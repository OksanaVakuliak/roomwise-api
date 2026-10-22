Reverts the projects migration: drops the immutability trigger, the projects tables and their enums.

```sql
DROP TRIGGER IF EXISTS "calculation_versions_immutable" ON "calculation_versions";
DROP FUNCTION IF EXISTS "calculation_versions_reject_update"();

DROP TABLE IF EXISTS "idempotency_keys";
DROP TABLE IF EXISTS "projects_settings";
DROP TABLE IF EXISTS "lead_notes";
DROP TABLE IF EXISTS "lead_status_changes";
DROP TABLE IF EXISTS "leads";
DROP TABLE IF EXISTS "calculation_versions";
DROP TABLE IF EXISTS "calculations";

DROP TYPE IF EXISTS "IdempotencyScope";
DROP TYPE IF EXISTS "Locale";
DROP TYPE IF EXISTS "LeadStatus";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261022210000_projects';
```
