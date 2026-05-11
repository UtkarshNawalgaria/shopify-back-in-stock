import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { json } from "@remix-run/node";
import {
  Badge,
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
  Banner,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import {
  getShopId,
  getShopMetafields,
  setMetafields,
} from "../lib/shopify/metafields.server";
import { encrypt, tryDecrypt } from "../lib/crypto/encrypt.server";
import { listAdAccounts, listPixels } from "../lib/meta/oauth.server";
import { login as shiprocketLogin } from "../lib/shiprocket/client.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const meta = await getShopMetafields(admin);
  const metaToken = tryDecrypt(meta.meta_ads_token?.value);

  let metaAdAccounts: { id: string; name: string }[] = [];
  let metaPixels: { id: string; name: string }[] = [];
  if (metaToken) {
    try {
      metaAdAccounts = await listAdAccounts(metaToken);
      const selected = meta.meta_ads_account_id?.value;
      if (selected) metaPixels = await listPixels(metaToken, selected);
    } catch (err) {
      console.error("listAdAccounts failed", err);
    }
  }

  return json({
    metaConnected: Boolean(metaToken),
    metaAdAccounts,
    metaPixels,
    selectedAdAccount: meta.meta_ads_account_id?.value ?? "",
    selectedPixel: meta.meta_ads_pixel_id?.value ?? "",
    capiConfigured: Boolean(meta.meta_ads_capi_token?.value),
    shiprocketConfigured: Boolean(meta.shiprocket_email?.value),
    shiprocketEmail: meta.shiprocket_email?.value ?? "",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const shopId = await getShopId(admin);

  if (intent === "save_meta_account") {
    const adAccountId = String(form.get("ad_account_id") || "");
    const pixelId = String(form.get("pixel_id") || "");
    await setMetafields(admin, [
      { ownerId: shopId, key: "meta_ads_account_id", type: "single_line_text_field", value: adAccountId },
      { ownerId: shopId, key: "meta_ads_pixel_id", type: "single_line_text_field", value: pixelId },
    ]);
    return json({ ok: "Meta Ads account saved." });
  }

  if (intent === "save_capi_token") {
    const capiToken = String(form.get("capi_token") || "").trim();
    if (!capiToken) return json({ error: "CAPI token is required." }, { status: 400 });
    await setMetafields(admin, [
      { ownerId: shopId, key: "meta_ads_capi_token", type: "single_line_text_field", value: encrypt(capiToken) },
    ]);
    return json({ ok: "CAPI token saved." });
  }

  if (intent === "disconnect_meta") {
    await setMetafields(admin, [
      { ownerId: shopId, key: "meta_ads_token", type: "single_line_text_field", value: "" },
      { ownerId: shopId, key: "meta_ads_account_id", type: "single_line_text_field", value: "" },
      { ownerId: shopId, key: "meta_ads_pixel_id", type: "single_line_text_field", value: "" },
      { ownerId: shopId, key: "meta_ads_capi_token", type: "single_line_text_field", value: "" },
    ]);
    return json({ ok: "Meta Ads disconnected." });
  }

  if (intent === "save_shiprocket") {
    const email = String(form.get("shiprocket_email") || "").trim();
    const password = String(form.get("shiprocket_password") || "").trim();
    if (!email || !password) {
      return json({ error: "Email and password required." }, { status: 400 });
    }
    try {
      const cache = await shiprocketLogin({ email, password });
      await setMetafields(admin, [
        { ownerId: shopId, key: "shiprocket_email", type: "single_line_text_field", value: email },
        { ownerId: shopId, key: "shiprocket_password", type: "single_line_text_field", value: encrypt(password) },
        { ownerId: shopId, key: "shiprocket_token_cache", type: "json", value: JSON.stringify(cache) },
      ]);
      return json({ ok: "ShipRocket connected." });
    } catch (err) {
      return json({ error: `ShipRocket login failed: ${(err as Error).message}` }, { status: 400 });
    }
  }

  if (intent === "disconnect_shiprocket") {
    await setMetafields(admin, [
      { ownerId: shopId, key: "shiprocket_email", type: "single_line_text_field", value: "" },
      { ownerId: shopId, key: "shiprocket_password", type: "single_line_text_field", value: "" },
      { ownerId: shopId, key: "shiprocket_token_cache", type: "json", value: "{}" },
    ]);
    return json({ ok: "ShipRocket disconnected." });
  }

  return json({ error: "Unknown intent." }, { status: 400 });
};

export default function Connections() {
  const data = useLoaderData<typeof loader>();
  const action = useActionData<typeof action>();
  const nav = useNavigation();

  const [adAccount, setAdAccount] = useState(data.selectedAdAccount);
  const [pixel, setPixel] = useState(data.selectedPixel);
  const [capi, setCapi] = useState("");
  const [srEmail, setSrEmail] = useState(data.shiprocketEmail);
  const [srPass, setSrPass] = useState("");

  return (
    <Page title="Connections">
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
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Meta Ads</Text>
                <Badge tone={data.metaConnected ? "success" : "warning"}>
                  {data.metaConnected ? "Connected" : "Not connected"}
                </Badge>
              </InlineStack>
              {!data.metaConnected && (
                <BlockStack gap="200">
                  <Text as="p">
                    Connect your Meta Ads account to pull campaign spend and send Conversion API events.
                  </Text>
                  <Form method="get" action="/auth/meta" target="_top">
                    <Button submit variant="primary">Connect Meta Ads</Button>
                  </Form>
                </BlockStack>
              )}
              {data.metaConnected && (
                <Form method="post">
                  <input type="hidden" name="intent" value="save_meta_account" />
                  <FormLayout>
                    <Select
                      label="Ad account"
                      name="ad_account_id"
                      options={[
                        { label: "Select an ad account", value: "" },
                        ...data.metaAdAccounts.map((a) => ({
                          label: `${a.name} (${a.id})`,
                          value: a.id,
                        })),
                      ]}
                      value={adAccount}
                      onChange={setAdAccount}
                    />
                    <Select
                      label="Pixel (for Conversions API)"
                      name="pixel_id"
                      options={[
                        { label: "Select a pixel", value: "" },
                        ...data.metaPixels.map((p) => ({
                          label: `${p.name} (${p.id})`,
                          value: p.id,
                        })),
                      ]}
                      value={pixel}
                      onChange={setPixel}
                      disabled={!adAccount}
                    />
                    <InlineStack gap="200">
                      <Button submit variant="primary" loading={nav.state !== "idle"}>Save</Button>
                      <Form method="post">
                        <input type="hidden" name="intent" value="disconnect_meta" />
                        <Button submit tone="critical">Disconnect</Button>
                      </Form>
                    </InlineStack>
                  </FormLayout>
                </Form>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {data.metaConnected && (
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">CAPI system-user token</Text>
                  <Badge tone={data.capiConfigured ? "success" : "warning"}>
                    {data.capiConfigured ? "Configured" : "Not configured"}
                  </Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Optional. Generate a long-lived system-user token in Meta Business Manager and paste here for
                  more reliable Conversions API event delivery (otherwise we use your user OAuth token).
                </Text>
                <Form method="post">
                  <input type="hidden" name="intent" value="save_capi_token" />
                  <FormLayout>
                    <TextField
                      label="CAPI token"
                      name="capi_token"
                      value={capi}
                      onChange={setCapi}
                      type="password"
                      autoComplete="off"
                    />
                    <Button submit>Save</Button>
                  </FormLayout>
                </Form>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">ShipRocket</Text>
                <Badge tone={data.shiprocketConfigured ? "success" : "warning"}>
                  {data.shiprocketConfigured ? "Connected" : "Not connected"}
                </Badge>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                ShipRocket uses email + password (not OAuth). Token auto-refreshes every 9 days.
              </Text>
              <Form method="post">
                <input type="hidden" name="intent" value="save_shiprocket" />
                <FormLayout>
                  <TextField
                    label="ShipRocket email"
                    name="shiprocket_email"
                    type="email"
                    value={srEmail}
                    onChange={setSrEmail}
                    autoComplete="off"
                  />
                  <TextField
                    label="ShipRocket password"
                    name="shiprocket_password"
                    type="password"
                    value={srPass}
                    onChange={setSrPass}
                    autoComplete="off"
                  />
                  <InlineStack gap="200">
                    <Button submit variant="primary" loading={nav.state !== "idle"}>Save & test</Button>
                    {data.shiprocketConfigured && (
                      <Form method="post">
                        <input type="hidden" name="intent" value="disconnect_shiprocket" />
                        <Button submit tone="critical">Disconnect</Button>
                      </Form>
                    )}
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
