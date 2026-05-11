import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export const NAMESPACE = "profitability";

export type MetafieldOwnerType =
  | "SHOP"
  | "ORDER"
  | "PRODUCT"
  | "PRODUCTVARIANT"
  | "CUSTOMER";

export type MetafieldType =
  | "single_line_text_field"
  | "multi_line_text_field"
  | "number_decimal"
  | "number_integer"
  | "money"
  | "json"
  | "date_time"
  | "boolean";

export interface MetafieldInput {
  ownerId: string;
  namespace?: string;
  key: string;
  type: MetafieldType;
  value: string;
}

interface MetafieldNode {
  id: string;
  namespace: string;
  key: string;
  type: string;
  value: string;
}

const SHOP_METAFIELDS_QUERY = `#graphql
  query ShopMetafields($ns: String!) {
    shop {
      id
      metafields(namespace: $ns, first: 50) {
        nodes { id namespace key type value }
      }
    }
  }
`;

const ORDER_METAFIELDS_QUERY = `#graphql
  query OrderMetafields($id: ID!, $ns: String!) {
    order(id: $id) {
      id
      metafields(namespace: $ns, first: 50) {
        nodes { id namespace key type value }
      }
    }
  }
`;

const VARIANT_METAFIELDS_QUERY = `#graphql
  query VariantMetafields($id: ID!, $ns: String!) {
    productVariant(id: $id) {
      id
      metafields(namespace: $ns, first: 10) {
        nodes { id namespace key type value }
      }
    }
  }
`;

const METAFIELDS_SET_MUTATION = `#graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key }
      userErrors { field message code }
    }
  }
`;

export async function getShopId(admin: AdminApiContext): Promise<string> {
  const res = await admin.graphql(`#graphql
    query ShopId { shop { id } }
  `);
  const data = (await res.json()) as { data?: { shop?: { id?: string } } };
  const id = data.data?.shop?.id;
  if (!id) throw new Error("Could not resolve shop id");
  return id;
}

export async function getShopMetafields(
  admin: AdminApiContext,
  namespace: string = NAMESPACE,
): Promise<Record<string, MetafieldNode>> {
  const res = await admin.graphql(SHOP_METAFIELDS_QUERY, {
    variables: { ns: namespace },
  });
  const data = (await res.json()) as {
    data?: { shop?: { metafields?: { nodes?: MetafieldNode[] } } };
  };
  const out: Record<string, MetafieldNode> = {};
  for (const node of data.data?.shop?.metafields?.nodes ?? []) {
    out[node.key] = node;
  }
  return out;
}

export async function getOrderMetafields(
  admin: AdminApiContext,
  orderId: string,
  namespace: string = NAMESPACE,
): Promise<Record<string, MetafieldNode>> {
  const res = await admin.graphql(ORDER_METAFIELDS_QUERY, {
    variables: { id: orderId, ns: namespace },
  });
  const data = (await res.json()) as {
    data?: { order?: { metafields?: { nodes?: MetafieldNode[] } } };
  };
  const out: Record<string, MetafieldNode> = {};
  for (const node of data.data?.order?.metafields?.nodes ?? []) {
    out[node.key] = node;
  }
  return out;
}

export async function getVariantMetafields(
  admin: AdminApiContext,
  variantId: string,
  namespace: string = NAMESPACE,
): Promise<Record<string, MetafieldNode>> {
  const res = await admin.graphql(VARIANT_METAFIELDS_QUERY, {
    variables: { id: variantId, ns: namespace },
  });
  const data = (await res.json()) as {
    data?: { productVariant?: { metafields?: { nodes?: MetafieldNode[] } } };
  };
  const out: Record<string, MetafieldNode> = {};
  for (const node of data.data?.productVariant?.metafields?.nodes ?? []) {
    out[node.key] = node;
  }
  return out;
}

export async function setMetafields(
  admin: AdminApiContext,
  inputs: MetafieldInput[],
): Promise<void> {
  if (inputs.length === 0) return;

  const chunks: MetafieldInput[][] = [];
  for (let i = 0; i < inputs.length; i += 25) {
    chunks.push(inputs.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    const variables = {
      metafields: chunk.map((m) => ({
        ownerId: m.ownerId,
        namespace: m.namespace ?? NAMESPACE,
        key: m.key,
        type: m.type,
        value: m.value,
      })),
    };
    const res = await admin.graphql(METAFIELDS_SET_MUTATION, { variables });
    const data = (await res.json()) as {
      data?: {
        metafieldsSet?: {
          userErrors?: { field?: string[]; message: string; code?: string }[];
        };
      };
    };
    const errors = data.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length) {
      throw new Error(
        `metafieldsSet failed: ${errors
          .map((e) => `${e.code ?? ""} ${e.message}`)
          .join("; ")}`,
      );
    }
  }
}

export function moneyValue(amount: number, currency: string): string {
  return JSON.stringify({
    amount: amount.toFixed(2),
    currency_code: currency,
  });
}

export function parseMoney(
  value: string | undefined | null,
): { amount: number; currency: string } | null {
  if (!value) return null;
  try {
    const obj = JSON.parse(value);
    return {
      amount: Number(obj.amount ?? 0),
      currency: String(obj.currency_code ?? "USD"),
    };
  } catch {
    return null;
  }
}
