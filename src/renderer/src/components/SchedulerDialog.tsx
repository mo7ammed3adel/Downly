import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock } from 'lucide-react'
import type { SchedulerSettings } from '@shared/types'
import { useStore } from '../store'
import { Field, Modal, Toggle, closeDialog } from './ui'

export function SchedulerDialog() {
  const { t } = useTranslation()
  const saved = useStore((s) => s.settings.scheduler)
  const [s, setS] = useState<SchedulerSettings>(saved)
  const patch = (p: Partial<SchedulerSettings>) => setS((prev) => ({ ...prev, ...p }))
  const weekdays = t('scheduler.weekdays', { returnObjects: true }) as string[]

  const save = async () => {
    await window.api.updateSettings({ scheduler: s })
    closeDialog()
  }

  return (
    <Modal
      title={t('scheduler.title')}
      icon={<CalendarClock size={18} />}
      onClose={closeDialog}
      footer={
        <>
          <button className="btn" onClick={closeDialog}>
            {t('add.cancel')}
          </button>
          <button className="btn primary" onClick={save}>
            {t('settings.save')}
          </button>
        </>
      }
    >
      <>
        <Toggle label={t('scheduler.enabled')} checked={s.enabled} onChange={(v) => patch({ enabled: v })} />
        <div className="grid-2" style={{ marginTop: 10 }}>
          <Field label={t('scheduler.start')}>
            <input className="input" type="time" value={s.startTime} onChange={(e) => patch({ startTime: e.target.value })} />
          </Field>
          <Field label={t('scheduler.stop')} hint={!s.stopTime ? t('scheduler.none') : undefined}>
            <input className="input" type="time" value={s.stopTime} onChange={(e) => patch({ stopTime: e.target.value })} />
          </Field>
        </div>
        <Field label={t('scheduler.days')}>
          <div className="days">
            {weekdays.map((d, i) => (
              <button
                key={i}
                type="button"
                className={s.days.includes(i) ? 'on' : ''}
                onClick={() => patch({ days: s.days.includes(i) ? s.days.filter((x) => x !== i) : [...s.days, i] })}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('scheduler.afterDone')}>
          <select className="select" value={s.afterDone} onChange={(e) => patch({ afterDone: e.target.value as SchedulerSettings['afterDone'] })}>
            <option value="none">{t('scheduler.afterNone')}</option>
            <option value="exit">{t('scheduler.afterExit')}</option>
            <option value="sleep">{t('scheduler.afterSleep')}</option>
            <option value="shutdown">{t('scheduler.afterShutdown')}</option>
          </select>
        </Field>
      </>
    </Modal>
  )
}
