import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { unauthenticated } from "../shopify.server";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
} from "../lib/meta/oauth.server";
import { encrypt } from "../lib/crypto/encrypt.server";
import { getShopId, setMetafields } from "../lib/shopify/metafields.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) throw new Response(`Meta returned error: ${error}`, { status: 400 });
  if (!code || !stateRaw) throw new Response("Missing code/state", { status: 400 });

  let state: { shop: string; ts: number };
  try {
    state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
  } catch {
    throw new Response("Invalid state", { status: 400 });
  }

  const appUrl = process.env.SHOPIFY_APP_URL || url.origin;
  const redirectUri = `${appUrl}/auth/meta/callback`;

  const short = await exchangeCodeForToken(code, redirectUri);
  const long = await exchangeForLongLivedToken(short.accessToken);

  const { admin } = await unauthenticated.admin(state.shop);
  const shopId = await getShopId(admin);
  await setMetafields(admin, [
    {
      ownerId: shopId,
      key: "meta_ads_token",
      type: "single_line_text_field",
      value: encrypt(long.accessToken),
    },
    {
      ownerId: shopId,
      key: "meta_ads_token_expires_at",
      type: "date_time",
      value: new Date(Date.now() + long.expiresIn * 1000).toISOString(),
    },
  ]);

  return redirect(
    `https://${state.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/connections`,
  );
};
