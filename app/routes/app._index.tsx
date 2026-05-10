import type { LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import {
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useMemo, useState } from "react";
import { authenticate } from "../shopify.server";
import { parseMoney } from "../lib/shopify/metafields.server";

const ORDERS_RANGE_QUERY = `#graphql
  query OrdersRange($query: String!, $cursor: String) {
    orders(first: 250, query: $query, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        netProfit: metafield(namespace: "profitability", key: "net_profit") { value }
        grossProfit: metafield(namespace: "profitability", key: "gross_profit") { value }
        cogs: metafield(namespace: "profitability", key: "cogs_total") { value }
        paymentFee: metafield(namespace: "profitability", key: "payment_fee") { value }
        shippingCost: metafield(namespace: "profitability", key: "shipping_cost") { value }
        marketingCost: metafield(namespace: "profitability", key: "marketing_cost") { value }
      }
    }
  }
`;

interface OrderNode {
  id: string;
  name: string;
  createdAt: string;
  currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  netProfit?: { value?: string } | null;
  grossProfit?: { value?: string } | null;
  cogs?: { value?: string } | null;
  paymentFee?: { value?: string } | null;
  shippingCost?: { value?: string } | null;
  marketingCost?: { value?: string } | null;
}

function moneyAmount(field: { value?: string } | null | undefined): number {
  return parseMoney(field?.value)?.amount ?? 0;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const today = new Date();
  const defaultSince = new Date();
  defaultSince.setUTCDate(defaultSince.getUTCDate() - 29);
  const since = url.searchParams.get("since") || defaultSince.toISOString().slice(0, 10);
  const until = url.searchParams.get("until") || today.toISOString().slice(0, 10);

  const all: OrderNode[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 4; i++) {
    const res = await admin.graphql(ORDERS_RANGE_QUERY, {
      variables: {
        query: `created_at:>=${since} AND created_at:<=${until}`,
        cursor,
      },
    });
    const j = (await res.json()) as {
      data?: {
        orders?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: OrderNode[];
        };
      };
    };
    const page = j.data?.orders;
    if (!page) break;
    all.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  const totals = all.reduce(
    (acc, o) => {
      const revenue = Number(o.currentTotalPriceSet.shopMoney.amount);
      acc.revenue += revenue;
      acc.cogs += moneyAmount(o.cogs);
      acc.paymentFee += moneyAmount(o.paymentFee);
      acc.shippingCost += moneyAmount(o.shippingCost);
      acc.marketingCost += moneyAmount(o.marketingCost);
      acc.netProfit += moneyAmount(o.netProfit);
      acc.grossProfit += moneyAmount(o.grossProfit);
      acc.orderCount += 1;
      return acc;
    },
    {
      revenue: 0,
      cogs: 0,
      paymentFee: 0,
      shippingCost: 0,
      marketingCost: 0,
      netProfit: 0,
      grossProfit: 0,
      orderCount: 0,
    },
  );

  const currency = all[0]?.currentTotalPriceSet.shopMoney.currencyCode ?? "USD";

  return { totals, currency, since, until, orderCount: all.length };
};

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function Dashboard() {
  const { totals, currency, since, until, orderCount } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const [sinceVal, setSince] = useState(since);
  const [untilVal, setUntil] = useState(until);

  const margin = useMemo(
    () => (totals.revenue > 0 ? (totals.netProfit / totals.revenue) * 100 : 0),
    [totals],
  );

  return (
    <Page title="Profitability Dashboard">
      <Layout>
        <Layout.Section>
          <Card>
            <Form method="get">
              <InlineStack gap="300" align="start" blockAlign="end">
                <TextField
                  label="From"
                  type="date"
                  name="since"
                  value={sinceVal}
                  onChange={setSince}
                  autoComplete="off"
                />
                <TextField
                  label="To"
                  type="date"
                  name="until"
                  value={untilVal}
                  onChange={setUntil}
                  autoComplete="off"
                />
                <Button submit loading={nav.state !== "idle"}>Apply</Button>
              </InlineStack>
            </Form>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
            <Stat label="Revenue" value={fmt(totals.revenue, currency)} />
            <Stat label="Net profit" value={fmt(totals.netProfit, currency)} tone="positive" />
            <Stat label="Margin" value={`${margin.toFixed(1)}%`} />
            <Stat label="Orders" value={String(orderCount)} />
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Cost breakdown</Text>
              <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
                <Stat label="COGS" value={fmt(totals.cogs, currency)} />
                <Stat label="Payment fees" value={fmt(totals.paymentFee, currency)} />
                <Stat label="Shipping" value={fmt(totals.shippingCost, currency)} />
                <Stat label="Marketing (Meta)" value={fmt(totals.marketingCost, currency)} />
              </InlineGrid>
              <Text as="p" variant="bodySm" tone="subdued">
                Gross profit: {fmt(totals.grossProfit, currency)} · Net profit:{" "}
                {fmt(totals.netProfit, currency)} ({orderCount} orders, {since} → {until})
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Sync</Text>
              <Text as="p">
                Push the latest Meta Ads spend and recompute profitability for recent orders.
              </Text>
              <Form method="post" action="/api/sync">
                <Button submit variant="primary">Sync now</Button>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "critical";
}) {
  return (
    <Card>
      <Box padding="200">
        <BlockStack gap="100">
          <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
          <Text as="p" variant="headingLg" tone={tone}>{value}</Text>
        </BlockStack>
      </Box>
    </Card>
  );
}
