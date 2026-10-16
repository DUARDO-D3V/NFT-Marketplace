import { http, HttpResponse, ws } from "msw";
import { toSocketIo } from "@mswjs/socket.io-binding";
import { nftCatalog } from "./fixtures";
import { getCartQuoteFingerprint } from "../cart-quote";
import { addEth, fromEthUnits, multiplyEth, percentEth, subtractEth, toEthUnits } from "../money";
import type { Cart, CartLine, CatalogResponse, CheckoutContact, CheckoutWallet, CollectorProfile, CollectorWallet, Nft, Order, Session } from "../types";
import { isValidWalletAddress } from "../wallet-validation";

const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const value = localStorage.getItem(`kurio:${key}`);
      return value ? (JSON.parse(value) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T) {
    localStorage.setItem(`kurio:${key}`, JSON.stringify(value));
  },
};

const getSession = () => storage.get<Session | null>("session", null);
const getOrders = () => storage.get<Order[]>("orders", []);
const getSessionKey = (key: string) => `${getSession()?.email ?? "guest"}:${key}`;

const demoAccounts = [
  {
    name: "Colecionador Kurio",
    email: "colecionador@kurio.test",
    passwordHash: "f1299649dde49895c6ee4947b435590f8502462ebeeee8cffc01895cd2c5280e",
  },
  {
    name: "Colecionadora Aurora",
    email: "aurora@kurio.test",
    passwordHash: "b8102716a3581f0a9d75df464f70e728da908436e5fbb3aa85335f60bdc71458",
  },
];

const catalogSeed = nftCatalog.map((nft) => ({ ...nft }));

// Restores every mutable piece of mock state so a scenario always starts from the same fixtures.
export function resetMockState(scenario = "standard") {
  for (const key of Object.keys(localStorage)) if (key.startsWith("kurio:")) localStorage.removeItem(key);
  for (const key of Object.keys(sessionStorage)) if (key.startsWith("kurio:")) sessionStorage.removeItem(key);
  nftCatalog.splice(0, nftCatalog.length, ...catalogSeed.map((nft) => ({ ...nft })));
  socketPriceVersions.clear();
  requestCounters.clear();
  localStorage.setItem("kurio:scenario", scenario);
}

const requestCounters = new Map<string, number>();
const nextRequestIndex = (name: string) => {
  const index = requestCounters.get(name) ?? 0;
  requestCounters.set(name, index + 1);
  return index;
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const socketEndpoint = ws.link(window.location.origin.replace(/^http/, "ws"));
type MockSocket = ReturnType<typeof toSocketIo>["client"];
const connectedSockets = new Set<MockSocket>();
const socketsByEmail = new Map<string, Set<MockSocket>>();
const socketPriceVersions = new Map<string, number>();
let priceUpdateTimer: ReturnType<typeof setInterval> | undefined;

// Mutates the shared catalog first so REST responses and the event always agree.
function emitNftUpdate(id: string, changes: { price?: string; available?: number }) {
  const nft = nftCatalog.find((item) => item.id === id);
  if (!nft) return;
  if (changes.price !== undefined && !/^\d+(?:\.\d{1,18})?$/.test(changes.price)) return;
  const version = (socketPriceVersions.get(id) ?? 0) + 1;
  socketPriceVersions.set(id, version);
  if (changes.price !== undefined) nft.price = changes.price;
  if (changes.available !== undefined) nft.available = changes.available;
  const event = { id, price: nft.price, available: nft.available, version, updatedAt: new Date().toISOString() };
  for (const socket of connectedSockets) socket.emit("nft.updated", event);
}

// Settles a pending order and notifies every socket that belongs to its owner.
function settleOrder(orderId: string, userEmail: string) {
  const orders = storage.get<Order[]>("orders", []);
  const order = orders.find((item) => item.id === orderId && item.customerEmail === userEmail);
  if (!order) return;
  if (order.status === "pending") {
    const declined = storage.get<string[]>("declined-orders", []).includes(order.id);
    order.status = declined ? "declined" : "confirmed";
    order.version += 1;
    storage.set("orders", orders);
    if (!declined) {
      const key = `cart:${userEmail}`;
      const lines = storage.get<CartLine[]>(key, []);
      for (const item of order.items) {
        const line = lines.find((entry) => entry.nftId === item.nftId);
        if (line) line.quantity = Math.max(0, line.quantity - item.quantity);
      }
      const remaining = lines.filter((line) => line.quantity > 0);
      storage.set(key, remaining);
      if (!remaining.length) localStorage.removeItem(`kurio:${userEmail}:coupon`);
    }
  }
  const event = { id: order.id, userEmail, status: order.status, version: order.version };
  for (const socket of socketsByEmail.get(userEmail) ?? []) socket.emit("order.updated", event);
}

function stopPriceUpdatesIfUnused() {
  if (connectedSockets.size || !priceUpdateTimer) return;
  clearInterval(priceUpdateTimer);
  priceUpdateTimer = undefined;
}

const socketHandler = socketEndpoint.addEventListener("connection", (connection) => {
  const { client: socket } = toSocketIo(connection);
  connectedSockets.add(socket);
  queueMicrotask(() => socket.emit("market.connected", { connectedAt: new Date().toISOString() }));
  if (!priceUpdateTimer) {
    // Random drift is opt-in so the default demonstration stays deterministic.
    priceUpdateTimer = setInterval(() => {
      if (localStorage.getItem("kurio:scenario") !== "live-prices") return;
      const nft = nftCatalog[Math.floor(Math.random() * nftCatalog.length)];
      if (!nft) return;
      const current = socketPriceVersions.get(nft.id) ?? 0;
      emitNftUpdate(nft.id, { price: current % 2 ? subtractEth(nft.price, "0.01") : addEth(nft.price, "0.01") });
    }, 30_000);
  }

  socket.on("mock.nft.update", (_event, payload: unknown) => {
    if (typeof payload !== "object" || payload === null || !("id" in payload) || typeof payload.id !== "string") return;
    const price = "price" in payload && typeof payload.price === "string" ? payload.price : undefined;
    const available = "available" in payload && typeof payload.available === "number" ? payload.available : undefined;
    emitNftUpdate(payload.id, { price, available });
  });
  // Replays an arbitrary event payload (duplicates, stale versions) without touching the catalog.
  socket.on("mock.emit", (_event, payload: unknown) => {
    if (typeof payload !== "object" || payload === null || !("event" in payload) || typeof payload.event !== "string") return;
    if (payload.event !== "nft.updated" && payload.event !== "order.updated") return;
    socket.emit(payload.event, "data" in payload ? payload.data : undefined);
  });
  socket.on("mock.order.watch", (_event, payload: unknown) => {
    if (typeof payload !== "object" || payload === null || !("id" in payload) || !("userEmail" in payload)) return;
    if (typeof payload.id !== "string" || typeof payload.userEmail !== "string") return;
    const orderId = payload.id;
    const userEmail = payload.userEmail;
    if (getSession()?.email !== userEmail) return;
    const listeners = socketsByEmail.get(userEmail) ?? new Set<MockSocket>();
    listeners.add(socket);
    socketsByEmail.set(userEmail, listeners);
    setTimeout(() => settleOrder(orderId, userEmail), 650);
  });
  const cleanup = () => {
    connectedSockets.delete(socket);
    for (const [email, listeners] of socketsByEmail) {
      listeners.delete(socket);
      if (!listeners.size) socketsByEmail.delete(email);
    }
    stopPriceUpdatesIfUnused();
  };
  connection.client.addEventListener("close", cleanup);
  connection.server.addEventListener("close", cleanup);
});

function getAccounts() {
  const accounts = storage.get<Array<{ name: string; email: string; passwordHash: string }>>("accounts", []);
  for (const demo of demoAccounts) if (!accounts.some((account) => account.email === demo.email)) accounts.push(demo);
  storage.set("accounts", accounts);
  return accounts;
}

function editionLimit(edition: string) {
  if (edition === "ABERTA") return 10;
  const match = /^1\/(\d+)$/.exec(edition);
  return match ? Math.min(10, Number(match[1])) : 0;
}

function getCartLines() {
  const session = getSession();
  const normalize = (lines: CartLine[]) => lines.map((line) => ({
    ...line,
    edition: line.edition ?? nftCatalog.find((item) => item.id === line.nftId)?.edition ?? "",
  }));
  if (!session) return normalize(storage.get<CartLine[]>("cart", []));
  const key = `cart:${session.email}`;
  const saved = storage.get<CartLine[] | null>(key, null);
  const guest = normalize(storage.get<CartLine[]>("cart", []));
  const normalizedSaved = saved ? normalize(saved) : null;
  if (!guest.length) return normalizedSaved ?? [];
  const merged = [...(normalizedSaved ?? [])];
  for (const line of guest) {
    const existing = merged.find((item) => item.nftId === line.nftId);
    if (existing && existing.edition === line.edition) existing.quantity = Math.min(editionLimit(line.edition ?? ""), existing.quantity + line.quantity);
    else if (existing) Object.assign(existing, line);
    else merged.push(line);
  }
  storage.set(key, merged);
  localStorage.removeItem("kurio:cart");
  return merged;
}

function setCartLines(lines: CartLine[]) {
  const session = getSession();
  storage.set(session ? `cart:${session.email}` : "cart", lines);
}

function getCoupon() {
  const key = getSessionKey("coupon");
  const saved = storage.get<string | undefined>(key, undefined);
  if (saved) return saved;
  const guest = storage.get<string | undefined>("guest:coupon", undefined);
  if (guest && getSession()) {
    setCoupon(guest);
    localStorage.removeItem("kurio:guest:coupon");
  }
  return guest;
}

function setCoupon(value: string) {
  storage.set(getSessionKey("coupon"), value);
}

function countBy(items: Nft[], field: "collection" | "network") {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item[field]] = (counts[item[field]] ?? 0) + 1;
  return counts;
}

function unauthorized() {
  return HttpResponse.json({ message: "Entre na sua conta para continuar." }, { status: 401 });
}

async function hashPassword(password: string) {
  const encoded = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function quote(lines: CartLine[], coupon?: string): Cart {
  const subtotal = lines.reduce((total, line) => {
    const nft = nftCatalog.find((item) => item.id === line.nftId);
    return total + toEthUnits(multiplyEth(nft?.price ?? "0", line.quantity));
  }, 0n);
  const subtotalEth = fromEthUnits(subtotal);
  const discount = coupon?.toUpperCase() === "KURIO10" ? percentEth(subtotalEth, 10n) : "0";
  const networkFee = lines.length ? "0.016" : "0";
  return {
    items: lines.map((line) => ({ ...line, nft: nftCatalog.find((item) => item.id === line.nftId) })),
    coupon,
    discount,
    networkFee,
    subtotal: subtotalEth,
    total: addEth(subtractEth(subtotalEth, discount), networkFee),
  };
}

export const handlers = [
  socketHandler,
  http.all("/api/*", ({ request }) => {
    if (request.headers.get("X-Kurio-Scenario") === "offline") {
      return HttpResponse.json({ message: "Conexão indisponível no cenário de demonstração." }, { status: 503 });
    }
    return undefined;
  }),
  http.get("/api/nfts", async ({ request }) => {
    const scenario = request.headers.get("X-Kurio-Scenario");
    if (scenario === "catalog-error") {
      return HttpResponse.json({ message: "Catálogo temporariamente indisponível." }, { status: 503 });
    }
    if (scenario === "transient-failure" && nextRequestIndex("nfts") === 0) {
      return HttpResponse.json({ message: "Falha transitória. Tente novamente." }, { status: 503, headers: { "Retry-After": "1" } });
    }
    const params = new URL(request.url).searchParams;
    const query = params.get("q")?.toLocaleLowerCase("pt-BR") ?? "";
    const delays = [1_200, 150, 700, 40];
    const delay = scenario === "slow" ? 1_800
      : scenario === "variable-latency" ? delays[nextRequestIndex("nfts") % delays.length]
      : scenario === "out-of-order" ? Math.max(100, 1_500 - query.length * 400)
      : 280;
    await wait(delay);
    if (scenario === "empty-catalog") {
      return HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 9, facets: { total: 0, collections: {}, networks: {} } } satisfies CatalogResponse);
    }
    const network = params.get("network") ?? "all";
    const collection = params.get("collection") ?? "all";
    const category = params.get("category") ?? "all";
    const mode = params.get("mode") ?? "all";
    const sort = params.get("sort") ?? "recent";
    const requestedMinPriceCents = Number(params.get("minPriceCents") ?? 2);
    const requestedMaxPriceCents = Number(params.get("maxPriceCents") ?? 1230);
    const minPriceCents = Number.isFinite(requestedMinPriceCents) ? Math.max(2, Math.min(1230, Math.floor(requestedMinPriceCents))) : 2;
    const maxPriceCents = Number.isFinite(requestedMaxPriceCents) ? Math.max(2, Math.min(1230, Math.floor(requestedMaxPriceCents))) : 1230;
    const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const pageSize = 9;
    const filtered = nftCatalog.filter((nft) =>
      `${nft.name} ${nft.creator} ${nft.collection}`.toLocaleLowerCase("pt-BR").includes(query) &&
      (network === "all" || nft.network === network) &&
      (collection === "all" || nft.collection === collection) &&
      (category === "all" || nft.category === category) &&
      toEthUnits(nft.price) >= BigInt(minPriceCents) * 10_000_000_000_000_000n &&
      toEthUnits(nft.price) <= BigInt(maxPriceCents) * 10_000_000_000_000_000n &&
      (mode !== "hot" || nft.featured) &&
      (mode !== "new" || ["emerald-ape-042", "golden-beat-207", "golden-signal-160"].includes(nft.id)),
    );
    if (sort === "price-low") filtered.sort((a, b) => toEthUnits(a.price) < toEthUnits(b.price) ? -1 : toEthUnits(a.price) > toEthUnits(b.price) ? 1 : 0);
    if (sort === "price-high") filtered.sort((a, b) => toEthUnits(a.price) > toEthUnits(b.price) ? -1 : toEthUnits(a.price) < toEthUnits(b.price) ? 1 : 0);
    const response: CatalogResponse = {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
      page,
      pageSize,
      facets: {
        total: nftCatalog.length,
        collections: countBy(nftCatalog, "collection"),
        networks: countBy(nftCatalog, "network"),
      },
    };
    return HttpResponse.json(response);
  }),
  http.get("/api/related-nfts", ({ request }) => {
    const params = new URL(request.url).searchParams;
    const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
    const limit = Math.min(12, Math.max(1, Number(params.get("limit") ?? 5) || 5));
    const exclude = params.get("exclude");
    return HttpResponse.json(nftCatalog.filter((item) => item.id !== exclude).slice(offset, offset + limit));
  }),
  http.get("/api/nfts/:id", ({ params }) => {
    const nft = nftCatalog.find((item) => item.id === params.id);
    return nft ? HttpResponse.json(nft) : HttpResponse.json({ message: "NFT não encontrado." }, { status: 404 });
  }),
  http.get("/api/cart", () => HttpResponse.json(quote(getCartLines(), getCoupon()))),
  http.post("/api/cart/items", async ({ request }) => {
    const { nftId, quantity, edition } = (await request.json()) as { nftId: string; quantity: number; edition: string };
    const nft = nftCatalog.find((item) => item.id === nftId);
    if (!nft) {
      return HttpResponse.json({ message: "NFT indisponível." }, { status: 404 });
    }
    if (nft.available === 0) {
      return HttpResponse.json({ message: "Esta edição está esgotada." }, { status: 409 });
    }
    const validEditions = ["1/1", "1/10", "1/50", nft.edition, "ABERTA"];
    if (!validEditions.includes(edition)) {
      return HttpResponse.json({ message: "A edição selecionada não está disponível para este NFT." }, { status: 422 });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || editionLimit(edition) < quantity) {
      return HttpResponse.json({ message: "A quantidade excede o limite desta edição." }, { status: 422 });
    }
    const lines = getCartLines();
    const existing = lines.find((item) => item.nftId === nftId);
    if (existing && existing.edition !== edition) {
      return HttpResponse.json({ message: "Remova a edição atual do carrinho antes de escolher outra edição deste NFT." }, { status: 409 });
    }
    if (existing && existing.quantity + quantity > editionLimit(edition)) {
      return HttpResponse.json({ message: "A quantidade excede o limite desta edição." }, { status: 409 });
    }
    const otherNetwork = lines.find((line) => line.nftId !== nftId && nftCatalog.find((item) => item.id === line.nftId)?.network !== nft.network);
    if (otherNetwork) {
      return HttpResponse.json({ message: "Para esta demonstração, todos os NFTs do carrinho precisam estar na mesma rede." }, { status: 409 });
    }
    if (existing) existing.quantity += quantity;
    else lines.push({ nftId, quantity, edition });
    setCartLines(lines);
    return HttpResponse.json(quote(lines, getCoupon()));
  }),
  http.patch("/api/cart/items/:id", async ({ params, request }) => {
    const { quantity } = (await request.json()) as { quantity: number };
    const lines = getCartLines().filter((item) => item.nftId !== params.id || quantity > 0);
    const item = lines.find((line) => line.nftId === params.id);
    if (item) {
      const limit = editionLimit(item.edition ?? "");
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > limit) {
        return HttpResponse.json({ message: "A quantidade excede o limite desta edição." }, { status: 422 });
      }
      item.quantity = quantity;
    }
    setCartLines(lines);
    return HttpResponse.json(quote(lines, getCoupon()));
  }),
  http.delete("/api/cart/items/:id", ({ params }) => {
    const lines = getCartLines().filter((item) => item.nftId !== params.id);
    setCartLines(lines);
    return HttpResponse.json(quote(lines, getCoupon()));
  }),
  http.post("/api/cart/coupon", async ({ request }) => {
    const { code } = (await request.json()) as { code: string };
    if (code.toUpperCase() !== "KURIO10" || request.headers.get("X-Kurio-Scenario") === "coupon-expired") {
      return HttpResponse.json({ message: "Esse código não é válido. Tente KURIO10." }, { status: 422 });
    }
    setCoupon(code.toUpperCase());
    return HttpResponse.json(quote(getCartLines(), "KURIO10"));
  }),
  http.post("/api/session", async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
      return HttpResponse.json({ message: "Informe um e-mail válido e uma senha com pelo menos 6 caracteres." }, { status: 422 });
    }
    const normalizedEmail = email.toLowerCase();
    const accounts = getAccounts();
    const account = accounts.find((item) => item.email === normalizedEmail);
    if (!account || account.passwordHash !== await hashPassword(password)) {
      return HttpResponse.json({ message: "E-mail ou senha incorretos." }, { status: 401 });
    }
    const session = { email: normalizedEmail, name: account.name };
    storage.set("session", session);
    return HttpResponse.json(session);
  }),
  http.post("/api/accounts", async ({ request }) => {
    const { name, email, password } = (await request.json()) as { name: string; email: string; password: string };
    const accounts = getAccounts();
    if (!name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      return HttpResponse.json({ message: "Informe um nome, e-mail válido e senha com pelo menos 8 caracteres." }, { status: 422 });
    }
    if (accounts.some((account) => account.email.toLowerCase() === email.toLowerCase())) {
      return HttpResponse.json({ message: "Esse e-mail já possui uma conta Kurio." }, { status: 409 });
    }
    accounts.push({ name: name.trim(), email: email.toLowerCase(), passwordHash: await hashPassword(password) });
    storage.set("accounts", accounts);
    const session = { email: email.toLowerCase(), name: name.trim() };
    storage.set("session", session);
    storage.set(`${session.email}:profile`, {
      displayName: name.trim(),
      username: email.split("@")[0],
      email: email.toLowerCase(),
      ensName: "",
      avatar: "",
    } satisfies CollectorProfile);
    return HttpResponse.json(session, { status: 201 });
  }),
  http.get("/api/session", () => HttpResponse.json(getSession())),
  http.delete("/api/session", () => {
    localStorage.removeItem("kurio:session");
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/profile", ({ request }) => {
    const session = getSession();
    if (!session || request.headers.get("X-Kurio-Scenario") === "session-revoked") return unauthorized();
    if (request.headers.get("X-Kurio-Scenario") === "forbidden") {
      return HttpResponse.json({ message: "Você não tem permissão para acessar este perfil." }, { status: 403 });
    }
    return HttpResponse.json(storage.get<CollectorProfile>(`${session.email}:profile`, {
      displayName: session.name,
      username: session.email.split("@")[0],
      email: session.email,
      ensName: "",
      avatar: "",
    }));
  }),
  http.put("/api/profile", async ({ request }) => {
    const session = getSession();
    if (!session) return unauthorized();
    const profile = (await request.json()) as CollectorProfile;
    if (!profile.displayName.trim() || !/^[a-zA-Z0-9_]{3,20}$/.test(profile.username)) {
      return HttpResponse.json({ message: "Preencha o nome e um usuário de 3 a 20 caracteres." }, { status: 422 });
    }
    if (profile.email.toLowerCase() !== session.email.toLowerCase()) {
      return HttpResponse.json({ message: "O e-mail não pode ser alterado por este formulário." }, { status: 422 });
    }
    storage.set(`${session.email}:profile`, profile);
    storage.set("session", { ...session, name: profile.displayName });
    return HttpResponse.json(profile);
  }),
  http.put("/api/profile/password", async ({ request }) => {
    const session = getSession();
    if (!session) return unauthorized();
    const { currentPassword, newPassword } = (await request.json()) as { currentPassword: string; newPassword: string };
    if (newPassword.length < 8 || currentPassword.length < 1) {
      return HttpResponse.json({ message: "A nova senha precisa ter pelo menos 8 caracteres." }, { status: 422 });
    }
    const accounts = getAccounts();
    const account = accounts.find((item) => item.email === session.email);
    if (account && account.passwordHash !== await hashPassword(currentPassword)) {
      return HttpResponse.json({ message: "A senha atual está incorreta." }, { status: 422 });
    }
    if (account) {
      account.passwordHash = await hashPassword(newPassword);
      storage.set("accounts", accounts);
    }
    return HttpResponse.json({ message: "Senha alterada com sucesso." });
  }),
  http.get("/api/wallets", ({ request }) => {
    const session = getSession();
    if (!session || request.headers.get("X-Kurio-Scenario") === "session-revoked") return unauthorized();
    if (request.headers.get("X-Kurio-Scenario") === "forbidden") {
      return HttpResponse.json({ message: "Você não tem permissão para acessar as carteiras." }, { status: 403 });
    }
    return HttpResponse.json(storage.get<CollectorWallet[]>(`${session.email}:wallets`, []));
  }),
  http.put("/api/wallets", async ({ request }) => {
    const session = getSession();
    if (!session) return unauthorized();
    const wallet = (await request.json()) as Omit<CollectorWallet, "id"> & { id?: string };
    if (!wallet.label.trim() || !wallet.alias.trim() || !isValidWalletAddress(wallet.network, wallet.address)) {
      return HttpResponse.json({ message: "Confira o nome, apelido e endereço válido para a rede selecionada." }, { status: 422 });
    }
    const wallets = storage.get<CollectorWallet[]>(`${session.email}:wallets`, []);
    const normalized: CollectorWallet = { ...wallet, id: wallet.id ?? crypto.randomUUID() };
    let next = wallets.filter((item) => item.id !== normalized.id);
    if (normalized.primary) next = next.map((item) => ({ ...item, primary: false }));
    next = [...next, normalized];
    storage.set(`${session.email}:wallets`, next);
    return HttpResponse.json(next);
  }),
  http.delete("/api/wallets/:id", ({ params }) => {
    const session = getSession();
    if (!session) return unauthorized();
    const wallets = storage.get<CollectorWallet[]>(`${session.email}:wallets`, []).filter((item) => item.id !== params.id);
    storage.set(`${session.email}:wallets`, wallets);
    return HttpResponse.json(wallets);
  }),
  http.get("/api/favorites", () => {
    const session = getSession();
    if (!session) return unauthorized();
    return HttpResponse.json(storage.get<string[]>(getSessionKey("favorites"), []));
  }),
  http.put("/api/favorites/:id", async ({ params, request }) => {
    const session = getSession();
    if (!session) return unauthorized();
    const { favorite } = (await request.json()) as { favorite: boolean };
    if (request.headers.get("X-Kurio-Scenario") === "favorites-error") {
      return HttpResponse.json({ message: "Falha transitória ao salvar favoritos." }, { status: 503 });
    }
    if (!nftCatalog.some((item) => item.id === params.id)) {
      return HttpResponse.json({ message: "NFT não encontrado." }, { status: 404 });
    }
    const current = storage.get<string[]>(getSessionKey("favorites"), []);
    const updated = favorite
      ? [...new Set([...current, String(params.id)])]
      : current.filter((id) => id !== params.id);
    storage.set(getSessionKey("favorites"), updated);
    return HttpResponse.json(updated);
  }),
  http.post("/api/orders", async ({ request }) => {
    const key = request.headers.get("Idempotency-Key");
    const { wallet, customer, quoteFingerprint, fingerprint } = (await request.json()) as {
      wallet: CheckoutWallet;
      customer: CheckoutContact;
      quoteFingerprint: string;
      fingerprint: string;
    };
    const session = getSession();
    if (!session) return unauthorized();
    if (request.headers.get("X-Kurio-Scenario") === "session-expired") {
      localStorage.removeItem("kurio:session");
      localStorage.setItem("kurio:scenario", "standard");
      return unauthorized();
    }
    if (!key || !fingerprint) return HttpResponse.json({ message: "Chave de idempotência ausente." }, { status: 400 });
    if (!wallet || !customer || !quoteFingerprint) {
      return HttpResponse.json({ message: "Dados de carteira, colecionador e cotação são obrigatórios." }, { status: 422 });
    }
    if (customer.email.toLowerCase() !== session.email || !customer.displayName.trim() || !customer.profileName.trim() || !/^[a-zA-Z0-9_]{3,20}$/.test(customer.username)) {
      return HttpResponse.json({ message: "Confira os dados obrigatórios do colecionador." }, { status: 422 });
    }
    if (!["Ethereum", "Polygon", "Solana"].includes(wallet.network) ||
        !["MetaMask", "WalletConnect", "Coinbase Wallet"].includes(wallet.provider) ||
        !isValidWalletAddress(wallet.network, wallet.address)) {
      return HttpResponse.json({ message: "Informe uma carteira válida para a rede selecionada." }, { status: 422 });
    }
    const existing = getOrders().find((order) => order.id === key);
    if (existing) {
      if (existing.customerEmail !== session.email) {
        return HttpResponse.json({ message: "Pedido não encontrado." }, { status: 404 });
      }
      const idempotency = storage.get<Record<string, string>>("idempotency", {});
      return existing.wallet === formatWallet(wallet) && idempotency[existing.id] === fingerprint
        ? HttpResponse.json(existing)
        : HttpResponse.json({ message: "Esta chave já foi utilizada com outros dados." }, { status: 409 });
    }
    if (request.headers.get("X-Kurio-Scenario") === "sold-out-before-order") {
      const nft = nftCatalog.find((item) => item.id === getCartLines()[0]?.nftId);
      if (nft) emitNftUpdate(nft.id, { available: 0 });
      localStorage.setItem("kurio:scenario", "standard");
      return HttpResponse.json({ message: "Esta edição esgotou durante a compra. Remova o item do carrinho para continuar." }, { status: 409 });
    }
    if (request.headers.get("X-Kurio-Scenario") === "quote-changed-before-order") {
      const nft = nftCatalog.find((item) => item.id === getCartLines()[0]?.nftId);
      if (nft) emitNftUpdate(nft.id, { price: addEth(nft.price, "0.01") });
      localStorage.setItem("kurio:scenario", "standard");
    }
    const cart = quote(getCartLines(), getCoupon());
    if (!cart.items.length) return HttpResponse.json({ message: "Seu carrinho está vazio." }, { status: 409 });
    if (getCartQuoteFingerprint(cart) !== quoteFingerprint) {
      return HttpResponse.json({ message: "O preço, desconto ou disponibilidade mudou. Revise o resumo atualizado antes de confirmar novamente." }, { status: 409 });
    }
    if (cart.items.some((line) => nftCatalog.find((item) => item.id === line.nftId)?.network !== wallet.network)) {
      return HttpResponse.json({ message: "A rede selecionada não corresponde à rede dos NFTs no carrinho." }, { status: 422 });
    }
    const items = cart.items.flatMap((line) => {
      const nft = nftCatalog.find((item) => item.id === line.nftId);
      return nft ? [{ ...line, nft, lineTotal: multiplyEth(nft.price, line.quantity) }] : [];
    });
    const order: Order = {
      id: key ?? crypto.randomUUID(),
      transaction: `0x${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}...${crypto.randomUUID().slice(0, 4)}`,
      status: "pending",
      version: 1,
      customerEmail: session.email,
      customer,
      network: wallet.network,
      walletAddress: wallet.address,
      items,
      subtotal: cart.subtotal,
      networkFee: cart.networkFee,
      discount: cart.discount,
      total: cart.total,
      wallet: formatWallet(wallet),
      createdAt: new Date().toISOString(),
    };
    storage.set("orders", [...getOrders(), order]);
    storage.set("idempotency", { ...storage.get<Record<string, string>>("idempotency", {}), [order.id]: fingerprint });
    if (request.headers.get("X-Kurio-Scenario") === "payment-declined") {
      storage.set("declined-orders", [...storage.get<string[]>("declined-orders", []), order.id]);
    }
    if (request.headers.get("X-Kurio-Scenario") === "order-timeout") {
      await new Promise((resolve) => setTimeout(resolve, 8_500));
    }
    return HttpResponse.json(order, { status: 201 });
  }),
  http.get("/api/orders/:id", ({ params }) => {
    const session = getSession();
    if (!session) return unauthorized();
    const order = getOrders().find((item) => item.id === params.id);
    if (order && order.customerEmail !== session.email) {
      return HttpResponse.json({ message: "Você não tem permissão para ver este pedido." }, { status: 403 });
    }
    return order
      ? HttpResponse.json(order)
      : HttpResponse.json({ message: "Pedido não encontrado." }, { status: 404 });
  }),
];

function formatWallet(wallet: CheckoutWallet) {
  return `${wallet.provider} · ${wallet.alias ?? wallet.provider} (${wallet.network}) ${wallet.address}`;
}

export type { Nft };
