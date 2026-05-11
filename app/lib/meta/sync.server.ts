import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import {
  getShopMetafields,
  getShopId,
  setMetafields,
} from "../shopify/metafields.server";
import { tryDecrypt } from "../crypto/encrypt.server";
import {
  aggregateInsights,
  fetchCampaignInsights,
  trimCacheToDays,
} from "./ads-insights.server";
import { sendPurchase, type CapiPurchaseEvent } from "./capi.server";

export interface MetaShopState {
  token: string | null;
  adAccountId: string | null;
  pixelId: string | null;
  capiToken: string | null;
}

export async function loadMetaShopState(
  admin: AdminApiContext,
): Promise<MetaShopState> {
  const meta = await getShopMetafields(admin);
  return {
    token: tryDecrypt(meta.meta_ads_token?.value),
    adAccountId: meta.meta_ads_account_id?.value ?? null,
    pixelId: meta.meta_ads_pixel_id?.value ?? null,
    capiToken: tryDecrypt(meta.meta_ads_capi_token?.value),
  };
}

export async function syncDailyInsights(
  admin: AdminApiContext,
  daysBack: number = 7,
): Promise<{ days: number; campaigns: number } | null> {
  const state = await loadMetaShopState(admin);
  if (!state.token || !state.adAccountId) return null;

  const until = new Date();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - daysBack);
  const sinceStr = since.toISOString().slice(0, 10);
  const untilStr = until.toISOString().slice(0, 10);

  const rows = await fetchCampaignInsights(
    state.token,
    state.adAccountId,
    sinceStr,
    untilStr,
  );
  const cache = trimCacheToDays(aggregateInsights(rows), 30);

  const shopId = await getShopId(admin);
  await setMetafields(admin, [
    {
      ownerId: shopId,
      key: "meta_ads_daily_cache",
      type: "json",
      value: JSON.stringify(cache),
    },
  ]);

  return {
    days: Object.keys(cache.by_date).length,
    campaigns: rows.length,
  };
}

export async function sendOrderToCapi(
  admin: AdminApiContext,
  event: CapiPurchaseEvent,
): Promise<boolean> {
  const state = await loadMetaShopState(admin);
  if (!state.pixelId || !(state.capiToken || state.token)) return false;
  try {
    await sendPurchase(state.pixelId, state.capiToken ?? state.token!, event);
    return true;
  } catch (err) {
    console.error("CAPI send failed", err);
    return false;
  }
}
