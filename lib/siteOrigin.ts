// Which address does a link we hand to somebody point at?
//
// This used to live inside the portal route, and getting it wrong is not a
// visible bug on our side — the link looks fine in a chat bubble and simply
// does not work for the person who taps it. NEXT_PUBLIC_SITE_URL wins when it
// is set, because it is the only source that cannot be a preview deployment or
// a localhost tunnel.

export interface OriginHeaders {
  get(name: string): string | null
}

export function resolveSiteOrigin(headers: OriginHeaders, fallback: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '')
  if (configured) return configured

  const host = headers.get('x-forwarded-host') ?? headers.get('host')
  if (host) {
    const proto = headers.get('x-forwarded-proto')
      ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return fallback.replace(/\/+$/, '')
}

/** Where the origin came from, so the UI can show it and a wrong one is caught
 *  by the person sending the link rather than by the person receiving it. */
export function originSource(): 'NEXT_PUBLIC_SITE_URL' | 'request headers' {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() ? 'NEXT_PUBLIC_SITE_URL' : 'request headers'
}
