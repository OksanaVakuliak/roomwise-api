import type { Section } from '../schemas';

export function lineId(section: Section, ...parts: string[]): string {
  return [section, ...parts].join(':');
}
