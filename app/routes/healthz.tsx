import { json } from "@remix-run/node";

export const loader = async () => {
  return json({ ok: true, ts: new Date().toISOString() });
};
