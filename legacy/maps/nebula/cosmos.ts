import { Rng } from '../../util/rng'
import { REMNANT_CRAB, REMNANT_KNOTS, REMNANT_PLANETARY, REMNANT_SHELL, REMNANT_SPAN } from './remnants'
import { hue, planck, scattered } from './spectrum'
import type { Rgb } from './spectrum'

/** 着色器给天象留的槽 */
export const COSMOS_SLOTS = 6
/** 超新星的光变：按 SN_RISE_S 亮起来、按 SN_FALL_S 暗下去，秒；色温从 SN_COOL_K + SN_HOT_K 按 SN_COOL_S 冷却到 SN_COOL_K */
export const SN_RISE_S = 0.35
export const SN_FALL_S = 3
export const SN_HOT_K = 14000
export const SN_COOL_K = 5000
export const SN_COOL_S = 2.2

/** 每隔多久在星云里冒出一处新的天象，秒 */
const EVERY_S: readonly [number, number] = [10, 16]
/** 槽都占着时过多久再看一次，秒 */
const RETRY_S = 3
/** 开局后第一处新天象什么时候冒出来，秒 */
const FIRST_S = 6
/** 开局时已经在演的天象各演了多久，秒 */
const PRELUDE_S: readonly number[] = [30, 17, 5]
/** 同时在演的天象彼此至少隔这么远，格 */
const APART_U = 7.5
/** 天象落在内壁上，离球心的水平距离最多占内壁半径的这么多 */
const SPREAD = 0.86
/** 恒星嵌在内壁里面这么深，格 */
const EMBED_U = 0.35

/** 恒星从裹着它的云里露出来要多久，秒 */
const EMERGE_S = 5
/** 电离前沿按 R = R_s·(1 − e^(−t/τ))^(1/3) 推出去的时标，秒 */
const FRONT_S = 7
/** 电离源灭了以后氢复合的时标与二次电离的氧复合的时标，秒 */
const RECOMB_S = 5
const OIII_RECOMB_S = 2
/** 主星没炸成超新星、直接塌缩成黑洞的电离氢区暗到看不见要多久，秒 */
const FADE_S = 16
/** 主星死后星团里剩下的星暗下去的时标，秒 */
const CLUSTER_FADE_S = 9
/** 超新星遗迹按 R ∝ t^0.4（谢多夫–泰勒）长大，演这么久，秒 */
const REMNANT_S = 40
/** 反射星云：星团亮起来与暗下去各用多久，秒 */
const CLUSTER_IN_S = 6
const CLUSTER_OUT_S = 9
/** 行星状星云：抛壳前红巨星亮多久、抛出的壳演多久、壳以匀速长到最大用多久，秒 */
const AGB_S = 8
const PLANETARY_S = 38
const PLANETARY_GROW_S = 30

/** 电离氢区的 O 型主星、反射星云的 B 型星团、红超巨星、渐近巨星支的红巨星、行星状星云中心的白矮星的色温，开尔文 */
const O_K = 38000
const B_K = 16000
const GIANT_K = 3300
const AGB_K = 3100
const WD_K = 100000
/** 星点有多亮 */
const O_POWER = 1.6
const B_POWER = 1
const GIANT_POWER = 1.5
const AGB_POWER = 0.9
const WD_POWER = 0.7
/** 星团里的几颗星散开多远，格 */
const O_SPREAD = 0.5
const B_SPREAD = 1.1
/** 星光被尘埃散射出来有多亮 */
const O_SCATTER = 1.5
const B_SCATTER = 4.5
const GIANT_SCATTER = 2.8
const AGB_SCATTER = 1.2
/** 电离区的发光与电离前沿那一圈亮边有多亮 */
const HII_GAIN = 0.8
const HII_FRONT = 0.7
/** B 型星团只电离得了身边小小一团 */
const B_ION_U = 1.3
const B_ION = 0.25
/** 红超巨星半规则地脉动：亮度上下这么多 */
const GIANT_PULSE = 0.18
/** 超新星照到旁边的单位与星尘上有多亮 */
const SN_POWER = 60
/** 星点连同星团与超新星的晕画多远、超新星的光回波照多远与照多久：格、秒；光回波按 e^(−(d/(ECHO_U/3))²) 在 ECHO_U 以内淡到看不见 */
const STAR_REACH_U = 3
export const ECHO_U = 14
const ECHO_S = 12
/** 黑洞吸积的起伏：光度按 e^(±LUM_SWING) 慢慢涨落，谱在软硬之间来回；各由几个周期（秒）随机的正弦叠成 */
const LUM_SWING = 0.4
const LUM_PERIODS_S: readonly (readonly [number, number])[] = [
  [23, 37],
  [41, 67],
  [71, 113],
]
const HARD_PERIODS_S: readonly (readonly [number, number])[] = [
  [31, 53],
  [59, 97],
]
/**
 * 吸积盘外缘翘曲，把黑洞的硬光挡得只从一对锥口照出去；黑洞自旋拖着盘进动（伦泽–蒂林），朝下那只锥慢慢扫过星云的内壁。
 * 锥轴偏离竖直 CONE_TILT_DEG 度，半张角 CONE_HALF_DEG 度，进动一圈的秒数在 PRECESS_S 里随机
 */
const CONE_TILT_DEG = 28
const CONE_HALF_DEG = 27
const PRECESS_S: readonly [number, number] = [70, 95]

/**
 * 天象的种类：电离氢区（O 型星团点亮、把周围的气体电离，最后炸成超新星或直接塌缩成黑洞）、反射星云（B 型星团的蓝光被尘埃散射）、
 * 红超巨星（照得尘埃发金黄，最后炸成超新星）、行星状星云（红巨星抛出外壳，中心留下白矮星）
 */
type Kind = 'hii' | 'cluster' | 'giant' | 'planetary'

const WEIGHTS: Readonly<Record<Kind, number>> = { hii: 0.3, cluster: 0.24, giant: 0.22, planetary: 0.24 }

interface Phenomenon {
  readonly kind: Kind
  readonly start: number
  /** 在内壁上的位置，格，以球心为原点、z 朝上 */
  readonly x: number
  readonly y: number
  readonly z: number
  readonly seed: number
  /** 电离区、反射区或行星状星云最大长到多大，格 */
  readonly reachU: number
  /** 恒星本身亮多久，秒 */
  readonly life: number
  /** 主星死时炸成超新星，否则直接塌缩成黑洞，悄无声息地暗下去 */
  readonly supernova: boolean
  readonly tile: number
  readonly remnantU: number
  readonly angle: number
  readonly aspect: number
  /** 红超巨星脉动的周期，秒 */
  readonly period: number
  /** O 型星的硬紫外能把多大一块里的氧电离两次，占电离区半径的比例 */
  readonly hard: number
}

/** 交给着色器的天象：每个槽各一个 vec4，按槽拼成数组 */
export interface CosmosUniforms {
  /** 位置（格，以球心为原点、z 朝上）、它的光与遗迹够得着多远（格，0 是这个槽空着） */
  readonly at: Float32Array
  /** 星点的颜色乘亮度、星团散开多远（格，0 是一颗星） */
  readonly star: Float32Array
  /** 电离区半径、二次电离的氧那一块的半径（格）、电离区的亮度、电离前沿的亮度 */
  readonly ion: Float32Array
  /** 尘埃散射出来的星光：颜色乘亮度、照得到多远（格） */
  readonly scatter: Float32Array
  /** 遗迹的半径（格）、图集里第几块、亮度、转角 */
  readonly remnant: Float32Array
  /** 超新星爆发的时刻（秒）、炸没炸、种子、遗迹的扁度 */
  readonly flash: Float32Array
}

/** 天象照向四周的光：位置（格，以球心为原点、z 朝上）、颜色与亮度；flash 是超新星的闪光 */
export interface CosmicLight {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly color: Rgb
  readonly power: number
  readonly flash: boolean
}

/** 一个槽此刻的样子 */
interface Look {
  r: number
  g: number
  b: number
  spread: number
  ionU: number
  highU: number
  ion: number
  front: number
  sr: number
  sg: number
  sb: number
  reachU: number
  remnantU: number
  tile: number
  remnant: number
  flashAt: number
  flash: number
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth01 = (t: number): number => {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}
const between = (e0: number, e1: number, t: number): number => smooth01((t - e0) / (e1 - e0))

/** 几个周期与相位随机的正弦叠起来，落在 [−1, 1]：缓慢、不重复的起伏 */
class Swing {
  private readonly waves: { w: number; phase: number }[]

  constructor(rng: Rng, periods: readonly (readonly [number, number])[]) {
    this.waves = periods.map(([lo, hi]) => ({ w: (Math.PI * 2) / (lo + rng.next() * (hi - lo)), phase: rng.next() * Math.PI * 2 }))
  }

  at(t: number): number {
    let s = 0
    for (const v of this.waves) s += Math.sin(v.w * t + v.phase)
    return s / this.waves.length
  }
}

/** 超新星的光变，峰值约 0.8：t 是爆发后多少秒 */
export function supernovaShape(t: number): number {
  return t <= 0 ? 0 : (1 - Math.exp(-t / SN_RISE_S)) * Math.exp(-t / SN_FALL_S)
}

const O_LIGHT = hue(planck(O_K))
const B_LIGHT = hue(planck(B_K))
const GIANT_LIGHT = hue(planck(GIANT_K))
const AGB_LIGHT = hue(planck(AGB_K))
const WD_LIGHT = hue(planck(WD_K))

/** 天象演完要多久，秒 */
function lasts(p: Phenomenon): number {
  switch (p.kind) {
    case 'hii':
      return p.life + (p.supernova ? REMNANT_S : FADE_S)
    case 'cluster':
      return p.life
    case 'giant':
      return p.life + REMNANT_S
    case 'planetary':
      return AGB_S + PLANETARY_S
  }
}

/**
 * 星云里此起彼伏的天象：每隔一阵在内壁上某处冒出一处，按布景种子随机挑种类、位置与大小，按对局的时间演完；
 * 同时最多 COSMOS_SLOTS 处，彼此隔开。黑洞的吸积也在起伏：光度慢慢涨落，谱在软态与硬态之间来回，硬态下周围的气体电离得更狠、更青。
 * 只管画面，不碰模拟
 */
export class Cosmos {
  readonly uniforms: CosmosUniforms
  readonly lights: CosmicLight[] = []
  /** 黑洞此刻的吸积光度比平时亮几倍，谱有多硬（0 是软态、1 是硬态） */
  lum = 1
  hard = 0.5
  /** 朝下那只电离锥：轴的方向（z 朝上）与半张角的余弦 */
  readonly cone: [number, number, number, number] = [0, 0, -1, Math.cos((CONE_HALF_DEG * Math.PI) / 180)]
  private readonly precess: { w: number; phase: number }
  private readonly slots: (Phenomenon | null)[] = []
  private readonly rng: Rng
  private readonly lumSwing: Swing
  private readonly hardSwing: Swing
  private readonly wallU: number
  private nextAt = FIRST_S
  private last: Kind | null = null
  private readonly look: Look = { r: 0, g: 0, b: 0, spread: 0, ionU: 0, highU: 0, ion: 0, front: 0, sr: 0, sg: 0, sb: 0, reachU: 0, remnantU: 0, tile: 0, remnant: 0, flashAt: 0, flash: 0 }

  /** wallU 是看得见的内壁的半径，格 */
  constructor(seed: number, wallU: number) {
    this.rng = new Rng(seed)
    this.lumSwing = new Swing(this.rng, LUM_PERIODS_S)
    this.hardSwing = new Swing(this.rng, HARD_PERIODS_S)
    const turn = PRECESS_S[0] + this.rng.next() * (PRECESS_S[1] - PRECESS_S[0])
    this.precess = { w: ((this.rng.next() < 0.5 ? -1 : 1) * Math.PI * 2) / turn, phase: this.rng.next() * Math.PI * 2 }
    this.wallU = wallU
    const n = COSMOS_SLOTS * 4
    this.uniforms = { at: new Float32Array(n), star: new Float32Array(n), ion: new Float32Array(n), scatter: new Float32Array(n), remnant: new Float32Array(n), flash: new Float32Array(n) }
    for (let i = 0; i < COSMOS_SLOTS; i++) this.slots.push(null)
    PRELUDE_S.forEach((ago, i) => {
      this.slots[i] = this.roll(-ago)
    })
  }

  /** 推到对局的第 now 秒：该冒的冒、该收的收，再把每个槽此刻的样子写进 uniforms 与 lights */
  update(now: number): void {
    this.lum = Math.exp(LUM_SWING * this.lumSwing.at(now))
    this.hard = 0.5 + 0.5 * this.hardSwing.at(now)
    const tilt = (CONE_TILT_DEG * Math.PI) / 180
    const phi = this.precess.w * now + this.precess.phase
    this.cone[0] = Math.sin(tilt) * Math.cos(phi)
    this.cone[1] = Math.sin(tilt) * Math.sin(phi)
    this.cone[2] = -Math.cos(tilt)
    while (now >= this.nextAt) {
      const at = this.nextAt
      const free = this.slots.findIndex((p) => !p || at - p.start >= lasts(p))
      if (free < 0) {
        this.nextAt += RETRY_S
        continue
      }
      this.slots[free] = this.roll(at)
      this.nextAt += EVERY_S[0] + this.rng.next() * (EVERY_S[1] - EVERY_S[0])
    }
    this.lights.length = 0
    for (let i = 0; i < COSMOS_SLOTS; i++) {
      const p = this.slots[i]
      if (p && now - p.start >= lasts(p)) this.slots[i] = null
      this.write(i, this.slots[i] ?? null, now)
    }
  }

  /** 挑一处新天象：种类按权重、不跟上一处重样；位置在内壁上，离正在演的都够远 */
  private roll(start: number): Phenomenon {
    const r = (lo: number, hi: number): number => lo + this.rng.next() * (hi - lo)
    let kind = this.pick()
    if (kind === this.last) kind = this.pick()
    this.last = kind
    const spot = this.spot(start)
    const angle = r(0, Math.PI * 2)
    const seed = Math.floor(r(0, 997))
    const base = { kind, start, ...spot, seed, angle, aspect: r(0.8, 1), period: r(6, 9), hard: r(0.42, 0.6) }
    switch (kind) {
      case 'hii':
        return { ...base, reachU: r(5.5, 8), life: r(40, 55), supernova: this.rng.next() < 0.55, tile: this.rng.next() < 0.5 ? REMNANT_SHELL : REMNANT_KNOTS, remnantU: r(5.5, 8) }
      case 'cluster':
        return { ...base, reachU: r(6.5, 9), life: r(38, 50), supernova: false, tile: 0, remnantU: 0 }
      case 'giant':
        return { ...base, reachU: r(5, 7), life: r(26, 38), supernova: true, tile: this.rng.next() < 0.65 ? REMNANT_CRAB : REMNANT_SHELL, remnantU: r(5, 7.5) }
      case 'planetary':
        return { ...base, reachU: r(2.2, 3.2), life: AGB_S, supernova: false, tile: REMNANT_PLANETARY, remnantU: 0, aspect: r(0.7, 1) }
    }
  }

  private pick(): Kind {
    const kinds = Object.keys(WEIGHTS) as Kind[]
    let x = this.rng.next() * kinds.reduce((s, k) => s + WEIGHTS[k], 0)
    for (const k of kinds) {
      x -= WEIGHTS[k]
      if (x < 0) return k
    }
    return kinds[kinds.length - 1]!
  }

  /** 内壁上随机一点，离 start 时还在演的天象最远的那个（试几次） */
  private spot(start: number): { x: number; y: number; z: number } {
    const a = this.wallU
    let best = { x: 0, y: 0, z: -(a - EMBED_U) }
    let bestD = -1
    for (let k = 0; k < 12; k++) {
      const rho = Math.sqrt(this.rng.next()) * a * SPREAD
      const th = this.rng.next() * Math.PI * 2
      const x = Math.cos(th) * rho
      const y = Math.sin(th) * rho
      const s = (a - EMBED_U) / a
      const p = { x: x * s, y: y * s, z: -Math.sqrt(a * a - rho * rho) * s }
      let d = Infinity
      for (const q of this.slots) if (q && start - q.start < lasts(q)) d = Math.min(d, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z))
      if (d >= APART_U) return p
      if (d > bestD) {
        bestD = d
        best = p
      }
    }
    return best
  }

  private write(i: number, p: Phenomenon | null, now: number): void {
    const u = this.uniforms
    const o = i * 4
    for (const arr of [u.at, u.star, u.ion, u.scatter, u.remnant, u.flash]) arr.fill(0, o, o + 4)
    if (!p) return
    const t = now - p.start
    const g = this.look
    g.r = g.g = g.b = g.spread = g.ionU = g.highU = g.ion = g.front = g.sr = g.sg = g.sb = g.reachU = g.remnantU = g.tile = g.remnant = g.flashAt = g.flash = 0
    if (p.kind === 'hii') this.hii(p, t)
    else if (p.kind === 'cluster') this.cluster(p, t)
    else if (p.kind === 'giant') this.giant(p, t)
    else this.planetary(p, t)
    let reach = g.r + g.g + g.b > 0 || g.flash > 0 ? STAR_REACH_U : 0
    if (g.ion > 0) reach = Math.max(reach, g.ionU * 1.4 + 0.6)
    if (g.sr + g.sg + g.sb > 0) reach = Math.max(reach, g.reachU)
    if (g.remnant > 0) reach = Math.max(reach, g.remnantU * REMNANT_SPAN)
    if (g.flash > 0 && now - g.flashAt < ECHO_S) reach = Math.max(reach, ECHO_U)
    u.at.set([p.x, p.y, p.z, reach], o)
    u.star.set([g.r, g.g, g.b, g.spread], o)
    u.ion.set([g.ionU, g.highU, g.ion, g.front], o)
    u.scatter.set([g.sr, g.sg, g.sb, g.reachU], o)
    u.remnant.set([g.remnantU, g.tile, g.remnant, p.angle], o)
    u.flash.set([g.flashAt, g.flash, p.seed, p.aspect], o)
    const power = Math.max(g.r, g.g, g.b)
    if (power > 0) this.lights.push({ x: p.x, y: p.y, z: p.z, color: [g.r / power, g.g / power, g.b / power], power, flash: false })
    const burst = g.flash > 0 ? supernovaShape(now - g.flashAt) : 0
    if (burst > 0) this.lights.push({ x: p.x, y: p.y, z: p.z, color: hue(planck(SN_COOL_K + SN_HOT_K * Math.exp(-(now - g.flashAt) / SN_COOL_S))), power: SN_POWER * burst, flash: true })
  }

  private star(c: Rgb, power: number): void {
    const g = this.look
    g.r += c[0] * power
    g.g += c[1] * power
    g.b += c[2] * power
  }

  private scatter(c: Rgb, power: number, reachU: number): void {
    const g = this.look
    const s = scattered(c)
    g.sr += s[0] * power
    g.sg += s[1] * power
    g.sb += s[2] * power
    g.reachU = Math.max(g.reachU, reachU)
  }

  /** 主星炸了：闪光与光回波交给着色器按爆发的时刻算，遗迹按谢多夫–泰勒长大，后半程慢慢暗下去 */
  private explode(p: Phenomenon, dt: number): void {
    const g = this.look
    g.flashAt = p.start + p.life
    g.flash = 1
    g.remnantU = p.remnantU * Math.min(1, dt / REMNANT_S) ** 0.4
    g.tile = p.tile
    g.remnant = between(0, 1.5, dt) * (1 - between(REMNANT_S * 0.55, REMNANT_S, dt))
  }

  /** 电离氢区：主星从云里露出来，电离前沿一圈圈推出去；主星死后氢慢慢复合，二次电离的氧先暗 */
  private hii(p: Phenomenon, t: number): void {
    const g = this.look
    if (t < p.life) {
      const e = smooth01(t / EMERGE_S)
      g.ionU = p.reachU * (1 - Math.exp(-Math.max(0, t) / FRONT_S)) ** (1 / 3)
      g.highU = g.ionU * p.hard
      g.ion = HII_GAIN * smooth01(t / FRONT_S)
      g.front = HII_FRONT * g.ion
      g.spread = O_SPREAD
      this.star(O_LIGHT, O_POWER * e)
      this.scatter(O_LIGHT, O_SCATTER * e, p.reachU * 1.7)
      return
    }
    const dt = t - p.life
    g.ionU = p.reachU
    g.highU = p.reachU * p.hard * Math.exp(-dt / OIII_RECOMB_S)
    g.ion = HII_GAIN * Math.exp(-dt / RECOMB_S)
    g.front = HII_FRONT * g.ion
    g.spread = O_SPREAD
    const rest = 0.35 * Math.exp(-dt / CLUSTER_FADE_S)
    this.star(B_LIGHT, O_POWER * rest)
    this.scatter(B_LIGHT, O_SCATTER * rest, p.reachU * 1.7)
    if (p.supernova) this.explode(p, dt)
  }

  /** 反射星云：一团年轻的 B 型星，蓝光被周围的尘埃散射出来，身边一小团气体被电离 */
  private cluster(p: Phenomenon, t: number): void {
    const g = this.look
    const e = smooth01(t / CLUSTER_IN_S) * (1 - between(p.life - CLUSTER_OUT_S, p.life, t))
    g.spread = B_SPREAD
    g.ionU = B_ION_U
    g.ion = B_ION * e
    g.front = 0.4 * g.ion
    this.star(B_LIGHT, B_POWER * e)
    this.scatter(B_LIGHT, B_SCATTER * e, p.reachU)
  }

  /** 红超巨星：橙红的星半规则地脉动，把周围的尘埃照成金黄，最后炸成超新星 */
  private giant(p: Phenomenon, t: number): void {
    if (t >= p.life) {
      this.explode(p, t - p.life)
      return
    }
    const e = smooth01(t / EMERGE_S) * (1 + GIANT_PULSE * Math.sin((t / p.period) * Math.PI * 2))
    this.star(GIANT_LIGHT, GIANT_POWER * e)
    this.scatter(GIANT_LIGHT, GIANT_SCATTER * e, p.reachU)
  }

  /** 行星状星云：红巨星把外壳匀速抛出去，中心露出又小又热的白矮星，把壳里的氧和氦电离成青蓝，外圈的氢和氮发红 */
  private planetary(p: Phenomenon, t: number): void {
    const g = this.look
    if (t < AGB_S) {
      const e = smooth01(t / 4)
      this.star(AGB_LIGHT, AGB_POWER * e)
      this.scatter(AGB_LIGHT, AGB_SCATTER * e, p.reachU * 1.4)
      return
    }
    const dt = t - AGB_S
    const shell = smooth01(dt / 4) * (1 - between(PLANETARY_S - 12, PLANETARY_S, dt))
    const old = 1 - smooth01(dt / 3)
    this.star(AGB_LIGHT, AGB_POWER * old)
    this.scatter(AGB_LIGHT, AGB_SCATTER * old, p.reachU * 1.4)
    this.star(WD_LIGHT, WD_POWER * shell)
    g.remnantU = p.reachU * (0.18 + 0.82 * Math.min(1, dt / PLANETARY_GROW_S))
    g.tile = p.tile
    g.remnant = shell
  }
}
