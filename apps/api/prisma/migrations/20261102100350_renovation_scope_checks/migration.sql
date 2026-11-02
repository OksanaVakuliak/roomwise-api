-- AlterCheck
ALTER TABLE "pricing_rules" DROP CONSTRAINT "pricing_rules_level_shape_check";
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_level_shape_check" CHECK (
    ("level" = 'OBJECT' AND "category_id" IS NULL AND "material_type_id" IS NULL AND "quantity_formula" IS NULL AND "surface" IS NULL AND "labor_formula" IS NULL)
    OR ("level" = 'SURFACE' AND "category_id" IS NULL AND "material_type_id" IS NULL AND "quantity_formula" IS NULL AND "surface" IN ('FLOOR', 'WALLS', 'CEILING') AND "labor_formula" IS NULL AND "base_component" = false)
    OR ("level" = 'CATEGORY' AND "category_id" IS NOT NULL AND "material_type_id" IS NULL AND "quantity_formula" IS NOT NULL AND "surface" IS NULL AND "base_component" = false)
    OR ("level" = 'MATERIAL_TYPE' AND "category_id" IS NOT NULL AND "material_type_id" IS NOT NULL AND "quantity_formula" IS NOT NULL AND "surface" IS NULL AND "base_component" = false)
);
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_labor_formula_check" CHECK (char_length("labor_formula") <= 500);
ALTER TABLE "options" ADD CONSTRAINT "options_scopes_check" CHECK (cardinality("scopes") > 0);
ALTER TABLE "pricing_settings" ADD CONSTRAINT "pricing_settings_missing_area_hint_sqm_check" CHECK ("missing_area_hint_sqm" >= 0);
