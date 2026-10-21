Reverts the pricing module: drops all pricing tables in reverse dependency order and the pricing enum types.

```sql
DROP TABLE IF EXISTS "pricing_settings";
DROP TABLE IF EXISTS "exchange_rates";
DROP TABLE IF EXISTS "pricing_rules";
DROP TABLE IF EXISTS "coefficients";
DROP TABLE IF EXISTS "base_rates";

DROP TYPE IF EXISTS "RateSource";
DROP TYPE IF EXISTS "RuleLevel";
DROP TYPE IF EXISTS "FinishLevel";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261007151605_pricing';
```

Note: this down migration must run before the down migration for `auth`, since these tables hold foreign keys referencing `admins`.
