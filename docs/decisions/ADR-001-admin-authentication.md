# ADR-001: Admin authentication

**Status:** Proposed — Pascal approval required.

Use Supabase Auth with magic links initially, explicit `admin_roles` allowlist, verified server session/JWT, RLS and server-side authorization. The current header secret sender is not dashboard authentication. Roles are operator/manager (future owner); service role is server-only. This protects PII and operational actions while allowing revocation and audit attribution. A1 must threat-model magic-link delivery/session expiry and test unauthorized, expired and non-admin access.
