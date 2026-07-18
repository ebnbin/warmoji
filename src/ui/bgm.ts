import { bgmScore } from '../core/music'
import type { BgmHit, BgmId, BgmNote, BgmScore } from '../core/music'
import { audioCtx, ensureAudio } from './sfx'

// BGM 播放器：前瞻调度器逐段排入 core/music.ts 的乐谱事件，整曲无缝循环。
// 与音效共用一个 AudioContext（首个手势解锁），BGM 走独立主增益压在音效之下；
// 切曲/开关走增益淡入淡出。音符/打击乐渲染按 (ctx, out) 参数化——离线渲染
// （renderBgmOffline，探针用）与实时播放走同一条合成路径。

const LOOKAHEAD_SEC = 0.4
const TICK_MS = 100
const MASTER_VOL = 0.42
const FADE_SEC = 0.6

let bgmMaster: GainNode | undefined
let trackGain: GainNode | undefined
let echoSend: GainNode | undefined
let desired: BgmId | null = null
let playing: BgmId | null = null
let enabled = true
/** 当前曲第 0 圈起点（ctx 时钟） */
let anchor = 0
/** 已调度到的播放秒（相对 anchor） */
let cursor = 0
let timer: number | undefined

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx)
  if (!buf) {
    buf = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.25), ctx.sampleRate)
    const data = buf.getChannelData(0)
    let seed = 987654321
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      data[i] = seed / 0x3fffffff - 1
    }
    noiseCache.set(ctx, buf)
  }
  return buf
}

function scheduleNote(
  ctx: BaseAudioContext,
  out: AudioNode,
  echo: AudioNode | undefined,
  n: BgmNote,
  when: number,
): void {
  const osc = ctx.createOscillator()
  osc.type = n.wave
  osc.frequency.value = n.freq
  const g = ctx.createGain()
  const end = when + n.dur
  g.gain.setValueAtTime(0.0001, when)
  g.gain.linearRampToValueAtTime(n.vol, when + n.attack)
  const relStart = Math.max(when + n.attack, end - n.release)
  g.gain.setValueAtTime(n.vol, relStart)
  g.gain.linearRampToValueAtTime(0.0001, end)
  osc.connect(g)
  g.connect(out)
  if (n.echo && echo) g.connect(echo)
  osc.onended = (): void => {
    osc.disconnect()
    g.disconnect()
  }
  osc.start(when)
  osc.stop(end + 0.02)
}

function scheduleHit(ctx: BaseAudioContext, out: AudioNode, h: BgmHit, when: number): void {
  if (h.kind === 'kick' || h.kind === 'tom') {
    // 正弦扫频鼓身
    const [f0, f1, dur] = h.kind === 'kick' ? [150, 42, 0.13] : [190, 82, 0.14]
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(f0, when)
    osc.frequency.exponentialRampToValueAtTime(f1, when + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(h.vol, when)
    g.gain.exponentialRampToValueAtTime(0.001, when + dur)
    osc.connect(g)
    g.connect(out)
    osc.onended = (): void => {
      osc.disconnect()
      g.disconnect()
    }
    osc.start(when)
    osc.stop(when + dur + 0.02)
    return
  }
  // 噪声打击：军鼓带通、踩镲高通
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx)
  const filter = ctx.createBiquadFilter()
  if (h.kind === 'snare') {
    filter.type = 'bandpass'
    filter.frequency.value = 1800
    filter.Q.value = 0.9
  } else {
    filter.type = 'highpass'
    filter.frequency.value = 6500
  }
  const dur = h.kind === 'snare' ? 0.09 : 0.035
  const g = ctx.createGain()
  g.gain.setValueAtTime(h.vol, when)
  g.gain.exponentialRampToValueAtTime(0.001, when + dur)
  src.connect(filter)
  filter.connect(g)
  g.connect(out)
  src.onended = (): void => {
    src.disconnect()
    filter.disconnect()
    g.disconnect()
  }
  src.start(when)
  src.stop(when + dur + 0.02)
}

/** 建回声链（送出增益 → 延迟 → 反馈环 → 湿声并入 out），返回送出节点 */
function buildEcho(ctx: BaseAudioContext, out: AudioNode, spec: NonNullable<BgmScore['echo']>): GainNode {
  const send = ctx.createGain()
  send.gain.value = spec.level
  const delay = ctx.createDelay(2)
  delay.delayTime.value = spec.delaySec
  const feedback = ctx.createGain()
  feedback.gain.value = spec.feedback
  send.connect(delay)
  delay.connect(feedback)
  feedback.connect(delay)
  delay.connect(out)
  return send
}

/** 把 [fromSec, toSec) 播放窗内的乐谱事件（跨圈展开）排入目标节点 */
function scheduleWindow(
  ctx: BaseAudioContext,
  out: AudioNode,
  echo: AudioNode | undefined,
  score: BgmScore,
  fromSec: number,
  toSec: number,
  baseTime: number,
): void {
  const L = score.loopSec
  for (let k = Math.floor(fromSec / L); k * L < toSec; k++) {
    const base = k * L
    for (const n of score.notes) {
      const at = base + n.t
      if (at >= fromSec && at < toSec) scheduleNote(ctx, out, echo, n, baseTime + at)
    }
    for (const h of score.hits) {
      const at = base + h.t
      if (at >= fromSec && at < toSec) scheduleHit(ctx, out, h, baseTime + at)
    }
  }
}

function tick(): void {
  const ctx = audioCtx()
  if (!ctx || !playing || !trackGain || ctx.state !== 'running') return
  const score = bgmScore(playing)
  const now = ctx.currentTime - anchor
  // 后台节流醒来：跳过错过的段落，按当前圈位置继续（不追播积压音符）
  if (now > cursor + 1) cursor = Math.max(0, now)
  const until = now + LOOKAHEAD_SEC
  if (until <= cursor) return
  scheduleWindow(ctx, trackGain, echoSend, score, cursor, until, anchor)
  cursor = until
}

/** 淡出并弃用当前曲的增益链（音符自然衰减，节点稍后随 GC 断开） */
function fadeOutCurrent(ctx: AudioContext): void {
  if (!trackGain) return
  const g = trackGain
  g.gain.setValueAtTime(g.gain.value, ctx.currentTime)
  g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + FADE_SEC)
  window.setTimeout(() => g.disconnect(), (FADE_SEC + 0.1) * 1000)
  trackGain = undefined
  echoSend = undefined
  playing = null
}

function startTrack(ctx: AudioContext, id: BgmId): void {
  if (!bgmMaster) {
    bgmMaster = ctx.createGain()
    bgmMaster.gain.value = MASTER_VOL
    bgmMaster.connect(ctx.destination)
  }
  fadeOutCurrent(ctx)
  const score = bgmScore(id)
  trackGain = ctx.createGain()
  trackGain.gain.setValueAtTime(0.0001, ctx.currentTime)
  trackGain.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_SEC)
  trackGain.connect(bgmMaster)
  echoSend = score.echo ? buildEcho(ctx, trackGain, score.echo) : undefined
  playing = id
  anchor = ctx.currentTime + 0.08
  cursor = 0
  if (timer === undefined) timer = window.setInterval(tick, TICK_MS)
}

function startIfWanted(): void {
  const ctx = audioCtx()
  if (!ctx || !enabled || !desired || playing === desired) return
  startTrack(ctx, desired)
}

/** 注册手势解锁：首个交互后若有待播曲即起播 */
export function initBgm(): void {
  const unlock = (): void => {
    ensureAudio()
    startIfWanted()
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
}

/** 声明想播的曲子（幂等）；上下文未解锁/开关关闭时仅记录，条件齐后起播 */
export function playBgm(id: BgmId): void {
  desired = id
  if (playing === id) return
  startIfWanted()
}

export function setBgmEnabled(on: boolean): void {
  enabled = on
  const ctx = audioCtx()
  if (!on) {
    if (ctx) fadeOutCurrent(ctx)
    if (timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
    return
  }
  startIfWanted()
}

/** 调试快照 */
export function bgmState(): { desired: BgmId | null; playing: BgmId | null; enabled: boolean } {
  return { desired, playing, enabled }
}

/** 离线渲染一段曲子并统计响度（探针用：验证真的出声且各曲不同） */
export async function renderBgmOffline(
  id: BgmId,
  seconds = 4,
): Promise<{ rms: number; peak: number; notes: number }> {
  const score = bgmScore(id)
  const rate = 22050
  const ctx = new OfflineAudioContext(1, Math.ceil(rate * seconds), rate)
  const out = ctx.createGain()
  out.gain.value = MASTER_VOL
  out.connect(ctx.destination)
  const echo = score.echo ? buildEcho(ctx, out, score.echo) : undefined
  scheduleWindow(ctx, out, echo, score, 0, seconds, 0)
  const buf = await ctx.startRendering()
  const data = buf.getChannelData(0)
  let sum = 0
  let peak = 0
  for (const s of data) {
    sum += s * s
    peak = Math.max(peak, Math.abs(s))
  }
  return { rms: Math.sqrt(sum / data.length), peak, notes: score.notes.length }
}
