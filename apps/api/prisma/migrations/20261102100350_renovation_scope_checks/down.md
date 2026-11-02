Reverts the renovation_scope_checks migration: restores the original rule shape check and drops the new checks. Run only while no `SURFACE` rule exists.

```sql
ALTER TABLE "pricing_settings" DROP CONSTRAINT IF EXISTS "pricing_settings_missing_area_hint_sqm_check";
ALTER TABLE "options" DROP CONSTRAINT IF EXISTS "options_scopes_check";
ALTER TABLE "pricing_rules" DROP CONSTRAINT IF EXISTS "pricing_rules_labor_formula_check";
ALTER TABLE "pricing_rules" DROP CONSTRAINT "pricing_rules_level_shape_check";
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_level_shape_check" CHECK (
    ("level" = 'OBJECT' AND "category_id" IS NULL AND "material_type_id" IS NULL AND "quantity_formula" IS NULL)
    OR ("level" = 'CATEGORY' AND "category_id" IS NOT NULL AND "material_type_id" IS NULL AND "quantity_formula" IS NOT NULL)
    OR ("level" = 'MATERIAL_TYPE' AND "category_id" IS NOT NULL AND "material_type_id" IS NOT NULL AND "quantity_formula" IS NOT NULL)
);

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261102100350_renovation_scope_checks';
```
