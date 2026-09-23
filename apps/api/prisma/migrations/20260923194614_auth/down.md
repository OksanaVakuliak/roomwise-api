Reverts the auth module: drops the admin session and admin tables.

```sql
DROP TABLE IF EXISTS "admin_sessions";
DROP TABLE IF EXISTS "admins";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260923194614_auth';
```

Note: the down migration for `catalog` must run before this one, since `catalog` tables hold foreign keys referencing `admins`.
