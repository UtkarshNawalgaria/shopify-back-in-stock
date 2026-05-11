import { createHash } from "node:crypto";
import { META_BASE } from "./config.server";

export interface CapiPurchaseEvent {
  orderId: string;
  orderName: string;
  value: number;
  currency: string;
  email?: string;
  phone?: string;
  externalId?: string;
  fbp?: string;
  fbc?: string;
  clientUserAgent?: string;
  clientIp?: string;
  contentIds?: string[];
  numItems?: number;
  eventSourceUrl?: string;
}

function hash(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

export async function sendPurchase(
  pixelId: string,
  accessToken: string,
  event: CapiPurchaseEvent,
): Promise<{ events_received: number; trace_id?: string }> {
  const userData: Record<string, string | string[]> = {};
  if (event.email) userData.em = hash(event.email)!;
  if (event.phone) userData.ph = hash(event.phone.replace(/\D/g, ""))!;
  if (event.externalId) userData.external_id = hash(event.externalId)!;
  if (event.fbp) userData.fbp = event.fbp;
  if (event.fbc) userData.fbc = event.fbc;
  if (event.clientUserAgent) userData.client_user_agent = event.clientUserAgent;
  if (event.clientIp) userData.client_ip_address = event.clientIp;

  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: event.orderId,
        action_source: "website",
        event_source_url: event.eventSourceUrl,
        user_data: userData,
        custom_data: {
          currency: event.currency,
          value: event.value,
          order_id: event.orderName,
          content_ids: event.contentIds ?? [],
          num_items: event.numItems ?? 0,
          content_type: "product",
        },
      },
    ],
  };

  const res = await fetch(
    `${META_BASE}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`CAPI Purchase failed: ${await res.text()}`);
  }
  return (await res.json()) as { events_received: number; trace_id?: string };
}
