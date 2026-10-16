import type { Cart } from "./types";

export function getCartQuoteFingerprint(cart: Cart) {
  return JSON.stringify({
    items: cart.items,
    coupon: cart.coupon ?? null,
    subtotal: cart.subtotal,
    discount: cart.discount,
    networkFee: cart.networkFee,
    total: cart.total,
  });
}
