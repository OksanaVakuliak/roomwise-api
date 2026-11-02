Reverts the room_types_hallway_storage migration. PostgreSQL cannot drop an enum value, so the room types using the new codes are deleted and the type is recreated without them.

```sql
DELETE FROM "room_types" WHERE "code" IN ('HALLWAY', 'STORAGE');
ALTER TYPE "RoomTypeCode" RENAME TO "RoomTypeCode_old";
CREATE TYPE "RoomTypeCode" AS ENUM ('LIVING_ROOM', 'BEDROOM', 'KITCHEN', 'KITCHEN_LIVING', 'BATHROOM');
ALTER TABLE "room_types" ALTER COLUMN "code" TYPE "RoomTypeCode" USING "code"::text::"RoomTypeCode";
DROP TYPE "RoomTypeCode_old";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261102100100_room_types_hallway_storage';
```
