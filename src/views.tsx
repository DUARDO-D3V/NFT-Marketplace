import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  CircleUserRound,
  Eye,
  EyeOff,
  Facebook,
  Heart,
  Instagram,
  Linkedin,
  Mail,
  Menu,
  Minus,
  Plus,
  Search,
  House,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Twitter,
  Wallet,
  Youtube,
  X,
} from "lucide-react";
import {
  Link,
  useNavigate,
  useParams,
  useRouter,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type FormEvent,
  type PropsWithChildren,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { marketplaceApi } from "./api";

import { getCartQuoteFingerprint } from "./cart-quote";
import type { Cart, CatalogResponse, CheckoutContact, CheckoutWallet, CollectorProfile, CollectorWallet, Nft, Order, OrderUpdatedEvent } from "./types";
import { marketSocket, type NftUpdatedEvent } from "./realtime";
import { multiplyEth } from "./money";
import { isValidWalletAddress } from "./wallet-validation";
import { useFocusTrap } from "./use-focus-trap";

const mocksEnabled = import.meta.env.VITE_MOCK_API !== "false";
const DemoControls = lazy(() => import("./mocks/demo-controls"));

const announce = (message: string) => window.dispatchEvent(new CustomEvent("kurio:announce", { detail: message }));

const queryKeys = {
  cart: ["cart"] as const,
  session: ["session"] as const,
};

const PRICE_MIN_CENTS = 2;
const PRICE_MAX_CENTS = 1230;
const formatPriceCents = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const editionLimit = (edition: string) => edition === "ABERTA" ? 10 : Math.min(10, Number(edition.split("/")[1]) || 0);

const useCart = () => useQuery({ queryKey: queryKeys.cart, queryFn: ({ signal }) => marketplaceApi.getCart({ signal }) });
const useSession = () => useQuery({ queryKey: queryKeys.session, queryFn: ({ signal }) => marketplaceApi.getSession({ signal }) });

// Private pages leave for the sign-in screen as soon as a 401 clears the cached session.
function useRedirectWhenSignedOut(session: unknown) {
  const navigate = useNavigate();
  useEffect(() => {
    if (session === null) void navigate({ to: "/account", search: { redirect: window.location.pathname } });
  }, [session, navigate]);
}

function GoogleLogo() {
  return <svg className="auth-social-logo" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
    <path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.73 7.18l7.65 5.94c4.47-4.13 7.12-10.2 7.12-17.59Z" />
    <path fill="#FBBC05" d="M10.54 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.11.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.98-6.19Z" />
    <path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.9-5.86l-7.65-5.94c-2.13 1.43-4.85 2.28-8.25 2.28-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
  </svg>;
}

function FacebookLogo() {
  return <svg className="auth-social-logo" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#1877F2" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.025 1.792-4.695 4.533-4.695 1.313 0 2.686.236 2.686.236v2.977h-1.513c-1.49 0-1.956.93-1.956 1.885v2.258h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z" />
  </svg>;
}

export function SiteShell({ children }: PropsWithChildren) {
  const [openMobileNav, setOpenMobileNav] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [realtimeNotice, setRealtimeNotice] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const navToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onAnnounce = (event: Event) => {
      setAnnouncement("");
      window.setTimeout(() => setAnnouncement((event as CustomEvent<string>).detail), 50);
    };
    window.addEventListener("kurio:announce", onAnnounce);
    return () => window.removeEventListener("kurio:announce", onAnnounce);
  }, []);
  useEffect(() => {
    if (!openMobileNav) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenMobileNav(false);
      navToggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openMobileNav]);
  const cartQuery = useCart();
  const sessionQuery = useSession();
  const queryClient = useQueryClient();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const count = cartQuery.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  useEffect(() => {
    const onOpenAuth = () => {
      setAuthModalOpen(true);
    };
    window.addEventListener("kurio:open-auth", onOpenAuth);
    return () => {
      window.removeEventListener("kurio:open-auth", onOpenAuth);
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.VITE_MOCK_API === "false") return;
    const versions = new Map<string, number>();
    const orderVersions = new Map<string, number>();
    const onUpdate = (event: NftUpdatedEvent) => {
      if ((versions.get(event.id) ?? 0) >= event.version) return;
      versions.set(event.id, event.version);
      const known = [
        ...queryClient.getQueriesData<CatalogResponse>({ queryKey: ["nfts"] }).flatMap(([, data]) => data?.items ?? []),
        ...(queryClient.getQueryData<Cart>(queryKeys.cart)?.items.flatMap((line) => line.nft ? [line.nft] : []) ?? []),
      ].find((item) => item.id === event.id);
      const patch = (item: Nft): Nft => item.id === event.id ? { ...item, price: event.price, available: event.available } : item;
      queryClient.setQueriesData<CatalogResponse>({ queryKey: ["nfts"] }, (current) => current ? { ...current, items: current.items.map(patch) } : current);
      queryClient.setQueriesData<Nft[]>({ queryKey: ["related"] }, (current) => current?.map(patch));
      queryClient.setQueryData<Nft>(["nft", event.id], (current) => current ? patch(current) : current);
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      void (async () => {
        const name = known?.name ?? (await queryClient.fetchQuery({ queryKey: ["nft", event.id], queryFn: ({ signal }) => marketplaceApi.getNft(event.id, { signal }) }).catch(() => undefined))?.name ?? "Um NFT";
        setRealtimeNotice(event.available === 0 ? `${name} esgotou.` : `${name} teve o preço atualizado.`);
        window.setTimeout(() => setRealtimeNotice(""), 5_000);
      })();
    };    const onReconnect = () => {
      void queryClient.invalidateQueries({ queryKey: ["nfts"] });
      void queryClient.invalidateQueries({ queryKey: ["cart"] });
      void queryClient.invalidateQueries({ queryKey: ["order"] });
      for (const query of queryClient.getQueryCache().findAll({ queryKey: ["order"] })) {
        const order = query.state.data as Order | undefined;
        if (order?.status === "pending" && order.customerEmail === sessionQuery.data?.email) {
          marketSocket.emit("mock.order.watch", { id: order.id, userEmail: order.customerEmail });
        }
      }
    };
    const onOrderUpdate = (event: OrderUpdatedEvent) => {
      if (event.userEmail !== sessionQuery.data?.email || (orderVersions.get(event.id) ?? 0) >= event.version) return;
      orderVersions.set(event.id, event.version);
      const current = queryClient.getQueryData<Order>(["order", event.id]);
      // Confirmed and declined orders are terminal: later events never reopen them.
      if (current && (current.status !== "pending" || current.version >= event.version)) return;
      queryClient.setQueryData<Order>(["order", event.id], (order) => order ? { ...order, status: event.status, version: event.version } : order);
      void queryClient.invalidateQueries({ queryKey: ["order", event.id] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      announce(event.status === "confirmed" ? "Pedido confirmado." : "Pagamento recusado. Seus itens continuam no carrinho.");
    };    marketSocket.on("nft.updated", onUpdate);
    marketSocket.on("connect", onReconnect);
    marketSocket.on("order.updated", onOrderUpdate);
    marketSocket.connect();
    return () => {
      marketSocket.off("nft.updated", onUpdate);
      marketSocket.off("connect", onReconnect);
      marketSocket.off("order.updated", onOrderUpdate);
      marketSocket.disconnect();
    };
  }, [queryClient, sessionQuery.data?.email]);

  return (
    <div className={`app-shell${path === "/" ? " route-home" : path === "/cart" ? " route-cart" : path === "/checkout" ? " route-checkout" : ""}`}>
        <div className="announcement"><Sparkles size={14} /> Arte independente, para colecionar com intenção <span>Descubra a coleção da semana <ArrowRight size={13} /></span></div>
        <header className="site-header">
          <div className="header-inner">
            <button ref={navToggleRef} className="icon-button mobile-menu" aria-label="Abrir menu" aria-expanded={openMobileNav} aria-controls="primary-nav" onClick={() => setOpenMobileNav(!openMobileNav)}><Menu size={21} /></button>
            <Link to="/" className="brand" aria-label="Kurio, página inicial">
              <span>KURIO</span>
            </Link>
            <nav id="primary-nav" className={`primary-nav ${openMobileNav ? "nav-open" : ""}`} aria-label="Navegação principal">
              <Link to="/" className={path === "/" ? "nav-active" : ""} onClick={() => setOpenMobileNav(false)}>Início</Link>
              <Link to="/" search={{ q: "" }} onClick={() => setOpenMobileNav(false)}>Mercado</Link>
              <Link to="/" hash="creators" onClick={() => setOpenMobileNav(false)}>Criadores</Link>
              <Link to="/" hash="learn" onClick={() => setOpenMobileNav(false)}>Aprenda</Link>
            </nav>
            <div className="header-actions">
              <Link to="/" className="header-search" aria-label="Explorar NFTs"><Search size={19} /></Link>
              {mocksEnabled && <Suspense fallback={null}><DemoControls /></Suspense>}
              <Link to="/cart" className="header-cart" aria-label={`Carrinho, ${count} itens`}>
                <ShoppingCart size={20} /><span className="cart-count">{count}</span>
              </Link>
              {sessionQuery.data
                ? <Link to="/account" className="button button-small button-primary header-login"><CircleUserRound size={15} /> Minha conta</Link>
                : <button className="button button-small button-primary header-login" onClick={() => setAuthModalOpen(true)}><span className="login-arrow">↗</span> Entrar</button>}
            </div>
          </div>
        </header>
        <div aria-live="polite" aria-atomic="true">
          {realtimeNotice && <div className="live-notice"><span className="live-dot" /> {realtimeNotice}<button aria-label="Dispensar aviso" onClick={() => setRealtimeNotice("")}><X size={14} /></button></div>}
        </div>
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
        {children}
        {authModalOpen && <AccountPage modal onClose={() => setAuthModalOpen(false)} />}
        <SiteFooter />
    </div>
  );
}

function SiteFooter() {
  const [newsletterFeedback, setNewsletterFeedback] = useState("");
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-promise"><span className="promise-icon">W</span><h3>Segurança da carteira</h3><p>Conecte sua carteira e colecione arte digital verificada com confiança.</p></div>
        <div className="footer-promise" id="creators"><span className="promise-icon">C</span><h3>Criadores em destaque</h3><p>Conheça artistas, estúdios e comunidades que moldam a cultura digital.</p></div>
        <div className="footer-promise"><span className="promise-icon">D</span><h3>Alertas de lançamentos</h3><p>Receba novidades de criadores e coleções selecionadas.</p></div>
        <form className="newsletter" onSubmit={(event) => { event.preventDefault(); setNewsletterFeedback("A inscrição na lista de novidades não está disponível nesta demonstração."); }}>
          <h3>Antecipe-se ao próximo lançamento</h3>
          <div className="newsletter-form"><input aria-label="Seu e-mail" type="email" placeholder="digite seu e-mail..." required /><button className="button button-primary button-small">Enviar</button></div>
          <p role={newsletterFeedback ? "status" : undefined}>{newsletterFeedback || "Uma carta de novidades selecionadas, direto para você."}</p>
        </form>
      </div>
      <div className="footer-contact"><Link to="/" className="brand footer-brand">KURIO</Link><span>Feito para colecionadores,<br />criadores e cultura.</span><a href="mailto:contato@kurio.test">contato@kurio.test</a><a href="tel:+551140028922">+55 11 4002 8922</a></div>
      <div className="footer-links">
        <div className="footer-link-group"><strong>Minha conta</strong><Link to="/account/profile">Meu perfil</Link><Link to="/cart">Minha coleção</Link><Link to="/account/wallets">Carteiras</Link></div>
        <div className="footer-link-group"><strong>Coleções</strong><Link to="/" search={{ category: "Arte digital", page: 1 }}>Arte digital</Link><Link to="/" search={{ category: "Colecionáveis", page: 1 }}>Colecionáveis</Link><Link to="/" search={{ category: "Generativa", page: 1 }}>Generativa</Link><Link to="/" search={{ category: "Arte 3D", page: 1 }}>Arte 3D</Link><Link to="/" search={{ category: "Música", page: 1 }}>Música</Link></div>
        <div className="footer-link-group"><strong>Redes sociais</strong><div className="footer-socials" aria-label="Redes sociais">
          <a href="https://www.facebook.com/" target="_blank" rel="noreferrer" aria-label="Facebook"><Facebook size={14} /></a>
          <a href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram size={14} /></a>
          <a href="https://x.com/" target="_blank" rel="noreferrer" aria-label="X"><Twitter size={14} /></a>
          <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer" aria-label="LinkedIn"><Linkedin size={14} /></a>
          <a href="https://www.youtube.com/" target="_blank" rel="noreferrer" aria-label="YouTube"><Youtube size={14} /></a>
        </div><strong>Carteiras compatíveis</strong><span className="wallet-brands">METAMASK · WALLETCONNECT · COINBASE</span></div>
      </div>
      <div className="footer-bottom"><Link to="/" className="brand footer-brand">KURIO</Link><span>Feito para colecionadores, criadores e cultura.</span><span>© 2026 Kurio. Todos os direitos reservados.</span></div>
    </footer>
  );
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <div className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>;
}

function NftCard({ nft, index = 0 }: { nft: Nft; index?: number }) {
  const queryClient = useQueryClient();
  const sessionQuery = useSession();
  const favoritesKey = ["favorites", sessionQuery.data?.email ?? "guest"] as const;
  const favoritesQuery = useQuery({
    queryKey: favoritesKey,
    queryFn: ({ signal }) => marketplaceApi.getFavorites({ signal }),
    enabled: Boolean(sessionQuery.data),
  });
  const favorite = favoritesQuery.data?.includes(nft.id) ?? false;
  const addMutation = useMutation({
    mutationFn: () => marketplaceApi.addToCart(nft.id, nft.edition),
    onSuccess: (cart) => { queryClient.setQueryData(queryKeys.cart, cart); announce(`${nft.name} adicionado ao carrinho.`); },
  });
  const favoriteMutation = useMutation({
    mutationFn: () => marketplaceApi.setFavorite(nft.id, !favorite),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: favoritesKey });
      const previous = queryClient.getQueryData<string[]>(favoritesKey) ?? [];
      queryClient.setQueryData<string[]>(favoritesKey, favorite
        ? previous.filter((id) => id !== nft.id)
        : [...previous, nft.id]);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context) queryClient.setQueryData(favoritesKey, context.previous);
    },
    onSuccess: (updated) => { queryClient.setQueryData(favoritesKey, updated); announce(updated.includes(nft.id) ? `${nft.name} adicionado aos favoritos.` : `${nft.name} removido dos favoritos.`); },
  });
  const toggleFavorite = () => {
    if (!sessionQuery.data) {
      window.dispatchEvent(new Event("kurio:open-auth"));
      return;
    }
    favoriteMutation.mutate();
  };
  return (
    <article className="nft-card" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
      <div className="nft-art-wrap">
        <Link to="/nft/$nftId" params={{ nftId: nft.id }} className="nft-art-link" aria-label={`Ver ${nft.name}`}>
          <img className="nft-art" src={nft.image} alt={`Obra de arte ${nft.name}`} loading={index > 2 ? "lazy" : "eager"} />
        </Link>
        {nft.featured && <span className="rare-tag">RARO</span>}
        <button className={`favorite-button ${favorite ? "is-favorite" : ""}`} onClick={toggleFavorite} aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} disabled={favoriteMutation.isPending} aria-describedby={favoriteMutation.isError ? `favorite-error-${nft.id}` : undefined}><Heart size={17} fill={favorite ? "currentColor" : "none"} /></button>
        {favoriteMutation.isError && <span className="favorite-error" id={`favorite-error-${nft.id}`} role="status">Não foi possível salvar.</span>}
        <div className="card-hover-actions">
          <button aria-label={`Adicionar ${nft.name} ao carrinho`} onClick={() => addMutation.mutate()} disabled={addMutation.isPending || nft.available === 0} title={nft.available === 0 ? "Esgotado" : undefined}><ShoppingBag size={17} /></button>
          <Link to="/nft/$nftId" params={{ nftId: nft.id }} aria-label={`Detalhes de ${nft.name}`}><Search size={17} /></Link>
        </div>
        {addMutation.isError && <span className="favorite-error" role="alert">{apiErrorMessage(addMutation.error, "Não foi possível adicionar ao carrinho.")}</span>}
      </div>
      <div className="nft-info">
        <Link to="/nft/$nftId" params={{ nftId: nft.id }} className="nft-name">{nft.name}</Link>
        <span className="nft-creator">por {nft.creator}</span>
        <div className="nft-card-bottom"><span className="nft-price">{nft.price} <small>ETH</small></span><span className="nft-edition">{nft.edition}</span></div>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return <div className="skeleton-card" aria-label="Carregando obra"><div className="skeleton shimmer" /><div className="skeleton-line shimmer" /><div className="skeleton-line short shimmer" /></div>;
}

const HERO_SLIDES = [
  { src: "/art/emerald-ape.webp", alt: "Emerald Ape, obra em destaque" },
  { src: "/art/sage-nomad.webp", alt: "Sage Nomad, obra em destaque" },
  { src: "/art/golden-beat.webp", alt: "Golden Beat, obra em destaque" },
];

export function HomePage() {
  const { q = "", network = "all", collection = "all", category = "all", mode = "all", page = 1, sort = "recent", minPriceCents = PRICE_MIN_CENTS, maxPriceCents = PRICE_MAX_CENTS } = useSearch({ from: "/" });
  const navigate = useNavigate({ from: "/" });
  const { data: mobileSession } = useSession();
  const [mobileFilters, setMobileFilters] = useState(false);
  const [heroSlide, setHeroSlide] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const touchX = useRef(0);
  const goToSlide = (index: number) => setHeroSlide((index + HERO_SLIDES.length) % HERO_SLIDES.length);
  useEffect(() => {
    if (heroPaused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setHeroSlide((current) => (current + 1) % HERO_SLIDES.length), 6000);
    return () => window.clearInterval(timer);
  }, [heroPaused, heroSlide]);
  const filterRef = useRef<HTMLElement>(null);
  useFocusTrap(filterRef, mobileFilters, () => setMobileFilters(false));
  const [draftMinPriceCents, setDraftMinPriceCents] = useState(minPriceCents);
  const [draftMaxPriceCents, setDraftMaxPriceCents] = useState(maxPriceCents);
  const query = useQuery({
    queryKey: ["nfts", { q, network, collection, category, sort, mode, page, minPriceCents, maxPriceCents }],
    queryFn: ({ signal }) => marketplaceApi.listNfts({ q, network, collection, category, sort, mode, page, minPriceCents, maxPriceCents }, { signal }),
  });
  useEffect(() => {
    setDraftMinPriceCents(minPriceCents);
    setDraftMaxPriceCents(maxPriceCents);
  }, [minPriceCents, maxPriceCents]);
  const visibleItems = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / (query.data?.pageSize ?? 6)));
  const activePage = Math.min(Math.max(1, page), pageCount);
  const updateSearch = (changes: { q?: string; network?: string; collection?: string; category?: string; mode?: string; page?: number; sort?: string; minPriceCents?: number; maxPriceCents?: number }) =>
    navigate({ search: (previous) => ({ ...previous, ...changes }) });
  const setSearch = (value: string) => updateSearch({ q: value, page: 1 });

  return (
    <main className="page-wrap home-page">
      <div className="mobile-home-toolbar">
        <label><Search size={17} /><input value={q} onChange={(event) => setSearch(event.target.value)} placeholder="Explorar coleções" aria-label="Explorar coleções" /></label>
        <button type="button" aria-label="Abrir filtros" onClick={() => setMobileFilters(true)}><SlidersHorizontal size={19} /></button>
      </div>
      <section className="hero-section" onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)} onFocus={() => setHeroPaused(true)} onBlur={() => setHeroPaused(false)}>
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-line" /> Bem-vindo à Kurio</p>
          <h1>SEJA DONO DO FUTURO<br />DA ARTE DIGITAL</h1>
          <p className="hero-description">Descubra NFTs selecionados de criadores emergentes e consagrados. Colecione arte rara, apoie artistas e faça parte da cultura da internet.</p>
          <Link to="/" search={{ q: "" }} className="button button-primary hero-cta">Explorar <ArrowRight size={16} /></Link>
          <div className="hero-proof"><span className="proof-avatars"><i>N</i><i>M</i><i>L</i></span><span><strong>2.4k+</strong> colecionadores já chegaram</span></div>
        </div>
        <div className="hero-carousel-dots" role="group" aria-label="Obras em destaque">
          {HERO_SLIDES.map((slide, index) => <button key={slide.src} type="button" aria-label={`Ver destaque ${index + 1} de ${HERO_SLIDES.length}`} aria-current={index === heroSlide} onClick={() => goToSlide(index)} />)}
        </div>
        <div className="hero-visual">
          <div className="hero-image-frame" onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }} onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - touchX.current; if (Math.abs(dx) > 40) goToSlide(heroSlide + (dx < 0 ? 1 : -1)); }}>
            {HERO_SLIDES.map((slide, index) => <img key={slide.src} className={index === heroSlide ? "is-active" : undefined} fetchPriority={index === 0 ? "high" : undefined} loading={index === 0 ? undefined : "lazy"} src={slide.src} alt={slide.alt} aria-hidden={index !== heroSlide} />)}
          </div>
          <span className="hero-sparkle">✳</span>
        </div>
        <span className="hero-index" aria-hidden="true">{String(heroSlide + 1).padStart(2, "0")} — {String(HERO_SLIDES.length).padStart(2, "0")}</span>
      </section>

      <section className="market-section" id="market">
        <aside ref={filterRef} className={`filter-sidebar ${mobileFilters ? "filters-open" : ""}`} role={mobileFilters ? "dialog" : undefined} aria-modal={mobileFilters || undefined} aria-label={mobileFilters ? "Filtros do catálogo" : undefined} tabIndex={mobileFilters ? -1 : undefined}>
          <div className="filter-heading"><h2>Coleções</h2><button className="filter-close icon-button" aria-label="Fechar filtros" onClick={() => setMobileFilters(false)}><X size={18} /></button></div>
          <label className="search-field"><Search size={17} /><input value={q} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar arte, artista..." aria-label="Buscar arte ou artista" /><kbd>⌘ K</kbd></label>
          <div className="filter-group actual-collection-list">
            <h3>Coleções <ChevronDown size={15} /></h3>
            {[["all", "Todas as coleções"], ["Kurio Apes", "Kurio Apes"], ["Wild Souls", "Wild Souls"], ["The Gentlemen", "The Gentlemen"], ["Golden Hour", "Golden Hour"]].map(([value, label]) => (
              <button className={`filter-option ${category === "all" && collection === value ? "selected" : ""}`} key={value} onClick={() => updateSearch({ collection: value, category: "all", page: 1 })}>{label}<span>{value === "all" ? query.data?.facets.total : query.data?.facets.collections[value] ?? 0}</span></button>
            ))}
          </div>
          <div className="home-genre-list">
            {[
              ["Arte digital", "Arte digital", "33"],
              ["Fotografia", "Fotografia", "12"],
              ["Música", "Música", "65"],
              ["Arte 3D", "Arte 3D", "39"],
              ["Colecionáveis", "Colecionáveis", "23"],
              ["Generativa", "Generativa", "17"],
              ["Jogos", "Jogos", "19"],
              ["Assinaturas", "Assinaturas", "13"],
              ["Utilidade", "Utilidade", "18"],
            ].map(([value, label, total]) => (
              <button className={`filter-option ${category === value ? "selected" : ""}`} key={label} onClick={() => updateSearch({ category: value, collection: "all", page: 1 })}>{label}<span>({total})</span></button>
            ))}
          </div>
          <div className="filter-group">
            <h3>Faixa de preço</h3>
            <div className="range-control">
              <div className="range-track" aria-hidden="true">
                <span style={{
                  left: `${((draftMinPriceCents - PRICE_MIN_CENTS) / (PRICE_MAX_CENTS - PRICE_MIN_CENTS)) * 100}%`,
                  right: `${100 - ((draftMaxPriceCents - PRICE_MIN_CENTS) / (PRICE_MAX_CENTS - PRICE_MIN_CENTS)) * 100}%`,
                }} />
              </div>
              <input aria-label="Preço mínimo" aria-valuetext={`${formatPriceCents(draftMinPriceCents)} ETH`} type="range" min={PRICE_MIN_CENTS} max={PRICE_MAX_CENTS - 1} step={1} value={draftMinPriceCents} onChange={(event) => setDraftMinPriceCents(Math.min(Number(event.target.value), draftMaxPriceCents - 1))} />
              <input aria-label="Preço máximo" aria-valuetext={`${formatPriceCents(draftMaxPriceCents)} ETH`} type="range" min={PRICE_MIN_CENTS + 1} max={PRICE_MAX_CENTS} step={1} value={draftMaxPriceCents} onChange={(event) => setDraftMaxPriceCents(Math.max(Number(event.target.value), draftMinPriceCents + 1))} />
            </div>
            <div className="range-labels"><span>{formatPriceCents(draftMinPriceCents)} – {formatPriceCents(draftMaxPriceCents)} ETH</span></div>
            <button className="button button-primary filter-apply" onClick={() => updateSearch({ minPriceCents: draftMinPriceCents, maxPriceCents: draftMaxPriceCents, page: 1 })}>Aplicar</button>
          </div>
          <div className="filter-group">
            <h3>Rede</h3>
            {[["all", "Todas as redes", ""], ["Ethereum", "Ethereum", "119"], ["Polygon", "Polygon", "78"], ["Solana", "Solana", "86"]].map(([value, label, count]) => (
              <button className={`filter-option network-option ${value === "all" ? "network-all-option" : ""} ${network === value ? "selected" : ""}`} key={value} onClick={() => updateSearch({ network: value, page: 1 })}><span className="network-dot" />{label}<span className="network-count-reference">({count})</span><span className="network-count-live">{value === "all" ? "" : query.data?.facets.networks[value] ?? 0}</span></button>
            ))}
          </div>
          <div className="sidebar-note"><Sparkles size={18} /><strong>Peças com história.</strong><span>Descubra obras selecionadas pelo time Kurio.</span></div>
          <article className="featured-sidebar"><h3>NFT EM DESTAQUE</h3><p>OFERTA LIMITADA</p><img src="/art/sage-nomad.webp" loading="lazy" alt="Sage Nomad em destaque" /></article>
        </aside>
        <div className="market-content">
          <div className="market-toolbar">
            <div className="market-tabs"><button className={`tab ${mode === "all" ? "active" : ""}`} onClick={() => updateSearch({ mode: "all", page: 1 })}>Todos os NFTs <span>({total})</span></button><button className={`tab ${mode === "new" ? "active" : ""}`} onClick={() => updateSearch({ mode: "new", page: 1 })}>Novos lançamentos</button><button className={`tab ${mode === "hot" ? "active" : ""}`} onClick={() => updateSearch({ mode: "hot", page: 1 })}>Em alta</button></div>
            <div className="market-tools"><button className="mobile-filter-button" onClick={() => setMobileFilters(true)}><SlidersHorizontal size={16} /> Filtros</button><label className="sort-control"><ArrowDownUp size={15} /><span>Ordenar por</span><select value={sort} aria-label="Ordenar NFTs" onChange={(event) => updateSearch({ sort: event.target.value, page: 1 })}><option value="recent">Recentemente listados</option><option value="price-low">Menor preço</option><option value="price-high">Maior preço</option></select></label></div>
          </div>
          {query.isError ? <div className="inline-error"><p>Não foi possível carregar a coleção.</p><button className="button button-outline" onClick={() => void query.refetch()}>Tentar novamente</button></div> : (
            <div className="nft-grid">
              {query.isLoading ? Array.from({ length: 9 }, (_, i) => <SkeletonCard key={i} />) : visibleItems.map((nft, index) => <NftCard key={nft.id} nft={nft} index={index} />)}
              {!query.isLoading && total === 0 && <div className="empty-state"><Search size={25} /><h3>Nenhuma obra encontrada</h3><p>Tente outro termo ou explore todas as redes.</p><button className="button button-outline" onClick={() => updateSearch({ q: "", network: "all", collection: "all", category: "all", mode: "all", minPriceCents: undefined, maxPriceCents: undefined, page: 1 })}>Limpar filtros</button></div>}
            </div>
          )}
          <div className="pagination"><button disabled={activePage <= 1} onClick={() => updateSearch({ page: activePage - 1 })}><ArrowLeft size={15} /> Anterior</button>{Array.from({ length: pageCount }, (_, index) => <button key={index + 1} className={activePage === index + 1 ? "page-current" : ""} onClick={() => updateSearch({ page: index + 1 })}>{String(index + 1).padStart(2, "0")}</button>)}<button disabled={activePage >= pageCount} onClick={() => updateSearch({ page: activePage + 1 })}>Próxima <ArrowRight size={15} /></button></div>
        </div>
      </section>

      <section className="home-promos" aria-label="Destaques Kurio">
        <article className="home-promo"><img src="/art/emerald-ape.webp" loading="lazy" alt="Emerald Ape da coleção Kurio Apes" /><div className="home-promo-copy"><h2>Lançamentos gênesis<br />de edição limitada</h2><p>Colecione edições escassas diretamente dos criadores antes da revelação pública.</p><Link to="/" className="button button-primary">Explorar <ArrowRight size={13} /></Link></div></article>
        <article className="home-promo"><img src="/art/ivory-baron.webp" loading="lazy" alt="Arte digital selecionada da coleção The Gentlemen" /><div className="home-promo-copy"><h2>Arte digital selecionada<br />e muito mais</h2><p>Explore novos artistas, coleções verificadas e obras digitais que definem a cultura.</p><Link to="/" className="button button-primary">Explorar <ArrowRight size={13} /></Link></div></article>
      </section>
      <section className="journal-section" id="learn" aria-labelledby="journal-heading">
        <div className="journal-heading"><h2 id="journal-heading">Diário da Cunhagem</h2><p>Histórias, guias e insights para colecionadores sobre o universo da propriedade digital.</p></div>
        <div className="journal-grid">
          <article className="journal-card"><img src="/art/ivory-baron.webp" alt="" loading="lazy" /><div className="journal-card-copy"><div className="journal-meta"><span>12 de setembro</span><span>Leitura de 6 min</span></div><h3>Como funciona a propriedade de NFTs</h3><p>Aprenda a colecionar, negociar e verificar ativos digitais.</p><a href="#market">Ler mais →</a></div></article>
          <article className="journal-card"><img src="/art/emerald-ape.webp" alt="" loading="lazy" /><div className="journal-card-copy"><div className="journal-meta"><span>13 de setembro</span><span>Leitura de 2 min</span></div><h3>10 artistas digitais para acompanhar</h3><p>Conheça criadores que moldam a cultura digital.</p><a href="#market">Ler mais →</a></div></article>
          <article className="journal-card"><img src="/art/sage-nomad.webp" alt="" loading="lazy" /><div className="journal-card-copy"><div className="journal-meta"><span>15 de setembro</span><span>Leitura de 3 min</span></div><h3>Raridade, atributos e procedência</h3><p>Entenda raridade, procedência, direitos autorais e utilidade.</p><a href="#market">Ler mais →</a></div></article>
          <article className="journal-card"><img src="/art/golden-beat.webp" alt="" loading="lazy" /><div className="journal-card-copy"><div className="journal-meta"><span>15 de setembro</span><span>Leitura de 2 min</span></div><h3>Como proteger sua carteira</h3><p>Proteja sua carteira, seus ativos e sua identidade.</p><a href="#market">Ler mais →</a></div></article>
        </div>
      </section>
      <nav className="mobile-bottom-nav" aria-label="Navegação móvel">
        <Link to="/" aria-label="Início" aria-current="page"><House size={18} /></Link>
        <button type="button" aria-label="Favoritos" onClick={() => window.dispatchEvent(new Event("kurio:open-auth"))}><Heart size={19} /></button>
        <Link to="/" hash="market" className="mobile-bottom-scan" aria-label="Explorar mercado"><ScanLine size={23} /></Link>
        <Link to="/cart" aria-label="Carrinho"><ShoppingCart size={18} /></Link>
        {mobileSession
          ? <Link to="/account" aria-label="Minha conta"><CircleUserRound size={18} /></Link>
          : <button type="button" aria-label="Minha conta" onClick={() => window.dispatchEvent(new Event("kurio:open-auth"))}><CircleUserRound size={18} /></button>}
      </nav>
    </main>
  );
}

export function NftDetailPage() {
  const { nftId } = useParams({ from: "/nft/$nftId" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [selectedEdition, setSelectedEdition] = useState("");
  const [activeImage, setActiveImage] = useState(0);
  const [activeDetailTab, setActiveDetailTab] = useState<"details" | "reviews">("details");
  const [imageZoomed, setImageZoomed] = useState(false);
  const session = useSession();
  const favoritesKey = ["favorites", session.data?.email ?? "guest"] as const;
  const favoritesQuery = useQuery({ queryKey: favoritesKey, queryFn: ({ signal }) => marketplaceApi.getFavorites({ signal }), enabled: Boolean(session.data) });
  const favorite = favoritesQuery.data?.includes(nftId) ?? false;
  const favoriteMutation = useMutation({
    mutationFn: () => marketplaceApi.setFavorite(nftId, !favorite),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: favoritesKey });
      const previous = queryClient.getQueryData<string[]>(favoritesKey) ?? [];
      queryClient.setQueryData<string[]>(favoritesKey, favorite
        ? previous.filter((id) => id !== nftId)
        : [...previous, nftId]);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context) queryClient.setQueryData(favoritesKey, context.previous);
    },
    onSuccess: (updated) => queryClient.setQueryData(favoritesKey, updated),
  });
  const query = useQuery({ queryKey: ["nft", nftId], queryFn: ({ signal }) => marketplaceApi.getNft(nftId, { signal }), retry: false });
  useEffect(() => {
    if (!query.data) return;
    setSelectedEdition(query.data.edition);
    setQuantity(1);
    setActiveImage(0);
    setActiveDetailTab("details");
  }, [nftId, query.data?.edition]);
  const addMutation = useMutation({
    mutationFn: () => marketplaceApi.addToCart(nftId, selectedEdition, quantity),
    onSuccess: (cart) => { queryClient.setQueryData(queryKeys.cart, cart); announce("Item adicionado ao carrinho."); void navigate({ to: "/cart" }); },
  });
  const relatedQuery = useQuery({ queryKey: ["related", nftId], queryFn: ({ signal }) => marketplaceApi.getRelatedNfts({ exclude: nftId, limit: 5 }, { signal }) });
  const zoomRef = useRef<HTMLDivElement>(null);
  useFocusTrap(zoomRef, imageZoomed, () => setImageZoomed(false));
  if (query.isLoading) return <main className="page-wrap detail-page" aria-busy="true"><div className="breadcrumb"><Link to="/">Início</Link><span>/</span><Link to="/" search={{ q: "" }}>Mercado</Link></div><section className="detail-layout detail-loading"><div className="skeleton shimmer" /><div><div className="skeleton-line shimmer" /><div className="skeleton-line short shimmer" /><div className="skeleton shimmer detail-description-skeleton" /></div></section><section className="related-section"><h2>Mais desta cole&#231;&#227;o</h2><div className="related-grid">{Array.from({ length: 5 }, (_, index) => <SkeletonCard key={index} />)}</div></section></main>;
  if (query.isError || !query.data) return <main className="page-wrap empty-page"><p className="eyebrow">Obra indisponível</p><h1>Não encontramos esse NFT.</h1><p className="muted">O link pode estar incorreto ou a obra não está mais no mercado.</p><Link to="/" className="button button-primary">Voltar ao mercado</Link></main>;
  const nft = query.data;
  const editionOptions = [...new Set(["1/1", "1/10", "1/50", nft.edition, "ABERTA"])];
  const selectedEditionLimit = selectedEdition === "ABERTA"
    ? 10
    : Math.min(10, Number(selectedEdition.split("/")[1]) || 10);
  const relatedNfts = relatedQuery.data ?? [];
  return (
    <main className="page-wrap detail-page">
      <div className="breadcrumb"><Link to="/">Início</Link><span>/</span><Link to="/" search={{ q: "" }}>Mercado</Link></div>
      <section className="detail-layout">
        <div className="detail-gallery"><div className="thumbnail-stack">{[0, 1, 2, 3].map((item) => <button type="button" className={item === activeImage ? "thumb-active" : ""} key={item} aria-label={`Ver imagem ${item + 1}`} aria-pressed={item === activeImage} onClick={() => setActiveImage(item)}><img src={nft.image} alt="" loading="lazy" /></button>)}</div><div className="detail-main-image"><img fetchPriority="high" src={nft.image} alt={`Obra ${nft.name}`} /><button type="button" className="zoom-button" aria-label="Ampliar imagem" onClick={() => setImageZoomed(true)}><Search size={17} /></button></div></div>
        <div className="detail-info">
          <h1>{nft.name}</h1>
          <div className="detail-price-row"><span className="detail-price">{nft.price} <small>ETH</small></span><span className="rating"><span>★★★★★</span> 4.8 (19 avaliações)</span></div>
          <div className="detail-about"><strong>Sobre este NFT:</strong><p className="detail-description">{nft.description}</p></div>
          <div className="edition-block"><span className="detail-label">Edição:</span><div className="edition-pills">{editionOptions.map((edition) => <button type="button" key={edition} className={`${selectedEdition === edition ? "edition-selected" : ""} ${edition === "ABERTA" ? "edition-open" : ""}`} aria-pressed={selectedEdition === edition} onClick={() => { setSelectedEdition(edition); setQuantity((current) => Math.min(current, edition === "ABERTA" ? 10 : Math.min(10, Number(edition.split("/")[1]) || 10))); }}>{edition}</button>)}</div></div>
          <div className="quantity-buy-row"><div className="quantity-control"><button aria-label="Diminuir quantidade" onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1}><Minus size={15} /></button><span>{quantity}</span><button aria-label="Aumentar quantidade" onClick={() => setQuantity(Math.min(selectedEditionLimit, quantity + 1))} disabled={quantity >= selectedEditionLimit}><Plus size={15} /></button></div><button aria-label="Comprar agora" className="button button-primary buy-button" onClick={() => addMutation.mutate()} disabled={addMutation.isPending || nft.available === 0}>{nft.available === 0 ? "Esgotado" : addMutation.isPending ? "Adicionando..." : "Comprar"} </button><button className={`button button-outline favorite-detail ${favorite ? "is-favorite" : ""}`} onClick={() => { if (!session.data) window.dispatchEvent(new Event("kurio:open-auth")); else favoriteMutation.mutate(); }} disabled={favoriteMutation.isPending}><Heart size={14} /> {favorite ? "Favoritado" : "Favoritar"}</button></div>
          <p className="detail-token">ID do token: <strong>#{nft.id.slice(-3)}</strong></p>
          <dl className="detail-metadata"><div><dt>Coleção:</dt><dd>{nft.collection}</dd></div><div><dt>Atributos:</dt><dd>Óculos, {nft.collection === "Kurio Apes" ? "Esmeralda" : nft.category ?? "Arte digital"}, Raro</dd></div></dl>
          <div className="detail-share"><strong>Compartilhar este NFT:</strong><a href={`mailto:?subject=${encodeURIComponent(nft.name)}&body=${encodeURIComponent(window.location.href)}`} aria-label="Compartilhar por e-mail">✉</a><a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(nft.name)}`} target="_blank" rel="noreferrer" aria-label="Compartilhar no X"><Twitter size={12} /></a></div>
          {addMutation.isError && <p className="form-error" role="alert">{apiErrorMessage(addMutation.error, "Não foi possível adicionar ao carrinho. Tente novamente.")}</p>}
          {favoriteMutation.isError && <p className="form-error" role="alert">Não foi possível atualizar seus favoritos. Tente novamente.</p>}
        </div>
      </section>
      <section className="detail-tabs-section">
        <div className="detail-tabs" role="tablist" aria-label="Informações da obra">
          <button type="button" role="tab" aria-selected={activeDetailTab === "details"} className={activeDetailTab === "details" ? "detail-tab-active" : ""} onClick={() => setActiveDetailTab("details")}>Detalhes do NFT</button>
          <button type="button" role="tab" aria-selected={activeDetailTab === "reviews"} className={activeDetailTab === "reviews" ? "detail-tab-active" : ""} onClick={() => setActiveDetailTab("reviews")}>Avaliações de colecionadores (19)</button>
        </div>
        {activeDetailTab === "details" ? <div className="detail-tab-content">
          <p>{nft.name} é uma obra digital finalizada à mão da coleção {nft.collection}. Cada atributo fica armazenado nos metadados do token e verificado na rede {nft.network}. A obra explora identidade, movimento e luz em uma mídia digital sem fronteiras.</p>
          <p>A propriedade inclui a arte em alta resolução, lançamentos exclusivos para colecionadores e um registro permanente de procedência registrada na rede. {nft.creator} recebe 5% de direitos autorais nas vendas secundárias, apoiando novos trabalhos e lançamentos da comunidade.</p>
          <p><strong>Rede:</strong><br />Cunhada na {nft.network} com procedência imutável e metadados armazenados no IPFS.</p>
          <p><strong>Contrato:</strong><br />Direitos autorais do criador: 5% nas vendas secundárias, pagos automaticamente pelos mercados compatíveis.</p>
          <p><strong>Direitos autorais:</strong><br />0x7A42...19E8 · Contrato inteligente ERC-721 verificado.</p>
        </div> : <div className="detail-reviews" role="tabpanel"><article><span>★★★★★</span><strong>Peça incrível, acabamento impecável.</strong><small>Colecionador verificado · há 2 semanas</small></article><article><span>★★★★★</span><strong>Uma das minhas obras favoritas da coleção.</strong><small>Colecionador verificado · há 1 mês</small></article></div>}
      </section>
      <section className="related-section"><h2>Mais desta coleção</h2><div className="related-grid" aria-busy={relatedQuery.isLoading}>{relatedQuery.isLoading ? Array.from({ length: 5 }, (_, index) => <SkeletonCard key={index} />) : relatedNfts.map((item, index) => <NftCard key={item.id} nft={item} index={index} />)}</div><div className="related-pagination" role="img" aria-label="Página 2 de 3"><i /><i className="active" /><i /></div></section>
      {imageZoomed && <div ref={zoomRef} tabIndex={-1} className="image-zoom-backdrop" role="dialog" aria-modal="true" aria-label={`Imagem ampliada de ${nft.name}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setImageZoomed(false); }}><button type="button" className="icon-button" aria-label="Fechar imagem ampliada" onClick={() => setImageZoomed(false)}><X size={20} /></button><img src={nft.image} alt={`Obra ${nft.name} ampliada`} /></div>}
    </main>
  );
}

export function CartPage() {
  const cartQuery = useCart();
  const queryClient = useQueryClient();
  const cart = cartQuery.data;
  const itemNfts = cart?.items.map((line) => ({ line, nft: line.nft })).filter((item): item is { line: Cart["items"][number]; nft: Nft } => Boolean(item.nft)) ?? [];
  const mutation = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => quantity <= 0 ? marketplaceApi.removeFromCart(id) : marketplaceApi.updateQuantity(id, quantity),
    onSuccess: (updated, variables) => { queryClient.setQueryData(queryKeys.cart, updated); announce(variables.quantity <= 0 ? "Item removido do carrinho." : `Quantidade atualizada para ${variables.quantity}. Total ${updated.total} ETH.`); },
  });
  const couponMutation = useMutation({
    mutationFn: marketplaceApi.applyCoupon,
    onSuccess: (updated) => { queryClient.setQueryData(queryKeys.cart, updated); announce("Código promocional aplicado."); },
  });
  const [coupon, setCoupon] = useState("");
  const cartRelatedQuery = useQuery({ queryKey: ["related", "cart"], queryFn: ({ signal }) => marketplaceApi.getRelatedNfts({ offset: 3, limit: 4 }, { signal }) });
  if (cartQuery.isLoading) return <main className="page-wrap"><PageHeading eyebrow="SUA COLEÇÃO" title="Carrinho" /><div className="skeleton shimmer cart-loading" /></main>;
  return (
    <main className="page-wrap cart-page">
      <div className="mobile-page-title"><Link to="/" aria-label="Voltar ao mercado"><ArrowLeft size={19} /></Link><h1>Carrinho de NFTs</h1></div>
      <div className="breadcrumb"><Link to="/">Início</Link><span>/</span><Link to="/">Mercado</Link><span>/</span><strong>Carrinho</strong></div>
      <PageHeading eyebrow="SUA PRÓXIMA OBRA ESTÁ AQUI" title="Carrinho de NFTs" description={`${itemNfts.length} ${itemNfts.length === 1 ? "obra" : "obras"} esperando por você`} />
      {itemNfts.length === 0 ? <div className="empty-cart"><div className="empty-cart-icon"><ShoppingBag size={25} /></div><h2>Seu carrinho está esperando por uma história.</h2><p>Encontre uma obra que fale com você e ela estará aqui.</p><Link to="/" className="button button-primary">Explorar o mercado <ArrowRight size={16} /></Link></div> : (
        <div className="cart-layout">
          <div className="cart-list">
            <div className="cart-list-header"><span>NFTs</span><span>Preço</span><span>Edições</span><span>Total</span><span /></div>
            {itemNfts.map(({ line, nft }) => <article className="cart-item" key={line.nftId}>
              <Link to="/nft/$nftId" params={{ nftId: nft.id }} className="cart-art"><img src={nft.image} alt={nft.name} /></Link>
              <div className="cart-nft-name"><Link to="/nft/$nftId" params={{ nftId: nft.id }}>{nft.name}</Link><span>Edição: {line.edition ?? nft.edition} · #{nft.id.slice(-3)}</span><small>por {nft.creator}</small></div>
              <span className="cart-unit-price">{nft.price} ETH</span>
              <div className="quantity-control cart-quantity"><button aria-label={`Diminuir ${nft.name}`} disabled={line.quantity <= 1} onClick={() => mutation.mutate({ id: nft.id, quantity: line.quantity - 1 })}><Minus size={13} /></button><span>{line.quantity}</span><button aria-label={`Aumentar ${nft.name}`} disabled={line.quantity >= editionLimit(line.edition ?? nft.edition)} onClick={() => mutation.mutate({ id: nft.id, quantity: line.quantity + 1 })}><Plus size={13} /></button></div>
              <strong className="cart-line-total">{multiplyEth(nft.price, line.quantity)} ETH</strong>
              <button className="remove-item icon-button" aria-label={`Remover ${nft.name}`} onClick={() => mutation.mutate({ id: nft.id, quantity: 0 })}><Trash2 size={16} /></button>
            </article>)}
            <Link to="/" className="text-link continue-shopping"><ArrowLeft size={15} /> Continuar explorando</Link>
          </div>
          <aside className="cart-summary">
            <h2>Resumo da carteira <span>✳</span></h2>
            <form className="coupon-form" onSubmit={(event: FormEvent) => { event.preventDefault(); couponMutation.mutate(coupon); }}>
              <label htmlFor="coupon">Código promocional</label><div><input id="coupon" value={coupon} onChange={(event) => setCoupon(event.target.value)} placeholder="Ex.: KURIO10" aria-invalid={couponMutation.isError || undefined} aria-describedby={couponMutation.isError ? "coupon-error" : undefined} /><button className="button button-primary button-small" disabled={couponMutation.isPending}>Aplicar</button></div>
            </form>
            {couponMutation.isSuccess && <p className="success-note"><Check size={14} /> Código KURIO10 aplicado: 10% de desconto.</p>}
            {couponMutation.isError && <p className="form-error" id="coupon-error" role="alert">{(couponMutation.error as Error).message.includes("422") ? "Cupom inválido. Tente KURIO10." : "Não foi possível validar o cupom."}</p>}
            <div className="summary-lines"><div><span>Subtotal</span><span>{cart?.subtotal} ETH</span></div><div><span>Desconto do lançamento</span><span>(−) {cart?.discount} ETH</span></div><div><span>Taxa de rede <small>Taxa estimada</small></span><span>{cart?.networkFee} ETH</span></div><div className="summary-total"><strong>Total</strong><strong>{cart?.total} <small>ETH</small></strong></div></div>
            <Link to="/checkout" className="button button-primary checkout-link">Continuar para pagamento <ArrowRight size={16} /></Link>
            <p className="secure-note"><Wallet size={14} /> Compra segura. Pagamento simulado.</p>
          </aside>
        </div>
      )}
      <section className="related-section cart-related"><SectionTitle eyebrow="ESCOLHAS DE COLECIONADORES" title="Talvez você também goste" /><div className="related-grid">{(cartRelatedQuery.data ?? []).map((nft, index) => <NftCard key={nft.id} nft={nft} index={index} />)}</div></section>
    </main>
  );
}

export function CheckoutPage() {
  const cartQuery = useCart();
  const cart = cartQuery.data;
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const walletsQuery = useQuery({
    queryKey: ["wallets", session?.email],
    queryFn: ({ signal }) => marketplaceApi.getWallets({ signal }),
    enabled: Boolean(session),
  });
  const [wallet, setWallet] = useState("provider:MetaMask");
  const [walletType, setWalletType] = useState<CollectorWallet["provider"]>("MetaMask");
  const [walletAddress, setWalletAddress] = useState("");
  const [isMobileCheckout, setIsMobileCheckout] = useState(() => window.matchMedia("(max-width: 600px)").matches);
  const [walletNetwork, setWalletNetwork] = useState<CollectorWallet["network"]>("Ethereum");
  const [checkoutCoupon, setCheckoutCoupon] = useState("");
  const [profileName, setProfileName] = useState(session?.name ?? "");
  const [secondaryAddress, setSecondaryAddress] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [ensName, setEnsName] = useState("");
  const [collectorNote, setCollectorNote] = useState("");
  const [checkoutFeedback, setCheckoutFeedback] = useState("");
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const fieldA11y = (field: string) => invalidFields.includes(field) ? { "aria-invalid": true, "aria-describedby": "checkout-feedback" } as const : {};
  const [termsAccepted, setTermsAccepted] = useState(false);
  const collectorDetailsRef = useRef<HTMLDetailsElement>(null);
  const cartNetworks = [...new Set((cart?.items ?? []).map((line) => line.nft?.network).filter((network): network is string => Boolean(network)))];
  const checkoutNetwork = cartNetworks.length === 1 ? cartNetworks[0] as CollectorWallet["network"] : undefined;
  useEffect(() => {
    const media = window.matchMedia("(max-width: 600px)");
    const updateViewport = () => setIsMobileCheckout(media.matches);
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);
  useEffect(() => {
    if (session && !profileName) setProfileName(session.name);
  }, [session, profileName]);
  useEffect(() => {
    if (!checkoutNetwork || checkoutNetwork === walletNetwork) return;
    setWalletNetwork(checkoutNetwork);
    setWalletAddress("");
    setWallet(`provider:${walletType}`);
  }, [checkoutNetwork, walletNetwork, walletType]);
  const couponMutation = useMutation({
    mutationFn: marketplaceApi.applyCoupon,
    onSuccess: (updatedCart) => queryClient.setQueryData(queryKeys.cart, updatedCart),
  });
  const [idempotencyKey, setIdempotencyKey] = useState(() => sessionStorage.getItem("kurio:pending-order-key") ?? "");
  const pendingOrderQuery = useQuery({
    queryKey: ["pending-order", idempotencyKey],
    queryFn: ({ signal }) => marketplaceApi.getOrder(idempotencyKey, { signal }),
    enabled: Boolean(idempotencyKey && cart && cart.items.length === 0),
    retry: false,
  });
  useEffect(() => {
    if (!pendingOrderQuery.data) return;
    void navigate({ to: "/order/$orderId", params: { orderId: pendingOrderQuery.data.id } });
  }, [pendingOrderQuery.data, navigate]);
  const orderMutation = useMutation({
    mutationFn: (request: { wallet: CheckoutWallet; customer: CheckoutContact; quoteFingerprint: string; key: string; fingerprint: string }) =>
      marketplaceApi.createOrder(request.wallet, request.customer, request.quoteFingerprint, request.key, request.fingerprint),
    onSuccess: (order) => {
      queryClient.setQueryData(["order", order.id], order);
      void navigate({ to: "/order/$orderId", params: { orderId: order.id } });
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      if (apiStatusCode(error) === 409) window.dispatchEvent(new Event("kurio:scenario-reset"));
      if (apiStatusCode(error) === 401) {
        queryClient.setQueryData(queryKeys.session, null);
        window.dispatchEvent(new Event("kurio:scenario-reset"));
        window.dispatchEvent(new Event("kurio:open-auth"));
      }
    },
  });
  const soldOut = cart?.items.some((line) => line.nft?.available === 0) ?? false;
  if (pendingOrderQuery.data) return <main className="page-wrap empty-page"><p className="eyebrow">PEDIDO RECUPERADO</p><h1>Estamos restaurando seu recibo.</h1><span className="spinner" /></main>;
  if (cartQuery.isLoading) return <main className="page-wrap checkout-page"><div className="skeleton shimmer cart-loading" /></main>;
  if (cartQuery.isError) return <main className="page-wrap empty-page"><PageHeading eyebrow="PAGAMENTO" title="Não foi possível carregar o carrinho" description="Tente novamente antes de confirmar o pedido." /><button className="button button-primary" onClick={() => void cartQuery.refetch()}>Tentar novamente</button></main>;
  if (!cart?.items.length) return <main className="page-wrap empty-page"><PageHeading eyebrow="PAGAMENTO" title="Seu carrinho está vazio" description="Adicione uma obra antes de iniciar o checkout." /><Link to="/" className="button button-primary">Explorar mercado</Link></main>;
  return (
    <main className="page-wrap checkout-page">
      <div className="mobile-page-title checkout-mobile-title"><Link to="/cart" aria-label="Voltar ao carrinho"><ArrowLeft size={19} /></Link><h1>Pagamento com carteira</h1></div>
      <div className="breadcrumb"><Link to="/">Início</Link><span>/</span><Link to="/">Mercado</Link><span>/</span><strong>Pagamento</strong></div>
      <h1 className="checkout-page-title">Perfil do colecionador</h1>
      <form className="checkout-layout" onSubmit={(event) => {
        event.preventDefault();
        setCheckoutFeedback("");
        if (soldOut || cartQuery.isFetching) return;
        if (!session || !cart || !checkoutNetwork) {
          setCheckoutFeedback("Todos os NFTs do carrinho precisam pertencer à mesma rede para concluir esta demonstração.");
          return;
        }
        const formData = new FormData(event.currentTarget);
        const customer: CheckoutContact = {
          displayName: String(formData.get("displayName") ?? "").trim(),
          username: String(formData.get("username") ?? "").trim(),
          profileName: profileName.trim(),
          email: String(formData.get("email") ?? "").trim().toLowerCase(),
        };
        const selectedSavedWallet = walletsQuery.data?.find((item) => `saved:${item.id}` === wallet);
        const walletForOrder: CheckoutWallet = {
          provider: selectedSavedWallet?.provider ?? walletType,
          network: selectedSavedWallet?.network ?? walletNetwork,
          address: selectedSavedWallet?.address ?? walletAddress.trim(),
          ...(selectedSavedWallet ? { alias: selectedSavedWallet.alias } : {}),
        };
        const invalidFields = [
          !customer.displayName && "displayName",
          !/^[a-zA-Z0-9_]{3,20}$/.test(customer.username) && "username",
          !customer.profileName && "profileName",
          (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) || customer.email !== session.email.toLowerCase()) && "email",
          !isValidWalletAddress(walletForOrder.network, walletForOrder.address) && "walletAddress",
          !termsAccepted && "terms",
        ].filter((field): field is string => Boolean(field));
        setInvalidFields(invalidFields);
        const invalidContact = !customer.displayName || !/^[a-zA-Z0-9_]{3,20}$/.test(customer.username) ||
          !customer.profileName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) ||
          customer.email !== session.email.toLowerCase();
        if (invalidContact || !termsAccepted || !isValidWalletAddress(walletForOrder.network, walletForOrder.address)) {
          collectorDetailsRef.current && (collectorDetailsRef.current.open = true);
          setCheckoutFeedback(invalidContact
            ? "Confira nome, usuário e e-mail do colecionador. O usuário deve ter de 3 a 20 letras, números ou _."
            : !termsAccepted
              ? "Aceite os termos da compra para continuar."
              : "Informe um endereço válido para a rede selecionada.");
          return;
        }
        const quoteFingerprint = getCartQuoteFingerprint(cart);
        const fingerprint = JSON.stringify({ wallet: walletForOrder, customer, quoteFingerprint });
        let key = sessionStorage.getItem("kurio:pending-order-key");
        const savedFingerprint = sessionStorage.getItem("kurio:pending-order-fingerprint");
        if (!key || savedFingerprint !== fingerprint) key = crypto.randomUUID();
        sessionStorage.setItem("kurio:pending-order-key", key);
        sessionStorage.setItem("kurio:pending-order-fingerprint", fingerprint);
        setIdempotencyKey(key);
        orderMutation.reset();
        orderMutation.mutate({ wallet: walletForOrder, customer, quoteFingerprint, key, fingerprint });
      }}>
        <section className="checkout-form-section">
          {!session && <div className="checkout-login-notice"><CircleUserRound size={20} /><div><strong>Entre para continuar</strong><p>Seu carrinho continua salvo quando você entrar na sua conta.</p></div><button type="button" className="text-link" onClick={() => window.dispatchEvent(new Event("kurio:open-auth"))}>Entrar <ArrowRight size={14} /></button></div>}
          <details className="checkout-collector-details" ref={collectorDetailsRef} open={!isMobileCheckout}>
            <summary>Dados do colecionador</summary>
            <div className="checkout-profile-fields">
              <label>Nome de exibição <b>*</b>              <input name="displayName" defaultValue={session?.name ?? ""} placeholder="Seu nome" {...fieldA11y("displayName")} /></label>
                            <label>Nome de usuário <b>*</b><input name="username" defaultValue={session?.email.split("@")[0] ?? ""} placeholder="Seu usuário" {...fieldA11y("username")} /></label>
              <label>Rede <b>*</b><select value={walletNetwork} onChange={(event) => { const network = event.target.value as CollectorWallet["network"]; setWalletNetwork(network); setWalletAddress(""); setWallet(`provider:${walletType}`); }}><option value="Ethereum" disabled={checkoutNetwork !== "Ethereum"}>Ethereum</option><option value="Polygon" disabled={checkoutNetwork !== "Polygon"}>Polygon</option><option value="Solana" disabled={checkoutNetwork !== "Solana"}>Solana</option></select></label>
              <label>Nome do perfil <b>*</b><input value={profileName} onChange={(event) => setProfileName(event.target.value)}               placeholder="Nome do perfil" {...fieldA11y("profileName")} /></label>
                            <label>Endereço da carteira <b>*</b><input value={walletAddress} onChange={(event) => setWalletAddress(event.target.value)} {...fieldA11y("walletAddress")} placeholder={walletNetwork === "Solana" ? "Endereço Solana (base58)" : "Endereço 0x da carteira"} /></label>
              <label>ENS ou carteira secundária (opcional)<input value={secondaryAddress} onChange={(event) => setSecondaryAddress(event.target.value)} placeholder="ENS ou endereço secundário" /></label>
              <label>Tipo de carteira <b>*</b><select value={walletType} onChange={(event) => { const provider = event.target.value as CollectorWallet["provider"]; setWalletType(provider); setWallet(`provider:${provider}`); }}><option>MetaMask</option><option>WalletConnect</option><option>Coinbase Wallet</option></select></label>
              <label>Código de indicação<input value={referralCode} onChange={(event) => setReferralCode(event.target.value)} placeholder="Código opcional" /></label>
              <label>E-mail <b>*</b><input name="email" type="email" defaultValue={session?.email ?? ""} placeholder="voce@email.com" {...fieldA11y("email")} /></label>
              <label>Nome ENS<input value={ensName} onChange={(event) => setEnsName(event.target.value)} placeholder="seunome.eth" /></label>
            </div>
            <label className="checkout-alternate-wallet"><input type="checkbox" /> <span>Usar outra carteira?</span></label>
            <label className="checkout-observation">Observação do colecionador (opcional)<textarea value={collectorNote} onChange={(event) => setCollectorNote(event.target.value)} /></label>
          </details>
        </section>
        <aside className="checkout-summary">
          <h2>Seus NFTs</h2>
          <div className="checkout-items-heading"><span>NFTs</span><span>Subtotal</span></div>
          {cart.items.map((line) => { const nft = line.nft; return nft ? <div className="checkout-item" key={line.nftId}><img src={nft.image} alt="" /><div><strong>{nft.name}</strong><span>Edição {line.edition ?? nft.edition} · x{line.quantity}</span></div><b>{multiplyEth(nft.price, line.quantity)} ETH</b></div> : null; })}
          <div className="checkout-coupon"><label htmlFor="checkout-coupon">Tem um código promocional? Aplique aqui</label><div><input id="checkout-coupon" value={checkoutCoupon} onChange={(event) => setCheckoutCoupon(event.target.value)} placeholder="Código promocional" aria-invalid={couponMutation.isError || undefined} aria-describedby={couponMutation.isError ? "checkout-coupon-error" : undefined} /><button type="button" onClick={() => couponMutation.mutate(checkoutCoupon)} disabled={couponMutation.isPending}>Aplicar</button></div></div>
          {couponMutation.isError && <p className="form-error" id="checkout-coupon-error" role="alert">Não foi possível aplicar o código promocional.</p>}
          <div className="checkout-total-lines"><div><span>Subtotal</span><span>{cart.subtotal} ETH</span></div><div><span>Desconto do lançamento</span><span>(−) {cart.discount} ETH</span></div><div><span>Taxa de rede</span><span>{cart.networkFee} ETH</span></div><div className="checkout-grand-total"><strong>Total</strong><strong>{cart.total} ETH</strong></div></div>
          <section className="checkout-wallet-section"><h2>Carteira e rede</h2><div className="checkout-wallet-options">
            {walletsQuery.data?.filter((item) => item.network === checkoutNetwork).map((item) => <label className={`checkout-wallet-option ${wallet === `saved:${item.id}` ? "selected" : ""}`} key={item.id}><input type="radio" name="wallet" value={`saved:${item.id}`} checked={wallet === `saved:${item.id}`} onChange={() => { setWallet(`saved:${item.id}`); setWalletAddress(item.address); setWalletNetwork(item.network); setWalletType(item.provider); }} /><span className="checkout-radio" /><span className="checkout-wallet-name"><strong>{item.label}{item.primary ? " · Principal" : ""}</strong><small>{item.alias}</small></span><small className="checkout-wallet-kind">{item.provider}</small></label>)}
            {(["MetaMask", "WalletConnect", "Coinbase Wallet"] as const).map((item) => <label className={`checkout-wallet-option ${wallet === `provider:${item}` ? "selected" : ""}`} key={item}><input type="radio" name="wallet" value={`provider:${item}`} checked={wallet === `provider:${item}`} onChange={() => { setWallet(`provider:${item}`); setWalletType(item); setWalletAddress(""); }} /><span className="checkout-radio" /><span className="checkout-wallet-name"><strong>{item}</strong></span>{item === "WalletConnect" && <small className="checkout-wallet-kind">METAMASK · WALLETCONNECT · COINBASE</small>}</label>)}
          </div></section>
          {cartNetworks.length > 1 && <p className="form-error" role="alert">O carrinho contém NFTs de redes diferentes. Separe os itens por rede para pagar.</p>}
          {soldOut && <p className="form-error" role="alert">Um item do carrinho está esgotado. Remova-o para continuar.</p>}
          {checkoutFeedback && <p className="form-error" id="checkout-feedback" role="alert">{checkoutFeedback}</p>}
          {!session && <p className="form-error" role="status">Entre na sua conta antes de confirmar a compra.</p>}
          {orderMutation.isError && <p className="form-error" role="alert">{apiErrorMessage(orderMutation.error, "Não foi possível criar o pedido. Seus itens continuam no carrinho.")} Se houve timeout, tente novamente para recuperar a mesma tentativa.</p>}
          <label className="checkout-terms"><input type="checkbox" name="terms" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} {...fieldA11y("terms")} /> Li e concordo com os termos da compra e a política da Kurio.</label>
          <Button type="submit" variant="default" size="lg" className="button button-primary confirm-order" disabled={!session || !checkoutNetwork || orderMutation.isPending || soldOut || cartQuery.isFetching}>{orderMutation.isPending ? <><span className="spinner" /> Confirmando pedido...</> : "Confirmar compra"}</Button>
          <p className="checkout-safe"><Wallet size={14} /> Nenhuma transação real será realizada.</p>
        </aside>
      </form>
    </main>
  );
}

export function AccountPage({ modal = false, onClose }: { modal?: boolean; onClose?: () => void } = {}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const redirectTo = useSearch({ strict: false }).redirect;
  const goAfterAuth = async () => {
    onClose?.();
    if (modal) return;
    if (typeof redirectTo === "string" && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) router.history.push(redirectTo);
    else await navigate({ to: "/account/profile" });
  };
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [authFeedback, setAuthFeedback] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, modal);
  useEffect(() => {
    if (!modal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [modal, onClose]);
  const signIn = useMutation({
    mutationKey: ["sign-in"],
    mutationFn: () => marketplaceApi.signIn(email, password),
    onSuccess: async (user) => {
      await queryClient.cancelQueries();
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "cart" });
      queryClient.setQueryData(queryKeys.session, user);
      queryClient.setQueryData(queryKeys.cart, await marketplaceApi.getCart());
      await goAfterAuth();
    },
  });
  const register = useMutation({
    mutationFn: () => marketplaceApi.register(name, email, password),
    onSuccess: async (user) => {
      await queryClient.cancelQueries();
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "cart" });
      queryClient.setQueryData(queryKeys.session, user);
      queryClient.setQueryData(queryKeys.cart, await marketplaceApi.getCart());
      await goAfterAuth();
    },
  });
  const signOut = useMutation({
    mutationFn: async () => {
      await marketplaceApi.signOut();
      return queryClient.clear();
    },
  });
  const hasAuthError = Boolean(authFeedback || signIn.isError || register.isError);
  const authFieldA11y = { "aria-invalid": hasAuthError || undefined, "aria-describedby": hasAuthError ? "auth-error" : undefined } as const;
  if (session) return <main className="page-wrap account-page">
    <div className="account-dashboard">
      <div className="account-dashboard-heading"><span className="profile-avatar large-avatar">{session.name.slice(0, 1).toUpperCase()}</span><div><p className="eyebrow">SUA CONTA KURIO</p><h1>Boas-vindas, {session.name}.</h1><p>{session.email}</p></div></div>
      <p className="muted">Sua coleção, seus dados e suas carteiras — tudo em um só lugar.</p>
      <div className="account-dashboard-links">
        <Link to="/account/profile"><CircleUserRound size={20} /><span><strong>Meu perfil</strong><small>Seus dados e preferências</small></span><ArrowRight size={16} /></Link>
        <Link to="/account/wallets"><Wallet size={20} /><span><strong>Minhas carteiras</strong><small>Gerencie seus endereços</small></span><ArrowRight size={16} /></Link>
        <Link to="/cart"><ShoppingBag size={20} /><span><strong>Minha coleção</strong><small>Continue de onde parou</small></span><ArrowRight size={16} /></Link>
      </div>
      <button className="button button-outline dashboard-signout" onClick={() => signOut.mutate()}>Sair da conta</button>
    </div>
  </main>;
  return (
    <main className={modal ? "auth-modal-backdrop" : "page-wrap account-page"} onMouseDown={modal ? (event) => {
      if (event.target === event.currentTarget) onClose?.();
    } : undefined}>
      <div ref={dialogRef} className={`account-card${modal ? ` auth-modal-card ${creatingAccount ? "auth-modal-register" : "auth-modal-login"}` : ""}`} role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-labelledby={modal ? "auth-modal-title" : undefined}>
        {modal && <button type="button" className="auth-modal-close icon-button" aria-label="Fechar login" onClick={onClose}><X size={15} /></button>}
        {!modal && <Link to="/" className="account-back"><ArrowLeft size={16} /> Voltar ao mercado</Link>}
        {modal ? <>
          <Link to="/" className="auth-mobile-brand">KURIO</Link>
          <div className="auth-modal-tabs" role="group" aria-label="Acesso à conta">
            <button type="button" aria-pressed={!creatingAccount} className={!creatingAccount ? "auth-tab-active" : ""} onClick={() => { setCreatingAccount(false); setAuthFeedback(""); register.reset(); signIn.reset(); }}>Entrar</button>
            <span aria-hidden="true">|</span>
            <button type="button" aria-pressed={creatingAccount} className={creatingAccount ? "auth-tab-active" : ""} onClick={() => { setCreatingAccount(true); setAuthFeedback(""); register.reset(); signIn.reset(); }}>Criar conta</button>
          </div>
          <h1 id="auth-modal-title" className="sr-only">{creatingAccount ? "Criar sua conta" : "Entre na sua conta"}</h1>
          <h2 className="auth-mobile-heading">{creatingAccount ? "Criar perfil de colecionador" : "Entrar"}</h2>
          <p className="auth-modal-description">{creatingAccount ? "Crie seu perfil de colecionador e conecte uma carteira quando quiser." : "Entre para gerenciar sua carteira, coleção e perfil de criador."}</p>
          <form onSubmit={(event) => {
            event.preventDefault();
            setAuthFeedback("");
            if (creatingAccount && password !== confirmPassword) {
              setAuthFeedback("As senhas não coincidem.");
              return;
            }
            if (creatingAccount) register.mutate();
            else signIn.mutate();
          }} className="account-form auth-modal-form">
            {creatingAccount && <label className="auth-modal-field"><span className="sr-only">Nome de usuário</span><Input aria-label="Nome de usuário" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome de usuário" minLength={2} required /></label>}
            <label className="auth-modal-field"><span className="sr-only">E-mail</span><Input type="email" autoFocus={modal && !creatingAccount} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Digite seu e-mail" required {...authFieldA11y} /></label>
            <div className="auth-modal-field auth-password-field"><Input aria-label="Senha" type={showPassword ? "text" : "password"} autoComplete={creatingAccount ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Senha" minLength={creatingAccount ? 8 : 6} required {...authFieldA11y} /><button type="button" className="auth-password-toggle" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={12} /> : <Eye size={12} />}</button></div>
            {creatingAccount && <div className="auth-modal-field auth-password-field"><Input aria-label="Confirmar senha" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirmar senha" minLength={8} required {...authFieldA11y} /><button type="button" className="auth-password-toggle" aria-label={showConfirmPassword ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"} onClick={() => setShowConfirmPassword(!showConfirmPassword)}>{showConfirmPassword ? <EyeOff size={12} /> : <Eye size={12} />}</button></div>}
            {!creatingAccount && <button type="button" className="auth-forgot-password" onClick={() => setAuthFeedback("A recuperação de senha não está disponível nesta demonstração.")}>Esqueceu a senha?</button>}
            {(authFeedback || signIn.isError || register.isError) && <p className="form-error auth-modal-error" id="auth-error" role="alert">{authFeedback || apiErrorMessage(register.error ?? signIn.error, creatingAccount ? "Não foi possível criar a conta." : "Não foi possível entrar.")}</p>}
            <Button type="submit" variant="default" size="lg" aria-label={creatingAccount ? "Criar conta" : "Entrar na Kurio"} className="button button-primary account-submit auth-modal-submit" disabled={signIn.isPending || register.isPending}>{signIn.isPending || register.isPending ? "Aguarde..." : creatingAccount ? "Criar conta" : "Entrar"}</Button>
          </form>
          <div className="auth-social-section"><span>Ou continue com</span><button type="button" className="auth-social-button" onClick={() => setAuthFeedback("O acesso com Google não está disponível nesta demonstração.")}><GoogleLogo />Continuar com Google</button><button type="button" className="auth-social-button" onClick={() => setAuthFeedback("O acesso com Facebook não está disponível nesta demonstração.")}><FacebookLogo />Continuar com Facebook</button></div>
          <p className="auth-mobile-switch">{creatingAccount ? "Já tem uma conta?" : "Novo na Kurio?"} <button type="button" onClick={() => { setCreatingAccount(!creatingAccount); setAuthFeedback(""); register.reset(); signIn.reset(); }}>{creatingAccount ? "Entre" : "Crie uma conta"}</button></p>
        </> : <>
          <p className="eyebrow">{creatingAccount ? "FAÇA PARTE DA KURIO" : "BEM-VINDO DE VOLTA"}</p><h1>{creatingAccount ? "Crie sua conta." : "Entre na sua conta."}</h1><p className="muted">Sua próxima grande descoberta está a um passo.</p>
          <form onSubmit={(event) => { event.preventDefault(); if (creatingAccount) register.mutate(); else signIn.mutate(); }} className="account-form">
            {creatingAccount && <label>Nome de exibição<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome" minLength={2} required /></label>}
            <label>E-mail<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" required {...authFieldA11y} /></label>
            <label>Senha<input type="password" autoComplete={creatingAccount ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={creatingAccount ? "Mínimo de 8 caracteres" : "Pelo menos 6 caracteres"}             minLength={creatingAccount ? 8 : 6} required {...authFieldA11y} /></label>
                        {(signIn.isError || register.isError) && <p className="form-error" id="auth-error" role="alert">{apiErrorMessage(register.error ?? signIn.error, creatingAccount ? "Não foi possível criar a conta." : "Não foi possível entrar.")}</p>}
            <button className="button button-primary account-submit" disabled={signIn.isPending || register.isPending}>{signIn.isPending || register.isPending ? "Aguarde..." : creatingAccount ? "Criar perfil" : "Entrar na Kurio"} <ArrowRight size={16} /></button>
          </form>
          <p className="account-switch">{creatingAccount ? "Já tem uma conta?" : "Novo na Kurio?"} <button type="button" onClick={() => { setCreatingAccount(!creatingAccount); register.reset(); signIn.reset(); }}> {creatingAccount ? "Entrar" : "Criar uma conta"}</button></p>
          <p className="account-hint">Use a conta de demonstração indicada no README ou crie seu próprio perfil.</p>
        </>}
      </div>
    </main>
  );
}

export function ProfilePage() {
  const { data: session } = useSession();
  useRedirectWhenSignedOut(session);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const profileQuery = useQuery({
    queryKey: ["profile", session?.email],
    queryFn: ({ signal }) => marketplaceApi.getProfile({ signal }),
    enabled: Boolean(session),
  });
  const [profile, setProfile] = useState<CollectorProfile>({
    displayName: "", username: "", email: "", ensName: "", avatar: "",
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  useEffect(() => {
    if (profileQuery.data) setProfile(profileQuery.data);
  }, [profileQuery.data]);
  const saveProfile = useMutation({
    mutationFn: () => marketplaceApi.updateProfile(profile),
    onSuccess: async (updated) => {
      queryClient.setQueryData(["profile", session?.email], updated);
      if (session) queryClient.setQueryData(queryKeys.session, { ...session, name: updated.displayName });
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
  const changePassword = useMutation({ mutationFn: () => marketplaceApi.updatePassword(currentPassword, newPassword) });
  const logOut = useMutation({
    mutationFn: marketplaceApi.signOut,
    onSuccess: () => { queryClient.clear(); void navigate({ to: "/account" }); },
  });
  if (!session) return <AccountRequired />;
  if (profileQuery.isLoading) return <main className="page-wrap account-page"><div className="skeleton shimmer account-loading" /></main>;
  return <main className="page-wrap profile-page">
    <div className="account-area">
      <aside className="account-sidebar"><h2>Meu perfil</h2><Link to="/account/profile" className="account-side-active"><CircleUserRound size={16} />Dados do perfil</Link><Link to="/account/wallets"><Wallet size={16} />Carteiras</Link><Link to="/cart"><ShoppingBag size={16} />Minha coleção</Link><button onClick={() => logOut.mutate()}><ArrowLeft size={16} />Sair</button></aside>
      <div className="account-content">
        <div className="profile-content-heading"><div><h1>Perfil do Colecionador</h1><p>Cuide dos detalhes que fazem sua coleção ser sua.</p></div><ShieldCheck size={23} /></div>
        {profileQuery.isError && <div className="inline-error"><p>Não foi possível carregar o perfil.</p><button className="button button-outline" onClick={() => void profileQuery.refetch()}>Tentar novamente</button></div>}
        <form className="profile-form" onSubmit={(event) => { event.preventDefault(); saveProfile.mutate(); }}>
          <label>Nome de exibição <b>*</b><input value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} required minLength={2} aria-invalid={saveProfile.isError || undefined} aria-describedby={saveProfile.isError ? "profile-error" : undefined} /></label>
          <label>Nome de usuário <b>*</b><input value={profile.username} onChange={(event) => setProfile({ ...profile, username: event.target.value })} required minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]{3,20}" aria-invalid={saveProfile.isError || undefined} aria-describedby={saveProfile.isError ? "profile-error" : undefined} /><small>3 a 20 letras, números ou _</small></label>
          <label>E-mail <b>*</b><input type="email" value={profile.email} disabled /><small>O e-mail de acesso não pode ser editado nesta demonstração.</small></label>
          <label>Nome ENS<input value={profile.ensName} onChange={(event) => setProfile({ ...profile, ensName: event.target.value })} placeholder="seunome.eth" /></label>
          <div className="avatar-field"><span>Avatar</span><div className="avatar-picker">{profile.avatar ? <img src={profile.avatar} alt="Avatar do perfil" /> : <span className="avatar-placeholder">{profile.displayName.slice(0, 1).toUpperCase() || "K"}</span>}<label className="button button-outline avatar-upload"><Camera size={14} /> Alterar<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) { event.currentTarget.setCustomValidity("A imagem deve ter até 1 MB."); event.currentTarget.reportValidity(); return; } const reader = new FileReader(); reader.onload = () => setProfile((current) => ({ ...current, avatar: String(reader.result) })); reader.readAsDataURL(file); }} /></label>{profile.avatar && <button type="button" className="text-link" onClick={() => setProfile({ ...profile, avatar: "" })}>Remover</button>}</div></div>
          {saveProfile.isError && <p className="form-error" id="profile-error" role="alert">{apiErrorMessage(saveProfile.error, "Não foi possível salvar seu perfil.")}</p>}
          {saveProfile.isSuccess && <p className="success-note" role="status"><Check size={14} /> Perfil salvo com sucesso.</p>}
          <button className="button button-primary profile-save" disabled={saveProfile.isPending}>{saveProfile.isPending ? "Salvando..." : "Salvar alterações"}</button>
        </form>
        <section className="password-section"><h2>Alterar senha</h2><form className="password-form" onSubmit={(event) => { event.preventDefault(); if (newPassword !== confirmPassword) return; changePassword.mutate(); }}>
          <label>Senha atual<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required aria-invalid={changePassword.isError || undefined} aria-describedby={changePassword.isError ? "password-error" : undefined} /></label>
          <label>Nova senha<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /></label>
          <label>Confirmar nova senha<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required aria-invalid={(confirmPassword && newPassword !== confirmPassword) || undefined} aria-describedby={confirmPassword && newPassword !== confirmPassword ? "password-mismatch" : undefined} /></label>
          {confirmPassword && newPassword !== confirmPassword && <p className="form-error" id="password-mismatch" role="alert">As senhas não correspondem.</p>}
          {changePassword.isError && <p className="form-error" id="password-error" role="alert">{apiErrorMessage(changePassword.error, "Não foi possível alterar a senha.")}</p>}
          {changePassword.isSuccess && <p className="success-note" role="status"><Check size={14} /> Senha alterada.</p>}
          <button className="button button-outline" disabled={changePassword.isPending || newPassword !== confirmPassword}>Atualizar senha</button>
        </form></section>
      </div>
    </div>
  </main>;
}

export function WalletsPage() {
  const { data: session } = useSession();
  useRedirectWhenSignedOut(session);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const walletsQuery = useQuery({
    queryKey: ["wallets", session?.email],
    queryFn: ({ signal }) => marketplaceApi.getWallets({ signal }),
    enabled: Boolean(session),
  });
  const initialWallet: Omit<CollectorWallet, "id"> & { id?: string } = {
    label: "", alias: "", address: "", network: "Ethereum", provider: "MetaMask", primary: false,
  };
  const [wallet, setWallet] = useState(initialWallet);
  const save = useMutation({
    mutationFn: () => marketplaceApi.saveWallet(wallet),
    onSuccess: (updated) => { queryClient.setQueryData(["wallets", session?.email], updated); setWallet(initialWallet); announce("Carteira salva."); },
  });
  const remove = useMutation({
    mutationFn: marketplaceApi.deleteWallet,
    onSuccess: (updated) => { queryClient.setQueryData(["wallets", session?.email], updated); announce("Carteira removida."); },
  });
  const logOut = useMutation({
    mutationFn: marketplaceApi.signOut,
    onSuccess: () => { queryClient.clear(); void navigate({ to: "/account" }); },
  });
  if (!session) return <AccountRequired />;
  const wallets = walletsQuery.data ?? [];
  return <main className="page-wrap profile-page">
    <div className="account-area">
      <aside className="account-sidebar"><h2>Meu perfil</h2><Link to="/account/profile"><CircleUserRound size={16} />Dados do perfil</Link><Link to="/account/wallets" className="account-side-active"><Wallet size={16} />Carteiras</Link><Link to="/cart"><ShoppingBag size={16} />Minha coleção</Link><button onClick={() => logOut.mutate()}><ArrowLeft size={16} />Sair</button></aside>
      <div className="account-content">
        <div className="profile-content-heading"><div><h1>Carteira principal</h1><p>Carteiras salvas ficam disponíveis ao finalizar uma compra.</p></div><button className="text-link" onClick={() => { setWallet({ ...initialWallet }); document.getElementById("wallet-label")?.focus(); }}>+ Adicionar carteira</button></div>
        {walletsQuery.isError && <div className="inline-error"><p>Não foi possível carregar as carteiras.</p><button className="button button-outline" onClick={() => void walletsQuery.refetch()}>Tentar novamente</button></div>}
        <form className="wallet-form" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
          <div className="wallet-form-heading"><div><h2>{wallet.id ? "Editar carteira" : "Carteira principal"}</h2><p>Informações usadas apenas nesta demonstração.</p></div></div>
          <div className="profile-form wallet-form-grid">
            <label>Nome de exibição <b>*</b><input id="wallet-label" value={wallet.label} onChange={(event) => setWallet({ ...wallet, label: event.target.value })} placeholder="Minha carteira principal" required minLength={2} /></label>
            <label>Apelido da carteira <b>*</b><input value={wallet.alias} onChange={(event) => setWallet({ ...wallet, alias: event.target.value })} placeholder="Colecionador.eth" required /></label>
            <label>Rede <b>*</b><select value={wallet.network} onChange={(event) => setWallet({ ...wallet, network: event.target.value as CollectorWallet["network"] })}><option>Ethereum</option><option>Polygon</option><option>Solana</option></select></label>
            <label>Tipo de carteira <b>*</b><select value={wallet.provider} onChange={(event) => setWallet({ ...wallet, provider: event.target.value as CollectorWallet["provider"] })}><option>MetaMask</option><option>WalletConnect</option><option>Coinbase Wallet</option></select></label>
            <label className="wallet-address-field">Endereço da carteira <b>*</b><input value={wallet.address} onChange={(event) => setWallet({ ...wallet, address: event.target.value })} placeholder={wallet.network === "Solana" ? "Endereço Solana (base58)" : "0x..."} required aria-invalid={save.isError || undefined} aria-describedby={save.isError ? "wallet-error" : undefined} /></label>
          </div>
          <label className="checkbox-row"><input type="checkbox" checked={wallet.primary} onChange={(event) => setWallet({ ...wallet, primary: event.target.checked })} /> Definir como carteira principal</label>
          {save.isError && <p className="form-error" id="wallet-error" role="alert">{apiErrorMessage(save.error, "Não foi possível salvar a carteira.")}</p>}
          {remove.isError && <p className="form-error" role="alert">Não foi possível remover a carteira.</p>}
          {save.isSuccess && <p className="success-note" role="status"><Check size={14} /> Carteira salva.</p>}
          <button className="button button-primary profile-save" disabled={save.isPending}>{save.isPending ? "Salvando..." : wallet.id ? "Atualizar carteira" : "Salvar carteira"}</button>
        </form>
        <section className="wallet-secondary-section">
          <div className="wallet-secondary-heading"><div><h2>Carteira secundária</h2><p>Adicione outras carteiras para facilitar seus pagamentos.</p></div><button className="text-link" onClick={() => { setWallet({ ...initialWallet }); document.getElementById("wallet-label")?.focus(); }}>+ Adicionar</button></div>
          {walletsQuery.isLoading ? <div className="skeleton shimmer account-loading" /> : wallets.length === 0 ? <div className="empty-wallets"><p>Ainda não existem carteiras secundárias.</p></div> : <div className="saved-wallets">{wallets.map((item) => <article key={item.id} className="saved-wallet"><span className="wallet-logo">{item.provider.slice(0, 1)}</span><div><strong>{item.label}{item.primary && <span className="primary-badge">PRINCIPAL</span>}</strong><span>{item.alias} · {item.network}</span><code>{item.address.slice(0, 9)}…{item.address.slice(-5)}</code></div><button className="button button-outline button-small" onClick={() => setWallet(item)}>Editar</button><button className="icon-button" aria-label={`Remover ${item.label}`} onClick={() => remove.mutate(item.id)}><Trash2 size={16} /></button></article>)}</div>}
        </section>
      </div>
    </div>
  </main>;
}

function AccountRequired() {
  return <main className="page-wrap empty-page"><p className="eyebrow">ÁREA DO COLECIONADOR</p><h1>Entre na sua conta para continuar.</h1><p className="muted">Seu perfil e suas carteiras ficam disponíveis depois do login.</p><Link to="/account" className="button button-primary">Entrar na Kurio <ArrowRight size={16} /></Link></main>;
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = error.response;
    if (typeof response === "object" && response !== null && "data" in response) {
      const data = response.data;
      if (typeof data === "object" && data !== null && "message" in data && typeof data.message === "string") return data.message;
    }
  }
  return fallback;
}

function apiStatusCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("response" in error)) return undefined;
  const response = error.response;
  if (typeof response !== "object" || response === null || !("status" in response)) return undefined;
  return typeof response.status === "number" ? response.status : undefined;
}

export function OrderPage() {
  const { orderId } = useParams({ from: "/order/$orderId" });
  const orderQuery = useQuery({ queryKey: ["order", orderId], queryFn: ({ signal }) => marketplaceApi.getOrder(orderId, { signal }), retry: false });
  const session = useSession();
  useEffect(() => {
    const order = orderQuery.data;
    if (order?.status === "pending" && session.data?.email === order.customerEmail) {
      marketSocket.emit("mock.order.watch", { id: order.id, userEmail: order.customerEmail });
    }
    if (order?.status === "confirmed" && sessionStorage.getItem("kurio:pending-order-key") === order.id) {
      sessionStorage.removeItem("kurio:pending-order-key");
      sessionStorage.removeItem("kurio:pending-order-fingerprint");
    }
  }, [orderQuery.data, session.data?.email]);
  if (orderQuery.isLoading) return <main className="page-wrap"><div className="skeleton shimmer cart-loading" /></main>;
  if (orderQuery.isError || !orderQuery.data) return <main className="page-wrap empty-page"><h1>Não encontramos esse pedido.</h1><Link className="button button-primary" to="/">Ir para o mercado</Link></main>;
  const order = orderQuery.data as Order;
  const transactionReference = `${order.transaction.slice(0, 6)}...${order.transaction.slice(-4)}`;
  const createdDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).formatToParts(new Date(order.createdAt));
  const receiptDate = `${createdDate.find((part) => part.type === "day")?.value ?? ""} ${createdDate.find((part) => part.type === "month")?.value ?? ""}, ${createdDate.find((part) => part.type === "year")?.value ?? ""}`;
  const walletName = order.wallet.split(/[·|]/)[0].trim();
  if (order.status === "pending") return <main className="page-wrap pending-order-page"><div className="pending-order-card"><span className="spinner" /><p className="eyebrow">PEDIDO EM PROCESSAMENTO</p><h1>Sua compra está sendo confirmada.</h1><p>Estamos aguardando a resposta simulada da carteira. Esta página atualiza automaticamente após a confirmação.</p><div className="pending-order-id">Pedido <strong>{order.id.slice(0, 12)}…</strong></div><Link to="/cart" className="text-link">Voltar ao carrinho <ArrowRight size={14} /></Link></div></main>;
  if (order.status === "declined") return <main className="page-wrap pending-order-page"><div className="pending-order-card order-declined"><span>×</span><p className="eyebrow">PAGAMENTO RECUSADO</p><h1>Nenhuma cobrança foi realizada.</h1><p>Seus itens continuam no carrinho. Você pode revisar o pedido e tentar novamente.</p><Link to="/cart" className="button button-primary">Voltar ao carrinho <ArrowRight size={15} /></Link></div></main>;
  return (
    <main className="order-confirmation-page" aria-label="Confirmação do pedido">
      <section className="order-receipt" aria-label="Recibo do pedido">
        <Link to="/" className="receipt-close icon-button" aria-label="Fechar recibo"><X size={12} /></Link>
        <header className="receipt-success">
          <div className="receipt-thankyou-icon" aria-hidden="true"><Mail /><span>THANK<br />YOU</span></div>
          <p>Seus NFTs agora estão na sua carteira</p>
        </header>
        <div className="receipt-meta">
          <div><span>ID da transação</span><strong>{transactionReference}</strong></div>
          <div><span>Data</span><strong>{receiptDate}</strong></div>
          <div><span>Total</span><strong>{order.total} ETH</strong></div>
          <div><span>Carteira</span><strong>{walletName}</strong></div>
        </div>
        <section className="receipt-details" aria-label="Detalhes da transação">
          <h2>Detalhes da transação</h2>
          <div className="receipt-items-heading"><span>NFTs</span><span>Edições</span><span>Subtotal</span></div>
          {order.items.map((item) => (
            <div className="receipt-item" key={item.nftId}>
              <img src={item.nft.image} alt="" />
              <div><strong>{item.nft.name}</strong><span>ID do token: #{item.nft.id.split("-").at(-1)}</span></div>
              <span className="receipt-item-quantity">{item.edition ?? item.nft.edition} · (x {item.quantity})</span>
              <b>{item.lineTotal} ETH</b>
            </div>
          ))}
        </section>
        <div className="receipt-totals">
          <div><span>Taxa de rede</span><span>{order.networkFee} ETH</span></div>
          <div className="summary-total"><strong>Total</strong><strong>{order.total} ETH</strong></div>
        </div>
        <p className="receipt-confirmation-note">Pedido confirmado na simulação da rede {order.network}. Nenhuma transação real foi enviada à blockchain.</p>
        <a className="button button-primary receipt-cta" href={order.network === "Solana"
          ? `https://explorer.solana.com/tx/${encodeURIComponent(order.transaction)}?cluster=devnet`
          : order.network === "Polygon"
            ? `https://polygonscan.com/search?f=0&q=${encodeURIComponent(order.transaction)}`
            : `https://etherscan.io/search?f=0&q=${encodeURIComponent(order.transaction)}`} target="_blank" rel="noreferrer">Ver no explorador</a>
      </section>
    </main>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="section-title"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><a href="#market" className="text-link">Ver coleção <ArrowRight size={15} /></a></div>;
}
