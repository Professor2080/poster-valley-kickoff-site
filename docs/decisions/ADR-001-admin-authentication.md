# ADR-001: Admin authentication

**Status:** Accepted — implementation and production release require separate approval.

Use Supabase Auth with magic links initially, explicit `admin_roles` allowlist, verified server session/JWT, RLS and server-side authorization. Pascal is initially the sole manager-level admin; operator accounts may be added later. The current header secret sender is not dashboard authentication. Service role is server-only. This protects PII and operational actions while allowing revocation and audit attribution. A1 must threat-model magic-link delivery/session expiry and test unauthorized, expired and non-admin access.
