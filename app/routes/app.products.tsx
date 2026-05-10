import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { json } from "@remix-run/node";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  IndexTable,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import Papa from "papaparse";
import { authenticate } from "../shopify.server";
import {
  moneyValue,
  parseMoney,
  setMetafields,
} from "../lib/shopify/metafields.server";

const VARIANTS_QUERY = `#graphql
  query VariantsForCogs($cursor: String) {
    productVariants(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        sku
        title
        displayName
        product { id title }
        inventoryItem { unitCost { amount currencyCode } }
        cogsOverride: metafield(namespace: "profitability", key: "cogs_override") { value }
      }
    }
  }
`;

const VARIANT_BY_SKU_QUERY = `#graphql
  query VariantBySku($sku: String!) {
    productVariants(first: 5, query: $sku) {
      nodes { id sku }
    }
  }
`;

interface VariantNode {
  id: string;
  sku: string | null;
  title: string;
  displayName: string;
  product: { id: string; title: string };
  inventoryItem?: { unitCost?: { amount: string; currencyCode: string } | null };
  cogsOverride?: { value?: string } | null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const all: VariantNode[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 5; i++) {
    const res = await admin.graphql(VARIANTS_QUERY, { variables: { cursor } });
    const j = (await res.json()) as {
      data?: { productVariants?: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: VariantNode[] } };
    };
    const page = j.data?.productVariants;
    if (!page) break;
    all.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }
  return json({ variants: all });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "upload_csv") {
    const file = form.get("file") as File;
    if (!file || typeof file === "string") {
      return json({ error: "No file uploaded." }, { status: 400 });
    }
    const text = await file.text();
    const parsed = Papa.parse<{ sku?: string; cost?: string; currency?: string }>(text, {
      header: true,
      skipEmptyLines: true,
    });
    if (parsed.errors.length) {
      return json({ error: `CSV parse error: ${parsed.errors[0].message}` }, { status: 400 });
    }

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of parsed.data) {
      const sku = row.sku?.trim();
      const cost = Number(row.cost);
      const currency = row.currency?.trim() || "USD";
      if (!sku || isNaN(cost)) {
        skipped++;
        continue;
      }
      try {
        const r = await admin.graphql(VARIANT_BY_SKU_QUERY, {
          variables: { sku: `sku:${sku}` },
        });
        const j = (await r.json()) as {
          data?: { productVariants?: { nodes: { id: string; sku: string }[] } };
        };
        const variant = j.data?.productVariants?.nodes?.find((v) => v.sku === sku);
        if (!variant) {
          errors.push(`SKU ${sku} not found`);
          skipped++;
          continue;
        }
        await setMetafields(admin, [
          {
            ownerId: variant.id,
            key: "cogs_override",
            type: "money",
            value: moneyValue(cost, currency),
          },
        ]);
        updated++;
      } catch (err) {
        errors.push(`SKU ${sku}: ${(err as Error).message}`);
        skipped++;
      }
    }

    return json({
      ok: `Updated ${updated} variants, skipped ${skipped}.`,
      errors: errors.slice(0, 10),
    });
  }

  return json({ error: "Unknown intent." }, { status: 400 });
};

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function Products() {
  const { variants } = useLoaderData<typeof loader>();
  const action = useActionData<typeof action>();
  const nav = useNavigation();

  const rows = variants.map((v, i) => {
    const built = v.inventoryItem?.unitCost;
    const builtAmount = built ? Number(built.amount) : null;
    const override = parseMoney(v.cogsOverride?.value ?? null);
    const effective = override?.amount ?? builtAmount ?? null;
    const currency = override?.currency ?? built?.currencyCode ?? "USD";
    return (
      <IndexTable.Row id={v.id} position={i} key={v.id}>
        <IndexTable.Cell>
          <Text as="span" fontWeight="semibold">{v.product.title}</Text>
          <Text as="p" variant="bodySm" tone="subdued">{v.displayName}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{v.sku ?? "—"}</IndexTable.Cell>
        <IndexTable.Cell>
          {builtAmount != null ? fmt(builtAmount, currency) : "—"}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {override ? fmt(override.amount, override.currency) : "—"}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" fontWeight="semibold">
            {effective != null ? fmt(effective, currency) : "Not set"}
          </Text>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page title="Product costs (COGS)">
      <Layout>
        {action && "ok" in action && action.ok && (
          <Layout.Section>
            <Banner tone="success">
              <BlockStack gap="100">
                <Text as="p">{action.ok}</Text>
                {"errors" in action && action.errors && action.errors.length > 0 && (
                  <Text as="p" variant="bodySm">{action.errors.join(" · ")}</Text>
                )}
              </BlockStack>
            </Banner>
          </Layout.Section>
        )}
        {action && "error" in action && action.error && (
          <Layout.Section>
            <Banner tone="critical">{action.error}</Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Bulk upload</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                CSV format: <code>sku,cost,currency</code> (one variant per row).
                Updates the <code>cogs_override</code> metafield on the matching variant.
              </Text>
              <Form method="post" encType="multipart/form-data">
                <input type="hidden" name="intent" value="upload_csv" />
                <InlineStack gap="200">
                  <input type="file" name="file" accept=".csv" required />
                  <Button submit variant="primary" loading={nav.state !== "idle"}>Upload</Button>
                </InlineStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "variant", plural: "variants" }}
              itemCount={variants.length}
              selectable={false}
              headings={[
                { title: "Product / Variant" },
                { title: "SKU" },
                { title: "Built-in cost" },
                { title: "Override" },
                { title: "Effective COGS" },
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
