import type { TaleConfig } from '../../types/maps'
import type { TalePlan } from './layout'

/** 一块地面此刻的状态：空白的纸、铅笔稿、正在描成墨稿、墨稿、正在被擦 */
export const BLANK = 0
export const SKETCH = 1
export const INK = 2
export const SOLID = 3
export const FADE = 4

/** 最近描完的几块算新墨：怪物在它们上面聚出来 */
const FRESH = 3
/** 刚描完的这么几块不擦 */
const SPARE = 2

/**
 * 看不见的作者，与每块地面此刻的状态：phase 是状态，at 是进这个状态的时刻（毫秒），描成墨稿的那块描线 line、上色 fill 各用多久，
 * season 是画成哪一季，scrub 是橡皮来回擦的方向（弧度）。open 是开局那一片描到第几块、下一块几时描；draw、erase 是下一次画、擦的时刻；
 * next 是已经起好铅笔稿、下一次要描的那块；dir 是作者往对角走（1）还是走回来（−1）；draws 是开局之后描了几块；inked 是描完的块，最近的在前；
 * walk 是此刻能站的块，version 在它变了时加一
 */
export interface Author {
  readonly phase: Uint8Array
  readonly at: Float64Array
  readonly line: Float32Array
  readonly fill: Float32Array
  readonly season: Uint8Array
  readonly scrub: Float32Array
  readonly walk: Uint8Array
  open: number
  openAt: number
  draw: number
  erase: number
  next: number
  dir: number
  draws: number
  readonly inked: number[]
  version: number
}

/** 一块此刻画成什么样：铅笔稿起到几成、墨线描到几成、色块填到几成、褪到几成，都在 0 到 1 */
export interface Look {
  pencil: number
  line: number
  fill: number
  fade: number
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** 开局：头一块已经是墨稿，开局那一片的别的块都是起好的铅笔稿 */
export function newAuthor(plan: TalePlan, cfg: TaleConfig): Author {
  const n = plan.patches.length
  const a: Author = {
    phase: new Uint8Array(n),
    at: new Float64Array(n).fill(-1e9),
    line: new Float32Array(n),
    fill: new Float32Array(n),
    season: new Uint8Array(n),
    scrub: new Float32Array(n),
    walk: new Uint8Array(n),
    open: 1,
    openAt: cfg.author.openMs,
    draw: Infinity,
    erase: Infinity,
    next: -1,
    dir: 1,
    draws: 0,
    inked: [plan.first],
    version: 0,
  }
  for (const i of plan.opening) a.phase[i] = SKETCH
  a.phase[plan.first] = SOLID
  a.walk[plan.first] = 1
  return a
}

/** 开局那一片之外，每一季描几块：作者走到对角时正好走完夏、秋、冬三季 */
export function perSeason(plan: TalePlan): number {
  return Math.max(1, Math.round((plan.patches.length - plan.opening.length) / 3))
}

/** 往作者走的方向数，第几个画到：走回来时倒着数 */
function order(plan: TalePlan, a: Author, i: number): number {
  const r = plan.patches[i]!.rank
  return a.dir > 0 ? r : plan.patches.length - 1 - r
}

/** 这几块彼此连成一片 */
function connected(plan: TalePlan, set: ReadonlySet<number>): boolean {
  if (set.size <= 1) return true
  const start = set.values().next().value!
  const seen = new Set<number>([start])
  const stack = [start]
  while (stack.length > 0) {
    const i = stack.pop()!
    for (const j of plan.patches[i]!.near) {
      if (!set.has(j) || seen.has(j)) continue
      seen.add(j)
      stack.push(j)
    }
  }
  return seen.size === set.size
}

/** 擦完以后还会在的块：墨稿、正在描的与起好铅笔稿的，正在擦的不算 */
function staying(a: Author): Set<number> {
  const s = new Set<number>()
  a.phase.forEach((p, i) => {
    if (p === SOLID || p === INK || p === SKETCH) s.add(i)
  })
  return s
}

/** 此刻是地面、或正在描成地面的块数 */
function live(a: Author): number {
  let n = 0
  for (const p of a.phase) if (p === SOLID || p === INK) n++
  return n
}

/**
 * 下一块铅笔稿起在哪：挨着地面的空白块里，往作者走的方向数、排在地面最后面那块之后的最前一块；前面没有了就掉头往回走
 */
function pickNext(plan: TalePlan, a: Author): number {
  for (let turn = 0; turn < 2; turn++) {
    let back = Infinity
    a.phase.forEach((p, i) => {
      if (p === SOLID || p === INK) back = Math.min(back, order(plan, a, i))
    })
    let best = -1
    a.phase.forEach((p, i) => {
      if (p !== BLANK) return
      if (!plan.patches[i]!.near.some((j) => a.phase[j] === SOLID || a.phase[j] === INK)) return
      const o = order(plan, a, i)
      if (o > back && (best < 0 || o < order(plan, a, best))) best = i
    })
    if (best >= 0) return best
    a.dir = -a.dir
  }
  return -1
}

/** 擦哪一块：刚描完的几块以外的墨稿里，往作者走的方向数最靠后、擦掉以后剩下的还连成一片的那块 */
function pickErase(plan: TalePlan, a: Author): number {
  const keep = staying(a)
  const fresh = a.inked.slice(0, SPARE)
  const cands: number[] = []
  a.phase.forEach((p, i) => {
    if (p === SOLID && !fresh.includes(i)) cands.push(i)
  })
  cands.sort((x, y) => order(plan, a, x) - order(plan, a, y))
  for (const i of cands) {
    keep.delete(i)
    if (keep.size >= 2 && connected(plan, keep)) return i
    keep.add(i)
  }
  return -1
}

function begin(a: Author, i: number, phase: number, now: number): void {
  a.phase[i] = phase
  a.at[i] = now
}

/** 开始把一块描成墨稿 */
function ink(a: Author, i: number, now: number, lineMs: number, fillMs: number, season: number): void {
  begin(a, i, INK, now)
  a.line[i] = lineMs
  a.fill[i] = fillMs
  a.season[i] = season
}

/**
 * 作者推进到 now：描完的成了地面，下一块的铅笔稿接着起；褪尽的回到空白；开局按先后描完那一片；之后到点轮流画一块、擦一块，
 * 地面比开局那一片多就先不画，少了就先不擦。rand 给出 [0, 1) 的随机数：间隔的抖动与橡皮的方向
 */
export function stepAuthor(a: Author, plan: TalePlan, cfg: TaleConfig, now: number, rand: () => number): void {
  const c = cfg.author
  const target = plan.opening.length
  for (let i = 0; i < a.phase.length; i++) {
    const p = a.phase[i]!
    if (p === INK && now >= a.at[i]! + a.line[i]! + a.fill[i]!) {
      begin(a, i, SOLID, a.at[i]! + a.line[i]! + a.fill[i]!)
      a.walk[i] = 1
      a.version++
      a.inked.unshift(i)
      if (a.inked.length > FRESH) a.inked.length = FRESH
      if (a.open >= plan.opening.length && a.next < 0) {
        a.next = pickNext(plan, a)
        if (a.next >= 0) begin(a, a.next, SKETCH, now)
      }
    } else if (p === FADE && now >= a.at[i]! + c.warnMs + c.fadeMs) {
      begin(a, i, BLANK, now)
      a.walk[i] = 0
      a.version++
    }
  }
  while (a.open < plan.opening.length && now >= a.openAt) {
    ink(a, plan.opening[a.open]!, a.openAt, c.openLineMs, c.openFillMs, 0)
    a.open++
    a.openAt += c.openMs
    if (a.open < plan.opening.length) continue
    const done = a.openAt - c.openMs + c.openLineMs + c.openFillMs
    a.draw = done + c.everyMs
    a.erase = done + c.firstEraseMs
  }
  const jitter = (): number => (rand() * 2 - 1) * c.jitterMs
  if (now >= a.draw) {
    a.draw = now + c.everyMs + jitter()
    if (a.next < 0 && !a.phase.some((p) => p === INK)) {
      a.next = pickNext(plan, a)
      if (a.next >= 0) begin(a, a.next, SKETCH, now)
    } else if (a.next >= 0 && now >= a.at[a.next]! + c.sketchMs && live(a) <= target) {
      ink(a, a.next, now, c.lineMs, c.fillMs, (1 + Math.floor(a.draws / perSeason(plan))) % 4)
      a.draws++
      a.next = -1
    }
  }
  if (now >= a.erase) {
    a.erase = now + c.everyMs + jitter()
    if (live(a) >= target) {
      const i = pickErase(plan, a)
      if (i >= 0) {
        begin(a, i, FADE, now)
        a.scrub[i] = rand() * Math.PI
      }
    }
  }
}

/** 这一块此刻画成什么样 */
export function lookOf(a: Author, cfg: TaleConfig, i: number, now: number, out: Look): Look {
  const t = now - a.at[i]!
  out.pencil = 0
  out.line = 0
  out.fill = 0
  out.fade = 0
  switch (a.phase[i]) {
    case SKETCH:
      out.pencil = clamp01(t / cfg.author.sketchMs)
      break
    case INK:
      out.line = clamp01(t / a.line[i]!)
      out.fill = clamp01((t - a.line[i]!) / a.fill[i]!)
      out.pencil = 1 - out.fill
      break
    case SOLID:
      out.line = 1
      out.fill = 1
      break
    case FADE:
      out.line = 1
      out.fill = 1
      out.fade = clamp01((t - cfg.author.warnMs) / cfg.author.fadeMs)
      break
  }
  return out
}

/** 最近描完、怪物在上面聚出来的几块，最近的在前 */
export function freshPatches(a: Author): readonly number[] {
  return a.inked
}
