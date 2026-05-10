import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { NAMESPACE } from "./metafields.server";

interface DefinitionSpec {
  name: string;
  key: string;
  type: string;
  ownerType: string;
  description: string;
  pin?: boolean;
}

const DEFINITIONS: DefinitionSpec[] = [
  {
    ownerType: "ORDER",
    key: "cogs_total",
    name: "COGS",
    type: "money",
    description: "Sum of variant cost × quantity for this order.",
    pin: true,
  },
  {
    ownerType: "ORDER",
    key: "payment_fee",
    name: "Payment processing fee",
    type: "money",
    description: "Computed from order transactions × configured gateway rate.",
  },
  {
    ownerType: "ORDER",
    key: "shipping_cost",
    name: "Shipping cost",
    type: "money",
    description: "Pulled from ShipRocket once a shipment exists.",
  },
  {
    ownerType: "ORDER",
    key: "shipping_cost_source",
    name: "Shipping cost source",
    type: "single_line_text_field",
    description: "shiprocket | manual | pending",
  },
  {
    ownerType: "ORDER",
    key: "marketing_cost",
    name: "Marketing cost",
    type: "money",
    description: "Attributed Meta Ads spend (UTM-first, blended fallback).",
  },
  {
    ownerType: "ORDER",
    key: "marketing_attribution",
    name: "Marketing attribution",
    type: "json",
    description: "{ method, campaign_id, campaign_name, source }",
  },
  {
    ownerType: "ORDER",
    key: "gross_profit",
    name: "Gross profit",
    type: "money",
    description: "Revenue − COGS.",
    pin: true,
  },
  {
    ownerType: "ORDER",
    key: "net_profit",
    name: "Net profit",
    type: "money",
    description: "Revenue − COGS − fees − shipping − marketing.",
    pin: true,
  },
  {
    ownerType: "ORDER",
    key: "profit_margin_pct",
    name: "Profit margin %",
    type: "number_decimal",
    description: "Net profit / revenue.",
    pin: true,
  },
  {
    ownerType: "ORDER",
    key: "last_calculated_at",
    name: "Last calculated at",
    type: "date_time",
    description: "When profitability was last recomputed.",
  },
  {
    ownerType: "PRODUCTVARIANT",
    key: "cogs_override",
    name: "COGS override",
    type: "money",
    description: "Optional override of the built-in 'cost per item'.",
  },
];

const CREATE_DEFINITION = `#graphql
  mutation CreateDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { field message code }
    }
  }
`;

export async function ensureMetafieldDefinitions(
  admin: AdminApiContext,
): Promise<{ created: number; existed: number; failed: string[] }> {
  let created = 0;
  let existed = 0;
  const failed: string[] = [];

  for (const def of DEFINITIONS) {
    const res = await admin.graphql(CREATE_DEFINITION, {
      variables: {
        definition: {
          name: def.name,
          namespace: NAMESPACE,
          key: def.key,
          type: def.type,
          ownerType: def.ownerType,
          description: def.description,
          pin: def.pin ?? false,
        },
      },
    });
    const data = (await res.json()) as {
      data?: {
        metafieldDefinitionCreate?: {
          createdDefinition?: { id?: string };
          userErrors?: { code?: string; message: string }[];
        };
      };
    };
    const errors = data.data?.metafieldDefinitionCreate?.userErrors ?? [];
    if (data.data?.metafieldDefinitionCreate?.createdDefinition?.id) {
      created++;
    } else if (errors.some((e) => e.code === "TAKEN")) {
      existed++;
    } else if (errors.length) {
      failed.push(`${def.ownerType}.${def.key}: ${errors[0].message}`);
    }
  }

  return { created, existed, failed };
}
