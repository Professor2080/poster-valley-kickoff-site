# Hybrid commerce architecture

## Boundary

Poster Valley uses two complementary systems, not a shared order-management system.

| Domain | Owner | Authoritative records |
| --- | --- | --- |
| Interest and demand validation | Custom application | `drop_interest_requests` and product registry lifecycle |
| Personal invitation checkout | Custom application | `order_invitations`, custom `orders`, custom `payments` |
| Manual international quote and invitation fulfilment | Custom application | quote, fulfilment and audit records |
| In-stock catalogue, carts and checkout | WooCommerce | Woo products, carts and orders |
| Stock, Woo refunds, shipping/tax and Woo emails | WooCommerce | Woo operational records |
| Commercial identity | Shared reference only | immutable `product_code`/SKU |

The custom application must not mirror Woo orders as editable Supabase orders, manage Woo stock from its dashboard, edit invitation orders from Woo, or maintain two independently editable prices. Each sellable mode has one commerce authority. If later reporting needs Woo data, use a read-only adapter or a separately governed warehouse projection, never a second operational order source.

## Product lifecycle registry

Introduce a custom product registry as the public-site catalogue reference. Each record has immutable `product_code` (example `eurofighter-typhoon-a2`), display metadata, lifecycle mode, custom shipping profile reference, and optional Woo product ID/URL. Woo uses the same code as its SKU. `product_code` is never derived from a mutable title or URL.

| Mode | Public-site behaviour | Order authority |
| --- | --- | --- |
| `interest` | reservation flow | custom |
| `preorder` | explicitly custom invitation flow in v1 | custom |
| `in_stock` | Buy now links to Woo product URL | WooCommerce |
| `sold_out` | sold-out state; optional updates/reservation | none (or custom interest only) |
| `archived` | no purchase; retained historical references | historical owner |

Do not offer custom invitations and Woo preorder for the same product at the same time without a separately approved migration. A Woo outage must leave the public page informative: disable/soften Buy now, show sold-out/unavailable messaging, and do not fall back to a custom order automatically.

## Current-to-target shipping path

Today `api/_drops.js` has the server price/rates/profile and `src/data/drops.ts` duplicates display configuration. Only the server quote is used to create an order/payment. Preserve that rule. Migrate safely: first introduce a versioned server-side registry and shipping repository behind existing `getOrderableDropBySlug`/`getShippingProfile`; retain identical values; add parity tests; make the frontend receive non-authoritative display data from a public catalogue endpoint or generated shared read model; then move admin-edited rules to database rows after reviewed migration. Do not switch production source or remove hard-coded fallback until reconciliation and rollback are proven.

The target shipping profile supports dimensions, packaging, weight, regions, country rules, manual-review flag/message, and future carrier service mapping. Server quote snapshots the selected profile/rule/version and amount onto every order. Client estimates never decide an amount.

## Initial integration

The minimum integration is shared product code plus optional Woo ID and URL in the custom registry. Links are declarative; there is no two-way order sync and no custom write to Woo. A later read-only Woo adapter may display stock/price only after caching, outage behaviour, credentials and authority are separately reviewed.
