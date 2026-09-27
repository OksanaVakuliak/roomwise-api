import { describe, expect, it } from 'vitest';
import { computeNextResetAt } from './next-reset-at';

const KYIV = 'Europe/Kyiv';

function next(now: string, resetTime = '03:00', timeZone = KYIV): string {
  return computeNextResetAt(new Date(now), resetTime, timeZone).toISOString();
}

describe('computeNextResetAt', () => {
  it('returns today when the reset time is still ahead in winter', () => {
    expect(next('2026-01-15T00:30:00.000Z')).toBe('2026-01-15T01:00:00.000Z');
  });

  it('returns today when the reset time is still ahead in summer', () => {
    expect(next('2026-07-15T23:30:00.000Z')).toBe('2026-07-16T00:00:00.000Z');
  });

  it('returns tomorrow when the reset time has passed', () => {
    expect(next('2026-01-15T01:00:00.001Z')).toBe('2026-01-16T01:00:00.000Z');
  });

  it('returns the next day when now is exactly the reset time', () => {
    expect(next('2026-01-15T01:00:00.000Z')).toBe('2026-01-16T01:00:00.000Z');
  });

  it('uses the local date of the zone rather than the UTC date', () => {
    expect(next('2026-01-15T22:30:00.000Z')).toBe('2026-01-16T01:00:00.000Z');
  });

  it('moves a reset time inside the spring-forward gap to the end of the gap', () => {
    expect(next('2026-03-28T12:00:00.000Z')).toBe('2026-03-29T01:00:00.000Z');
  });

  it('switches to the summer offset on the day after spring forward', () => {
    expect(next('2026-03-29T01:00:00.000Z')).toBe('2026-03-30T00:00:00.000Z');
  });

  it('keeps a reset time outside the gap exact on the spring-forward day', () => {
    expect(next('2026-03-28T12:00:00.000Z', '05:00')).toBe(
      '2026-03-29T02:00:00.000Z',
    );
  });

  it('picks the earlier instant of a repeated wall time on fall back', () => {
    expect(next('2026-10-24T12:00:00.000Z')).toBe('2026-10-25T00:00:00.000Z');
  });

  it('does not reset twice when now falls between the repeated wall times', () => {
    expect(next('2026-10-25T00:30:00.000Z')).toBe('2026-10-26T01:00:00.000Z');
  });

  it('switches to the winter offset on the day after fall back', () => {
    expect(next('2026-10-25T00:00:00.000Z')).toBe('2026-10-26T01:00:00.000Z');
  });

  it('handles midnight and zones without daylight saving', () => {
    expect(next('2026-06-01T12:00:00.000Z', '00:00', 'UTC')).toBe(
      '2026-06-02T00:00:00.000Z',
    );
    expect(next('2026-06-01T12:00:00.000Z', '23:59', 'Asia/Tokyo')).toBe(
      '2026-06-01T14:59:00.000Z',
    );
  });

  it('handles zones west of UTC across the year end', () => {
    expect(next('2026-12-31T23:00:00.000Z', '03:00', 'America/New_York')).toBe(
      '2027-01-01T08:00:00.000Z',
    );
  });
});
