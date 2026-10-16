export interface Nft {
  id: string;
  name: string;
  creator: string;
  collection: string;
  description: string;
  price: string;
  image: string;
  edition: string;
  network: string;
  available?: number;
  category?: string;
  featured?: boolean;
}

export interface CatalogFacets {
  total: number;
  collections: Record<string, number>;
  networks: Record<string, number>;
}

export interface CatalogResponse {
  items: Nft[];
  total: number;
  page: number;
  pageSize: number;
  facets: CatalogFacets;
}

export interface CartLine {
  nftId: string;
  quantity: number;
  edition?: string;
  nft?: Nft;
}

export interface Cart {
  items: CartLine[];
  coupon?: string;
  discount: string;
  networkFee: string;
  subtotal: string;
  total: string;
}

export interface Session {
  email: string;
  name: string;
}

export interface CollectorProfile {
  displayName: string;
  username: string;
  email: string;
  ensName: string;
  avatar: string;
}

export interface CollectorWallet {
  id: string;
  label: string;
  alias: string;
  address: string;
  network: "Ethereum" | "Polygon" | "Solana";
  provider: "MetaMask" | "WalletConnect" | "Coinbase Wallet";
  primary: boolean;
}

export interface CheckoutContact {
  displayName: string;
  username: string;
  profileName: string;
  email: string;
}

export interface CheckoutWallet {
  address: string;
  network: CollectorWallet["network"];
  provider: CollectorWallet["provider"];
  alias?: string;
}

export interface Order {
  id: string;
  transaction: string;
  status: "pending" | "confirmed" | "declined";
  version: number;
  customerEmail: string;
  customer: CheckoutContact;
  network: CollectorWallet["network"];
  walletAddress: string;
  items: Array<CartLine & { nft: Nft; lineTotal: string }>;
  subtotal: string;
  networkFee: string;
  discount: string;
  total: string;
  wallet: string;
  createdAt: string;
}

export interface OrderUpdatedEvent {
  id: string;
  userEmail: string;
  status: "confirmed" | "declined";
  version: number;
}
