export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export function parseCloudinaryUrl(url: string): CloudinaryCredentials | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== 'cloudinary:' ||
    !parsed.hostname ||
    !parsed.username ||
    !parsed.password
  ) {
    return null;
  }

  try {
    return {
      cloudName: parsed.hostname,
      apiKey: decodeURIComponent(parsed.username),
      apiSecret: decodeURIComponent(parsed.password),
    };
  } catch {
    return null;
  }
}

export function findCloudinaryCloudName(url: string): string | null {
  return parseCloudinaryUrl(url)?.cloudName ?? null;
}
