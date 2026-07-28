# Migration-history canonicalization

## Decision

Poster Valley uses **environment-specific canonicalization**:

- the local Git timestamps are canonical for the six shared A1 through A3.2 migrations;
- Staging and Production retain separate legitimate baselines;
- execution-time aliases recorded by remote environments are historical registration timestamps,
  not durable migration identities;
- migration SQL is immutable and must never be replayed merely to reconcile history.

The six shared SQL bodies were normalized and compared across local Git, Staging and Production.
For every migration, all three SHA-256 hashes, migration names and statement ordering were identical.

## Environment baselines

| Environment | Canonical baseline | Purpose |
|---|---|---|
| Staging | `20260719175848_initialize_poster_valley_kickoff_staging` | Five-table kickoff baseline used by the isolated Staging project |
| Production | `20260707234351_create_kickoff_signup_tables` | Original two-table live kickoff baseline |

The two baselines are intentionally different. Do not place both in one shared active migration
directory without an explicit architecture decision and environment-specific CLI workflow: either
environment could otherwise see the other baseline as pending.

Production's current schema has the same five-table pre-A4 structure as Staging, but its recorded
history does not explain the evolution from the original two-table baseline. Before A4 can be
considered for Production, reconstruct that provenance or approve and document it as a controlled
historical exception. A history repair alone does not make the Production chain reproducible on an
empty database.

## Shared canonical identities

| Canonical Git timestamp | Migration | Historical Staging alias | Historical Production alias |
|---|---|---|---|
| `20260720090000` | `admin_auth_data_foundation` | `20260719212704` | `20260720212806` |
| `20260720093000` | `admin_auth_data_hardening` | `20260719213336` | `20260720212813` |
| `20260720110000` | `admin_operational_actions` | `20260720120934` | `20260720212838` |
| `20260720165432` | `admin_operational_actions_runtime_fix` | `20260720170541` | `20260720212845` |
| `20260721083831` | `a3_1_admin_customer_data_record_origin` | `20260721093458` | `20260721093937` |
| `20260721151023` | `admin_invitation_delivery_confirmation` | `20260721154918` | `20260721155649` |

Staging also contains canonical
`20260722111632_admin_reporting_exports`. Production does not contain A4. Applying A4 to Production
requires a separate, explicit approval after its canonical history and baseline provenance gates
have passed.

## History-repair boundary

Supabase migration-history repair changes only records in
`supabase_migrations.schema_migrations`. For an exact, already-executed SQL match, the approved
reconciliation sequence is:

1. pause every migration runner;
2. prove the target environment, current history, SQL hash and schema fingerprint;
3. mark one canonical Git timestamp `applied`;
4. prove history and schema are unchanged;
5. mark only its matching execution-time alias `reverted`;
6. prove history and schema again before continuing.

History repair must not execute migration SQL, alter schema objects or modify application rows.
Baseline timestamps are never repaired as part of the shared A1 through A3.2 reconciliation.
Staging A4 is likewise outside that repair set.

Production history repair and Production A4 are separate future changes. Neither is authorized by
this document.
