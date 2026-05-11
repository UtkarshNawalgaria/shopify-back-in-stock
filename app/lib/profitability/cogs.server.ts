export interface LineItemCogsInput {
  variantId: string | null;
  quantity: number;
  unitCost: number | null;
  costOverride: number | null;
}

export function lineItemCogs(item: LineItemCogsInput): number {
  const cost = item.costOverride ?? item.unitCost ?? 0;
  return cost * item.quantity;
}

export function totalCogs(items: LineItemCogsInput[]): number {
  const sum = items.reduce((acc, i) => acc + lineItemCogs(i), 0);
  return Math.round(sum * 100) / 100;
}
