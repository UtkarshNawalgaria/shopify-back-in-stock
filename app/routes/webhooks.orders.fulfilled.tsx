import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { recalculateOrder } from "../lib/profitability/calculator.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, shop } = await authenticate.webhook(request);
  const order = payload as { id: number; admin_graphql_api_id: string; name: string };
  console.log(`orders/fulfilled ${order.name} for ${shop}`);

  if (admin) {
    try {
      await recalculateOrder(admin, order.admin_graphql_api_id);
    } catch (err) {
      console.error("recalculateOrder failed", err);
    }
  }
  return new Response();
};
