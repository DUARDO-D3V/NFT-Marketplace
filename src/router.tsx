import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { marketplaceApi } from "./api";
import { queryClient, sessionQueryKey } from "./query-client";
import {
  AccountPage,
  CartPage,
  CheckoutPage,
  HomePage,
  NftDetailPage,
  OrderPage,
  ProfilePage,
  SiteShell,
  WalletsPage,
} from "./views";

// Private flows resolve the session through the shared Query cache before rendering.
async function requireSession({ location }: { location: { href: string } }) {
  const session = await queryClient
    .ensureQueryData({ queryKey: sessionQueryKey, queryFn: ({ signal }) => marketplaceApi.getSession({ signal }) })
    .catch(() => null);
  if (!session) throw redirect({ to: "/account", search: { redirect: location.href } });
}

const rootRoute = createRootRoute({
  component: () => (
    <SiteShell>
      <Outlet />
    </SiteShell>
  ),
  notFoundComponent: () => (
    <main className="page-wrap empty-page">
      <p className="eyebrow">404 — página não encontrada</p>
      <h1>Esse caminho ainda não existe.</h1>
      <a className="button button-primary" href="/">Voltar ao início</a>
    </main>
  ),
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>): { q?: string; network?: string; collection?: string; category?: string; mode?: string; page?: number; sort?: string; minPriceCents?: number; maxPriceCents?: number } => ({
    ...(typeof search.q === "string" ? { q: search.q } : {}),
    ...(typeof search.network === "string" ? { network: search.network } : {}),
    ...(typeof search.collection === "string" ? { collection: search.collection } : {}),
    ...(typeof search.category === "string" ? { category: search.category } : {}),
    ...(typeof search.mode === "string" ? { mode: search.mode } : {}),
    ...(typeof search.page === "number" ? { page: search.page } : {}),
    ...(typeof search.sort === "string" ? { sort: search.sort } : {}),
    ...(typeof search.minPriceCents === "number" ? { minPriceCents: search.minPriceCents } : {}),
    ...(typeof search.maxPriceCents === "number" ? { maxPriceCents: search.maxPriceCents } : {}),
  }),
  component: HomePage,
});
const nftRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/nft/$nftId",
  component: NftDetailPage,
});
const cartRoute = createRoute({ getParentRoute: () => rootRoute, path: "/cart", component: CartPage });
const checkoutRoute = createRoute({ getParentRoute: () => rootRoute, path: "/checkout", component: CheckoutPage });
const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account",
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    ...(typeof search.redirect === "string" && search.redirect.startsWith("/") && !search.redirect.startsWith("//") ? { redirect: search.redirect } : {}),
  }),
  component: AccountPage,
});
const profileRoute = createRoute({ getParentRoute: () => rootRoute, path: "/account/profile", beforeLoad: requireSession, component: ProfilePage });
const walletsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/account/wallets", beforeLoad: requireSession, component: WalletsPage });
const orderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/order/$orderId",
  beforeLoad: requireSession,
  component: OrderPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  nftRoute,
  cartRoute,
  checkoutRoute,
  accountRoute,
  profileRoute,
  walletsRoute,
  orderRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
