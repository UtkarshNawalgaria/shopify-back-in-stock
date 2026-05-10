import type { DailyInsightsCache } from "./ads-insights.server";

export type AttributionMethod =
  | "utm_campaign_cpa"
  | "fbclid_blended"
  | "blended_revenue_share"
  | "blended_per_order"
  | "no_attribution"
  | "no_data";

export interface AttributionInput {
  orderCreatedAt: string;
  orderRevenue: number;
  landingSiteRef?: string | null;
  noteAttributes?: { name: string; value: string }[];
  totalDayRevenue?: number;
  totalDayOrders?: number;
}

export interface AttributionResult {
  amount: number;
  method: AttributionMethod;
  campaign_id?: string;
  campaign_name?: string;
  source?: string;
}

const META_SOURCES = new Set([
  "facebook",
  "fb",
  "meta",
  "instagram",
  "ig",
  "messenger",
]);

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

function parseUtm(landing: string | null | undefined): {
  source?: string;
  medium?: string;
  campaign?: string;
} {
  if (!landing) return {};
  try {
    const url = new URL(landing, "https://example.com");
    return {
      source: url.searchParams.get("utm_source")?.toLowerCase() ?? undefined,
      medium: url.searchParams.get("utm_medium")?.toLowerCase() ?? undefined,
      campaign: url.searchParams.get("utm_campaign") ?? undefined,
    };
  } catch {
    return {};
  }
}

function findNoteAttr(
  attrs: { name: string; value: string }[] | undefined,
  name: string,
): string | undefined {
  if (!attrs) return undefined;
  return attrs.find((a) => a.name === name)?.value;
}

export function resolveMarketingCost(
  input: AttributionInput,
  cache: DailyInsightsCache | null,
  settings: {
    utm_source_match: string[];
    method: "utm_first_blended" | "blended" | "utm_only";
  },
): AttributionResult {
  if (!cache) return { amount: 0, method: "no_data" };

  const day = dateKey(input.orderCreatedAt);
  const dayCache = cache.by_date[day];
  if (!dayCache) return { amount: 0, method: "no_data" };

  const matchSet = new Set(
    (settings.utm_source_match.length
      ? settings.utm_source_match
      : [...META_SOURCES]
    ).map((s) => s.toLowerCase()),
  );
  const utm = parseUtm(input.landingSiteRef);

  if (settings.method !== "blended" && utm.source && matchSet.has(utm.source) && utm.campaign) {
    const camp = dayCache.campaigns.find(
      (c) =>
        c.campaign_name === utm.campaign ||
        c.campaign_name.toLowerCase() === utm.campaign?.toLowerCase(),
    );
    if (camp) {
      const cpa =
        camp.purchases > 0 ? camp.spend / camp.purchases : camp.spend;
      return {
        amount: round2(cpa),
        method: "utm_campaign_cpa",
        campaign_id: camp.campaign_id,
        campaign_name: camp.campaign_name,
        source: utm.source,
      };
    }
  }

  if (settings.method === "utm_only") {
    return { amount: 0, method: "no_attribution" };
  }

  const fbc = findNoteAttr(input.noteAttributes, "_fbc");
  if (fbc && dayCache.total_purchases > 0) {
    return {
      amount: round2(dayCache.total_spend / dayCache.total_purchases),
      method: "fbclid_blended",
    };
  }

  if (
    input.totalDayRevenue &&
    input.totalDayRevenue > 0 &&
    input.orderRevenue > 0
  ) {
    return {
      amount: round2(
        (input.orderRevenue / input.totalDayRevenue) * dayCache.total_spend,
      ),
      method: "blended_revenue_share",
    };
  }

  if (input.totalDayOrders && input.totalDayOrders > 0) {
    return {
      amount: round2(dayCache.total_spend / input.totalDayOrders),
      method: "blended_per_order",
    };
  }

  return { amount: 0, method: "no_data" };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
