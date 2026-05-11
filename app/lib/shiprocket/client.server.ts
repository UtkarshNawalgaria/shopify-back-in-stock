const BASE = "https://apiv2.shiprocket.in/v1/external";

export interface ShiprocketCreds {
  email: string;
  password: string;
}

export interface ShiprocketTokenCache {
  token: string;
  expires_at: string;
}

export interface ShiprocketShipmentCharges {
  awb_code?: string;
  freight_charges: number;
  cod_charges?: number;
  other_charges?: number;
  total_charges: number;
  status?: string;
}

export async function login(creds: ShiprocketCreds): Promise<ShiprocketTokenCache> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
  });
  if (!res.ok) {
    throw new Error(`ShipRocket auth failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { token: string };
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + 9);
  return { token: data.token, expires_at: expires.toISOString() };
}

function isFresh(cache: ShiprocketTokenCache | null | undefined): boolean {
  if (!cache) return false;
  return new Date(cache.expires_at).getTime() > Date.now() + 60_000;
}

export async function getValidToken(
  cache: ShiprocketTokenCache | null,
  creds: ShiprocketCreds,
): Promise<ShiprocketTokenCache> {
  if (isFresh(cache)) return cache!;
  return login(creds);
}

interface ShiprocketOrderResponse {
  data?: {
    id: number;
    channel_order_id: string;
    shipments?: {
      id: number;
      awb?: string;
      freight_charges?: number;
      total_charges?: number;
      cod_charges?: number;
      status?: string;
    }[];
  }[];
}

export async function getShipmentByOrderId(
  token: string,
  shopifyOrderName: string,
): Promise<ShiprocketShipmentCharges | null> {
  const params = new URLSearchParams({ search: shopifyOrderName });
  const res = await fetch(`${BASE}/orders?${params}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    throw new Error("SHIPROCKET_UNAUTHORIZED");
  }
  if (!res.ok) {
    throw new Error(`ShipRocket order lookup failed: ${await res.text()}`);
  }
  const json = (await res.json()) as ShiprocketOrderResponse;
  const order = json.data?.find(
    (o) => o.channel_order_id === shopifyOrderName,
  );
  if (!order || !order.shipments?.length) return null;
  const shipment = order.shipments[0];
  return {
    awb_code: shipment.awb,
    freight_charges: Number(shipment.freight_charges ?? 0),
    cod_charges: Number(shipment.cod_charges ?? 0),
    total_charges: Number(
      shipment.total_charges ?? shipment.freight_charges ?? 0,
    ),
    status: shipment.status,
  };
}
