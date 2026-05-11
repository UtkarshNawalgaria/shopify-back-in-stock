import { json, redirect, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { syncDailyInsights } from "../lib/meta/sync.server";
import { recalculateOrder } from "../lib/profitability/calculator.server";

const RECENT_ORDERS_QUERY = `#graphql
  query RecentOrders($query: String!) {
    orders(first: 100, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes { id }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const insights = await syncDailyInsights(admin, 7).catch((err) => {
    console.error("syncDailyInsights failed", err);
    return null;
  });

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 7);
  const sinceStr = since.toISOString().slice(0, 10);
  const res = await admin.graphql(RECENT_ORDERS_QUERY, {
    variables: { query: `created_at:>=${sinceStr}` },
  });
  const j = (await res.json()) as { data?: { orders?: { nodes: { id: string }[] } } };
  const orders = j.data?.orders?.nodes ?? [];

  let recalculated = 0;
  for (const o of orders) {
    try {
      await recalculateOrder(admin, o.id);
      recalculated++;
    } catch (err) {
      console.error(`recalc failed for ${o.id}`, err);
    }
  }

  if (request.headers.get("accept")?.includes("application/json")) {
    return json({ insights, recalculated });
  }
  return redirect("/app");
};
