import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_SETTINGS, type UserSettings } from '@shared/types'

const HEX = /^#[0-9a-fA-F]{6}$/

/** Merges untrusted JSON onto the defaults, keeping only valid values. */
export function sanitizeSettings(raw: unknown): UserSettings {
  const out: UserSettings = { ...DEFAULT_SETTINGS }
  if (!raw || typeof raw !== 'object') return out
  const r = raw as Record<string, unknown>
  if (r.cardType === 'ntag215' || r.cardType === 'mifare1k') out.cardType = r.cardType
  if (typeof r.autoOpen === 'boolean') out.autoOpen = r.autoOpen
  if (typeof r.linkRatio === 'boolean') out.linkRatio = r.linkRatio
  for (const k of ['frontColor', 'backColor', 'qrColor'] as const) {
    if (typeof r[k] === 'string' && HEX.test(r[k] as string)) out[k] = r[k] as string
  }
  if (typeof r.qrSize === 'number' && Number.isFinite(r.qrSize)) {
    out.qrSize = Math.min(250, Math.max(50, Math.round(r.qrSize)))
  }
  return out
}

export class SettingsStore {
  private current: UserSettings

  constructor(private readonly filePath: string) {
    this.current = this.read()
  }

  get(): UserSettings {
    return this.current
  }

  update(patch: unknown): UserSettings {
    this.current = sanitizeSettings({ ...this.current, ...(patch as object) })
    this.write()
    return this.current
  }

  private read(): UserSettings {
    try {
      return sanitizeSettings(JSON.parse(readFileSync(this.filePath, 'utf8')))
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  private write(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, JSON.stringify(this.current, null, 2))
      renameSync(tmp, this.filePath)
    } catch {
      /* a read-only profile folder shouldn't crash the app */
    }
  }
}
