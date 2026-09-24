export function findCloudinaryCloudName(url: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'cloudinary:' || !parsed.hostname) {
    return null;
  }

  return parsed.hostname;
}
