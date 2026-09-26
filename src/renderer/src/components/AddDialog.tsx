import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Captions, FolderOpen, Image as ImageIcon, Info, Link, ListVideo, Music, Plus, Video } from 'lucide-react'
import type {
  AudioFormat,
  Category,
  ExternalAddRequest,
  MediaInfo,
  MediaOptions,
  NewDownloadRequest,
  PlaylistInfo,
  ProbeResult,
  RequestContext,
  VideoContainer
} from '@shared/types'
import { categorize, expandBatchPattern, mediaCategory, formatBytes, formatDuration, isHttpUrl, isKnownMediaSite, parseSpotifyUrl } from '@shared/util'
import { useStore } from '../store'
import { explainError } from '@shared/errors'
import { SubtitleLangs } from './SubtitleLangs'
import { Field, Modal, Segmented, Toggle, closeDialog } from './ui'

const QUALITIES = [4320, 2160, 1440, 1080, 720, 480, 360, 240, 144]
const AUDIO_FORMATS: AudioFormat[] = ['mp3', 'm4a', 'opus', 'flac', 'wav', 'best']
const BITRATES = [0, 320, 256, 192, 128]
const CONTAINERS: VideoContainer[] = ['mp4', 'mkv', 'webm']

type Phase = 'idle' | 'loading' | 'done' | 'error'

export function AddDialog({ initial, urls }: { initial?: ExternalAddRequest; urls?: string[] }) {
  const { t } = useTranslation()
  const settings = useStore((s) => s.settings)
  const platform = useStore((s) => s.platform)

  const [text, setText] = useState(initial?.url ?? urls?.join('\n') ?? '')
  // How the browser requested this link: guarded sites only answer requests that look the same
  const browserContext: RequestContext = {
    cookies: initial?.cookies,
    referrer: initial?.referrer,
    userAgent: initial?.userAgent,
    headers: initial?.headers
  }
  const downloadContext: RequestContext = {
    cookies: initial?.cookies,
    referrer: initial?.referrer,
    headers:
      initial?.headers || initial?.userAgent
        ? { ...initial?.headers, ...(initial?.userAgent ? { 'user-agent': initial.userAgent } : {}) }
        : undefined
  }
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<ProbeResult | null>(null)
  const [batch, setBatch] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  const [directory, setDirectory] = useState('')
  const [fileName, setFileName] = useState(initial?.fileName ?? '')
  const [selection, setSelection] = useState<Set<number>>(new Set())
  const [media, setMedia] = useState<MediaOptions>(() => ({
    mode: initial?.mode ?? settings.media.defaultMode,
    quality: settings.media.defaultQuality,
    container: settings.media.defaultContainer,
    audioFormat: settings.media.defaultAudioFormat,
    audioBitrate: 0,
    subtitles: settings.media.subtitles,
    subtitleLangs: settings.media.subtitleLangs,
    embedThumbnail: settings.media.embedThumbnail
  }))
  const patchMedia = (p: Partial<MediaOptions>) => setMedia((m) => ({ ...m, ...p }))

  const analyze = async (raw = text) => {
    const list = raw
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(isHttpUrl)
      .flatMap((u) => expandBatchPattern(u))
    setResult(null)
    setBatch(null)
    setError('')
    if (!list.length) {
      setPhase(raw.trim() ? 'error' : 'idle')
      if (raw.trim()) setError(t('add.error'))
      return
    }
    if (list.length > 1) {
      setBatch([...new Set(list)])
      setPhase('done')
      return
    }
    setPhase('loading')
    try {
      const res = await window.api.probe({ url: list[0], ...browserContext })
      setResult(res)
      if (res.kind === 'http' && !initial?.fileName) setFileName(res.fileName)
      if (res.kind !== 'http' && res.info.type === 'playlist') {
        setSelection(new Set(res.info.entries.map((_, i) => i)))
      }
      if (res.kind === 'spotify') patchMedia({ mode: 'audio' })
      if (res.kind === 'media' && res.info.type === 'single' && res.info.heights.length) {
        // Snap the default quality to what this video actually offers
        const heights = res.info.heights
        setMedia((m) => {
          if (!m.quality || heights.includes(m.quality)) return m
          return { ...m, quality: heights.find((h) => h <= m.quality) ?? heights[heights.length - 1] }
        })
      }
      setPhase('done')
    } catch (e) {
      const msg = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
      setError(msg)
      setPhase('error')
    }
  }

  useEffect(() => {
    if (text.trim()) void analyze(text)
    return () => void window.api.cancelProbe()
  }, [])

  const category: Category = useMemo(() => {
    if (batch) return 'other'
    if (!result) return 'other'
    if (result.kind === 'http') return categorize(fileName || result.fileName, settings.categories)
    return mediaCategory(media.mode)
  }, [result, batch, fileName, media.mode, settings.categories])

  const sep = platform === 'win32' ? '\\' : '/'
  const autoDir = settings.useCategoryFolders
    ? `${settings.downloadDir}${sep}${settings.categories[category].folder}`
    : settings.downloadDir

  const submit = async (startPaused: boolean) => {
    const dir = directory || undefined
    const reqs: NewDownloadRequest[] = []
    if (batch) {
      for (const url of batch) {
        if (parseSpotifyUrl(url)) continue
        const isMedia = isKnownMediaSite(url)
        reqs.push({ url, kind: isMedia ? 'media' : 'http', media: isMedia ? media : undefined, directory: dir, startPaused })
      }
    } else if (result?.kind === 'http') {
      reqs.push({
        url: result.url,
        kind: 'http',
        fileName: fileName || result.fileName,
        size: result.size,
        directory: dir,
        pageUrl: initial?.pageUrl,
        ...downloadContext,
        startPaused
      })
    } else if (result && result.info.type === 'single') {
      const info = result.info
      reqs.push({
        url: info.url,
        kind: 'media',
        title: info.title,
        thumbnail: info.thumbnail,
        media,
        directory: dir,
        pageUrl: initial?.pageUrl,
        ...downloadContext,
        startPaused
      })
    } else if (result && result.info.type === 'playlist') {
      const pl = result.info
      const many = pl.entries.length > 1
      pl.entries.forEach((e, i) => {
        if (!selection.has(i)) return
        reqs.push({
          url: e.url,
          kind: result.kind === 'spotify' ? 'spotify' : 'media',
          title: e.title,
          thumbnail: e.thumbnail,
          track: e.track,
          media: result.kind === 'spotify' ? { ...media, mode: 'audio', formatId: undefined } : { ...media, formatId: undefined },
          directory: dir,
          playlistTitle: many ? pl.title : undefined,
          startPaused
        })
      })
    }
    if (!reqs.length) return
    await window.api.add(reqs)
    useStore.getState().set({ filter: 'all' })
    closeDialog()
  }

  const count = batch
    ? batch.length
    : result && result.kind !== 'http' && result.info.type === 'playlist'
      ? selection.size
      : result
        ? 1
        : 0

  return (
    <Modal
      title={t('add.title')}
      icon={<Plus size={18} />}
      onClose={closeDialog}
      wide={!!result && result.kind !== 'http'}
      footer={
        <>
          <span className="left">{count > 1 ? t('add.items', { count }) : ''}</span>
          <button className="btn" onClick={closeDialog}>
            {t('add.cancel')}
          </button>
          <button className="btn" disabled={!count || phase !== 'done'} onClick={() => submit(true)}>
            {t('add.later')}
          </button>
          <button className="btn primary" disabled={!count || phase !== 'done'} onClick={() => submit(false)}>
            {count > 1 ? t('add.downloadSelected', { count }) : t('add.start')}
          </button>
        </>
      }
    >
      <div className="field">
        <div className="input-row">
          <textarea
            className="textarea"
            dir="ltr"
            rows={text.includes('\n') ? 4 : 2}
            autoFocus
            placeholder={t('add.urlPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void analyze()
              }
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text')
              if (!text.trim() && isHttpUrl(pasted.trim())) setTimeout(() => analyze(pasted), 0)
            }}
          />
          <button className="btn" style={{ height: 'auto' }} onClick={() => analyze()} disabled={phase === 'loading'}>
            <Link size={15} /> {t('add.analyze')}
          </button>
        </div>
      </div>

      {phase === 'loading' && (
        <div className="center-state">
          <div className="spinner" /> {t('add.analyzing')}
        </div>
      )}

      {phase === 'error' && (
        <div className="note error">
          <AlertTriangle size={16} style={{ flex: 'none' }} />
          <div style={{ flex: 1 }}>
            <strong>{t('add.error')}</strong>
            {explainError(error) && <div>{t(explainError(error)!)}</div>}
            <div className={explainError(error) ? 'hint' : undefined} style={{ wordBreak: 'break-word' }}>
              {error}
            </div>
          </div>
        </div>
      )}

      {phase === 'done' && batch && (
        <>
          <div className="note">
            <Info size={16} /> {t('add.batch', { count: batch.length })}
          </div>
          <div className="entry-list">
            {batch.slice(0, 500).map((u) => (
              <div className="entry" key={u}>
                <span className="t" title={u}>
                  {u}
                </span>
              </div>
            ))}
          </div>
          {batch.some(isKnownMediaSite) && <MediaOptionsForm media={media} onChange={patchMedia} heights={[]} audioOnly={false} />}
        </>
      )}

      {phase === 'done' && result?.kind === 'http' && (
        <>
          <Field label={t('add.fileName')}>
            <input className="input" value={fileName} onChange={(e) => setFileName(e.target.value)} />
          </Field>
          <div className="info-strip">
            <div>
              <span>{t('add.size')}:</span>
              {result.size > 0 ? formatBytes(result.size) : t('add.unknown')}
            </div>
            <div>
              <span>{t('add.resumable')}:</span>
              {result.resumable ? t('details.yes') : t('details.no')}
            </div>
            {result.mime && (
              <div>
                <span>MIME:</span>
                {result.mime}
              </div>
            )}
          </div>
        </>
      )}

      {phase === 'done' && result && result.kind !== 'http' && result.info.type === 'single' && (
        <SingleMedia info={result.info} media={media} onChange={patchMedia} />
      )}

      {phase === 'done' && result && result.kind !== 'http' && result.info.type === 'playlist' && (
        <PlaylistView
          info={result.info}
          spotify={result.kind === 'spotify'}
          selection={selection}
          setSelection={setSelection}
          media={media}
          onChange={patchMedia}
        />
      )}

      {phase === 'done' && (
        <Field label={t('add.saveTo')}>
          <div className="input-row">
            <input className="input" value={directory} placeholder={autoDir} onChange={(e) => setDirectory(e.target.value)} />
            <button
              className="btn"
              onClick={async () => {
                const dir = await window.api.chooseDirectory(directory || autoDir)
                if (dir) setDirectory(dir)
              }}
            >
              <FolderOpen size={15} /> {t('add.browse')}
            </button>
          </div>
        </Field>
      )}
    </Modal>
  )
}

function SingleMedia({ info, media, onChange }: { info: MediaInfo; media: MediaOptions; onChange(p: Partial<MediaOptions>): void }) {
  const { t } = useTranslation()
  const [advanced, setAdvanced] = useState(false)
  const estimate = useMemo(() => estimateSize(info, media), [info, media])

  return (
    <>
      <div className="media-head">
        {info.thumbnail && <img className="thumb" src={info.thumbnail} alt="" referrerPolicy="no-referrer" />}
        <div style={{ minWidth: 0 }}>
          <h3>{info.title}</h3>
          <div className="meta">
            {info.uploader && <span>{t('add.by', { name: info.uploader })}</span>}
            {info.duration ? <span>{formatDuration(info.duration)}</span> : null}
            <span>{info.extractor}</span>
            {estimate > 0 && <span>≈ {formatBytes(estimate)}</span>}
          </div>
        </div>
      </div>
      <MediaOptionsForm media={media} onChange={onChange} heights={info.heights} audioOnly={!info.heights.length} />
      <label className="check" style={{ marginTop: -6, marginBottom: 8 }}>
        <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
        {t('add.advanced')}
      </label>
      {advanced && (
        <Field label={t('add.advanced')}>
          <select
            className="select"
            value={media.formatId ?? ''}
            onChange={(e) => onChange({ formatId: e.target.value || undefined })}
          >
            <option value="">{t('add.auto')}</option>
            {info.formats
              .filter((f) => (media.mode === 'audio' ? !f.vcodec || f.vcodec === 'none' : f.vcodec && f.vcodec !== 'none'))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {[
                    f.id,
                    f.ext,
                    f.height ? `${f.height}p${f.fps && f.fps > 30 ? f.fps : ''}` : f.abr ? `${Math.round(f.abr)}k` : '',
                    f.vcodec && f.vcodec !== 'none' ? f.vcodec.split('.')[0] : '',
                    f.acodec && f.acodec !== 'none' ? f.acodec.split('.')[0] : '',
                    f.filesize ? formatBytes(f.filesize) : '',
                    f.note ?? ''
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </option>
              ))}
          </select>
        </Field>
      )}
    </>
  )
}

function PlaylistView(props: {
  info: PlaylistInfo
  spotify: boolean
  selection: Set<number>
  setSelection(s: Set<number>): void
  media: MediaOptions
  onChange(p: Partial<MediaOptions>): void
}) {
  const { t } = useTranslation()
  const { info, selection, setSelection } = props
  const toggle = (i: number) => {
    const next = new Set(selection)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setSelection(next)
  }

  return (
    <>
      <div className="media-head" style={{ alignItems: 'center' }}>
        <div className="file-icon video" style={{ width: 44, height: 44 }}>
          {props.spotify ? <Music size={22} /> : <ListVideo size={22} />}
        </div>
        <div>
          <h3 style={{ margin: 0 }}>{info.title}</h3>
          <div className="meta">
            <span>{t('add.items', { count: info.entries.length })}</span>
            {info.uploader && <span>{t('add.by', { name: info.uploader })}</span>}
            <span>{props.spotify ? 'Spotify' : info.extractor}</span>
          </div>
        </div>
      </div>
      {props.spotify && (
        <div className="note">
          <Info size={16} style={{ flex: 'none' }} /> {t('add.spotifyNote')}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button className="btn" onClick={() => setSelection(new Set(info.entries.map((_, i) => i)))}>
          {t('add.selectAll')}
        </button>
        <button className="btn" onClick={() => setSelection(new Set())}>
          {t('add.selectNone')}
        </button>
      </div>
      <div className="entry-list">
        {info.entries.map((e, i) => (
          <label className="entry" key={`${e.url}-${i}`}>
            <input type="checkbox" checked={selection.has(i)} onChange={() => toggle(i)} />
            {e.thumbnail ? <img src={e.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
            <span className="t" title={e.title}>
              {i + 1}. {e.title}
            </span>
            {e.duration ? <span className="d">{formatDuration(e.duration)}</span> : null}
          </label>
        ))}
      </div>
      <MediaOptionsForm media={props.media} onChange={props.onChange} heights={[]} audioOnly={props.spotify} />
    </>
  )
}

function MediaOptionsForm(props: {
  media: MediaOptions
  onChange(p: Partial<MediaOptions>): void
  heights: number[]
  audioOnly: boolean
}) {
  const { t } = useTranslation()
  const { media, onChange } = props
  const mode = props.audioOnly ? 'audio' : media.mode
  const heights = props.heights.length ? QUALITIES.filter((q) => props.heights.some((h) => h >= q * 0.9 && h <= q * 1.1)) : QUALITIES.slice(1, 7)

  return (
    <div className="section" style={{ borderBottom: 0 }}>
      {!props.audioOnly && (
        <div style={{ marginBottom: 14 }}>
          <Segmented
            value={mode}
            onChange={(v) => onChange({ mode: v, formatId: undefined })}
            options={[
              { value: 'video', label: <><Video size={15} /> {t('add.video')}</> },
              { value: 'audio', label: <><Music size={15} /> {t('add.audio')}</> },
              { value: 'thumbnail', label: <><ImageIcon size={15} /> {t('add.thumbnailOnly')}</> },
              { value: 'subtitles', label: <><Captions size={15} /> {t('add.subtitlesOnly')}</> }
            ]}
          />
        </div>
      )}
      {mode === 'thumbnail' ? (
        <div className="hint" style={{ marginBottom: 10 }}>
          {t('add.thumbnailHint')}
        </div>
      ) : mode === 'subtitles' ? (
        <Field label={t('add.subtitleLangs')} hint={t('add.subtitlesHint')}>
          <SubtitleLangs value={media.subtitleLangs} onChange={(v) => onChange({ subtitleLangs: v })} />
        </Field>
      ) : mode === 'video' ? (
        <div className="grid-3">
          <Field label={t('add.quality')}>
            <select className="select" value={media.quality} onChange={(e) => onChange({ quality: Number(e.target.value) })}>
              <option value={0}>{t('add.best')}</option>
              {heights.map((h) => (
                <option key={h} value={h}>
                  {labelForHeight(h)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('add.container')}>
            <select className="select" value={media.container} onChange={(e) => onChange({ container: e.target.value as VideoContainer })}>
              {CONTAINERS.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('add.subtitleLangs')}>
            <SubtitleLangs value={media.subtitleLangs} disabled={!media.subtitles} onChange={(v) => onChange({ subtitleLangs: v })} />
          </Field>
        </div>
      ) : (
        <div className="grid-2">
          <Field label={t('add.audioFormat')}>
            <select className="select" value={media.audioFormat} onChange={(e) => onChange({ audioFormat: e.target.value as AudioFormat })}>
              {AUDIO_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f === 'best' ? t('add.best') : f.toUpperCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('add.bitrate')}>
            <select
              className="select"
              value={media.audioBitrate}
              disabled={media.audioFormat === 'flac' || media.audioFormat === 'wav'}
              onChange={(e) => onChange({ audioBitrate: Number(e.target.value) })}
            >
              {BITRATES.map((b) => (
                <option key={b} value={b}>
                  {b ? `${b} kbps` : t('add.best')}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {(mode === 'video' || mode === 'audio') && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {mode === 'video' && (
            <Toggle label={t('add.subtitles')} checked={media.subtitles} onChange={(v) => onChange({ subtitles: v })} />
          )}
          <Toggle label={t('add.embedThumbnail')} checked={media.embedThumbnail} onChange={(v) => onChange({ embedThumbnail: v })} />
        </div>
      )}
    </div>
  )
}

function labelForHeight(h: number): string {
  const names: Record<number, string> = { 4320: '8K', 2160: '4K', 1440: '2K' }
  return names[h] ? `${h}p (${names[h]})` : `${h}p`
}

function estimateSize(info: MediaInfo, m: MediaOptions): number {
  const audio = info.formats
    .filter((f) => (!f.vcodec || f.vcodec === 'none') && f.filesize)
    .sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))[0]
  if (m.mode === 'audio') return audio?.filesize ?? 0
  const limit = m.quality || Infinity
  const video = info.formats
    .filter((f) => f.vcodec && f.vcodec !== 'none' && f.height && f.height <= limit && f.filesize)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.tbr ?? 0) - (a.tbr ?? 0))[0]
  if (!video) return 0
  const hasAudio = video.acodec && video.acodec !== 'none'
  return (video.filesize ?? 0) + (hasAudio ? 0 : audio?.filesize ?? 0)
}
