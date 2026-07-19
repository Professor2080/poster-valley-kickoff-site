# ADR-004: WooCommerce topology

**Status:** Accepted — implementation and production release require separate approval.

Use managed native WordPress/WooCommerce at `shop.postervalley.nl`, while this custom site remains at `www.postervalley.nl`. Link in-stock products to Woo. Do not proxy `/shop`, build headless Woo, or replace the public site in the first release. This keeps operational capabilities native and limits integration/plugin/proxy risk. Hosting, staging, plugins and launch are future, separately approved actions.
