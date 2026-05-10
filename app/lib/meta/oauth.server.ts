import { META_BASE, getMetaAppCreds } from "./config.server";

export const META_SCOPES = [
  "ads_read",
  "ads_management",
  "business_management",
];

export function buildAuthUrl(redirectUri: string, state: string): string {
  const { appId } = getMetaAppCreds();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: META_SCOPES.join(","),
    response_type: "code",
  });
  return `https://www.facebook.com/${process.env.META_GRAPH_API_VERSION || "v19.0"}/dialog/oauth?${params}`;
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const { appId, appSecret } = getMetaAppCreds();
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(`${META_BASE}/oauth/access_token?${params}`);
  if (!res.ok) {
    throw new Error(`Meta token exchange failed: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 0 };
}

export async function exchangeForLongLivedToken(
  shortToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const { appId, appSecret } = getMetaAppCreds();
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`${META_BASE}/oauth/access_token?${params}`);
  if (!res.ok) {
    throw new Error(`Meta long-lived exchange failed: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 5184000,
  };
}

export async function listAdAccounts(
  accessToken: string,
): Promise<{ id: string; name: string; currency: string }[]> {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "id,name,currency,account_status",
    limit: "100",
  });
  const res = await fetch(`${META_BASE}/me/adaccounts?${params}`);
  if (!res.ok) {
    throw new Error(`Meta listAdAccounts failed: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    data: { id: string; name: string; currency: string }[];
  };
  return data.data;
}

export async function listPixels(
  accessToken: string,
  adAccountId: string,
): Promise<{ id: string; name: string }[]> {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "id,name",
  });
  const res = await fetch(`${META_BASE}/${adAccountId}/adspixels?${params}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { data: { id: string; name: string }[] };
  return data.data ?? [];
}
