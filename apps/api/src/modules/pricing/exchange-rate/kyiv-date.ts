const KYIV_TIME_ZONE = 'Europe/Kyiv';
const ISO_DATE_LENGTH = 10;

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: KYIV_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function kyivDateString(instant: Date): string {
  return formatter.format(instant);
}

export function kyivDate(instant: Date): Date {
  return new Date(`${kyivDateString(instant)}T00:00:00.000Z`);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, ISO_DATE_LENGTH);
}
