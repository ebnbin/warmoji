// Emoji Studio 纯逻辑层：twemoji SVG 源码级改造的配方与烘焙函数。
// twemoji 无语义标签，部件识别靠「固定色板 + getBBox 边界 + 绘制顺序」人工判读后
// 沉淀为配方数据；本层只做纯字符串变换（禁 DOM），原始 SVG 永不改动。
// 两类配方：
//   动画 = 部件分组 + 关键帧（烘焙成 N 帧静态 SVG → N 张纹理循环播放）
//   合并 = 色相重映射 / 部件移植 / 饰品叠加（生成一张新 SVG → 一张纹理）

const OPEN_TAG = /<svg\b[^>]*>/
const TOP_LEVEL = /<(?:path|circle|ellipse|rect)\b[^>]*\/>|<g\b[^>]*>[\s\S]*?<\/g>/g

export interface SplitSvg {
  open: string
  els: string[]
}

/** 把 SVG 切成开标签 + 顶层元素数组（twemoji 顶层不嵌套 g 套 g，正则足够） */
export function splitSvg(svg: string): SplitSvg {
  const open = OPEN_TAG.exec(svg)?.[0]
  if (!open) throw new Error('不是有效的 SVG')
  const closeIdx = svg.lastIndexOf('</svg>')
  if (closeIdx < 0) throw new Error('SVG 缺少闭合标签')
  const body = svg.slice(svg.indexOf(open) + open.length, closeIdx)
  return { open, els: body.match(TOP_LEVEL) ?? [] }
}

/** 按 M/m 命令把 path 拆成独立 subpath（同色部件粘连时的手术刀，如牛仔帽檐） */
export function subpathsOf(pathEl: string): string[] {
  const d = /\bd="([^"]+)"/.exec(pathEl)?.[1]
  if (!d) return []
  const fill = /\bfill="([^"]+)"/.exec(pathEl)?.[1]
  const fillAttr = fill ? ` fill="${fill}"` : ''
  return d
    .split(/(?=[Mm])/g)
    .filter((s) => s.trim())
    .map((p) => `<path${fillAttr} d="${p.trim()}"/>`)
}

function replaceViewBox(open: string, viewBox: string): string {
  return open.replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`)
}

function applyRecolor(s: string, pairs: readonly (readonly [string, string])[]): string {
  let out = s
  for (const [from, to] of pairs) out = out.replaceAll(from, to)
  return out
}

// ── 动画 ────────────────────────────────────────────────────

/** 全体动画统一规格：10 帧 / 1 秒循环——效果整齐划一，未来新配方也照此编排 */
export const ANIM_SPEC = { frames: 10, durMs: 1000 } as const

/** 关键帧：t 为周期内相位 0..1（首尾值应闭环）；变换绕 (cx,cy) 施加 */
export interface PartKeyframe {
  readonly t: number
  readonly rotate?: number
  readonly tx?: number
  readonly ty?: number
  readonly scale?: number
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

export interface AnimRecipe {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  /** 部件拆解说明（Studio 详情页展示识别依据） */
  readonly anatomy: string
  readonly parts: readonly AnimPart[]
}

interface PartPose {
  rotate: number
  tx: number
  ty: number
  scale: number
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
    opacity: k.opacity ?? 1,
  })
  if (kfs.length === 0) return { rotate: 0, tx: 0, ty: 0, scale: 1, opacity: 1 }
  const phase = ((t % 1) + 1) % 1
  let prev = fill(kfs[kfs.length - 1]!)
  let prevT = prev.t - 1
  for (const kf of kfs) {
    const cur = fill(kf)
    if (phase <= cur.t) {
      const span = cur.t - prevT
      const r = span <= 0 ? 1 : (phase - prevT) / span
      const mix = (a: number, b: number): number => a + (b - a) * r
      return {
        rotate: mix(prev.rotate, cur.rotate),
        tx: mix(prev.tx, cur.tx),
        ty: mix(prev.ty, cur.ty),
        scale: mix(prev.scale, cur.scale),
        opacity: mix(prev.opacity, cur.opacity),
      }
    }
    prev = cur
    prevT = cur.t
  }
  // phase 落在末帧之后：向首帧（+1 周期）回绕插值
  const first = fill(kfs[0]!)
  const span = first.t + 1 - prevT
  const r = span <= 0 ? 1 : (phase - prevT) / span
  const mix = (a: number, b: number): number => a + (b - a) * r
  return {
    rotate: mix(prev.rotate, first.rotate),
    tx: mix(prev.tx, first.tx),
    ty: mix(prev.ty, first.ty),
    scale: mix(prev.scale, first.scale),
    opacity: mix(prev.opacity, first.opacity),
  }
}

const fmt = (n: number): string => {
  const r = Math.round(n * 1000) / 1000
  return Object.is(r, -0) ? '0' : String(r)
}

/** 把动画在相位 t 烘焙成一帧静态 SVG：部件包 <g> 写死 transform，其余元素原样保序 */
export function bakeAnimFrame(svg: string, recipe: AnimRecipe, t: number): string {
  const { open, els } = splitSvg(svg)
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
      ` rotate(${fmt(pose.rotate)}) scale(${fmt(pose.scale)})` +
      ` translate(${fmt(-cx)} ${fmt(-cy)})`
    const opacity = pose.opacity < 1 ? ` opacity="${fmt(pose.opacity)}"` : ''
    const members = part.indices.map((idx) => els[idx] ?? '').join('')
    out += `<g transform="${transform}"${opacity}>${members}</g>`
  })
  return `${open}${out}</svg>`
}

/** 部件动画花名册：每条 = 一个 emoji 的部件拆解 + 1 秒周期内的关键帧编排 */
export const ANIM_RECIPES: readonly AnimRecipe[] = [
  {
    emoji: '🤖',
    name: '机器人',
    desc: '红瞳左右扫视巡逻，天线上下浮动，双耳信号灯呼吸闪烁。',
    anatomy: '红瞳 = 仅有的两个 #DD2E44 圆；天线组在 viewBox 顶部；耳朵是两侧橙色椭圆。',
    parts: [
      // 双耳信号灯：opacity 呼吸一次
      {
        indices: [0, 1],
        keyframes: [
          { t: 0, opacity: 1 },
          { t: 0.5, opacity: 0.5 },
          { t: 1, opacity: 1 },
        ],
      },
      // 天线顶盘：上下浮动一次
      {
        indices: [3, 4],
        keyframes: [
          { t: 0, ty: 0 },
          { t: 0.5, ty: -1.1 },
          { t: 1, ty: 0 },
        ],
      },
      // 双眼红瞳：左右扫视一个来回
      {
        indices: [9, 13],
        keyframes: [
          { t: 0, tx: 0 },
          { t: 0.25, tx: 1.7 },
          { t: 0.5, tx: 0 },
          { t: 0.75, tx: -1.7 },
          { t: 1, tx: 0 },
        ],
      },
    ],
  },
  {
    emoji: '🐍',
    name: '毒蛇',
    desc: '分叉舌头快速吞吐两下再收回，眨一下眼，身体盘绕不动。',
    anatomy: '舌头 = 唯一的红色 path，位于头部朝向的延长线上；眼睛是黑色小圆。',
    parts: [
      // 舌头：前半周期吞吐两下，后半收拢
      {
        indices: [0],
        keyframes: [
          { t: 0, tx: 0, ty: 0 },
          { t: 0.12, tx: -2.4, ty: -0.4 },
          { t: 0.24, tx: -0.6, ty: -0.1 },
          { t: 0.36, tx: -2.4, ty: -0.4 },
          { t: 0.5, tx: 0, ty: 0 },
          { t: 1, tx: 0, ty: 0 },
        ],
      },
      // 眨眼：黑点瞬隐
      {
        indices: [2],
        keyframes: [
          { t: 0, opacity: 1 },
          { t: 0.7, opacity: 1 },
          { t: 0.78, opacity: 0 },
          { t: 0.86, opacity: 1 },
          { t: 1, opacity: 1 },
        ],
      },
    ],
  },
  {
    emoji: '🧟',
    name: '僵尸',
    desc: '躯干蹒跚摇摆，伸出的手前后抓挠，头部反相晃动——三组反相运动合成「挪步逼近」。',
    anatomy: '橙衫躯干在底部；灰白手掌是独立 path；头组（发/脸/五官）占上半。旋转轴分设肩/颈。',
    parts: [
      // 躯干（衫+暗部）：绕下摆摇摆
      {
        indices: [0, 1],
        cx: 18,
        cy: 32,
        keyframes: [
          { t: 0, rotate: -2 },
          { t: 0.5, rotate: 2 },
          { t: 1, rotate: -2 },
        ],
      },
      // 手掌：向前抓挠两下
      {
        indices: [2],
        keyframes: [
          { t: 0, tx: 0, ty: 0 },
          { t: 0.25, tx: -1.1, ty: 0.5 },
          { t: 0.5, tx: 0, ty: 0 },
          { t: 0.75, tx: -0.5, ty: 0.25 },
          { t: 1, tx: 0, ty: 0 },
        ],
      },
      // 头组：绕颈根反相摇摆
      {
        indices: [5, 6, 7, 8, 9, 10, 11],
        cx: 18,
        cy: 27,
        keyframes: [
          { t: 0, rotate: 2.2 },
          { t: 0.5, rotate: -2.2 },
          { t: 1, rotate: 2.2 },
        ],
      },
    ],
  },
  {
    emoji: '👻',
    name: '幽灵',
    desc: '双眼在眼窝内游移画圈（盯人感），嘴巴以自身中心一缩一张地「呜~」。',
    anatomy: '身体一整片 path；双眼 + 高光是三个圆；嘴是黑色斜椭圆 path，缩放锚点取其几何中心。',
    parts: [
      // 双眼：小菱形轨迹游移一圈
      {
        indices: [1, 2, 3],
        keyframes: [
          { t: 0, tx: 0, ty: 0 },
          { t: 0.25, tx: 0.9, ty: 0.5 },
          { t: 0.5, tx: 0, ty: 1 },
          { t: 0.75, tx: -0.9, ty: 0.5 },
          { t: 1, tx: 0, ty: 0 },
        ],
      },
      // 嘴：绕自身中心缩放
      {
        indices: [4],
        cx: 19.5,
        cy: 23.5,
        keyframes: [
          { t: 0, scale: 1 },
          { t: 0.3, scale: 0.8 },
          { t: 0.6, scale: 1 },
          { t: 0.8, scale: 1.18 },
          { t: 1, scale: 1 },
        ],
      },
    ],
  },
]

export function animRecipeOf(emoji: string): AnimRecipe | undefined {
  return ANIM_RECIPES.find((r) => r.emoji === emoji)
}

// ── 合并 ────────────────────────────────────────────────────

/** 从 B 抽取的部件：整个顶层元素（sub 缺省）或其中第 sub 个 subpath */
export interface MergePartRef {
  readonly index: number
  readonly sub?: number
}

export interface MergeRecipe {
  readonly a: string
  readonly b: string
  readonly name: string
  /** 配方手法标签（Studio 展示） */
  readonly method: string
  readonly desc: string
  /** A 的整体色相重映射（保持明暗关系的成对替换） */
  readonly recolorA?: readonly (readonly [string, string])[]
  /** 取 B 的哪些部件（缺省 = 整个 B） */
  readonly partsB?: readonly MergePartRef[]
  readonly recolorB?: readonly (readonly [string, string])[]
  /** B 的放置变换（translate/rotate/scale 组合） */
  readonly transformB: string
  readonly opacityB?: number
  /** B 垫在 A 之下（默认盖在上面） */
  readonly bBehindA?: boolean
  /** 扩容画布防裁切（缺省沿用 A 的 viewBox） */
  readonly viewBox?: string
}

/** 精品配方注册表：逐对调参过的组合；未命中的组合走 genericMergeRecipe 兜底 */
export const MERGE_RECIPES: readonly MergeRecipe[] = [
  {
    a: '🧟',
    b: '🤠',
    name: '牛仔僵尸',
    method: '部件移植',
    desc: '牛仔的帽檐与五官同色同 path，按 subpath 拆出第 4 段，连同帽顶帽带移植到僵尸头顶。',
    partsB: [{ index: 1, sub: 3 }, { index: 2 }, { index: 3 }],
    transformB: 'translate(4.6 -1.8) scale(0.77)',
    viewBox: '0 -3 36 39',
  },
  {
    a: '🍄',
    b: '👑',
    name: '精英蘑菇',
    method: '饰品叠加',
    desc: '皇冠整体缩小、旋转 9° 斜戴在菌伞顶。最廉价的配方：任何敌人 + 👑 即成精英变体。',
    transformB: 'translate(12.5 -4.5) rotate(9 6 6) scale(0.34)',
    viewBox: '0 -6 36 42',
  },
  {
    a: '👻',
    b: '🔥',
    name: '烈焰幽灵',
    method: '重映射+融合',
    desc: '幽灵灰白系整体映射为火焰橙，头顶接一簇火苗。惊恐表情 × 自燃，语义天然成立。',
    recolorA: [
      ['#E1E8ED', '#FFCC80'],
      ['#9AAAB4', '#FFE8CC'],
    ],
    recolorB: [
      ['#F4900C', '#E85319'],
      ['#FFCC4D', '#FFAC33'],
    ],
    transformB: 'translate(13.9 -4.6) scale(0.23)',
    viewBox: '0 -5.5 36 41.5',
  },
  {
    a: '🐗',
    b: '❄️',
    name: '冰霜野猪',
    method: '色相重映射',
    desc: '棕毛→冰蓝、深棕→靛蓝、獠牙提亮为雪白，额头缀一枚白色雪晶。明暗关系保留，立体感不丢。',
    recolorA: [
      ['#C1694F', '#85B9DC'],
      ['#662113', '#31618C'],
      ['#E1E8ED', '#F2FAFF'],
    ],
    recolorB: [['#88C9F9', '#FFFFFF']],
    transformB: 'translate(13.7 3.6) scale(0.24)',
    opacityB: 0.9,
  },
]

/** 查精品配方（含 a/b 反序，反序按注册方向合成）；未命中返回 null → 走 fusionRecipe */
export function findMergeRecipe(a: string, b: string): MergeRecipe | null {
  return (
    MERGE_RECIPES.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a)) ?? null
  )
}

// ── 通用融合（未收录组合的程序化真合并）────────────────────────
// A 的形体 + B 的配色：提取双方色板（按图形数据量近似面积加权、排除眼睛等
// 保护色），A 的主色系按明暗序映射到 B 的主色系（B 色不足时以主色生成明暗
// 变体补足，保住 A 的立体层次），再把 B 本体缩小栖在 A 头顶保留识别度。

/** 不参与融合的保护色：眼睛/线条近黑与眼白高光，保证五官可读 */
const PROTECTED_FILLS = new Set(['#292F33', '#31373D', '#000000', '#000', '#FFFFFF', '#FFF', '#F5F8FA'])

/** 提取 SVG 色板：fill → 图形数据量权重（d/半径长度近似面积），降序 */
export function extractPalette(svg: string): { color: string; weight: number }[] {
  const { els } = splitSvg(svg)
  const weights = new Map<string, number>()
  for (const el of els) {
    const fill = /\bfill="(#[0-9a-fA-F]{3,6})"/.exec(el)?.[1]?.toUpperCase()
    if (!fill || PROTECTED_FILLS.has(fill)) continue
    const d = /\bd="([^"]+)"/.exec(el)?.[1]
    // circle/ellipse 无 d：按半径估权重；g 内多形状：整段长度
    const w = d ? d.length : el.length / 2
    weights.set(fill, (weights.get(fill) ?? 0) + w)
  }
  return [...weights.entries()]
    .map(([color, weight]) => ({ color, weight }))
    .sort((x, y) => y.weight - x.weight)
}

function hexToRgb(hex: string): [number, number, number] {
  const s = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]
}

function luma(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** 明暗变体：RGB 按比例向白/黑插值（k>0 变亮，k<0 变暗） */
export function shadeHex(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex)
  const to = (c: number): number => {
    const v = k > 0 ? c + (255 - c) * k : c * (1 + k)
    return Math.max(0, Math.min(255, Math.round(v)))
  }
  const h = (n: number): string => n.toString(16).padStart(2, '0').toUpperCase()
  return `#${h(to(r))}${h(to(g))}${h(to(b))}`
}

/** A 全色板 → B 主色的明暗梯度映射：A 每色按自身亮度在色板中的位置，
 * 落到 B 主色的对应明暗档上——整体色调统一为 B 系，明暗层次严格保留 */
export function fusionRecolor(
  palA: readonly { color: string; weight: number }[],
  palB: readonly { color: string; weight: number }[],
): [string, string][] {
  if (palA.length === 0 || palB.length === 0) return []
  const base = palB[0]!.color
  const lumas = palA.map((p) => luma(p.color))
  const lo = Math.min(...lumas)
  const hi = Math.max(...lumas)
  return palA.map((p, i) => {
    const t = hi > lo ? (lumas[i]! - lo) / (hi - lo) : 0.5
    return [p.color, shadeHex(base, (t - 0.5) * 1.1)]
  })
}

/** 通用融合配方：需要双方 SVG 文本才能算出换色映射 */
export function fusionRecipe(a: string, b: string, svgA: string, svgB: string): MergeRecipe {
  return {
    a,
    b,
    name: '元素融合',
    method: '色板注入',
    desc: 'B 的配色按明暗层次注入 A 全身（眼睛等保护色不动），B 本体缩小栖在头顶。',
    recolorA: fusionRecolor(extractPalette(svgA), extractPalette(svgB)),
    transformB: 'translate(9.9 -14.7) scale(0.45)',
    viewBox: '-8 -15.5 52 52',
  }
}

/** 合并主函数：svgA/svgB 为两个原始 twemoji 文本，按配方产出新 SVG */
export function mergeSvg(svgA: string, svgB: string, recipe: MergeRecipe): string {
  const a = splitSvg(svgA)
  const b = splitSvg(svgB)
  let bodyA = a.els.join('')
  if (recipe.recolorA) bodyA = applyRecolor(bodyA, recipe.recolorA)
  let partB: string
  if (recipe.partsB) {
    partB = recipe.partsB
      .map((ref) => {
        const el = b.els[ref.index] ?? ''
        if (ref.sub === undefined) return el
        return subpathsOf(el)[ref.sub] ?? ''
      })
      .join('')
  } else {
    partB = b.els.join('')
  }
  if (recipe.recolorB) partB = applyRecolor(partB, recipe.recolorB)
  const opacity = recipe.opacityB !== undefined ? ` opacity="${recipe.opacityB}"` : ''
  const overlay = `<g transform="${recipe.transformB}"${opacity}>${partB}</g>`
  const open = recipe.viewBox ? replaceViewBox(a.open, recipe.viewBox) : a.open
  const body = recipe.bBehindA ? overlay + bodyA : bodyA + overlay
  return `${open}${body}</svg>`
}

/** 合并页候选池：游戏在用的形象 + 元素/饰品素材（精品配方的原料都在列） */
export const MERGE_POOL: readonly string[] = [
  // 角色
  '🤹', '🦄', '🧌', '🤠', '🧙', '🦘', '🤖', '⛄',
  // 敌人 + Boss
  '🧟', '👻', '👾', '🐗', '🐍', '🍄', '🐀', '🫧', '👹',
  // 元素 / 饰品
  '👑', '🔥', '❄️', '⚡', '🎩', '🕶️', '💀', '🌈', '💎',
]
