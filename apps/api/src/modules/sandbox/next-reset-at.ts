const MS_PER_SECOND = 1000;
const MS_PER_DAY = 86_400_000;
const DAYS_TO_SEARCH = 3;

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, formatter);
  }

  return formatter;
}

function wallClockAt(instant: number, timeZone: string): WallClock {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(new Date(instant))
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function offsetAt(instant: number, timeZone: string): number {
  const wholeSecond = Math.floor(instant / MS_PER_SECOND) * MS_PER_SECOND;
  const wall = wallClockAt(wholeSecond, timeZone);
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );

  return wallAsUtc - wholeSecond;
}

function zonedWallTimeToInstant(wallAsUtc: number, timeZone: string): number {
  const offsetBefore = offsetAt(wallAsUtc - MS_PER_DAY, timeZone);
  const offsetAfter = offsetAt(wallAsUtc + MS_PER_DAY, timeZone);
  const matches = [offsetBefore, offsetAfter]
    .map((offset) => wallAsUtc - offset)
    .filter((instant) => wallAsUtc - offsetAt(instant, timeZone) === instant);

  if (matches.length === 0) {
    return wallAsUtc - offsetBefore;
  }

  return Math.min(...matches);
}

export function parseResetTime(resetTime: string): {
  hour: number;
  minute: number;
} {
  const [hour, minute] = resetTime.split(':').map(Number);

  return { hour, minute };
}

export function computeNextResetAt(
  now: Date,
  resetTime: string,
  timeZone: string,
): Date {
  const { hour, minute } = parseResetTime(resetTime);
  const today = wallClockAt(now.getTime(), timeZone);

  for (let dayOffset = 0; dayOffset < DAYS_TO_SEARCH; dayOffset += 1) {
    const wallAsUtc = Date.UTC(
      today.year,
      today.month - 1,
      today.day + dayOffset,
      hour,
      minute,
    );
    const candidate = zonedWallTimeToInstant(wallAsUtc, timeZone);

    if (candidate > now.getTime()) {
      return new Date(candidate);
    }
  }

  throw new Error(`No reset time found after ${now.toISOString()}`);
}
