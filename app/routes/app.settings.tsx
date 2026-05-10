import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { json } from "@remix-run/node";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  FormLayout,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import {
  getShopId,
  getShopMetafields,
  setMetafields,
} from "../lib/shopify/metafields.server";
import { DEFAULT_PAYMENT_RATES, type PaymentRates } from "../lib/profitability/payment-fees.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const meta = await getShopMetafields(admin);

  let rates: PaymentRates = DEFAULT_PAYMENT_RATES;
  try {
    rates = meta.payment_rates?.value
      ? JSON.parse(meta.payment_rates.value)
      : DEFAULT_PAYMENT_RATES;
  } catch {}

  let attribution: {
    method: "utm_first_blended" | "blended" | "utm_only";
    utm_source_match: string[];
    lookback_days: number;
  } = {
    method: "utm_first_blended",
    utm_source_match: ["facebook", "fb", "meta", "instagram", "ig"],
    lookback_days: 7,
  };
  try {
    if (meta.attribution_settings?.value) {
      attribution = { ...attribution, ...JSON.parse(meta.attribution_settings.value) };
    }
  } catch {}

  return json({ rates, attribution });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const shopId = await getShopId(admin);

  if (intent === "save_rates") {
    const ratesJson = String(form.get("rates_json") || "");
    try {
      const parsed = JSON.parse(ratesJson);
      if (!parsed.default) {
        return json({ error: "rates JSON must include a 'default' entry." }, { status: 400 });
      }
      await setMetafields(admin, [
        { ownerId: shopId, key: "payment_rates", type: "json", value: JSON.stringify(parsed) },
      ]);
      return json({ ok: "Payment rates saved." });
    } catch (err) {
      return json({ error: `Invalid JSON: ${(err as Error).message}` }, { status: 400 });
    }
  }

  if (intent === "save_attribution") {
    const method = String(form.get("method") || "utm_first_blended") as
      | "utm_first_blended"
      | "blended"
      | "utm_only";
    const sources = String(form.get("utm_source_match") || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const lookback = Number(form.get("lookback_days") || 7);
    await setMetafields(admin, [
      {
        ownerId: shopId,
        key: "attribution_settings",
        type: "json",
        value: JSON.stringify({
          method,
          utm_source_match: sources,
          lookback_days: lookback,
        }),
      },
    ]);
    return json({ ok: "Attribution settings saved." });
  }

  return json({ error: "Unknown intent." }, { status: 400 });
};

export default function Settings() {
  const { rates, attribution } = useLoaderData<typeof loader>();
  const action = useActionData<typeof action>();
  const nav = useNavigation();

  const [ratesJson, setRatesJson] = useState(JSON.stringify(rates, null, 2));
  const [method, setMethod] = useState(attribution.method);
  const [sources, setSources] = useState(attribution.utm_source_match.join(","));
  const [lookback, setLookback] = useState(String(attribution.lookback_days));

  return (
    <Page title="Settings">
      <Layout>
        {action && "ok" in action && action.ok && (
          <Layout.Section>
            <Banner tone="success">{action.ok}</Banner>
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
              <Text as="h2" variant="headingMd">Payment processing rates</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                JSON map keyed by Shopify gateway name. Each entry is{" "}
                <code>{`{ pct: 2.9, flat: 0.30 }`}</code>. <code>default</code> is required.
                Successful "sale"/"capture" transactions are charged; refunds rebate the percentage.
              </Text>
              <Form method="post">
                <input type="hidden" name="intent" value="save_rates" />
                <FormLayout>
                  <TextField
                    label="Rates JSON"
                    name="rates_json"
                    value={ratesJson}
                    onChange={setRatesJson}
                    multiline={12}
                    autoComplete="off"
                    monospaced
                  />
                  <Button submit variant="primary" loading={nav.state !== "idle"}>Save</Button>
                </FormLayout>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Marketing attribution</Text>
              <Form method="post">
                <input type="hidden" name="intent" value="save_attribution" />
                <FormLayout>
                  <Select
                    label="Method"
                    name="method"
                    options={[
                      { label: "UTM first, blended fallback", value: "utm_first_blended" },
                      { label: "Pure blended (revenue share)", value: "blended" },
                      { label: "UTM only (orders without UTM get $0)", value: "utm_only" },
                    ]}
                    value={method}
                    onChange={(v) => setMethod(v as typeof method)}
                  />
                  <TextField
                    label="UTM sources to match (comma-separated)"
                    name="utm_source_match"
                    value={sources}
                    onChange={setSources}
                    autoComplete="off"
                    helpText="Default: facebook, fb, meta, instagram, ig"
                  />
                  <TextField
                    label="Lookback (days)"
                    name="lookback_days"
                    type="number"
                    value={lookback}
                    onChange={setLookback}
                    autoComplete="off"
                  />
                  <InlineStack>
                    <Button submit variant="primary">Save</Button>
                  </InlineStack>
                </FormLayout>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
