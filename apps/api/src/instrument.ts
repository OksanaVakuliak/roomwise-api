import * as Sentry from '@sentry/nestjs';

const sentryDsn = process.env.SENTRY_DSN?.trim();

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    sendDefaultPii: false,
  });
}
