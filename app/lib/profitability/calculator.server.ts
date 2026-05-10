import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import {
  getShopMetafields,
  moneyValue,
  parseMoney,
  setMetafields,
} from "../shopify/metafields.server";
import { tryDecrypt } from "../crypto/encrypt.server";
import {
  resolveMarketingCost,
  type AttributionResult,
} from "../meta/attribution.server";
import type { DailyInsightsCache } from "../meta/ads-insights.server";
import {
  getValidToken,
  getShipmentByOrderId,
  type ShiprocketTokenCache,
} from "../shiprocket/client.server";
import {
  computePaymentFee,
  DEFAULT_PAYMENT_RATES,
  type PaymentRates,
} from "./payment-fees.server";
import { totalCogs } from "./cogs.server";

const ORDER_QUERY = `#graphql
  query OrderForProfit($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      currencyCode
      currentTotalPriceSet { shopMoney { amount } }
      totalRefundedSet { shopMoney { amount } }
      landingPageUrl
      referrerUrl
      customAttributes { key value }
      customer { id email phone }
      transactions(first: 50) {
        amountSet { shopMoney { amount } }
        gateway
        kind
        status
      }
      lineItems(first: 100) {
        nodes {
          id
          quantity
          variant {
            id
            inventoryItem { unitCost { amount } }
            metafield(namespace: "profitability", key: "cogs_override") { value }
          }
        }
      }
    }
  }
`;

const ORDERS_DAY_QUERY = `#graphql
  query OrdersOnDay($query: String!) {
    orders(first: 250, query: $query) {
      nodes {
        id
        currentTotalPriceSet { shopMoney { amount } }
      }
    }
  }
`;

interface OrderQueryResult {
  data?: {
    order?: {
      id: string;
      name: string;
      createdAt: string;
      currencyCode: string;
      currentTotalPriceSet: { shopMoney: { amount: string } };
      totalRefundedSet?: { shopMoney: { amount: string } };
      landingPageUrl?: string | null;
      referrerUrl?: string | null;
      customAttributes?: { key: string; value: string }[];
      customer?: { id?: string; email?: string; phone?: string };
      transactions: {
        amountSet: { shopMoney: { amount: string } };
        gateway?: string | null;
        kind: string;
        status: string;
      }[];
      lineItems: {
        nodes: {
          id: string;
          quantity: number;
          variant?: {
            id: string;
            inventoryItem?: { unitCost?: { amount: string } | null };
            metafield?: { value?: string } | null;
          } | null;
        }[];
      };
    };
  };
}

export interface CalcResult {
  orderId: string;
  revenue: number;
  cogs: number;
  paymentFee: number;
  shippingCost: number;
  shippingSource: "shiprocket" | "manual" | "pending";
  marketing: AttributionResult;
  grossProfit: number;
  netProfit: number;
  marginPct: number;
}

function safeParseJson<T>(value: string | undefined | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function loadShopState(admin: AdminApiContext): Promise<{
  rates: PaymentRates;
  insightsCache: DailyInsightsCache | null;
  attribution: {
    method: "utm_first_blended" | "blended" | "utm_only";
    utm_source_match: string[];
    lookback_days: number;
  };
  shiprocketToken: string | null;
  shiprocketCreds: { email: string; password: string } | null;
  shiprocketTokenCache: ShiprocketTokenCache | null;
}> {
  const meta = await getShopMetafields(admin);

  const rates =
    safeParseJson<PaymentRates>(meta.payment_rates?.value, DEFAULT_PAYMENT_RATES) ??
    DEFAULT_PAYMENT_RATES;

  const insightsCache = safeParseJson<DailyInsightsCache | null>(
    meta.meta_ads_daily_cache?.value,
    null,
  );

  const attribution = safeParseJson(meta.attribution_settings?.value, {
    method: "utm_first_blended" as const,
    utm_source_match: ["facebook", "fb", "meta", "instagram", "ig"],
    lookback_days: 7,
  });

  const shiprocketTokenCache = safeParseJson<ShiprocketTokenCache | null>(
    meta.shiprocket_token_cache?.value,
    null,
  );

  const shiprocketEmail = meta.shiprocket_email?.value ?? null;
  const shiprocketPassword = tryDecrypt(meta.shiprocket_password?.value);
  const shiprocketCreds =
    shiprocketEmail && shiprocketPassword
      ? { email: shiprocketEmail, password: shiprocketPassword }
      : null;

  return {
    rates,
    insightsCache,
    attribution,
    shiprocketToken: shiprocketTokenCache?.token ?? null,
    shiprocketCreds,
    shiprocketTokenCache,
  };
}

export async function recalculateOrder(
  admin: AdminApiContext,
  orderId: string,
): Promise<CalcResult | null> {
  const orderRes = await admin.graphql(ORDER_QUERY, { variables: { id: orderId } });
  const orderJson = (await orderRes.json()) as OrderQueryResult;
  const order = orderJson.data?.order;
  if (!order) return null;

  const state = await loadShopState(admin);

  const revenue =
    Number(order.currentTotalPriceSet.shopMoney.amount) -
    Number(order.totalRefundedSet?.shopMoney.amount ?? 0);

  const cogs = totalCogs(
    order.lineItems.nodes.map((n) => ({
      variantId: n.variant?.id ?? null,
      quantity: n.quantity,
      unitCost: n.variant?.inventoryItem?.unitCost
        ? Number(n.variant.inventoryItem.unitCost.amount)
        : null,
      costOverride: n.variant?.metafield?.value
        ? Number(parseMoney(n.variant.metafield.value)?.amount ?? 0) || null
        : null,
    })),
  );

  const paymentFee = computePaymentFee(
    order.transactions.map((t) => ({
      amount: Number(t.amountSet.shopMoney.amount),
      gateway: t.gateway,
      kind: t.kind.toLowerCase(),
      status: t.status.toLowerCase(),
    })),
    state.rates,
  );

  let shippingCost = 0;
  let shippingSource: "shiprocket" | "manual" | "pending" = "pending";
  if (state.shiprocketCreds) {
    try {
      const fresh = await getValidToken(
        state.shiprocketTokenCache,
        state.shiprocketCreds,
      );
      const shipment = await getShipmentByOrderId(fresh.token, order.name);
      if (shipment) {
        shippingCost = shipment.total_charges;
        shippingSource = "shiprocket";
      }
    } catch (err) {
      console.error("ShipRocket lookup failed", err);
    }
  }

  let totalDayRevenue: number | undefined;
  let totalDayOrders: number | undefined;
  try {
    const day = order.createdAt.slice(0, 10);
    const next = new Date(day + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    const q = `created_at:>=${day} AND created_at:<${next.toISOString().slice(0, 10)}`;
    const res = await admin.graphql(ORDERS_DAY_QUERY, { variables: { query: q } });
    const j = (await res.json()) as {
      data?: {
        orders?: {
          nodes: { currentTotalPriceSet: { shopMoney: { amount: string } } }[];
        };
      };
    };
    const nodes = j.data?.orders?.nodes ?? [];
    totalDayOrders = nodes.length;
    totalDayRevenue = nodes.reduce(
      (a, n) => a + Number(n.currentTotalPriceSet.shopMoney.amount),
      0,
    );
  } catch (err) {
    console.error("orders/day lookup failed", err);
  }

  const marketing = resolveMarketingCost(
    {
      orderCreatedAt: order.createdAt,
      orderRevenue: revenue,
      landingSiteRef: order.landingPageUrl,
      noteAttributes: order.customAttributes ?? [],
      totalDayRevenue,
      totalDayOrders,
    },
    state.insightsCache,
    state.attribution,
  );

  const grossProfit = round2(revenue - cogs);
  const netProfit = round2(revenue - cogs - paymentFee - shippingCost - marketing.amount);
  const marginPct = revenue > 0 ? round4(netProfit / revenue) : 0;

  const currency = order.currencyCode;
  await setMetafields(admin, [
    { ownerId: order.id, key: "cogs_total", type: "money", value: moneyValue(cogs, currency) },
    { ownerId: order.id, key: "payment_fee", type: "money", value: moneyValue(paymentFee, currency) },
    { ownerId: order.id, key: "shipping_cost", type: "money", value: moneyValue(shippingCost, currency) },
    {
      ownerId: order.id,
      key: "shipping_cost_source",
      type: "single_line_text_field",
      value: shippingSource,
    },
    {
      ownerId: order.id,
      key: "marketing_cost",
      type: "money",
      value: moneyValue(marketing.amount, currency),
    },
    {
      ownerId: order.id,
      key: "marketing_attribution",
      type: "json",
      value: JSON.stringify({
        method: marketing.method,
        campaign_id: marketing.campaign_id ?? null,
        campaign_name: marketing.campaign_name ?? null,
        source: marketing.source ?? null,
        last_calculated_at: new Date().toISOString(),
      }),
    },
    { ownerId: order.id, key: "gross_profit", type: "money", value: moneyValue(grossProfit, currency) },
    { ownerId: order.id, key: "net_profit", type: "money", value: moneyValue(netProfit, currency) },
    {
      ownerId: order.id,
      key: "profit_margin_pct",
      type: "number_decimal",
      value: marginPct.toFixed(4),
    },
    {
      ownerId: order.id,
      key: "last_calculated_at",
      type: "date_time",
      value: new Date().toISOString(),
    },
  ]);

  return {
    orderId: order.id,
    revenue,
    cogs,
    paymentFee,
    shippingCost,
    shippingSource,
    marketing,
    grossProfit,
    netProfit,
    marginPct,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
