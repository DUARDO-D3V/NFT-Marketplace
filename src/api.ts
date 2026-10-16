import axios from "axios";
import type { Cart, CatalogResponse, CheckoutContact, CheckoutWallet, CollectorProfile, CollectorWallet, Nft, Order, Session } from "./types";

export const api = axios.create({ baseURL: "/api", timeout: 8_000 });

api.interceptors.request.use((config) => {
  const scenario = localStorage.getItem("kurio:scenario");
  if (scenario) config.headers.set("X-Kurio-Scenario", scenario);
  return config;
});

export interface RequestOptions { signal?: AbortSignal }

export const marketplaceApi = {
  listNfts: async (filters: { q: string; network: string; collection: string; category: string; sort: string; mode: string; page: number; minPriceCents: number; maxPriceCents: number }, { signal }: RequestOptions = {}) => {
    const { data } = await api.get<CatalogResponse>("/nfts", { params: filters, signal });
    return data;
  },
  getNft: async (id: string, { signal }: RequestOptions = {}) => {
      const { data } = await api.get<Nft>(`/nfts/${id}`, { signal });
    return data;
  },
  getRelatedNfts: async (params: { exclude?: string; offset?: number; limit?: number }, { signal }: RequestOptions = {}) => {
    const { data } = await api.get<Nft[]>("/related-nfts", { params, signal });
    return data;
  },
  getCart: async ({ signal }: RequestOptions = {}) => {
      const { data } = await api.get<Cart>("/cart", { signal });
    return data;
  },
  addToCart: async (nftId: string, edition: string, quantity = 1) => {
    const { data } = await api.post<Cart>("/cart/items", { nftId, quantity, edition });
    return data;
  },
  updateQuantity: async (nftId: string, quantity: number) => {
    const { data } = await api.patch<Cart>(`/cart/items/${nftId}`, { quantity });
    return data;
  },
  removeFromCart: async (nftId: string) => {
    const { data } = await api.delete<Cart>(`/cart/items/${nftId}`);
    return data;
  },
  applyCoupon: async (code: string) => {
    const { data } = await api.post<Cart>("/cart/coupon", { code });
    return data;
  },
  signIn: async (email: string, password: string) => {
    const { data } = await api.post<Session>("/session", { email, password });
    return data;
  },
  register: async (name: string, email: string, password: string) => {
    const { data } = await api.post<Session>("/accounts", { name, email, password });
    return data;
  },
  getSession: async ({ signal }: RequestOptions = {}) => {
      const { data } = await api.get<Session | null>("/session", { signal });
    return data;
  },
  signOut: async () => api.delete("/session"),
  getProfile: async ({ signal }: RequestOptions = {}) => {
      const { data } = await api.get<CollectorProfile>("/profile", { signal });
    return data;
  },
  updateProfile: async (profile: CollectorProfile) => {
    const { data } = await api.put<CollectorProfile>("/profile", profile);
    return data;
  },
  updatePassword: async (currentPassword: string, newPassword: string) => {
    const { data } = await api.put<{ message: string }>("/profile/password", { currentPassword, newPassword });
    return data;
  },
  getWallets: async ({ signal }: RequestOptions = {}) => {
      const { data } = await api.get<CollectorWallet[]>("/wallets", { signal });
    return data;
  },
  saveWallet: async (wallet: Omit<CollectorWallet, "id"> & { id?: string }) => {
    const { data } = await api.put<CollectorWallet[]>("/wallets", wallet);
    return data;
  },
  deleteWallet: async (id: string) => {
    const { data } = await api.delete<CollectorWallet[]>(`/wallets/${id}`);
    return data;
  },
  getFavorites: async ({ signal }: RequestOptions = {}) => {
      const { data } = await api.get<string[]>("/favorites", { signal });
    return data;
  },
  setFavorite: async (nftId: string, favorite: boolean) => {
    const { data } = await api.put<string[]>(`/favorites/${nftId}`, { favorite });
    return data;
  },
  createOrder: async (wallet: CheckoutWallet, customer: CheckoutContact, quoteFingerprint: string, idempotencyKey: string, fingerprint: string) => {
    const { data } = await api.post<Order>(
      "/orders",
      { wallet, customer, quoteFingerprint, fingerprint },
      { headers: { "Idempotency-Key": idempotencyKey } },
    );
    return data;
  },
  getOrder: async (orderId: string, { signal }: RequestOptions = {}) => {
      const { data } = await api.get<Order>(`/orders/${orderId}`, { signal });
    return data;
  },
};
