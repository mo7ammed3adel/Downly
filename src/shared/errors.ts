/**
 * yt-dlp / HTTP errors people meet most, mapped to an explanation key (locales: errors.*).
 * The raw message stays available as detail for problem reports.
 */
const KNOWN: [RegExp, string][] = [
  [/DRM protected/i, 'errors.drm'],
  [/sign in|log ?in|login required|cookies.*(needed|required)|confirm you.?re not a bot/i, 'errors.login'],
  [/private video|this video is private/i, 'errors.private'],
  [/video unavailable|has been removed|no longer available|HTTP Error 404|\b404\b/i, 'errors.gone'],
  [/unsupported url/i, 'errors.unsupported'],
  [/not available in your country|geo.?restrict/i, 'errors.geo'],
  [/HTTP (Error )?405|method not allowed/i, 'errors.needsForm'],
  [/HTTP Error 403|\b403\b|forbidden/i, 'errors.forbidden'],
  [/HTTP Error 429|too many requests/i, 'errors.rateLimited']
]

export function explainError(message: string): string | null {
  return KNOWN.find(([re]) => re.test(message))?.[1] ?? null
}
