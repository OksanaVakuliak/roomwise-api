-- DeleteOrphans
DELETE FROM "style_default_materials" sdm
WHERE NOT EXISTS (
    SELECT 1 FROM "room_type_categories" rtc
    WHERE rtc."room_type_id" = sdm."room_type_id"
      AND rtc."category_id" = sdm."category_id"
);

-- AddForeignKey
ALTER TABLE "style_default_materials" ADD CONSTRAINT "style_default_materials_room_type_id_category_id_fkey" FOREIGN KEY ("room_type_id", "category_id") REFERENCES "room_type_categories"("room_type_id", "category_id") ON DELETE CASCADE ON UPDATE CASCADE;
