// Emoji Studio 纯逻辑层：twemoji 部件动画的资源格式与烘焙函数。
// twemoji 无语义标签，部件识别靠「固定色板 + getBBox 边界 + 绘制顺序」人工判读后
// 沉淀为资源数据（animations.json = 原始 SVG 引用 + 动画参数）；本层只做
// 纯字符串变换（禁 DOM），原始 SVG 永不改动。动画 = 部件分组关键帧 +
// fx 程序化效果层，按统一规格烘焙成 N 帧静态 SVG → N 张纹理循环播放。
import animationsJson from './animations.json'

const OPEN_TAG = /<svg\b[^>]*>/
// 通用标签 token：属性内引号里的 > 不会截断
const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|[^">])*?)(\/?)>/g

export interface SplitSvg {
  open: string
  /** <defs> 原文（无则空串）——绘制元素可能引用其中的 clipPath 等，重组输出必须带上 */
  defs: string
  els: string[]
}

interface TopSegment {
  tag: string
  /** 平衡的元素原文（容器含整个子树） */
  text: string
  /** 容器开标签；自闭合叶子为 null */
  open: string | null
  /** 容器内部原文；叶子为 null */
  inner: string | null
}

/** 深度计数切顶层段落：任意标签、任意嵌套都平衡正确（不依赖标签白名单） */
function topLevelSegments(body: string): TopSegment[] {
  const out: TopSegment[] = []
  const re = new RegExp(TAG.source, 'g')
  let depth = 0
  let start = 0
  let startTag = ''
  let startOpen = ''
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const close = m[1] === '/'
    const self = m[4] === '/'
    if (close) {
      depth--
      if (depth < 0) throw new Error('SVG 标签不平衡')
      if (depth === 0) {
        out.push({
          tag: startTag,
          text: body.slice(start, m.index + m[0].length),
          open: startOpen,
          inner: body.slice(start + startOpen.length, m.index),
        })
      }
    } else if (self) {
      if (depth === 0) out.push({ tag: m[2]!, text: m[0], open: null, inner: null })
    } else {
      if (depth === 0) {
        start = m.index
        startTag = m[2]!
        startOpen = m[0]
      }
      depth++
    }
  }
  if (depth !== 0) throw new Error('SVG 标签不平衡')
  return out
}

/** 把 SVG 切成开标签 + defs + 顶层绘制元素数组。defs 单列：它不绘制、
 * 只是共享定义（clipPath 等），下标序保持「绘制元素」语义，重组时恒带上 */
export function splitSvg(svg: string): SplitSvg {
  const open = OPEN_TAG.exec(svg)?.[0]
  if (!open) throw new Error('不是有效的 SVG')
  const closeIdx = svg.lastIndexOf('</svg>')
  if (closeIdx < 0) throw new Error('SVG 缺少闭合标签')
  const body = svg.slice(svg.indexOf(open) + open.length, closeIdx)
  let defs = ''
  const els: string[] = []
  for (const seg of topLevelSegments(body)) {
    if (seg.tag === 'defs') defs += seg.text
    else els.push(seg.text)
  }
  return { open, defs, els }
}

function replaceViewBox(open: string, viewBox: string): string {
  return open.replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`)
}

// ── 动画 ────────────────────────────────────────────────────

/** 关键帧：t 为周期内相位 0..1（首尾值应闭环）；变换绕 (cx,cy) 施加。
 * scaleX/scaleY 与 scale 相乘——挤压拉伸（squash & stretch）用 */
export interface PartKeyframe {
  readonly t: number
  readonly rotate?: number
  readonly tx?: number
  readonly ty?: number
  readonly scale?: number
  readonly scaleX?: number
  readonly scaleY?: number
  readonly opacity?: number
}

export interface AnimPart {
  /** 顶层元素下标（splitSvg 序）；成员聚合渲染在最大下标处（略提 z 序，配方自行保证视觉等价） */
  readonly indices: readonly number[]
  /** 旋转/缩放中心（viewBox 坐标） */
  readonly cx?: number
  readonly cy?: number
  readonly keyframes: readonly PartKeyframe[]
}

/** 程序化效果层：每帧生成原 SVG 里不存在的新 path（火星/涟漪/高光/电弧…），
 * back 垫在本体之下、front 盖在本体之上 */
export interface FxLayer {
  readonly layer: 'back' | 'front'
  readonly render: (t: number) => string
}

export interface AnimRecipe {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  /** 部件拆解说明（Studio 详情页展示识别依据） */
  readonly anatomy: string
  readonly parts: readonly AnimPart[]
  readonly fx?: readonly FxLayer[]
  /** 效果超出原画布时扩容（如头顶蒸汽、上方火星） */
  readonly viewBox?: string
}

interface PartPose {
  rotate: number
  tx: number
  ty: number
  scale: number
  scaleX: number
  scaleY: number
  opacity: number
}

/** 相位 t（0..1）处的分段线性插值；t 落在首帧前/末帧后按闭环回绕 */
export function lerpKeyframes(kfs: readonly PartKeyframe[], t: number): PartPose {
  const fill = (k: PartKeyframe): Required<PartKeyframe> => ({
    t: k.t,
    rotate: k.rotate ?? 0,
    tx: k.tx ?? 0,
    ty: k.ty ?? 0,
    scale: k.scale ?? 1,
    scaleX: k.scaleX ?? 1,
    scaleY: k.scaleY ?? 1,
    opacity: k.opacity ?? 1,
  })
  const blend = (a: Required<PartKeyframe>, b: Required<PartKeyframe>, r: number): PartPose => {
    const mix = (x: number, y: number): number => x + (y - x) * r
    return {
      rotate: mix(a.rotate, b.rotate),
      tx: mix(a.tx, b.tx),
      ty: mix(a.ty, b.ty),
      scale: mix(a.scale, b.scale),
      scaleX: mix(a.scaleX, b.scaleX),
      scaleY: mix(a.scaleY, b.scaleY),
      opacity: mix(a.opacity, b.opacity),
    }
  }
  if (kfs.length === 0) {
    return { rotate: 0, tx: 0, ty: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1 }
  }
  const phase = ((t % 1) + 1) % 1
  let prev = fill(kfs[kfs.length - 1]!)
  let prevT = prev.t - 1
  for (const kf of kfs) {
    const cur = fill(kf)
    if (phase <= cur.t) {
      const span = cur.t - prevT
      return blend(prev, cur, span <= 0 ? 1 : (phase - prevT) / span)
    }
    prev = cur
    prevT = cur.t
  }
  // phase 落在末帧之后：向首帧（+1 周期）回绕插值
  const first = fill(kfs[0]!)
  const span = first.t + 1 - prevT
  return blend(prev, first, span <= 0 ? 1 : (phase - prevT) / span)
}

const fmt = (n: number): string => {
  const r = Math.round(n * 1000) / 1000
  return Object.is(r, -0) ? '0' : String(r)
}

/** 把动画在相位 t 烘焙成一帧静态 SVG：部件包 <g> 写死 transform、
 * fx 层按帧生成新 path（back 垫底 / front 盖面），其余元素原样保序 */
export function bakeAnimFrame(svg: string, recipe: AnimRecipe, t: number): string {
  const { open, defs, els } = splitSvg(svg)
  const ownerAt = new Map<number, AnimPart>()
  const skip = new Set<number>()
  for (const part of recipe.parts) {
    const max = Math.max(...part.indices)
    ownerAt.set(max, part)
    for (const i of part.indices) if (i !== max) skip.add(i)
  }
  let out = ''
  els.forEach((el, i) => {
    if (skip.has(i)) return
    const part = ownerAt.get(i)
    if (!part) {
      out += el
      return
    }
    const pose = lerpKeyframes(part.keyframes, t)
    const cx = part.cx ?? 0
    const cy = part.cy ?? 0
    // 绕 (cx,cy) 旋转+缩放，再整体平移 (tx,ty)
    const transform =
      `translate(${fmt(pose.tx + cx)} ${fmt(pose.ty + cy)})` +
      ` rotate(${fmt(pose.rotate)}) scale(${fmt(pose.scale * pose.scaleX)} ${fmt(pose.scale * pose.scaleY)})` +
      ` translate(${fmt(-cx)} ${fmt(-cy)})`
    const opacity = pose.opacity < 1 ? ` opacity="${fmt(pose.opacity)}"` : ''
    const members = part.indices.map((idx) => els[idx] ?? '').join('')
    out += `<g transform="${transform}"${opacity}>${members}</g>`
  })
  const phase = ((t % 1) + 1) % 1
  const fxAt = (layer: 'back' | 'front'): string =>
    (recipe.fx ?? [])
      .filter((f) => f.layer === layer)
      .map((f) => f.render(phase))
      .join('')
  const openTag = recipe.viewBox ? replaceViewBox(open, recipe.viewBox) : open
  return `${openTag}${defs}${fxAt('back')}${out}${fxAt('front')}</svg>`
}

// ── fx 生成器：程序化几何，产出原 SVG 里不存在的 path ──────────

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

/** 四芒星 path data（星光/电光用） */
export function star4(cx: number, cy: number, r: number): string {
  const k = r * 0.22
  return (
    `M${fmt(cx)} ${fmt(cy - r)}L${fmt(cx + k)} ${fmt(cy - k)}L${fmt(cx + r)} ${fmt(cy)}` +
    `L${fmt(cx + k)} ${fmt(cy + k)}L${fmt(cx)} ${fmt(cy + r)}L${fmt(cx - k)} ${fmt(cy + k)}` +
    `L${fmt(cx - r)} ${fmt(cy)}L${fmt(cx - k)} ${fmt(cy - k)}Z`
  )
}

/** 粒子升腾（火星/气泡）：每颗按相位错开循环，上升途中渐小渐隐 */
export function fxRise(opts: {
  readonly particles: readonly { x: number; phase: number; size: number; color: string; drift?: number }[]
  readonly y0: number
  readonly y1: number
}): FxLayer {
  return {
    layer: 'front',
    render: (t) =>
      opts.particles
        .map((p) => {
          const pt = (t + p.phase) % 1
          const y = opts.y0 + (opts.y1 - opts.y0) * pt
          const x = p.x + Math.sin(pt * Math.PI * 2) * (p.drift ?? 0.8)
          const size = p.size * (1 - pt * 0.6)
          const opacity = pt < 0.12 ? pt / 0.12 : 1 - (pt - 0.12) / 0.88
          if (opacity <= 0.02) return ''
          return `<path fill="${p.color}" opacity="${fmt(clamp01(opacity))}" d="${star4(x, y, size)}"/>`
        })
        .join(''),
  }
}

/** 高光斜条扫过：clipPath 裁剪在圆形表面内（金属/宝石的反光） */
export function fxShineSweep(opts: {
  readonly clip: { cx: number; cy: number; r: number }
  readonly id: string
}): FxLayer {
  const { cx, cy, r } = opts.clip
  return {
    layer: 'front',
    render: (t) => {
      // 斜平行四边形从左外扫到右外；周期后 40% 无高光（歇一拍）
      const sweep = t / 0.6
      if (sweep > 1) return ''
      const x = cx - r - 14 + (2 * r + 22) * sweep
      const bar = (w: number, dx: number, o: number): string =>
        `<path fill="#FFFFFF" opacity="${fmt(o)}" d="M${fmt(x + dx)} ${fmt(cy - r - 2)}l${fmt(w)} 0l-10 ${fmt(2 * r + 4)}l${fmt(-w)} 0Z"/>`
      return (
        `<defs><clipPath id="${opts.id}"><circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}"/></clipPath></defs>` +
        `<g clip-path="url(#${opts.id})">${bar(6.5, 0, 0.5)}${bar(2.6, 9.5, 0.4)}</g>`
      )
    },
  }
}

/** 星光闪烁：定点四芒星错相缩放脉冲 */
export function fxSparkles(opts: {
  readonly stars: readonly { x: number; y: number; r: number; phase: number; color?: string }[]
}): FxLayer {
  return {
    layer: 'front',
    render: (t) =>
      opts.stars
        .map((s) => {
          const pt = (t + s.phase) % 1
          // 每颗每周期亮一次：前 55% 隐藏
          if (pt < 0.55) return ''
          const k = Math.sin(((pt - 0.55) / 0.45) * Math.PI)
          if (k <= 0.05) return ''
          return `<path fill="${s.color ?? '#FFFFFF'}" opacity="${fmt(0.9 * k)}" d="${star4(s.x, s.y, s.r * (0.5 + 0.5 * k))}"/>`
        })
        .join(''),
  }
}

/** 涟漪环扩散：椭圆描边从小到大、由实到无 */
export function fxRipples(opts: {
  readonly cx: number
  readonly cy: number
  readonly color: string
  readonly rings: readonly { phase: number }[]
  /** 涟漪只在周期的这段相位窗内活动 */
  readonly window: readonly [number, number]
}): FxLayer {
  const [w0, w1] = opts.window
  return {
    layer: 'back',
    render: (t) =>
      opts.rings
        .map((ring) => {
          const local = (t - w0 + ring.phase) / (w1 - w0)
          if (local < 0 || local > 1) return ''
          const rx = 3 + 12 * local
          const opacity = (1 - local) * 0.75
          if (opacity <= 0.03) return ''
          return `<ellipse cx="${fmt(opts.cx)}" cy="${fmt(opts.cy)}" rx="${fmt(rx)}" ry="${fmt(rx * 0.32)}" fill="none" stroke="${opts.color}" stroke-width="${fmt(1.7 * (1 - local) + 0.3)}" opacity="${fmt(opacity)}"/>`
        })
        .join(''),
  }
}

/** 电弧闪现：小折线在各自相位窗内硬切出现（放电的随机感靠错窗） */
export function fxBolts(opts: {
  readonly bolts: readonly {
    points: readonly (readonly [number, number])[]
    window: readonly [number, number]
    color?: string
    width?: number
  }[]
}): FxLayer {
  return {
    layer: 'front',
    render: (t) =>
      opts.bolts
        .map((b) => {
          const [w0, w1] = b.window
          if (t < w0 || t > w1) return ''
          const d = b.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`).join('')
          return `<path d="${d}" fill="none" stroke="${b.color ?? '#FFF7DD'}" stroke-width="${fmt(b.width ?? 1.7)}" stroke-linecap="round" stroke-linejoin="round"/>`
        })
        .join(''),
  }
}

/** 蒸汽波浪：竖向 S 形描边升起淡出（怒气/热气） */
export function fxSteam(opts: {
  readonly wisps: readonly { x: number; y0: number; phase: number }[]
}): FxLayer {
  return {
    layer: 'front',
    render: (t) =>
      opts.wisps
        .map((w) => {
          const pt = (t + w.phase) % 1
          const y = w.y0 - pt * 4.5
          const opacity = pt < 0.15 ? pt / 0.15 : 1 - (pt - 0.15) / 0.85
          if (opacity <= 0.03) return ''
          const sway = Math.sin(pt * Math.PI * 2) * 0.8
          return (
            `<path d="M${fmt(w.x + sway)} ${fmt(y)}c-1.8 -1.4 1.8 -2.6 0 -4c-1.6 -1.2 1.6 -2.4 0 -3.6"` +
            ` fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" opacity="${fmt(0.55 * clamp01(opacity))}"/>`
          )
        })
        .join(''),
  }
}

// ── 动画资源格式：原始 SVG + 动画参数 = 可存储/校验/热加载的数据资产 ──
// fx 用「生成器名 + 参数」声明（函数无法序列化），加载时经注册表还原成渲染函数。
// 资源文件：src/core/animations.json（format 版本化；def 为缺省播放规格）。
// v2 起一个 emoji 是一组具名 clip（idle 待机循环、attack 攻击周期…）：
// clip 只是纯相位空间的资产，播放时长/触发时机全由玩法侧决定——
// kind='cycle' 的契约是「相位 0..1 = 一个完整行为周期、出手时刻锚在相位终点」，
// 播放器按真实行为间隔铺放相位即可让动画速度天然跟随行为速度（如攻速）。

export const ANIM_FORMAT = 'warmoji-anim@2'

/** fx 声明：gen 必须是注册表成员；layer 缺省用生成器自身默认 */
export interface FxDecl {
  readonly gen: string
  readonly layer?: 'back' | 'front'
  readonly params: unknown
}

export type AnimClipKind = 'loop' | 'cycle'

/** 单个 clip 的资源形态：省略 kind 视为 loop；frames 缺省用全局 def */
export interface AnimClipEntry {
  readonly kind?: AnimClipKind
  readonly frames?: number
  readonly viewBox?: string
  readonly parts: readonly AnimPart[]
  readonly fx?: readonly FxDecl[]
}

export interface AnimResourceEntry {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly anatomy: string
  readonly clips: Readonly<Record<string, AnimClipEntry>>
}

export interface AnimResource {
  readonly format: string
  readonly def: { readonly frames: number; readonly durMs: number }
  /** key = emoji 的 codepoints（与打包索引的 c 键一致） */
  readonly animations: Readonly<Record<string, AnimResourceEntry>>
}

/** fx 生成器注册表：资源里的 gen 名 → 还原函数。新增效果类型 = 此处加一行 */
const FX_REGISTRY = {
  rise: fxRise,
  shine: fxShineSweep,
  sparkles: fxSparkles,
  ripples: fxRipples,
  bolts: fxBolts,
  steam: fxSteam,
} as const satisfies Record<string, (params: never) => FxLayer>

export const FX_GENERATORS = Object.keys(FX_REGISTRY) as readonly string[]

// 注意不能用 lerpKeyframes(kfs,0) 与 (kfs,1) 对比——相位 1 会归一化回 0，恒等
const poseOf = (kf: PartKeyframe): PartPose => ({
  rotate: kf.rotate ?? 0,
  tx: kf.tx ?? 0,
  ty: kf.ty ?? 0,
  scale: kf.scale ?? 1,
  scaleX: kf.scaleX ?? 1,
  scaleY: kf.scaleY ?? 1,
  opacity: kf.opacity ?? 1,
})

const poseEq = (a: PartPose, b: PartPose): boolean =>
  Math.abs(a.rotate - b.rotate) < 1e-9 &&
  Math.abs(a.tx - b.tx) < 1e-9 &&
  Math.abs(a.ty - b.ty) < 1e-9 &&
  Math.abs(a.scale - b.scale) < 1e-9 &&
  Math.abs(a.scaleX - b.scaleX) < 1e-9 &&
  Math.abs(a.scaleY - b.scaleY) < 1e-9 &&
  Math.abs(a.opacity - b.opacity) < 1e-9

/** 资源校验：格式版本 / 播放规格 / 每个 clip 的关键帧闭环与时序 / 部件下标 /
 * fx 生成器存在。违规即抛错（带定位信息）——坏资源在加载期暴露，不进运行时 */
export function validateAnimResource(data: AnimResource): void {
  if (data.format !== ANIM_FORMAT) {
    throw new Error(`动画资源格式不符：期望 ${ANIM_FORMAT}，得到 ${String(data.format)}`)
  }
  if (!(data.def.frames >= 2) || !(data.def.durMs > 0)) {
    throw new Error('动画资源 def 非法：frames 需 ≥2，durMs 需 >0')
  }
  for (const [key, entry] of Object.entries(data.animations)) {
    const at = `animations.${key}`
    if (!entry.emoji || !entry.name) throw new Error(`${at}: 缺少 emoji/name`)
    const clipIds = Object.keys(entry.clips ?? {})
    if (clipIds.length === 0) throw new Error(`${at}: 至少要有一个 clip`)
    for (const [clipId, clip] of Object.entries(entry.clips)) {
      const cat = `${at}.clips.${clipId}`
      if (clip.kind !== undefined && clip.kind !== 'loop' && clip.kind !== 'cycle') {
        throw new Error(`${cat}: kind 只能是 loop/cycle`)
      }
      if (clip.frames !== undefined && (!Number.isInteger(clip.frames) || clip.frames < 2)) {
        throw new Error(`${cat}: frames 需为 ≥2 的整数`)
      }
      if (clip.parts.length === 0 && (clip.fx?.length ?? 0) === 0) {
        throw new Error(`${cat}: parts 与 fx 至少要有一项`)
      }
      const seen = new Set<number>()
      clip.parts.forEach((part, pi) => {
        const pat = `${cat}.parts[${pi}]`
        if (part.indices.length === 0) throw new Error(`${pat}: indices 为空`)
        for (const i of part.indices) {
          if (!Number.isInteger(i) || i < 0) throw new Error(`${pat}: 非法下标 ${i}`)
          if (seen.has(i)) throw new Error(`${pat}: 下标 ${i} 被多个部件占用`)
          seen.add(i)
        }
        if (part.keyframes.length < 2) throw new Error(`${pat}: 关键帧不足 2 个`)
        let prev = -Infinity
        for (const kf of part.keyframes) {
          if (kf.t < 0 || kf.t > 1) throw new Error(`${pat}: 关键帧 t=${kf.t} 超出 [0,1]`)
          if (kf.t < prev) throw new Error(`${pat}: 关键帧 t 未按升序排列`)
          prev = kf.t
        }
        const first = part.keyframes[0]!
        const last = part.keyframes[part.keyframes.length - 1]!
        if (!poseEq(poseOf(first), poseOf(last))) {
          throw new Error(`${pat}: 首尾姿态不闭环（循环/连续周期播放会跳变）`)
        }
      })
      clip.fx?.forEach((decl, fi) => {
        if (!(decl.gen in FX_REGISTRY)) {
          throw new Error(`${cat}.fx[${fi}]: 未知生成器 "${decl.gen}"（可用：${FX_GENERATORS.join('/')}）`)
        }
        if (decl.layer !== undefined && decl.layer !== 'back' && decl.layer !== 'front') {
          throw new Error(`${cat}.fx[${fi}]: layer 只能是 back/front`)
        }
      })
    }
  }
}

/** fx 声明 → 渲染函数（模板套用与资源加载共用的还原逻辑） */
export function restoreFx(decl: FxDecl): FxLayer {
  const make = FX_REGISTRY[decl.gen as keyof typeof FX_REGISTRY] as (params: unknown) => FxLayer
  const fx = make(decl.params)
  return decl.layer ? { ...fx, layer: decl.layer } : fx
}

/** 运行时 clip：可直接喂给 bakeAnimFrame 的配方 + 播放语义（kind/frames） */
export interface AnimClip extends AnimRecipe {
  readonly id: string
  readonly kind: AnimClipKind
  readonly frames: number
}

/** 一个 emoji 的整套动画：具名 clip 集（首个视为代表作/待机） */
export interface AnimSet {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly anatomy: string
  readonly clips: readonly AnimClip[]
}

export function loadAnimSets(data: AnimResource): AnimSet[] {
  validateAnimResource(data)
  return Object.values(data.animations).map((entry) => ({
    emoji: entry.emoji,
    name: entry.name,
    desc: entry.desc,
    anatomy: entry.anatomy,
    clips: Object.entries(entry.clips).map(([id, clip]) => ({
      id,
      kind: clip.kind ?? 'loop',
      frames: clip.frames ?? data.def.frames,
      emoji: entry.emoji,
      name: entry.name,
      desc: entry.desc,
      anatomy: entry.anatomy,
      viewBox: clip.viewBox,
      parts: clip.parts,
      fx: clip.fx?.map(restoreFx),
    })),
  }))
}

const RESOURCE = animationsJson as unknown as AnimResource

/** 缺省播放规格（clip 未自带 frames 时用；durMs 是 loop 类 clip 的标准时长） */
export const ANIM_DEF: { readonly frames: number; readonly durMs: number } = RESOURCE.def

/** 动画花名册：从资源文件加载（坏数据在此即抛错，dev/测试期暴露） */
export const ANIM_SETS: readonly AnimSet[] = loadAnimSets(RESOURCE)

/** 兼容视图：每个 emoji 的首个 clip（画廊/模板等只关心代表作的场合用） */
export const ANIM_RECIPES: readonly AnimClip[] = ANIM_SETS.map((s) => s.clips[0]!)

export function animSetOf(emoji: string): AnimSet | undefined {
  return ANIM_SETS.find((s) => s.emoji === emoji)
}

export function animClipOf(emoji: string, clipId: string): AnimClip | undefined {
  return animSetOf(emoji)?.clips.find((c) => c.id === clipId)
}

export function animRecipeOf(emoji: string): AnimRecipe | undefined {
  return ANIM_RECIPES.find((r) => r.emoji === emoji)
}

/** 播放进度 → 帧下标（播放器与测试共用的纯函数）：
 * once 播完停在末帧；循环按相位回绕 */
export function clipFrameIndex(
  elapsedMs: number,
  durMs: number,
  frames: number,
  once: boolean,
): number {
  if (durMs <= 0 || frames <= 0) return 0
  const phase = elapsedMs / durMs
  if (once && phase >= 1) return frames - 1
  const wrapped = ((phase % 1) + 1) % 1
  return Math.min(frames - 1, Math.floor(wrapped * frames))
}

// ── 通用动画模板：不依赖部件解剖，任意 emoji 即选即用 ──────────
// 模板 = 全体元素的关键帧（whole，套用时展开成 [0..n-1]）+ fx 声明。
// 专属配方（animations.json）是逐 emoji 精修；模板是批量铺动画的底座，
// 也是「预测一个静态物品动起来什么样」的快速试衣间。

export interface AnimTemplate {
  readonly id: string
  readonly icon: string
  readonly name: string
  readonly desc: string
  /** 全体元素统一施加的关键帧动画（可缺省：纯 fx 模板） */
  readonly whole?: {
    readonly cx?: number
    readonly cy?: number
    readonly keyframes: readonly PartKeyframe[]
  }
  readonly fx?: readonly FxDecl[]
  readonly viewBox?: string
}

export const ANIM_TEMPLATES: readonly AnimTemplate[] = [
  {
    id: 'breathe',
    icon: '1f62e_200d_1f4a8',
    name: '呼吸',
    desc: '整体缓慢地鼓起又收回，安静的活物感。',
    whole: {
      cx: 18,
      cy: 18,
      keyframes: [
        { t: 0, scale: 1 },
        { t: 0.5, scale: 1.045 },
        { t: 1, scale: 1 },
      ],
    },
  },
  {
    id: 'sway',
    icon: '1f33e',
    name: '摇摆',
    desc: '绕底部左右摆动，像被风吹着。',
    whole: {
      cx: 18,
      cy: 34,
      keyframes: [
        { t: 0, rotate: -4 },
        { t: 0.5, rotate: 4 },
        { t: 1, rotate: -4 },
      ],
    },
  },
  {
    id: 'bounce',
    icon: '1f3c0',
    name: '弹跳',
    desc: '蹲身蓄力、跃起、落地压扁回弹——完整的挤压拉伸循环。',
    whole: {
      cx: 18,
      cy: 36,
      keyframes: [
        { t: 0, ty: 0, scaleX: 1, scaleY: 1 },
        { t: 0.12, ty: 0, scaleX: 1.09, scaleY: 0.9 },
        { t: 0.4, ty: -3.6, scaleX: 0.97, scaleY: 1.04 },
        { t: 0.62, ty: 0, scaleX: 1.07, scaleY: 0.92 },
        { t: 0.78, ty: 0, scaleX: 1, scaleY: 1 },
        { t: 1, ty: 0, scaleX: 1, scaleY: 1 },
      ],
    },
  },
  {
    id: 'float',
    icon: '1f388',
    name: '悬浮',
    desc: '轻轻上下漂浮并微微倾侧，幽灵与气球的质感。',
    whole: {
      cx: 18,
      cy: 18,
      keyframes: [
        { t: 0, ty: 0, rotate: 0 },
        { t: 0.3, ty: -1.3, rotate: 1.2 },
        { t: 0.55, ty: 0, rotate: 0 },
        { t: 0.8, ty: 0.8, rotate: -1.2 },
        { t: 1, ty: 0, rotate: 0 },
      ],
    },
  },
  {
    id: 'shiver',
    icon: '1f976',
    name: '战栗',
    desc: '高频左右哆嗦，受惊或冻僵的样子。',
    whole: {
      cx: 18,
      cy: 18,
      keyframes: [
        { t: 0, tx: 0 },
        { t: 0.14, tx: -0.7 },
        { t: 0.28, tx: 0.6 },
        { t: 0.42, tx: -0.5 },
        { t: 0.56, tx: 0.7 },
        { t: 0.7, tx: -0.6 },
        { t: 0.84, tx: 0.4 },
        { t: 1, tx: 0 },
      ],
    },
  },
  {
    id: 'pulse',
    icon: '1f493',
    name: '心跳',
    desc: '咚-咚两连跳后歇一拍，心脏与警报的节奏。',
    whole: {
      cx: 18,
      cy: 18,
      keyframes: [
        { t: 0, scale: 1 },
        { t: 0.1, scale: 1.07 },
        { t: 0.2, scale: 1 },
        { t: 0.3, scale: 1.05 },
        { t: 0.42, scale: 1 },
        { t: 1, scale: 1 },
      ],
    },
  },
  {
    id: 'ignite',
    icon: '1f525',
    name: '燃烧',
    desc: '轻微摇曳，火星从身后升起——着火了。',
    whole: {
      cx: 18,
      cy: 34,
      keyframes: [
        { t: 0, rotate: -1.5 },
        { t: 0.5, rotate: 1.5 },
        { t: 1, rotate: -1.5 },
      ],
    },
    fx: [
      {
        gen: 'rise',
        params: {
          particles: [
            { x: 11, phase: 0, size: 1.5, color: '#FFD983' },
            { x: 24.5, phase: 0.28, size: 1.2, color: '#E85319', drift: 1.2 },
            { x: 16, phase: 0.55, size: 1.6, color: '#FFAC33' },
            { x: 27, phase: 0.8, size: 1, color: '#FFD983', drift: 0.6 },
          ],
          y0: 26,
          y1: -3,
        },
      },
    ],
    viewBox: '0 -5 36 41',
  },
  {
    id: 'sparkle',
    icon: '2728',
    name: '闪耀',
    desc: '周身三颗星光错相闪烁，稀有物品的光泽。',
    fx: [
      {
        gen: 'sparkles',
        params: {
          stars: [
            { x: 6, y: 7, r: 2.2, phase: 0 },
            { x: 30, y: 10, r: 1.8, phase: 0.33 },
            { x: 26, y: 29, r: 2, phase: 0.66 },
          ],
        },
      },
    ],
  },
  {
    id: 'steaming',
    icon: '2668',
    name: '蒸腾',
    desc: '头顶两缕热气袅袅升起，刚出锅或怒气值拉满。',
    fx: [
      {
        gen: 'steam',
        params: {
          wisps: [
            { x: 12, y0: 0.5, phase: 0 },
            { x: 24, y0: 0.5, phase: 0.5 },
          ],
        },
      },
    ],
    viewBox: '0 -7 36 43',
  },
  {
    id: 'electrified',
    icon: '26a1',
    name: '触电',
    desc: '细微高频抖动，三道电弧在周身错时炸开。',
    whole: {
      cx: 18,
      cy: 18,
      keyframes: [
        { t: 0, tx: 0 },
        { t: 0.25, tx: -0.5 },
        { t: 0.5, tx: 0.5 },
        { t: 0.75, tx: -0.4 },
        { t: 1, tx: 0 },
      ],
    },
    fx: [
      {
        gen: 'bolts',
        params: {
          bolts: [
            { points: [[3, 10], [6, 12], [4, 15]], window: [0.1, 0.22] },
            { points: [[33, 8], [30, 11], [32, 14]], window: [0.48, 0.6] },
            { points: [[14, 31], [17, 32.5], [15.5, 35]], window: [0.78, 0.88] },
          ],
        },
      },
      {
        gen: 'sparkles',
        params: { stars: [{ x: 29, y: 27, r: 1.8, phase: 0.3, color: '#FFE8B6' }] },
      },
    ],
  },
]

export function animTemplateOf(id: string): AnimTemplate | undefined {
  return ANIM_TEMPLATES.find((t) => t.id === id)
}

/** 模板 × 任意 emoji：全体元素展开成一个部件，fx 声明还原，产出可烘焙配方 */
export function applyTemplate(tpl: AnimTemplate, emoji: string, svg: string): AnimRecipe {
  const n = splitSvg(svg).els.length
  return {
    emoji,
    name: tpl.name,
    desc: tpl.desc,
    anatomy: `模板「${tpl.name}」整体施加于全部 ${n} 个元素，无需部件解剖。`,
    parts: tpl.whole
      ? [
          {
            indices: Array.from({ length: n }, (_, i) => i),
            cx: tpl.whole.cx,
            cy: tpl.whole.cy,
            keyframes: tpl.whole.keyframes,
          },
        ]
      : [],
    fx: tpl.fx?.map(restoreFx),
    viewBox: tpl.viewBox,
  }
}

// ── SVG 结构树：解剖工作台（写专属配方时的部件情报）──────────────
// 树 = SVG 原文的镜像：顶层元素为一级节点，g/defs 等容器可下钻到子元素。
// 节点 path key：顶层 "3"，组内 "3/1"——显隐/选中状态都以它为键。

export interface SvgTreeNode {
  readonly path: string
  readonly tag: string
  /** 平衡的节点原文（容器含整个子树） */
  readonly raw: string
  /** 容器开标签；叶子为 null */
  readonly open: string | null
  readonly fill: string | null
  readonly children: readonly SvgTreeNode[]
  /** 绘制型节点；defs 子树 = 共享定义（clipPath 等），不绘制、不可显隐 */
  readonly paints: boolean
}

export interface SvgTree {
  readonly open: string
  readonly nodes: readonly SvgTreeNode[]
}

function buildNodes(body: string, parentPath: string, paints: boolean): SvgTreeNode[] {
  return topLevelSegments(body).map((seg, i) => {
    const path = parentPath === '' ? String(i) : `${parentPath}/${i}`
    const selfPaints = paints && seg.tag !== 'defs'
    return {
      path,
      tag: seg.tag,
      raw: seg.text,
      open: seg.open,
      fill: /\bfill="([^"]+)"/.exec(seg.open ?? seg.text)?.[1] ?? null,
      children: seg.inner === null ? [] : buildNodes(seg.inner, path, selfPaints),
      paints: selfPaints,
    }
  })
}

/** SVG 文本 → 结构树（含 defs 节点，paints=false） */
export function parseSvgTree(svg: string): SvgTree {
  const open = OPEN_TAG.exec(svg)?.[0]
  if (!open) throw new Error('不是有效的 SVG')
  const closeIdx = svg.lastIndexOf('</svg>')
  if (closeIdx < 0) throw new Error('SVG 缺少闭合标签')
  const body = svg.slice(svg.indexOf(open) + open.length, closeIdx)
  return { open, nodes: buildNodes(body, '', true) }
}

export interface ComposeState {
  /** 隐藏节点 path 集合（容器隐藏 = 整个子树消失） */
  readonly hidden?: ReadonlySet<string>
}

/** 按显隐状态把结构树重组回 SVG 文本。defs 恒原样保留（裁剪引用不能断）；
 * 无状态时输出与原文等价。纯字符串操作，不改任何原文片段 */
export function composeSvg(tree: SvgTree, state: ComposeState = {}): string {
  const hidden = state.hidden ?? new Set<string>()
  const anyHiddenWithin = (path: string): boolean => {
    for (const h of hidden) if (h.startsWith(`${path}/`)) return true
    return false
  }
  const emit = (node: SvgTreeNode): string => {
    if (!node.paints) return node.raw
    if (hidden.has(node.path)) return ''
    // 仅当子树内有隐藏项才需要拆开容器逐子重组，否则原样直出
    return node.children.length > 0 && anyHiddenWithin(node.path)
      ? `${node.open}${node.children.map(emit).join('')}</${node.tag}>`
      : node.raw
  }
  return `${tree.open}${tree.nodes.map(emit).join('')}</svg>`
}

export interface TreeRow {
  readonly path: string
  readonly tag: string
  readonly fill: string | null
  readonly depth: number
  readonly paints: boolean
  /** 有子节点（可展开/收起） */
  readonly container: boolean
  readonly childCount: number
}

/** 结构树 → 平铺行（UI 列表用）；collapsed 中的容器不展开其子行 */
export function flattenTree(tree: SvgTree, collapsed: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (nodes: readonly SvgTreeNode[], depth: number): void => {
    for (const node of nodes) {
      rows.push({
        path: node.path,
        tag: node.tag,
        fill: node.fill,
        depth,
        paints: node.paints,
        container: node.children.length > 0,
        childCount: node.children.length,
      })
      if (node.children.length > 0 && !collapsed.has(node.path)) walk(node.children, depth + 1)
    }
  }
  walk(tree.nodes, 0)
  return rows
}
