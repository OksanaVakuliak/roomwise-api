Reverts the rule_level_surface migration. Run after reverting renovation_scope. PostgreSQL cannot drop an enum value, so the surface rules are deleted and the type is recreated without `SURFACE`.

```sql
DELETE FROM "pricing_rules" WHERE "level" = 'SURFACE';
DROP INDEX "pricing_rules_category_id_key";
DROP INDEX "pricing_rules_category_id_material_type_id_key";
ALTER TYPE "RuleLevel" RENAME TO "RuleLevel_old";
CREATE TYPE "RuleLevel" AS ENUM ('OBJECT', 'CATEGORY', 'MATERIAL_TYPE');
ALTER TABLE "pricing_rules" ALTER COLUMN "level" TYPE "RuleLevel" USING "level"::text::"RuleLevel";
DROP TYPE "RuleLevel_old";
CREATE UNIQUE INDEX "pricing_rules_category_id_key" ON "pricing_rules"("category_id") WHERE ("level" = 'CATEGORY');
CREATE UNIQUE INDEX "pricing_rules_category_id_material_type_id_key" ON "pricing_rules"("category_id", "material_type_id") WHERE ("level" = 'MATERIAL_TYPE');

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261102100200_rule_level_surface';
```
