import { hasComponent, query } from 'bitecs'
import { Fx, Hp, Shard, Transform } from './components'
import { restoreSandbox, sandboxState, sandboxVersion } from './sandbox/knobs'
import type { SandboxState } from './sandbox/knobs'
import { numChoiceValues, pinNumChoices } from './systems/shared/devNumbers'
import type { Sim } from './sim'
import type { RunState } from '../run/state'
import type { Claim } from '../run/levelUp'

const TAPE_VERSION = 3

/** 每走这么多步记一次校验值 */
const CHECK_EVERY = 60

/** 开发面板对这一场下的指令 */
export type DevCommand =
  /** n 是放这张图的第几个头目 */
  | { readonly kind: 'spawn'; readonly what: 'one' | 'elite' | 'surge' | 'boss'; readonly n?: number }
  | { readonly kind: 'killAll' }
  /** 打倒一名队员：队长以外站着的先倒 */
  | { readonly kind: 'down' }
  | { readonly kind: 'grant'; readonly what: 'coins' | 'level' }
  | { readonly kind: 'endWave' }
  | { readonly kind: 'nextPhase' }
  | { readonly kind: 'resetSkill' }
  | { readonly kind: 'invincible'; readonly on: boolean }
  | { readonly kind: 'knobs' }

/** 改变战局的一条输入；t 是在第几步之前放进去 */
export type TapeEvent =
  | { readonly t: number; readonly k: 'move'; readonly x: number; readonly y: number; readonly raw: number }
  | { readonly t: number; readonly k: 'cast'; readonly dir: { readonly x: number; readonly y: number } | null; readonly hold: number }
  | { readonly t: number; readonly k: 'switch'; readonly slot: number }
  | { readonly t: number; readonly k: 'claim'; readonly claim: Claim }
  | { readonly t: number; readonly k: 'dev'; readonly cmd: DevCommand }
  | { readonly t: number; readonly k: 'settings'; readonly sandbox: SandboxState; readonly tuning: Readonly<Record<string, number>> }

/** 一场战斗的录像：进场前的这一局与开发旋钮、各步之前放进去的输入、每隔一段的校验值 */
export interface Tape {
  readonly v: typeof TAPE_VERSION
  readonly run: RunState
  readonly sandbox: SandboxState
  readonly tuning: Readonly<Record<string, number>>
  readonly events: TapeEvent[]
  /** 走完第几步时的校验值，按步排好 */
  readonly checks: [number, number][]
  /** 录到了第几步 */
  ticks: number
  /** 打完以后的校验值；没打完是 null */
  final: number | null
}

const f64 = new Float64Array(1)
const u32 = new Uint32Array(f64.buffer)

const mix = (h: number, v: number): number => {
  f64[0] = v
  return Math.imul(Math.imul(h ^ u32[0]!, 0x01000193) ^ u32[1]!, 0x01000193)
}

/** 战局的校验值：步数、世界时间、随机数、队长、战果，与每个玩法实体的坐标和生命；特效与碎片只给画面看，不算；与实体编号和遍历次序无关 */
export function stateHash(sim: Sim): number {
  let h = 0x811c9dc5
  for (const v of [sim.tick, sim.elapsedMs, sim.rng.snapshot(), sim.leader, sim.run.kills, sim.run.coins, sim.run.xp.level, sim.run.xp.xp]) h = mix(h, v)
  let sum = 0
  let n = 0
  for (const eid of query(sim.world, [Transform])) {
    if (hasComponent(sim.world, eid, Fx) || hasComponent(sim.world, eid, Shard)) continue
    let e = mix(mix(0x811c9dc5, Transform.x[eid]!), Transform.y[eid]!)
    if (hasComponent(sim.world, eid, Hp)) e = mix(e, Hp.v[eid]!)
    sum = (sum + e) >>> 0
    n++
  }
  return mix(mix(h, n), sum) >>> 0
}

const sameTuning = (a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean => {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}

/** 留几场录像：这一场与上一场 */
const KEPT_TAPES = 2

/** 最近几场的录像，新的在前；离开战斗以后还留着 */
const kept: Tape[] = []

export function keepTape(tape: Tape): void {
  kept.unshift(tape)
  kept.length = Math.min(kept.length, KEPT_TAPES)
}

export function keptTapes(): readonly Tape[] {
  return kept
}

/** 录一场：进场前记下这一局，之后每步之前记下变了的输入 */
export class TapeRecorder {
  readonly tape: Tape
  private moved: { x: number; y: number; raw: number } | null = null
  private sandboxAt = sandboxVersion()
  private tuning: Readonly<Record<string, number>>

  constructor(run: RunState) {
    this.tuning = numChoiceValues()
    this.tape = { v: TAPE_VERSION, run: structuredClone(run), sandbox: sandboxState(), tuning: this.tuning, events: [], checks: [], ticks: 0, final: null }
  }

  /** 开发旋钮从上次看过以后改过就记下改后的全部取值；放指令之前与每步之前都要先看一眼 */
  poll(t: number): void {
    const tuning = numChoiceValues()
    if (sandboxVersion() === this.sandboxAt && sameTuning(tuning, this.tuning)) return
    this.sandboxAt = sandboxVersion()
    this.tuning = tuning
    this.tape.events.push({ t, k: 'settings', sandbox: sandboxState(), tuning })
  }

  push(e: Exclude<TapeEvent, { k: 'move' | 'settings' }>): void {
    this.poll(e.t)
    this.tape.events.push(e)
  }

  move(t: number, x: number, y: number, raw: number): void {
    const m = this.moved
    if (m && m.x === x && m.y === y && m.raw === raw) return
    this.moved = { x, y, raw }
    this.tape.events.push({ t, k: 'move', x, y, raw })
  }

  /** 走完一步后调用 */
  check(sim: Sim): void {
    this.tape.ticks = sim.tick
    if (sim.tick % CHECK_EVERY === 0) this.tape.checks.push([sim.tick, stateHash(sim)])
  }

  /** 这一场打完、结算过以后调用 */
  finish(sim: Sim): void {
    this.tape.final ??= stateHash(sim)
  }
}

/** 照录像重打一场：开发旋钮摆回录下的取值，每步之前放进录下的输入，走完比对校验值 */
export class TapePlayer {
  private next = 0
  private nextCheck = 0
  private moved = { x: 0, y: 0, raw: 0 }
  /** 第一次对不上的那一步 */
  divergedAt: number | null = null
  /** 比对过几个校验值 */
  matched = 0
  over = false

  constructor(readonly tape: Tape) {
    restoreSandbox(tape.sandbox)
    pinNumChoices(tape.tuning)
  }

  /** 第 t 步之前要放的输入，按录下的次序；移动与旋钮由回放自己接管 */
  due(t: number): Exclude<TapeEvent, { k: 'move' | 'settings' }>[] {
    const out: Exclude<TapeEvent, { k: 'move' | 'settings' }>[] = []
    const events = this.tape.events
    while (this.next < events.length && events[this.next]!.t <= t) {
      const e = events[this.next++]!
      if (e.k === 'move') this.moved = { x: e.x, y: e.y, raw: e.raw }
      else if (e.k === 'settings') {
        restoreSandbox(e.sandbox)
        pinNumChoices(e.tuning)
      } else out.push(e)
    }
    return out
  }

  move(): { readonly x: number; readonly y: number; readonly raw: number } {
    return this.moved
  }

  /** 走完一步后调用；录像在这之前已经打完也算对不上 */
  check(sim: Sim): void {
    const checks = this.tape.checks
    while (this.nextCheck < checks.length && checks[this.nextCheck]![0] <= sim.tick) {
      const [t, hash] = checks[this.nextCheck++]!
      if (t !== sim.tick) continue
      if (hash === stateHash(sim)) this.matched++
      else this.diverge(t)
    }
    if (this.tape.final !== null && sim.tick > this.tape.ticks) this.diverge(this.tape.ticks)
  }

  /** 回放的这一场打完、结算过以后调用；录像没录到打完时，录到的那段里打完了也算对不上 */
  finish(sim: Sim): void {
    this.over = true
    const tape = this.tape
    if (tape.final === null) {
      if (sim.tick <= tape.ticks) this.diverge(sim.tick)
    } else if (sim.tick !== tape.ticks || tape.final !== stateHash(sim)) this.diverge(sim.tick)
    else this.matched++
  }

  /** 已经走过录像录到的地方：再往后没有可比的 */
  beyond(sim: Sim): boolean {
    return sim.tick > this.tape.ticks
  }

  /** 离开回放：开发旋钮还给开发面板 */
  stop(): void {
    pinNumChoices(null)
  }

  private diverge(t: number): void {
    this.divergedAt ??= t
  }
}

const NON_FINITE = '#num:'

/** 录像存成文字：生命满格等处的 Infinity 也能带上 */
export function encodeTape(tape: Tape): string {
  return JSON.stringify(tape, (_k, v: unknown) => (typeof v === 'number' && !Number.isFinite(v) ? `${NON_FINITE}${v}` : v))
}

export function decodeTape(text: string): Tape {
  const tape = JSON.parse(text, (_k, v: unknown) => (typeof v === 'string' && v.startsWith(NON_FINITE) ? Number(v.slice(NON_FINITE.length)) : v)) as Partial<Tape>
  if (tape.v !== TAPE_VERSION) throw new Error(`录像版本不对：${String(tape.v)}，这一版读 ${TAPE_VERSION}`)
  if (!tape.run || !tape.sandbox || !tape.tuning || !Array.isArray(tape.events) || !Array.isArray(tape.checks) || typeof tape.ticks !== 'number') throw new Error('录像缺了内容')
  return tape as Tape
}
