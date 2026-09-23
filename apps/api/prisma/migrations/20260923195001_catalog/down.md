Reverts the catalog module: drops all catalog tables in reverse dependency order and the catalog enum types.

```sql
DROP TABLE IF EXISTS "option_room_types";
DROP TABLE IF EXISTS "options";
DROP TABLE IF EXISTS "engineering_package_items";
DROP TABLE IF EXISTS "style_default_materials";
DROP TABLE IF EXISTS "styles";
DROP TABLE IF EXISTS "product_attributes";
DROP TABLE IF EXISTS "product_images";
DROP TABLE IF EXISTS "products";
DROP TABLE IF EXISTS "images";
DROP TABLE IF EXISTS "material_types";
DROP TABLE IF EXISTS "room_type_categories";
DROP TABLE IF EXISTS "categories";
DROP TABLE IF EXISTS "room_types";

DROP TYPE IF EXISTS "RoomTypeCode";
DROP TYPE IF EXISTS "OptionKind";
DROP TYPE IF EXISTS "OptionUnit";
DROP TYPE IF EXISTS "ProductUnit";
DROP TYPE IF EXISTS "SurfaceKind";
DROP TYPE IF EXISTS "PublicationStatus";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260923195001_catalog';
```

Note: this down migration must run before the down migration for `auth`, since these tables hold foreign keys referencing `admins`.
