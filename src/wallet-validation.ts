import type { CollectorWallet } from "./types";

export function isValidWalletAddress(network: CollectorWallet["network"], address: string) {
  if (network === "Solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
