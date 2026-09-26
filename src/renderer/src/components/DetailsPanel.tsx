import { useTranslation } from 'react-i18next'
import { useStore } from '../store'

/** Info about the selected download, with IDM's per-connection segment map */
export function DetailsPanel() {
  const { t } = useTranslation()
  const item = useStore((s) => (s.selected.length === 1 ? s.downloads[s.selected[0]] : undefined))
  if (!item) return null
  const sep = item.directory.includes('\\') ? '\\' : '/'
  const showSegments = item.kind === 'http' && item.size > 0 && item.segments.length > 0 && item.status !== 'completed'

  return (
    <section className="details">
      <dl>
        <dt>{t('details.url')}</dt>
        <dd title={item.url}>{item.pageUrl ?? item.url}</dd>
        <dt>{t('details.saveTo')}</dt>
        <dd title={item.directory}>{`${item.directory}${sep}${item.fileName}`}</dd>
        {item.kind === 'http' && (
          <>
            <dt>{t('details.resumable')}</dt>
            <dd>
              {item.resumable ? t('details.yes') : t('details.no')}
              {showSegments && ` · ${t('details.connections')}: ${item.segments.filter((s) => s.downloaded < s.end - s.start + 1).length}`}
            </dd>
          </>
        )}
        {item.error && (
          <>
            <dt>{t('details.error')}</dt>
            <dd className="error-text">{item.error}</dd>
          </>
        )}
      </dl>
      <div />
      {showSegments && (
        <div className="segments" aria-hidden>
          {item.segments.map((s, i) => (
            <div
              key={i}
              style={{
                insetInlineStart: `${(s.start / item.size) * 100}%`,
                width: `${(s.downloaded / item.size) * 100}%`
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
}
