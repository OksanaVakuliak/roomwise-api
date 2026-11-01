Reverts the renovation_scope migration: drops the surface index, the new columns and the `Scope` and `CoefficientGroup` enums.

```sql
DROP INDEX IF EXISTS "pricing_rules_surface_key";
ALTER TABLE "pricing_settings" DROP COLUMN IF EXISTS "missing_area_hint_sqm";
ALTER TABLE "pricing_rules" DROP COLUMN IF EXISTS "surface",
DROP COLUMN IF EXISTS "labor_formula",
DROP COLUMN IF EXISTS "base_component";
ALTER TABLE "options" DROP COLUMN IF EXISTS "scopes",
DROP COLUMN IF EXISTS "price_coefficient_keys";
ALTER TABLE "coefficients" DROP COLUMN IF EXISTS "group";
DROP TYPE IF EXISTS "CoefficientGroup";
DROP TYPE IF EXISTS "Scope";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261102100300_renovation_scope';
```
