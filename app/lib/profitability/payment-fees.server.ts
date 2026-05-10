export interface GatewayRate {
  pct: number;
  flat: number;
}

export type PaymentRates = Record<string, GatewayRate> & {
  default: GatewayRate;
};

export const DEFAULT_PAYMENT_RATES: PaymentRates = {
  default: { pct: 2.9, flat: 0.3 },
  shopify_payments: { pct: 2.9, flat: 0.3 },
  bogus: { pct: 0, flat: 0 },
  manual: { pct: 0, flat: 0 },
  cash_on_delivery: { pct: 0, flat: 0 },
  paypal: { pct: 3.49, flat: 0.49 },
  stripe: { pct: 2.9, flat: 0.3 },
  razorpay: { pct: 2.0, flat: 0 },
};

export interface OrderTransactionForFee {
  amount: number;
  gateway?: string | null;
  kind: "sale" | "capture" | "authorization" | "refund" | "void" | string;
  status: "success" | "failure" | "pending" | string;
}

export function computePaymentFee(
  transactions: OrderTransactionForFee[],
  rates: PaymentRates,
): number {
  let fee = 0;
  for (const t of transactions) {
    if (t.status !== "success") continue;
    const gateway = (t.gateway ?? "default").toLowerCase().replace(/[^a-z]/g, "_");
    const rate = rates[gateway] ?? rates.default;
    if (t.kind === "sale" || t.kind === "capture") {
      fee += t.amount * (rate.pct / 100) + rate.flat;
    } else if (t.kind === "refund") {
      fee -= t.amount * (rate.pct / 100);
    }
  }
  return Math.max(0, Math.round(fee * 100) / 100);
}
