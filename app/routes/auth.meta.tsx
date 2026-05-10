import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { buildAuthUrl } from "../lib/meta/oauth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const appUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
  const redirectUri = `${appUrl}/auth/meta/callback`;
  const state = Buffer.from(
    JSON.stringify({ shop: session.shop, ts: Date.now() }),
  ).toString("base64url");
  return redirect(buildAuthUrl(redirectUri, state));
};
