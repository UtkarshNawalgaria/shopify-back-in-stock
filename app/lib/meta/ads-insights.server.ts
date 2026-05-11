import { META_BASE } from "./config.server";

export interface CampaignDayInsight {
  campaign_id: string;
  campaign_name: string;
  date: string;
  spend: number;
  purchases: number;
  purchase_value: number;
}

export interface DailyInsightsCache {
  by_date: Record<
    string,
    {
      total_spend: number;
      total_purchases: number;
      total_purchase_value: number;
      campaigns: CampaignDayInsight[];
    }
  >;
  fetched_at: string;
}

function parseAction(actions: { action_type: string; value: string }[] | undefined, type: string): number {
  if (!actions) return 0;
  const found = actions.find((a) => a.action_type === type);
  return found ? Number(found.value) : 0;
}

export async function fetchCampaignInsights(
  accessToken: string,
  adAccountId: string,
  since: string,
  until: string,
): Promise<CampaignDayInsight[]> {
  const params = new URLSearchParams({
    access_token: accessToken,
    level: "campaign",
    fields:
      "campaign_id,campaign_name,spend,actions,action_values,date_start,date_stop",
    time_range: JSON.stringify({ since, until }),
    time_increment: "1",
    limit: "500",
  });
  const url = `${META_BASE}/${adAccountId}/insights?${params}`;
  const out: CampaignDayInsight[] = [];

  let next: string | null = url;
  while (next) {
    const res = await fetch(next);
    if (!res.ok) {
      throw new Error(`Meta insights failed: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      data: {
        campaign_id: string;
        campaign_name: string;
        spend: string;
        date_start: string;
        actions?: { action_type: string; value: string }[];
        action_values?: { action_type: string; value: string }[];
      }[];
      paging?: { next?: string };
    };
    for (const row of data.data) {
      out.push({
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        date: row.date_start,
        spend: Number(row.spend),
        purchases: parseAction(row.actions, "purchase"),
        purchase_value: parseAction(row.action_values, "purchase"),
      });
    }
    next = data.paging?.next ?? null;
  }
  return out;
}

export function aggregateInsights(rows: CampaignDayInsight[]): DailyInsightsCache {
  const by_date: DailyInsightsCache["by_date"] = {};
  for (const row of rows) {
    if (!by_date[row.date]) {
      by_date[row.date] = {
        total_spend: 0,
        total_purchases: 0,
        total_purchase_value: 0,
        campaigns: [],
      };
    }
    const day = by_date[row.date];
    day.total_spend += row.spend;
    day.total_purchases += row.purchases;
    day.total_purchase_value += row.purchase_value;
    day.campaigns.push(row);
  }
  return { by_date, fetched_at: new Date().toISOString() };
}

export function trimCacheToDays(cache: DailyInsightsCache, days: number): DailyInsightsCache {
  const keep = new Set<string>();
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    keep.add(d.toISOString().slice(0, 10));
  }
  const by_date: DailyInsightsCache["by_date"] = {};
  for (const [k, v] of Object.entries(cache.by_date)) {
    if (keep.has(k)) by_date[k] = v;
  }
  return { by_date, fetched_at: cache.fetched_at };
}
