export const META_GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || "v19.0";
export const META_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export function getMetaAppCreds(): { appId: string; appSecret: string } {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("META_APP_ID and META_APP_SECRET env vars are required.");
  }
  return { appId, appSecret };
}
