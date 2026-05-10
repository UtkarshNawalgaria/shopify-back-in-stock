# Shopify Profitability Tracker

A Shopify embedded app that gives you a per-order P&L by combining:

- **Revenue** from Shopify orders
- **COGS** from Shopify variant `cost per item` (with CSV upload override)
- **Payment processing fees** from order transactions × configurable rate
- **Shipping cost** pulled from ShipRocket per AWB
- **Marketing cost** attributed via Meta Conversions API + UTM (blended fallback)

All business data is written to **Shopify metafields** — no external database. Only a tiny SQLite file is used for Shopify session tokens.

## Stack

- Shopify App Remix template (TypeScript)
- Polaris v13 + App Bridge React
- Prisma + SQLite (sessions only)
- Meta Marketing API (Ads Insights + Conversions API)
- ShipRocket REST API

## Setup

```bash
npm install
cp .env.example .env       # fill in Shopify + Meta credentials
npm run setup              # prisma generate + migrate
npm run dev                # shopify app dev
```

Required env vars:

- `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` — from Shopify Partners
- `META_APP_ID` / `META_APP_SECRET` — from developers.facebook.com
- `APP_ENCRYPTION_KEY` — 32 random bytes hex-encoded (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

## Architecture

See [`/root/.claude/plans/build-me-a-shopify-stateless-graham.md`](../../root/.claude/plans/build-me-a-shopify-stateless-graham.md) for the full design — metafield schema, attribution pipeline, OAuth flows, and verification steps.

## How profitability is calculated

For each order, on `orders/create` / `orders/updated` / `orders/fulfilled`:

```
cogs_total      = Σ(variant.unitCost × qty)
payment_fee     = Σ(transaction.amount × gateway_rate.pct + gateway_rate.flat)
shipping_cost   = ShipRocket freight charges (or 0/pending)
marketing_cost  = attribution.resolve(order)   # see below
gross_profit    = revenue - cogs_total
net_profit      = revenue - cogs_total - payment_fee - shipping_cost - marketing_cost
profit_margin   = net_profit / revenue
```

All written to order metafields under namespace `profitability`.

### Attribution resolver

1. **CAPI hint**: every order is sent to Meta via Conversions API (improves Meta-side attribution quality).
2. **UTM match**: if `order.landing_site` has `utm_source ∈ {facebook, fb, meta}` + `utm_campaign`, use that campaign's CPA from Ads Insights for that day.
3. **fbclid blended**: if order has `_fbc` cookie, use day's blended Meta CPA.
4. **Pure blended**: otherwise, `total_meta_spend(date) / total_orders(date)`.
