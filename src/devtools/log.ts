import Phaser from 'phaser'

export type DevLogLevel = 'info' | 'warn' | 'error'

export interface DevLogEntry {
  readonly at: number
  readonly level: DevLogLevel
  readonly text: string
}

export const LOG_CHANGED = 'changed'
export const logEvents = new Phaser.Events.EventEmitter()

const CAP = 200
const MAX_TEXT = 600
const entries: DevLogEntry[] = []
let unread = 0
let started = false
let captureInfo = false

function describe(v: unknown): string {
  if (v instanceof Error) return v.stack ?? `${v.name}: ${v.message}`
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null) {
    try {
      return JSON.stringify(v)
    } catch {
      return Object.prototype.toString.call(v)
    }
  }
  return String(v)
}

function push(level: DevLogLevel, text: string): void {
  entries.push({ at: Date.now(), level, text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text })
  if (entries.length > CAP) entries.shift()
  if (level === 'error') unread++
  logEvents.emit(LOG_CHANGED)
}

type ConsoleFn = (...args: unknown[]) => void

function wrap(level: DevLogLevel, orig: ConsoleFn): ConsoleFn {
  return (...args: unknown[]): void => {
    orig.apply(console, args)
    if (level === 'info' && !captureInfo) return
    push(level, args.map(describe).join(' '))
  }
}

export function infoCaptureOn(): boolean {
  return captureInfo
}

export function setInfoCapture(on: boolean): void {
  captureInfo = on
}

export function startLogCapture(): void {
  if (started) return
  started = true
  console.error = wrap('error', console.error as ConsoleFn)
  console.warn = wrap('warn', console.warn as ConsoleFn)
  console.log = wrap('info', console.log as ConsoleFn)
  console.info = wrap('info', console.info as ConsoleFn)
  window.addEventListener('error', (e) => {
    push('error', e.error instanceof Error ? describe(e.error) : `${e.message} (${e.filename}:${e.lineno})`)
  })
  window.addEventListener('unhandledrejection', (e) => {
    push('error', `未处理的 Promise 拒绝：${describe(e.reason)}`)
  })
}

export function devLogEntries(): readonly DevLogEntry[] {
  return entries
}

export function unreadErrorCount(): number {
  return unread
}

export function markLogRead(): void {
  if (unread === 0) return
  unread = 0
  logEvents.emit(LOG_CHANGED)
}

export function clearDevLog(): void {
  entries.length = 0
  unread = 0
  logEvents.emit(LOG_CHANGED)
}
