import { resolveTestDatabaseUrls } from './test-database-url';

const { databaseUrl, directUrl } = resolveTestDatabaseUrls();

Object.assign(process.env, {
  DATABASE_URL: databaseUrl,
  DIRECT_URL: directUrl,
  JWT_SECRET: 'test-jwt-secret-with-at-least-32-characters',
  CORS_ORIGIN: 'http://localhost:3000',
  CLOUDINARY_URL: 'cloudinary://key:secret@test',
  MAINTENANCE_TOKEN: 'test-maintenance-token-with-32-characters',
  DEMO_ADMIN_LOGIN: 'demo',
  DEMO_ADMIN_PASSWORD: 'test-demo-password',
  SANDBOX_RESET_TIME: '03:00',
  SANDBOX_TIMEZONE: 'Europe/Kyiv',
  PORT: '4000',
});
