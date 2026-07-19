# WooCommerce shop architecture and spike

## Provisional topology

Choose managed WordPress/WooCommerce at **`shop.postervalley.nl`** for the first stock-shop release. Keep this React/Vercel site at `www.postervalley.nl` and link in-stock product cards to Woo product pages. Use a theme/child theme for visual alignment; first release is not headless.

| Option | Assessment |
| --- | --- |
| `shop` subdomain (chosen) | Clear ownership and blast radius, native Woo reliability/admin/plugins, straightforward SEO separation and hosting. Requires consistent branding and cross-domain analytics/cookie review. |
| `www/shop` proxy | Pretty URL but proxy/cache/login/media/permalink failures and security/operational complexity; defer unless a host proves support. |
| Headless Woo + React | Highest custom API/auth/cart/checkout/cache complexity; weakens native Woo operational benefit. Not v1. |
| Replace public site | Largest SEO/design/migration risk; destroys the useful custom drop flow boundary. Reject. |

## Staging spike (research/proposal only until Pascal approves provisioning)

Evaluate managed hosts, backups, updates, WAF/SSL, staging isolation, restore time and support. Propose a staging domain; do not create it. Define a child-theme implementation, ~10 simple poster products, SKU/product-code convention, dimensions/weight/packaging, stock, shipping classes/zones (NL/EU/manual outside EU), Mollie for Woo **test mode**, customer emails, terms/privacy/returns content ownership, least-privilege admins, backup/rollback and an operations guide.

The spike must explicitly research—rather than decide—Sendcloud/MyParcel/PostNL/DHL alternatives, flat vs live rates, customs forms, EU VAT/OSS, invoices and duties. WooCommerce does not by itself settle tax, customs or legal obligations. Hosting purchase, WordPress/Woo install, plugins, product data entry, Mollie test mode and launch occur only after a reviewed spike and fresh human approvals.
