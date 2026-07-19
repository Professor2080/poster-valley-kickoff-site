# ADR-005: Cross-system product identifiers

**Status:** Accepted — implementation and production release require separate approval.

Adopt immutable lowercase kebab-case `product_code`, also used as Woo SKU. The first code is `eurofighter-typhoon-a2`. Titles, URLs, dimensions and prices can change; the code does not. Custom registry stores optional Woo product ID/URL. A product’s active selling mode determines price/stock/order authority, preventing duplicate editable commercial truth.
