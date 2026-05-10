import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { recalculateOrder } from "../lib/profitability/calculator.server";
import { sendOrderToCapi, syncDailyInsights } from "../lib/meta/sync.server";

interface OrderWebhookPayload {
  id: number;
  admin_graphql_api_id: string;
  name: string;
  total_price: string;
  currency: string;
  line_items?: { product_id?: number; quantity: number }[];
  customer?: { email?: string; phone?: string; id?: number };
  email?: string;
  phone?: string;
  note_attributes?: { name: string; value: string }[];
  client_details?: { user_agent?: string; browser_ip?: string };
  landing_site?: string;
  order_status_url?: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, shop } = await authenticate.webhook(request);
  const order = payload as OrderWebhookPayload;
  console.log(`orders/create ${order.name} for ${shop}`);

  if (admin) {
    try {
      await syncDailyInsights(admin, 2);
    } catch (err) {
      console.error("syncDailyInsights failed", err);
    }

    try {
      await sendOrderToCapi(admin, {
        orderId: String(order.id),
        orderName: order.name,
        value: Number(order.total_price),
        currency: order.currency,
        email: order.customer?.email ?? order.email,
        phone: order.customer?.phone ?? order.phone,
        externalId: order.customer?.id ? String(order.customer.id) : undefined,
        fbp: findAttr(order.note_attributes, "_fbp"),
        fbc: findAttr(order.note_attributes, "_fbc"),
        clientUserAgent: order.client_details?.user_agent,
        clientIp: order.client_details?.browser_ip,
        contentIds: order.line_items?.map((l) => String(l.product_id ?? "")),
        numItems: order.line_items?.reduce((a, l) => a + l.quantity, 0),
        eventSourceUrl: order.order_status_url,
      });
    } catch (err) {
      console.error("CAPI send failed", err);
    }

    try {
      await recalculateOrder(admin, order.admin_graphql_api_id);
    } catch (err) {
      console.error("recalculateOrder failed", err);
    }
  }

  return new Response();
};

function findAttr(
  attrs: { name: string; value: string }[] | undefined,
  name: string,
): string | undefined {
  return attrs?.find((a) => a.name === name)?.value;
}
