Reverts the style default pair constraint: drops the foreign key from `style_default_materials` to `room_type_categories`.

```sql
ALTER TABLE "style_default_materials" DROP CONSTRAINT IF EXISTS "style_default_materials_room_type_id_category_id_fkey";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260925120000_style_default_pair_fk';
```

Note: the rows this migration deleted, style defaults for a room type and category pair that was not linked, are not restored.
