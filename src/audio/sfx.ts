import { SFX } from '../data/sfx'
import type { SfxDef, SfxId } from '../types/sfx'
export type { Wave, SfxDef, SfxId } from '../types/sfx'
export { SFX } from '../data/sfx'

const SAMPLE_RATE = 22050
const MAX_VOICES = 14

let ctx: AudioContext | undefined
let master: GainNode | undefined
const buffers = new Map<SfxId, AudioBuffer>()
const lastPlayed = new Map<SfxId, number>()
let enabled = true
let active = 0
const stats = { baked: 0, played: 0 }

/** 噪声种子固定，可复现 */
function render(audio: AudioContext, def: SfxDef): AudioBuffer {
  const n = Math.max(1, Math.round(def.duration * SAMPLE_RATE))
  const buf = audio.createBuffer(1, n, SAMPLE_RATE)
  const data = buf.getChannelData(0)
  const attack = Math.max(1, (def.attack ?? 0.005) * SAMPLE_RATE)
  const decayPow = def.decayPow ?? 1.6
  let phase = 0
  let seed = 1234567
  let lp = 0
  for (let i = 0; i < n; i++) {
    const t = i / n
    let f = def.freq + (def.freqEnd !== undefined ? (def.freqEnd - def.freq) * t : 0)
    if (def.steps) {
      f *= def.steps[Math.min(def.steps.length - 1, Math.floor(t * def.steps.length))]!
    }
    phase += f / SAMPLE_RATE
    let s: number
    switch (def.wave) {
      case 'square':
        s = phase % 1 < 0.5 ? 1 : -1
        break
      case 'sawtooth':
        s = 2 * (phase % 1) - 1
        break
      case 'triangle': {
        const p = phase % 1
        s = p < 0.5 ? 4 * p - 1 : 3 - 4 * p
        break
      }
      case 'sine':
        s = Math.sin(phase * Math.PI * 2)
        break
      case 'noise': {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        const white = seed / 0x3fffffff - 1
        const alpha = Math.min(1, f / (f + SAMPLE_RATE / (2 * Math.PI)))
        lp += alpha * (white - lp)
        s = lp * 2.5
        break
      }
    }
    const env = i < attack ? i / attack : Math.pow(1 - (i - attack) / Math.max(1, n - attack), decayPow)
    data[i] = Math.max(-1, Math.min(1, s * env * def.volume))
  }
  return buf
}

/** 音效与 BGM 共用；无 WebAudio 时返回 undefined */
export function ensureAudio(): AudioContext | undefined {
  try {
    if (!ctx) {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = 0.5
      master.connect(ctx.destination)
      for (const [id, def] of Object.entries(SFX) as [SfxId, SfxDef][]) {
        buffers.set(id, render(ctx, def))
        stats.baked++
      }
    }
    void ctx.resume()
    return ctx
  } catch {
    return undefined
  }
}

/** 不触发创建 */
export function audioCtx(): AudioContext | undefined {
  return ctx
}

/** 幂等 */
export function initSfx(): void {
  const unlock = (): void => {
    ensureAudio()
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
}

export function setSfxEnabled(on: boolean): void {
  enabled = on
}

export function playSfx(id: SfxId): void {
  if (!enabled || !ctx || !master) return
  if (ctx.state !== 'running') {
    void ctx.resume()
    return
  }
  const def: SfxDef = SFX[id]
  const now = performance.now()
  if (now - (lastPlayed.get(id) ?? -Infinity) < (def.throttleMs ?? 0)) return
  if (active >= MAX_VOICES) return
  const buffer = buffers.get(id)
  if (!buffer) return
  lastPlayed.set(id, now)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  if (def.jitter) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * def.jitter
  src.connect(master)
  active++
  src.onended = (): void => {
    active--
    src.disconnect()
  }
  src.start()
  stats.played++
}
