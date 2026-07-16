// Emoji Studio 纯逻辑层：twemoji 部件动画的配方与烘焙函数。
// twemoji 无语义标签，部件识别靠「固定色板 + getBBox 边界 + 绘制顺序」人工判读后
// 沉淀为配方数据；本层只做纯字符串变换（禁 DOM），原始 SVG 永不改动。
// 动画配方 = 部件分组关键帧 + fx 程序化效果层，按统一规格烘焙成
// N 帧静态 SVG → N 张纹理循环播放（与未来战斗内落地同一条管线）。

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

function replaceViewBox(open: string, viewBox: string): string {
  return open.replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`)
}

// ── 动画 ────────────────────────────────────────────────────

/** 全体动画统一规格：10 帧 / 1 秒循环——效果整齐划一，未来新配方也照此编排 */
export const ANIM_SPEC = { frames: 10, durMs: 1000 } as const

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
  return `${openTag}${fxAt('back')}${out}${fxAt('front')}</svg>`
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
export function fxSparkles(
  stars: readonly { x: number; y: number; r: number; phase: number; color?: string }[],
): FxLayer {
  return {
    layer: 'front',
    render: (t) =>
      stars
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
export function fxBolts(
  bolts: readonly {
    points: readonly (readonly [number, number])[]
    window: readonly [number, number]
    color?: string
    width?: number
  }[],
): FxLayer {
  return {
    layer: 'front',
    render: (t) =>
      bolts
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
export function fxSteam(
  wisps: readonly { x: number; y0: number; phase: number }[],
): FxLayer {
  return {
    layer: 'front',
    render: (t) =>
      wisps
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
  // ── 以下配方展示 fx 能力：为静态物品程序化生成原本不存在的 path ──
  {
    emoji: '🔥',
    name: '火焰',
    desc: '双层火苗反相摇曳，四颗火星从焰心升起——渐小、随风摆、熄灭，循环不息。',
    anatomy: '本体仅外焰/内焰两个 path（绕焰底反相摆动）；火星是程序化新建的四芒星 path，逐帧计算位置与明暗。',
    viewBox: '0 -5 36 41',
    parts: [
      // 外焰：绕焰底摇曳
      {
        indices: [0],
        cx: 18,
        cy: 34,
        keyframes: [
          { t: 0, rotate: -2.4, scaleY: 1 },
          { t: 0.25, rotate: 0, scaleY: 1.025 },
          { t: 0.5, rotate: 2.4, scaleY: 1 },
          { t: 0.75, rotate: 0, scaleY: 0.985 },
          { t: 1, rotate: -2.4, scaleY: 1 },
        ],
      },
      // 内焰：反相摆 + 呼吸
      {
        indices: [1],
        cx: 18,
        cy: 35,
        keyframes: [
          { t: 0, rotate: 2, scale: 1 },
          { t: 0.5, rotate: -2, scale: 1.05 },
          { t: 1, rotate: 2, scale: 1 },
        ],
      },
    ],
    fx: [
      // 火星从焰尖上方的空域升起：亮金/深橙交替，与焰体拉开对比
      fxRise({
        particles: [
          { x: 13, phase: 0, size: 1.7, color: '#FFD983' },
          { x: 21.5, phase: 0.31, size: 1.3, color: '#E85319', drift: 1.3 },
          { x: 16.5, phase: 0.55, size: 1.8, color: '#FFD983' },
          { x: 24.5, phase: 0.78, size: 1.1, color: '#E85319', drift: 0.7 },
        ],
        y0: 7,
        y1: -4,
      }),
    ],
  },
  {
    emoji: '🪙',
    name: '金币',
    desc: '一道高光斜扫过币面（裁剪在圆内不越界），边缘三颗星光错相闪烁——金光闪闪。',
    anatomy: '本体 15 个元素全部静止；高光条与四芒星都是新建 path，高光用程序化 clipPath 裁在币面圆内。',
    parts: [],
    fx: [
      fxShineSweep({ clip: { cx: 18, cy: 18, r: 16.2 }, id: 'coin-shine' }),
      fxSparkles([
        { x: 5.5, y: 7.5, r: 2.4, phase: 0 },
        { x: 30.5, y: 25, r: 1.9, phase: 0.33 },
        { x: 27, y: 5.5, r: 1.6, phase: 0.66 },
      ]),
    ],
  },
  {
    emoji: '⚡',
    name: '闪电',
    desc: '本体充能鼓胀、亮度脉动，三道小电弧在周围错时炸开，一颗电光闪过。',
    anatomy: '本体是单个 path（缩放+明暗脉冲）；电弧是新建的折线 path，各自只在周期的一小段窗口内闪现。',
    parts: [
      {
        indices: [0],
        cx: 18,
        cy: 18,
        keyframes: [
          { t: 0, scale: 1, opacity: 0.82 },
          { t: 0.18, scale: 1.05, opacity: 1 },
          { t: 0.36, scale: 1, opacity: 0.86 },
          { t: 0.6, scale: 1.04, opacity: 1 },
          { t: 1, scale: 1, opacity: 0.82 },
        ],
      },
    ],
    fx: [
      fxBolts([
        { points: [[6, 8], [9, 10.5], [7, 13], [10, 15.5]], window: [0.12, 0.24] },
        { points: [[30.5, 14], [27.5, 16], [29.5, 19], [26.5, 21.5]], window: [0.55, 0.68] },
        { points: [[10, 27], [13, 28], [11.5, 31]], window: [0.82, 0.92] },
      ]),
      fxSparkles([{ x: 28, y: 6, r: 2.1, phase: 0.4, color: '#FFE8B6' }]),
    ],
  },
  {
    emoji: '💧',
    name: '水滴',
    desc: '一颗水珠淡入、坠落、触底压扁又回弹（挤压拉伸），底部漾开两圈涟漪后消散。',
    anatomy: '本体单 path 走「位移+不等比缩放」的经典 squash & stretch；涟漪椭圆环是新建 path，只在触底后的相位窗内扩散。',
    viewBox: '0 -8 36 44',
    parts: [
      {
        indices: [0],
        cx: 18,
        cy: 35,
        keyframes: [
          { t: 0, ty: -9, opacity: 0 },
          { t: 0.1, ty: -9, opacity: 1 },
          { t: 0.3, ty: 0, scaleX: 1, scaleY: 1 },
          { t: 0.38, scaleX: 1.24, scaleY: 0.74 },
          { t: 0.48, scaleX: 0.94, scaleY: 1.05 },
          { t: 0.56, scaleX: 1, scaleY: 1 },
          { t: 0.85, scaleX: 1, scaleY: 1, opacity: 1 },
          // 透明期把水珠搬回顶部，闭环衔接下一次坠落
          { t: 0.93, ty: 0, opacity: 0 },
          { t: 1, ty: -9, opacity: 0 },
        ],
      },
    ],
    fx: [
      fxRipples({
        cx: 18,
        cy: 33.5,
        color: '#5DADEC',
        rings: [{ phase: 0 }, { phase: 0.16 }],
        window: [0.3, 0.85],
      }),
    ],
  },
  {
    emoji: '👹',
    name: '赤鬼',
    desc: '红脸怒气起伏，双瞳收缩瞪视，头顶两缕怒气蒸腾而上——Boss 的待机威压。',
    anatomy: '红脸 path 呼吸缩放；两只瞳孔是独立圆，各绕自身中心收放；蒸汽是新建的 S 形描边 path，升起淡出。',
    viewBox: '0 -7 36 43',
    parts: [
      // 红脸：呼吸
      {
        indices: [1],
        cx: 18,
        cy: 22,
        keyframes: [
          { t: 0, scale: 1 },
          { t: 0.5, scale: 1.018 },
          { t: 1, scale: 1 },
        ],
      },
      // 左瞳：收缩瞪视
      {
        indices: [6],
        cx: 12.74,
        cy: 17.71,
        keyframes: [
          { t: 0, scale: 1 },
          { t: 0.35, scale: 0.72 },
          { t: 0.55, scale: 1.18 },
          { t: 0.75, scale: 1 },
          { t: 1, scale: 1 },
        ],
      },
      // 右瞳：同步收放
      {
        indices: [8],
        cx: 23.26,
        cy: 17.71,
        keyframes: [
          { t: 0, scale: 1 },
          { t: 0.35, scale: 0.72 },
          { t: 0.55, scale: 1.18 },
          { t: 0.75, scale: 1 },
          { t: 1, scale: 1 },
        ],
      },
      // 眉弓：随怒气微皱
      {
        indices: [12],
        keyframes: [
          { t: 0, ty: 0 },
          { t: 0.35, ty: 0.6 },
          { t: 0.55, ty: -0.3 },
          { t: 1, ty: 0 },
        ],
      },
    ],
    fx: [
      fxSteam([
        { x: 10.5, y0: -0.5, phase: 0 },
        { x: 25.5, y0: -0.5, phase: 0.5 },
      ]),
    ],
  },
]

export function animRecipeOf(emoji: string): AnimRecipe | undefined {
  return ANIM_RECIPES.find((r) => r.emoji === emoji)
}
