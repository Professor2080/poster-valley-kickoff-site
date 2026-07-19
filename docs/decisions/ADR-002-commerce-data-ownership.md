# ADR-002: Commerce data ownership

**Status:** Proposed — Pascal approval required.

Custom Drop Operations owns interest, invitations, invitation custom orders/payments, manual quotes, fulfilment and related emails/audit. WooCommerce owns in-stock catalogue, stock, cart/checkout, Woo orders/payments/refunds/fulfilment/emails/shipping-tax. No editable Woo-order replica in Supabase, no Woo stock in custom dashboard, and no cross-system editing of invitation orders. Read-only integration may be considered later with a documented authority and outage policy.
