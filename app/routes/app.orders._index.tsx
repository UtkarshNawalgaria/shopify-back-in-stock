import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Badge,
  Card,
  IndexTable,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { parseMoney } from "../lib/shopify/metafields.server";

const ORDERS_QUERY = `#graphql
  query OrdersList {
    orders(first: 50, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        netProfit: metafield(namespace: "profitability", key: "net_profit") { value }
        margin: metafield(namespace: "profitability", key: "profit_margin_pct") { value }
        marketing: metafield(namespace: "profitability", key: "marketing_cost") { value }
        shippingSource: metafield(namespace: "profitability", key: "shipping_cost_source") { value }
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
  margin?: { value?: string } | null;
  marketing?: { value?: string } | null;
  shippingSource?: { value?: string } | null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const res = await admin.graphql(ORDERS_QUERY);
  const j = (await res.json()) as { data?: { orders?: { nodes: OrderNode[] } } };
  return { orders: j.data?.orders?.nodes ?? [] };
};

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function Orders() {
  const { orders } = useLoaderData<typeof loader>();

  const rows = orders.map((o, i) => {
    const currency = o.currentTotalPriceSet.shopMoney.currencyCode;
    const revenue = Number(o.currentTotalPriceSet.shopMoney.amount);
    const net = parseMoney(o.netProfit?.value ?? null)?.amount ?? null;
    const margin = o.margin?.value ? Number(o.margin.value) * 100 : null;
    const marketing = parseMoney(o.marketing?.value ?? null)?.amount ?? null;
    const shippingSource = o.shippingSource?.value ?? "pending";

    const orderId = o.id.split("/").pop();

    return (
      <IndexTable.Row id={o.id} position={i} key={o.id}>
        <IndexTable.Cell>
          <Link to={`/app/orders/${orderId}`}>
            <Text as="span" fontWeight="semibold">{o.name}</Text>
          </Link>
        </IndexTable.Cell>
        <IndexTable.Cell>{new Date(o.createdAt).toLocaleDateString()}</IndexTable.Cell>
        <IndexTable.Cell>{fmt(revenue, currency)}</IndexTable.Cell>
        <IndexTable.Cell>
          {marketing != null ? fmt(marketing, currency) : "—"}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={shippingSource === "shiprocket" ? "success" : "warning"}>
            {shippingSource}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" tone={net != null && net < 0 ? "critical" : "success"}>
            {net != null ? fmt(net, currency) : "—"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {margin != null ? `${margin.toFixed(1)}%` : "—"}
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page title="Orders">
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "order", plural: "orders" }}
              itemCount={orders.length}
              selectable={false}
              headings={[
                { title: "Order" },
                { title: "Date" },
                { title: "Revenue" },
                { title: "Marketing" },
                { title: "Shipping source" },
                { title: "Net profit" },
                { title: "Margin" },
              ]}
            >
              {rows}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
