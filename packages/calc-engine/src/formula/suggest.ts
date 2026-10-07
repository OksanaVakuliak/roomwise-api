export function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + substitution,
      );
    }
    previous = current;
  }
  return previous[b.length] as number;
}

export function suggestNearest(
  name: string,
  candidates: readonly string[],
  maxDistance = 2,
): string | undefined {
  let best: string | undefined;
  let bestDistance = maxDistance + 1;
  for (const candidate of candidates) {
    const distance = levenshtein(name, candidate);
    if (
      distance < bestDistance ||
      (distance === bestDistance && best !== undefined && candidate < best)
    ) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
