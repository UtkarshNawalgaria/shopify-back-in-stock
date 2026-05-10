import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, payload } = await authenticate.webhook(request);
  if (session) {
    const current = (payload as { current?: string[] }).current ?? [];
    await db.session.update({
      where: { id: session.id },
      data: { scope: current.toString() },
    });
  }
  console.log(`scopes_update for ${shop}`);
  return new Response();
};
