export function getSiteUrl(): string {
  const configured = import.meta.env.VITE_SITE_URL?.replace(/\/$/, "");
  if (configured) {
    return configured;
  }
  return window.location.origin;
}

export function getAuthCallbackUrl(next?: string): string {
  const base = `${getSiteUrl()}/auth/callback`;
  if (!next) {
    return base;
  }
  const url = new URL(base);
  url.searchParams.set("next", next);
  return url.toString();
}

export function getPasswordResetRedirectUrl(): string {
  return `${getSiteUrl()}/reset-password`;
}
