import { useTranslation } from 'react-i18next'

/** yt-dlp --sub-langs values behind friendly names (codes like 'ar.*' mean nothing to most people) */
const CHOICES = [
  ['ar.*', 'add.subsArabic'],
  ['en.*', 'add.subsEnglish'],
  ['ar.*,en.*', 'add.subsArabicEnglish'],
  ['all', 'add.subsAll']
] as const

export function SubtitleLangs(props: { value: string; disabled?: boolean; onChange(value: string): void }) {
  const { t } = useTranslation()
  // A value typed in an older version stays selectable as it is
  const custom = !CHOICES.some(([v]) => v === props.value) && props.value
  return (
    <select className="select" value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value)}>
      {CHOICES.map(([value, label]) => (
        <option key={value} value={value}>
          {t(label)}
        </option>
      ))}
      {custom && <option value={custom}>{custom}</option>}
    </select>
  )
}
