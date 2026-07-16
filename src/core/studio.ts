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
  readonly durMs: number
  /** 烘焙帧数：每帧一张纹理，显存与流畅度的折中 */
  readonly frames: number
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

/** 部件动画花名册：每条 = 一个 emoji 的部件拆解 + 关键帧编排 */
export const ANIM_RECIPES: readonly AnimRecipe[] = [
  {
    emoji: '🤖',
    name: '机器人',
    desc: '红瞳左右扫视（带停顿的巡逻节奏），天线上下浮动，双耳信号灯呼吸闪烁。',
    anatomy: '红瞳 = 仅有的两个 #DD2E44 圆；天线组在 viewBox 顶部；耳朵是两侧橙色椭圆。',
    durMs: 4000,
    frames: 10,
    parts: [
      // 双耳信号灯：opacity 呼吸 ×2
      {
        indices: [0, 1],
        keyframes: [
          { t: 0, opacity: 1 },
          { t: 0.25, opacity: 0.55 },
          { t: 0.5, opacity: 1 },
          { t: 0.75, opacity: 0.55 },
          { t: 1, opacity: 1 },
        ],
      },
      // 天线顶盘：上下浮动 ×3
      {
        indices: [3, 4],
        keyframes: [
          { t: 0, ty: 0 },
          { t: 1 / 6, ty: -1.1 },
          { t: 2 / 6, ty: 0 },
          { t: 3 / 6, ty: -1.1 },
          { t: 4 / 6, ty: 0 },
          { t: 5 / 6, ty: -1.1 },
          { t: 1, ty: 0 },
        ],
      },
      // 双眼红瞳：同步左右扫视，两端各停一拍
      {
        indices: [9, 13],
        keyframes: [
          { t: 0, tx: 0 },
          { t: 0.12, tx: 1.7 },
          { t: 0.3, tx: 1.7 },
          { t: 0.45, tx: -1.7 },
          { t: 0.72, tx: -1.7 },
          { t: 0.85, tx: 0 },
          { t: 1, tx: 0 },
        ],
      },
    ],
  },
  {
    emoji: '🐍',
    name: '毒蛇',
    desc: '分叉舌头快速吞吐两下、停顿、再吞吐，眼睛偶尔眨一下，身体盘绕不动。',
    anatomy: '舌头 = 唯一的红色 path，位于头部朝向的延长线上；眼睛是黑色小圆。',
    durMs: 3000,
    frames: 10,
    parts: [
      // 舌头：吐-半收-再吐-收，前半周期静止
      {
        indices: [0],
        keyframes: [
          { t: 0, tx: 0, ty: 0 },
          { t: 0.5, tx: 0, ty: 0 },
          { t: 0.58, tx: -2.4, ty: -0.4 },
          { t: 0.66, tx: -0.6, ty: -0.1 },
          { t: 0.74, tx: -2.4, ty: -0.4 },
          { t: 0.82, tx: 0, ty: 0 },
          { t: 1, tx: 0, ty: 0 },
        ],
      },
      // 眨眼：黑点瞬隐
      {
        indices: [2],
        keyframes: [
          { t: 0, opacity: 1 },
          { t: 0.88, opacity: 1 },
          { t: 0.92, opacity: 0 },
          { t: 0.96, opacity: 1 },
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
    durMs: 1700,
    frames: 8,
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
    desc: '双眼在眼窝内缓慢游移画圈（盯人感），嘴巴以自身中心一缩一张地「呜~」。',
    anatomy: '身体一整片 path；双眼 + 高光是三个圆；嘴是黑色斜椭圆 path，缩放锚点取其几何中心。',
    durMs: 3200,
    frames: 10,
    parts: [
      // 双眼：小菱形轨迹游移
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

/** 兜底配方：B 缩小叠在 A 右上角当徽章——保证任意组合都有结果 */
export function genericMergeRecipe(a: string, b: string): MergeRecipe {
  return {
    a,
    b,
    name: '自由合成',
    method: '徽章叠加',
    desc: '未收录的组合走通用配方：B 缩小叠在 A 的右上角。调参后可晋升为精品配方。',
    transformB: 'translate(19 -4) scale(0.45)',
    viewBox: '-1 -5 38 42',
  }
}

/** 查配方：精品注册表命中（含 a/b 反序，反序按注册方向合成）→ 否则通用兜底 */
export function findMergeRecipe(a: string, b: string): MergeRecipe {
  const hit = MERGE_RECIPES.find(
    (r) => (r.a === a && r.b === b) || (r.a === b && r.b === a),
  )
  return hit ?? genericMergeRecipe(a, b)
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
