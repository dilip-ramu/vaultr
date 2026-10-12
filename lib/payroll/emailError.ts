// Turning an email provider's refusal into something the person can act on.
//
// The provider answers a blocked send with a 401 and a paragraph of its own
// prose, which the app was passing straight through, truncated at 200
// characters — so what the user saw was a severed sentence ending in "add the
// new IP address in this link: h". There is nothing in that a person can do
// anything with, and the actual cause is a setting in another company's
// dashboard.
//
// This is the second time the same wall has been hit with a different IP, which
// is the tell: the sending IP is not stable and never will be, because the app
// runs on serverless functions that get a fresh address whenever they cold
// start. Chasing the allowlist is not a fix; turning the allowlist off is.
//
// Pure, so the wording is tested rather than hoped at.

export interface EmailFailure {
  /** What to show the person. Written for them, not for a log. */
  message: string
  /** True when nothing about the app can fix it. */
  needsProviderSetting: boolean
}

// The address is optional. The advice is the same with or without it, and the
// phrase alone is enough to know which wall we hit.
const IP_BLOCK = /unrecogni[sz]ed ip address\s*([0-9a-f.:]*)/i

/**
 * Explain a failed send.
 *
 * The raw body is kept out of the message on purpose. It was written for
 * whoever integrated the provider, not for whoever is trying to send a payslip
 * on a Friday evening.
 */
export function explainEmailFailure(status: number, rawBody: string): EmailFailure {
  const body = String(rawBody ?? '')

  const ip = body.match(IP_BLOCK)
  if (ip) {
    // Only print something that actually looks like an address.
    const found = (ip[1] ?? '').replace(/[.:]+$/, '')
    const address = /[.:]/.test(found) ? found : ''
    return {
      needsProviderSetting: true,
      message:
        `Brevo blocked this send because it did not recognise the address it came from`
        + `${address ? ` (${address})` : ''}. `
        + 'Inex runs on Vercel, which gives each request a different address, so there is no '
        + 'fixed one to approve — approving this one will not stop it happening again. '
        + 'In Brevo: Settings → Security → Authorized IPs → Deactivate for API keys. '
        + '(Inex calls the REST API, so that is the one that matters; SMTP keys can stay as '
        + 'they are.) Nothing needs changing in Inex.',
    }
  }

  if (status === 401 || status === 403) {
    return {
      needsProviderSetting: true,
      message:
        'Brevo refused the request as unauthorised. Check that BREVO_API_KEY in Vercel is a '
        + 'current key and that the sender address is verified in Brevo.',
    }
  }

  if (status === 429) {
    return {
      needsProviderSetting: false,
      message: 'Brevo is rate limiting us. Wait a minute and send the rest.',
    }
  }

  if (status >= 500) {
    return {
      needsProviderSetting: false,
      message: `Brevo had a problem at their end (${status}). Nothing is wrong here — try again shortly.`,
    }
  }

  // Unknown: say what happened and keep a short piece of the original, because
  // a message with nothing concrete in it cannot be searched for.
  return {
    needsProviderSetting: false,
    message: `Brevo rejected this email (${status}). ${body.slice(0, 120)}`.trim(),
  }
}
