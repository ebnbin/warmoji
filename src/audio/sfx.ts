// 程序化音效：迷你 sfxr 风格合成器。
// 首个用户手势解锁 AudioContext（浏览器自动播放策略），随即把参数表逐条
// 离线合成为 AudioBuffer（一次性，毫秒级）；战斗中播放只是 BufferSource 回放。
// 高频事件靠节流 + 随机音高抖动避免机关枪感，全局并发上限防爆音。

type Wave = 'square' | 'sawtooth' | 'triangle' | 'sine' | 'noise'

interface SfxDef {
  wave: Wave
  /** 起始频率 Hz（noise 时为低通滤波截止频率） */
  freq: number
  /** 结束频率（缺省 = 无滑移） */
  freqEnd?: number
  /** 时长（秒） */
  duration: number
  /** 峰值音量 0..1 */
  volume: number
  /** 起音时长（秒，线性淡入，默认 5ms 防爆点） */
  attack?: number
  /** 衰减曲线指数：1 线性，越大收尾越快（默认 1.6） */
  decayPow?: number
  /** 琶音：时长均分 N 段，各段频率乘以对应倍率 */
  steps?: readonly number[]
  /** 同种音效连播最小间隔 ms */
  throttleMs?: number
  /** 随机音高抖动（±比例） */
  jitter?: number
}

export const SFX = {
  /** 投掷/射击（子弹类能力出手） */
  shoot: { wave: 'square', freq: 900, freqEnd: 430, duration: 0.07, volume: 0.16, decayPow: 1.4, throttleMs: 45, jitter: 0.12 },
  /** 激光 */
  zap: { wave: 'sawtooth', freq: 1500, freqEnd: 280, duration: 0.12, volume: 0.15, throttleMs: 70, jitter: 0.08 },
  /** 突刺/横扫/回旋镖挥出 */
  whoosh: { wave: 'noise', freq: 1400, freqEnd: 240, duration: 0.12, volume: 0.3, throttleMs: 60, jitter: 0.15 },
  /** 轰炸爆炸 */
  boom: { wave: 'noise', freq: 420, freqEnd: 45, duration: 0.34, volume: 0.55, decayPow: 2, throttleMs: 90, jitter: 0.1 },
  /** 敌人受击 */
  hit: { wave: 'square', freq: 320, freqEnd: 160, duration: 0.045, volume: 0.12, throttleMs: 50, jitter: 0.2 },
  /** 敌人死亡（碎裂 pop） */
  kill: { wave: 'triangle', freq: 560, freqEnd: 70, duration: 0.16, volume: 0.3, throttleMs: 40, jitter: 0.15 },
  /** 金币拾取（双音 ding） */
  coin: { wave: 'square', freq: 988, duration: 0.09, volume: 0.14, steps: [1, 1.498], throttleMs: 35, jitter: 0.06 },
  /** 队员受伤 */
  hurt: { wave: 'square', freq: 200, freqEnd: 90, duration: 0.2, volume: 0.32, throttleMs: 150 },
  /** 队员复活（上行扫频） */
  revive: { wave: 'sine', freq: 280, freqEnd: 880, duration: 0.28, volume: 0.3, attack: 0.05 },
  /** 队伍升级（上行琶音） */
  levelup: { wave: 'square', freq: 523, duration: 0.34, volume: 0.22, steps: [1, 1.26, 1.5, 2], throttleMs: 200 },
  /** 波次完成小号角 */
  wave: { wave: 'square', freq: 392, duration: 0.5, volume: 0.24, steps: [1, 1.26, 1.5, 2, 1.5, 2] },
  /** 游戏结束（下行） */
  over: { wave: 'sawtooth', freq: 392, freqEnd: 80, duration: 0.7, volume: 0.26, decayPow: 1.2 },
  /** 购买道具 */
  buy: { wave: 'square', freq: 660, duration: 0.11, volume: 0.2, steps: [1, 1.33], throttleMs: 80 },
  /** 角色升级 */
  upgrade: { wave: 'square', freq: 523, duration: 0.16, volume: 0.2, steps: [1, 1.5], throttleMs: 80 },
  /** 招募入队 */
  recruit: { wave: 'square', freq: 440, duration: 0.24, volume: 0.22, steps: [1, 1.26, 1.6], throttleMs: 120 },
  /** 通用 UI 点击 */
  click: { wave: 'square', freq: 760, freqEnd: 660, duration: 0.035, volume: 0.12, throttleMs: 40 },
} as const satisfies Record<string, SfxDef>

export type SfxId = keyof typeof SFX

const SAMPLE_RATE = 22050
const MAX_VOICES = 14

let ctx: AudioContext | undefined
let master: GainNode | undefined
const buffers = new Map<SfxId, AudioBuffer>()
const lastPlayed = new Map<SfxId, number>()
let enabled = true
let active = 0
const stats = { baked: 0, played: 0 }

/** 手写采样合成：波形 + 频率滑移/琶音 + 起音-衰减包络；噪声走一阶低通（种子固定可复现） */
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

/** 惰性创建共享 AudioContext（音效与 BGM 共用一个）并尝试恢复；
 * 无 WebAudio 的环境返回 undefined 静默降级为无声 */
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

/** 已创建的共享上下文（不触发创建/恢复） */
export function audioCtx(): AudioContext | undefined {
  return ctx
}

/** 注册首个用户手势解锁；重复调用/无 WebAudio 环境均安全 */
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

export function sfxStats(): { baked: number; played: number } {
  return { ...stats }
}

export function playSfx(id: SfxId): void {
  if (!enabled || !ctx || !master) return
  if (ctx.state !== 'running') {
    // 后台挂起后由下一次交互/播放尝试恢复
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
