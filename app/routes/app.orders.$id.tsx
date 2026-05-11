import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { json, redirect } from "@remix-run/node";
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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  getOrderMetafields,
  parseMoney,
} from "../lib/shopify/metafields.server";
import { recalculateOrder } from "../lib/profitability/calculator.server";

const ORDER_DETAIL = `#graphql
  query OrderDetail($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      currencyCode
      currentTotalPriceSet { shopMoney { amount } }
      lineItems(first: 50) {
        nodes {
          quantity
          name
          variantTitle
          originalUnitPriceSet { shopMoney { amount } }
        }
      }
    }
  }
`;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = `gid://shopify/Order/${params.id}`;

  const detailRes = await admin.graphql(ORDER_DETAIL, { variables: { id } });
  const detailJson = (await detailRes.json()) as {
    data?: {
      order?: {
        id: string;
        name: string;
        createdAt: string;
        currencyCode: string;
        currentTotalPriceSet: { shopMoney: { amount: string } };
        lineItems: {
          nodes: {
            quantity: number;
            name: string;
            variantTitle?: string | null;
            originalUnitPriceSet: { shopMoney: { amount: string } };
          }[];
        };
      };
    };
  };
  const order = detailJson.data?.order;
  if (!order) throw new Response("Not found", { status: 404 });

  const meta = await getOrderMetafields(admin, id);

  return json({ order, meta });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = `gid://shopify/Order/${params.id}`;
  await recalculateOrder(admin, id);
  return redirect(`/app/orders/${params.id}`);
};

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function readMoney(v: string | undefined | null): number {
  return parseMoney(v ?? null)?.amount ?? 0;
}

export default function OrderDetail() {
  const { order, meta } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const currency = order.currencyCode;
  const revenue = Number(order.currentTotalPriceSet.shopMoney.amount);
  const cogs = readMoney(meta.cogs_total?.value);
  const paymentFee = readMoney(meta.payment_fee?.value);
  const shippingCost = readMoney(meta.shipping_cost?.value);
  const marketing = readMoney(meta.marketing_cost?.value);
  const net = readMoney(meta.net_profit?.value);
  const gross = readMoney(meta.gross_profit?.value);
  const margin = meta.profit_margin_pct?.value
    ? Number(meta.profit_margin_pct.value) * 100
    : 0;

  let attribution: { method?: string; campaign_name?: string; source?: string } = {};
  try {
    attribution = meta.marketing_attribution?.value
      ? JSON.parse(meta.marketing_attribution.value)
      : {};
  } catch {}

  return (
    <Page title={order.name} backAction={{ content: "Orders", url: "/app/orders" }}>
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
            <Stat label="Revenue" value={fmt(revenue, currency)} />
            <Stat label="Net profit" value={fmt(net, currency)} tone={net < 0 ? "critical" : "success"} />
            <Stat label="Margin" value={`${margin.toFixed(1)}%`} />
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Cost stack</Text>
              <Row label="Revenue" value={fmt(revenue, currency)} />
              <Row label="COGS" value={`− ${fmt(cogs, currency)}`} />
              <Row label="Gross profit" value={fmt(gross, currency)} bold />
              <Row label="Payment fee" value={`− ${fmt(paymentFee, currency)}`} />
              <Row
                label={`Shipping (${meta.shipping_cost_source?.value ?? "pending"})`}
                value={`− ${fmt(shippingCost, currency)}`}
              />
              <Row
                label={`Marketing (${attribution.method ?? "n/a"}${
                  attribution.campaign_name ? ` · ${attribution.campaign_name}` : ""
                })`}
                value={`− ${fmt(marketing, currency)}`}
              />
              <Row label="Net profit" value={fmt(net, currency)} bold />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Line items</Text>
              {order.lineItems.nodes.map((li, idx) => (
                <Row
                  key={idx}
                  label={`${li.quantity} × ${li.name}${li.variantTitle ? ` (${li.variantTitle})` : ""}`}
                  value={fmt(Number(li.originalUnitPriceSet.shopMoney.amount) * li.quantity, currency)}
                />
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Form method="post">
            <Button submit variant="primary" loading={nav.state !== "idle"}>
              Recalculate
            </Button>
          </Form>
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
  tone?: "success" | "critical";
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

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <InlineStack align="space-between">
      <Text as="span" fontWeight={bold ? "bold" : "regular"}>{label}</Text>
      <Text as="span" fontWeight={bold ? "bold" : "regular"}>{value}</Text>
    </InlineStack>
  );
}
