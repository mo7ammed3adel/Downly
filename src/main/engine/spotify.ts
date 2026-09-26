import type { PlaylistEntry, PlaylistInfo, TrackMeta } from '@shared/types'
import { parseSpotifyUrl } from '@shared/util'
import { createFetcher, type Fetcher } from './http'

/**
 * Spotify audio is DRM protected, so like spotDL we only read the metadata here
 * (track names, artists, album, cover) and fetch the matching audio from YouTube.
 * Uses the Web API when the user configured credentials (full, paginated lists),
 * otherwise the public embed page (no keys, first ~100 tracks of big playlists).
 */
export async function resolveSpotify(
  url: string,
  creds: { clientId: string; clientSecret: string },
  fetchFn: Fetcher = createFetcher()
): Promise<PlaylistInfo> {
  const parsed = parseSpotifyUrl(url)
  if (!parsed) throw new Error('Not a Spotify link')
  if (creds.clientId && creds.clientSecret) {
    try {
      return await viaWebApi(parsed.type, parsed.id, url, creds, fetchFn)
    } catch {
      /* fall back to the embed page */
    }
  }
  return viaEmbed(parsed.type, parsed.id, url, fetchFn)
}

export function searchQuery(t: TrackMeta): string {
  return `ytsearch1:${t.artist} - ${t.title} audio`
}

function toEntry(meta: TrackMeta, trackUrl: string): PlaylistEntry {
  return {
    url: trackUrl,
    title: `${meta.artist} - ${meta.title}`,
    duration: meta.durationMs ? meta.durationMs / 1000 : undefined,
    thumbnail: meta.cover,
    track: meta
  }
}

async function viaEmbed(type: string, id: string, url: string, fetchFn: Fetcher): Promise<PlaylistInfo> {
  const res = await fetchFn(`https://open.spotify.com/embed/${type}/${id}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36' }
  })
  if (!res.ok) throw new Error(`Spotify returned HTTP ${res.status}`)
  const html = await res.text()
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/.exec(html)
  if (!m) throw new Error('Could not read Spotify page')
  const entity = JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity
  if (!entity) throw new Error('Spotify content not found')

  const cover: string | undefined = pickImage(entity.coverArt?.sources ?? entity.visualIdentity?.image)
  const name: string = entity.name ?? entity.title ?? 'Spotify'

  if (type === 'track') {
    const meta: TrackMeta = {
      title: name,
      artist: (entity.artists ?? []).map((a: { name: string }) => a.name).join(', ') || entity.subtitle || '',
      cover,
      durationMs: entity.duration
    }
    return { type: 'playlist', url, title: name, extractor: 'spotify', entries: [toEntry(meta, url)] }
  }

  const entries: PlaylistEntry[] = (entity.trackList ?? []).map(
    (t: { uri: string; title: string; subtitle: string; duration?: number }) => {
      const trackId = t.uri.split(':').pop()
      const meta: TrackMeta = {
        title: t.title,
        artist: t.subtitle?.replace(/ /g, ' ') ?? '',
        album: type === 'album' ? name : undefined,
        cover: type === 'album' ? cover : undefined,
        durationMs: t.duration
      }
      return toEntry(meta, `https://open.spotify.com/track/${trackId}`)
    }
  )
  return { type: 'playlist', url, title: name, uploader: entity.subtitle, extractor: 'spotify', entries }
}

function pickImage(sources: { url: string; width?: number; maxWidth?: number }[] | undefined): string | undefined {
  if (!sources?.length) return undefined
  return [...sources].sort((a, b) => (b.width ?? b.maxWidth ?? 0) - (a.width ?? a.maxWidth ?? 0))[0].url
}

interface ApiTrack {
  name: string
  duration_ms: number
  external_urls: { spotify: string }
  artists: { name: string }[]
  album?: { name: string; images: { url: string; width: number }[] }
}

async function viaWebApi(
  type: string,
  id: string,
  url: string,
  creds: { clientId: string; clientSecret: string },
  fetchFn: Fetcher
): Promise<PlaylistInfo> {
  const tokenRes = await fetchFn('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')}`
    },
    body: 'grant_type=client_credentials'
  })
  if (!tokenRes.ok) throw new Error('Spotify credentials rejected')
  const { access_token } = (await tokenRes.json()) as { access_token: string }
  const api = async <T>(path: string): Promise<T> => {
    const r = await fetchFn(path.startsWith('http') ? path : `https://api.spotify.com/v1/${path}`, {
      headers: { authorization: `Bearer ${access_token}` }
    })
    if (!r.ok) throw new Error(`Spotify API HTTP ${r.status}`)
    return r.json() as Promise<T>
  }
  const meta = (t: ApiTrack, album?: { name: string; images: { url: string; width: number }[] }): TrackMeta => ({
    title: t.name,
    artist: t.artists.map((a) => a.name).join(', '),
    album: (album ?? t.album)?.name,
    cover: pickImage((album ?? t.album)?.images),
    durationMs: t.duration_ms
  })

  if (type === 'track') {
    const t = await api<ApiTrack>(`tracks/${id}`)
    return { type: 'playlist', url, title: t.name, extractor: 'spotify', entries: [toEntry(meta(t), url)] }
  }

  if (type === 'album') {
    const album = await api<{ name: string; images: { url: string; width: number }[]; artists: { name: string }[]; tracks: Page<ApiTrack> }>(`albums/${id}`)
    const entries: PlaylistEntry[] = []
    let page: Page<ApiTrack> | null = album.tracks
    while (page) {
      for (const t of page.items) entries.push(toEntry(meta(t, album), t.external_urls.spotify))
      page = page.next ? await api<Page<ApiTrack>>(page.next) : null
    }
    return { type: 'playlist', url, title: album.name, uploader: album.artists[0]?.name, extractor: 'spotify', entries }
  }

  if (type === 'playlist') {
    const pl = await api<{ name: string; owner: { display_name: string }; tracks: Page<{ track: ApiTrack | null }> }>(`playlists/${id}`)
    const entries: PlaylistEntry[] = []
    let page: Page<{ track: ApiTrack | null }> | null = pl.tracks
    while (page) {
      for (const { track } of page.items) if (track) entries.push(toEntry(meta(track), track.external_urls.spotify))
      page = page.next ? await api<Page<{ track: ApiTrack | null }>>(page.next) : null
    }
    return { type: 'playlist', url, title: pl.name, uploader: pl.owner.display_name, extractor: 'spotify', entries }
  }

  // artist → top tracks
  const artist = await api<{ name: string }>(`artists/${id}`)
  const top = await api<{ tracks: ApiTrack[] }>(`artists/${id}/top-tracks?market=US`)
  return { type: 'playlist', url, title: artist.name, extractor: 'spotify', entries: top.tracks.map((t) => toEntry(meta(t), t.external_urls.spotify)) }
}

interface Page<T> {
  items: T[]
  next: string | null
}
