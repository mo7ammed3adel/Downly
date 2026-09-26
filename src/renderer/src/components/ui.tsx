import { useEffect, type ReactNode } from 'react'
import { AppWindow, Archive, File, FileText, Image, Music, Video, X } from 'lucide-react'
import type { Category } from '@shared/types'
import { useStore } from '../store'

export function Modal(props: {
  title: ReactNode
  icon?: ReactNode
  onClose(): void
  footer?: ReactNode
  wide?: boolean
  children: ReactNode
  bodyClass?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`modal ${props.wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          {props.icon}
          <h2>{props.title}</h2>
          <button className="btn ghost icon" onClick={props.onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>
        <div className={props.bodyClass ?? 'modal-body'}>{props.children}</div>
        {props.footer && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>
  )
}

export const closeDialog = () => useStore.getState().openDialog(null)

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    />
  )
}

export function Toggle(props: { label: ReactNode; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <label className="check" onClick={(e) => e.preventDefault()}>
      <Switch checked={props.checked} onChange={props.onChange} disabled={props.disabled} />
      <span onClick={() => !props.disabled && props.onChange(!props.checked)}>{props.label}</span>
    </label>
  )
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export function Segmented<T extends string>(props: {
  value: T
  onChange(v: T): void
  options: { value: T; label: ReactNode }[]
}) {
  return (
    <div className="segmented">
      {props.options.map((o) => (
        <button key={o.value} type="button" className={o.value === props.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const ICONS: Record<Category, typeof File> = {
  video: Video,
  music: Music,
  documents: FileText,
  compressed: Archive,
  programs: AppWindow,
  images: Image,
  other: File
}

export function FileIcon({ category, size = 16 }: { category: Category; size?: number }) {
  const Icon = ICONS[category] ?? File
  return (
    <div className={`file-icon ${category}`}>
      <Icon size={size} />
    </div>
  )
}

export function CategoryIcon({ category, size = 16 }: { category: Category; size?: number }) {
  const Icon = ICONS[category] ?? File
  return <Icon size={size} />
}
