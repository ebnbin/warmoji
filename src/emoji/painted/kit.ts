import { SUN } from '../../data/light.ts'

/** 画布上指向光源的方向（单位向量）：和地图的太阳一样从左上方来 */
const L = { x: SUN.x / Math.hypot(SUN.x, SUN.y), y: SUN.y / Math.hypot(SUN.x, SUN.y) }

/** 描线：深暖褐，不用纯黑 */
export const INK = '#2a1b12'
/** 高光：暖白 */
export const SPARK = '#fff4dc'
/** 地面反上来的暖光 */
const BOUNCE = '#ffae62'
/** 墨垫在体下面往背光一侧错开这么多，背光边的线就粗一些 */
const DROP = { x: 0.32, y: 0.42 }

/** 一种材质的色阶：受光、本色、背光、最暗 */
export interface Ramp {
  readonly hi: string
  readonly base: string
  readonly lo: string
  readonly deep: string
}

const ramp = (hi: string, base: string, lo: string, deep: string): Ramp => ({ hi, base, lo, deep })

/** 全套只用这些色阶：比 Twemoji 暗一些、暖一些 */
export const RAMP = {
  skin: ramp('#ffe8ad', '#f3c566', '#cc8a3f', '#8f5526'),
  auburn: ramp('#ec9c5c', '#c1662f', '#86401f', '#552512'),
  red: ramp('#ff9d7d', '#d8432c', '#9a281c', '#621611'),
  orange: ramp('#ffb57b', '#e2743b', '#ad4a24', '#6f2c15'),
  gold: ramp('#ffeaa8', '#f0bf4a', '#b68226', '#77511a'),
  tan: ramp('#ecca9b', '#c8955d', '#8c6039', '#5a3b22'),
  felt: ramp('#a97a4b', '#7b5234', '#4f3220', '#311e12'),
  wood: ramp('#dcaa6c', '#ae7743', '#724826', '#472c16'),
  steel: ramp('#f0f4f4', '#aab4b9', '#66727a', '#39424a'),
  iron: ramp('#80858c', '#464a51', '#272a2f', '#141518'),
  bone: ramp('#fcf4e2', '#e0d1af', '#ad9b77', '#6c5d46'),
  ghost: ramp('#ffffff', '#e5eaee', '#a9b5c6', '#6c7a94'),
  pearl: ramp('#ffffff', '#efeaf3', '#b8afc9', '#7a7197'),
  rot: ramp('#cbd5a6', '#99aa78', '#647854', '#3d4d36'),
  fur: ramp('#aa9d92', '#7d706a', '#524743', '#322a27'),
  pink: ramp('#ffcbc1', '#e98b8c', '#b45b65', '#7a3743'),
  leaf: ramp('#b9d47c', '#6e9a44', '#45702d', '#2a4a1d'),
  moss: ramp('#9fbb6a', '#5c8738', '#395c24', '#223a16'),
  sea: ramp('#c2e8e3', '#3f9ba7', '#1f5e6d', '#0f3441'),
  water: ramp('#c4e9ff', '#4aa4e0', '#2468a8', '#153f6d'),
  violet: ramp('#dab6f1', '#9a61c9', '#61348e', '#3c1e5d'),
  magenta: ramp('#f6b0ea', '#c350b1', '#7d2a78', '#4c1648'),
  night: ramp('#5d5868', '#36333e', '#201e26', '#121116'),
  crimson: ramp('#f07a86', '#bf2037', '#7f1224', '#4d0a16'),
} as const satisfies Record<string, Ramp>

export type Pt = readonly [number, number]

export const fmt = (n: number): string => {
  const r = Math.round(n * 100) / 100
  return Object.is(r, -0) ? '0' : String(r)
}

/** 椭圆的路径，rot 是度 */
export function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0): string {
  const a = (rot * Math.PI) / 180
  const ux = Math.cos(a) * rx
  const uy = Math.sin(a) * rx
  return `M${fmt(cx - ux)} ${fmt(cy - uy)}A${fmt(rx)} ${fmt(ry)} ${fmt(rot)} 1 0 ${fmt(cx + ux)} ${fmt(cy + uy)}A${fmt(rx)} ${fmt(ry)} ${fmt(rot)} 1 0 ${fmt(cx - ux)} ${fmt(cy - uy)}Z`
}

/** 过这些点的平滑曲线（Catmull-Rom 转三次贝塞尔）；closed 时首尾相接 */
export function smooth(pts: readonly Pt[], closed = true, k = 1): string {
  const n = pts.length
  const at = (i: number): Pt => (closed ? pts[((i % n) + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!)
  let d = `M${fmt(pts[0]![0])} ${fmt(pts[0]![1])}`
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * k
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * k
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * k
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * k
    d += `C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2[0])} ${fmt(p2[1])}`
  }
  return closed ? `${d}Z` : d
}

/** 折线；closed 时封口 */
export function poly(pts: readonly Pt[], closed = true): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`).join('') + (closed ? 'Z' : '')
}

export interface FormOpts {
  /** 右下暗面有多宽，格 */
  readonly depth?: number
  /** 描线粗细 */
  readonly ink?: number
  /** 左上亮边的宽，0 不画 */
  readonly rim?: number
  /** 右下的地面反光，0 不画 */
  readonly bounce?: number
}

/**
 * 一张 emoji 的画笔：记下渐变与裁剪，画出来的每一块都按同一个光向打光。
 * 一块体的画法：墨垫往背光一侧错开一点；整块先铺背光色，裁在体内把受光的本体往光源方向错开，
 * 右下就露出一弯暗面；再沿边描一道渐隐的亮边与一道地面反光，最后描线。
 */
export class Painter {
  private readonly defs: string[] = []
  private readonly cache = new Map<string, string>()
  private readonly tag: string
  private n = 0

  constructor(tag: string) {
    this.tag = tag
  }

  private id(): string {
    return `${this.tag}${(this.n++).toString(36)}`
  }

  private once(key: string, make: (id: string) => string): string {
    const hit = this.cache.get(key)
    if (hit) return hit
    const id = this.id()
    this.defs.push(make(id))
    const url = `url(#${id})`
    this.cache.set(key, url)
    return url
  }

  /** 受光的本色：左上最亮 */
  lit(r: Ramp): string {
    return this.once(`lit${r.base}`, (id) =>
      `<radialGradient id="${id}" cx="0.3" cy="0.24" r="0.95" fx="0.26" fy="0.18">` +
      `<stop offset="0" stop-color="${r.hi}"/><stop offset="0.5" stop-color="${r.base}"/><stop offset="1" stop-color="${r.base}"/></radialGradient>`,
    )
  }

  /** 背光色：越往右下越深 */
  shade(r: Ramp): string {
    return this.once(`shade${r.base}`, (id) =>
      `<linearGradient id="${id}" x1="0.2" y1="0.15" x2="1" y2="1">` +
      `<stop offset="0.35" stop-color="${r.lo}"/><stop offset="1" stop-color="${r.deep}"/></linearGradient>`,
    )
  }

  private rimPaint(r: Ramp): string {
    return this.once(`rim${r.base}`, (id) =>
      `<linearGradient id="${id}" x1="0" y1="0" x2="0.8" y2="1">` +
      `<stop offset="0" stop-color="${r.hi}" stop-opacity="0.95"/><stop offset="0.42" stop-color="${r.hi}" stop-opacity="0"/></linearGradient>`,
    )
  }

  private bouncePaint(): string {
    return this.once('bounce', (id) =>
      `<linearGradient id="${id}" x1="0.2" y1="0" x2="0.9" y2="1">` +
      `<stop offset="0.62" stop-color="${BOUNCE}" stop-opacity="0"/><stop offset="1" stop-color="${BOUNCE}" stop-opacity="0.55"/></linearGradient>`,
    )
  }

  /** 用这条路径裁剪 */
  clip(d: string): string {
    const id = this.id()
    this.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`)
    return `url(#${id})`
  }

  /** 一块受光的体 */
  form(d: string, r: Ramp, o: FormOpts = {}): string {
    const depth = o.depth ?? 1.3
    const rim = o.rim ?? 0.9
    const bounce = o.bounce ?? 0.8
    const inner =
      `<path d="${d}" fill="${this.lit(r)}" transform="translate(${fmt(L.x * depth)} ${fmt(L.y * depth)})"/>` +
      (rim > 0 ? `<path d="${d}" fill="none" stroke="${this.rimPaint(r)}" stroke-width="${fmt(rim * 2)}"/>` : '') +
      (bounce > 0 ? `<path d="${d}" fill="none" stroke="${this.bouncePaint()}" stroke-width="${fmt(bounce * 2)}"/>` : '')
    return (
      `<path d="${d}" fill="${INK}" transform="translate(${DROP.x} ${DROP.y})"/>` +
      `<path d="${d}" fill="${this.shade(r)}"/>` +
      `<g clip-path="${this.clip(d)}">${inner}</g>` +
      `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${fmt(o.ink ?? 0.75)}" stroke-linejoin="round"/>`
    )
  }

  /** 平涂一块，不打光：小零件与花纹 */
  flat(d: string, color: string, ink = 0): string {
    return `<path d="${d}" fill="${color}"${ink > 0 ? ` stroke="${INK}" stroke-width="${fmt(ink)}" stroke-linejoin="round"` : ''}/>`
  }

  /** 画在 host 这块体里面，出界的部分裁掉 */
  within(host: string, body: string): string {
    return `<g clip-path="${this.clip(host)}">${body}</g>`
  }

  /** 上面的体投在下面这块上的影子：d 往背光一侧挪开，裁在 host 里 */
  cast(host: string, d: string, dist = 1, opacity = 0.35): string {
    return this.within(host, `<path d="${d}" fill="${INK}" opacity="${fmt(opacity)}" transform="translate(${fmt(-L.x * dist)} ${fmt(-L.y * dist)})"/>`)
  }

  /** 硬材质的高光：一片柔光加一粒亮点 */
  gloss(cx: number, cy: number, rx: number, ry: number, rot = -35): string {
    return (
      `<path d="${ellipse(cx, cy, rx, ry, rot)}" fill="${SPARK}" opacity="0.45"/>` +
      `<path d="${ellipse(cx - rx * 0.2, cy - ry * 0.15, rx * 0.38, ry * 0.42, rot)}" fill="${SPARK}" opacity="0.95"/>`
    )
  }

  /** 墨线：开放的路径 */
  line(d: string, w = 0.75, color = INK, opacity = 1): string {
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${fmt(w)}" stroke-linecap="round" stroke-linejoin="round"${opacity < 1 ? ` opacity="${fmt(opacity)}"` : ''}/>`
  }

  /** 眼睛：深色的椭圆，左上一粒暖白的反光 */
  eye(cx: number, cy: number, rx: number, ry: number, iris = INK): string {
    return (
      `<path d="${ellipse(cx, cy, rx, ry)}" fill="${iris}"/>` +
      `<path d="${ellipse(cx - rx * 0.32, cy - ry * 0.38, rx * 0.42, ry * 0.3)}" fill="${SPARK}"/>`
    )
  }

  /** 两颊的红晕 */
  blush(cx: number, cy: number, rx: number, ry: number): string {
    return `<path d="${ellipse(cx, cy, rx, ry)}" fill="#e2735c" opacity="0.32"/>`
  }

  defsSvg(): string {
    return this.defs.length > 0 ? `<defs>${this.defs.join('')}</defs>` : ''
  }
}
