import type Phaser from 'phaser'
import { UNIT } from '../../util/units'
import { cellEdge, cellNearest, fbm, valueNoise } from '../../util/noise'
import { Rng } from '../../util/rng'
import { heightM, NEAR, nearAt, outward, poolField, roomOf, skyAbove } from '../worlds/cave'
import type { CaveLayout, CaveLight, Opening, Rock } from '../worlds/cave'

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const frac = (x: number): number => x - Math.floor(x)

type Rgb = [number, number, number]

function mixTo(c: Rgb, r: number, g: number, b: number, t: number): void {
  c[0] += (r - c[0]) * t
  c[1] += (g - c[1]) * t
  c[2] += (b - c[2]) * t
}

function scale(c: Rgb, k: number): void {
  c[0] *= k
  c[1] *= k
  c[2] *= k
}

/** 地面贴图、高度图、天窗图与照度场都盖住同一块：地图连同镜头能看到的一圈，像素 */
export interface Field {
  readonly x0: number
  readonly y0: number
  readonly w: number
  readonly h: number
}

export function fieldOf(L: CaveLayout): Field {
  return { x0: L.rock.x0, y0: L.rock.y0, w: L.w - 2 * L.rock.x0, h: L.h - 2 * L.rock.y0 }
}

/** 石笋背着天窗拖的影子最长几格 */
export const STALAGMITE_SHADOW_U = 1.2

/** 烘进固有色的小起伏（碎石、石块、石笋）按头顶略偏画面上方的光打：洞里的光多半从天窗往下来 */
const BAKE_Y = -0.3 / Math.hypot(0.3, 1)
const BAKE_Z = 1 / Math.hypot(0.3, 1)

/** 法线是 (nx, ny, 1) 的小斜面朝着烘焙光有多亮 */
function facetLit(nx: number, ny: number): number {
  return Math.max(0, (ny * BAKE_Y + BAKE_Z) / Math.hypot(nx, ny, 1))
}

/** 洞里的天光从哪边来：各个天窗按张开的立体角加权的方向（单位向量，z 朝上），越近、越大的天窗占得越多 */
function skyward(L: CaveLayout, x: number, y: number): { x: number; y: number; z: number } {
  const up = L.ceilingM * UNIT
  let sx = 0
  let sy = 0
  let sz = 0
  for (const o of L.openings) {
    const dx = o.x - x
    const dy = o.y - y
    const d2 = dx * dx + dy * dy + up * up
    const w = (o.r * o.r) / (d2 * Math.sqrt(d2))
    sx += dx * w
    sy += dy * w
    sz += up * w
  }
  const len = Math.hypot(sx, sy, sz)
  return len > 0 ? { x: sx / len, y: sy / len, z: sz / len } : { x: 0, y: 0, z: 1 }
}

/** 背着光拖出的一条淡影：(dx, dy) 是这一点离物体中心的偏移，物体半径 r，影长 len（都按像素），light 是光来的方向 */
function castShadow(c: Rgb, dx: number, dy: number, r: number, len: number, light: { x: number; y: number }, strength: number): void {
  const hl = Math.hypot(light.x, light.y)
  if (hl < 1e-6 || len <= 0) return
  const ex = (-light.x / hl) * len
  const ey = (-light.y / hl) * len
  const t = clamp01((dx * ex + dy * ey) / (ex * ex + ey * ey))
  const q = Math.hypot(dx - ex * t, dy - ey * t) / (r * (1 - 0.45 * t))
  if (q < 1.25) scale(c, 1 - strength * smooth(1.25, 0.45, q) * (1 - 0.7 * t))
}

/** 一块圆滚的石头：(dx, dy) 是这一点离石心的偏移，rad 是半径（同一单位），w 是盖上去的分量；背光一侧投一小片影子 */
function pebble(c: Rgb, dx: number, dy: number, rad: number, r: number, g: number, b: number, w: number): void {
  const d = Math.hypot(dx, dy) / rad
  if (d < 1) {
    const lit = Math.max(0, (dy / rad) * BAKE_Y + Math.sqrt(1 - d * d) * BAKE_Z)
    const tone = 0.6 + 0.5 * lit
    mixTo(c, r * tone, g * tone, b * tone, w * smooth(1, 0.8, d))
    return
  }
  const sd = Math.hypot(dx, dy - rad * 0.4) / rad
  if (sd < 1.3) scale(c, 1 - 0.34 * w * smooth(1.3, 0.85, sd))
}

/** 塌落的石块：每块一个斜面，按烘焙光分出明暗，块与块之间是暗缝；freq 是每格几块 */
function rubble(c: Rgb, gx: number, gy: number, freq: number, seed: number, w: number): void {
  const q = cellNearest(gx * freq, gy * freq, seed)
  const tone = (0.42 + 0.72 * facetLit((frac(q.h * 71.31) - 0.5) * 1.3, (frac(q.h * 113.73) - 0.5) * 1.3)) * (0.86 + 0.26 * frac(q.h * 7.7))
  mixTo(c, 108 * tone, 99 * tone, 86 * tone, w)
  mixTo(c, 34, 29, 25, w * smooth(0.11, 0.03, cellEdge(gx * freq, gy * freq, seed)) * 0.9)
}

/** 从上往下看的一丛蕨：几片羽状的叶从中心散开，叶尖收细；(dx, dy) 是离中心的偏移，rad 是叶长 */
function fern(c: Rgb, dx: number, dy: number, rad: number, h: number, w: number): void {
  const d = Math.hypot(dx, dy) / rad
  if (d >= 1) return
  const blades = 5 + Math.floor(h * 4)
  const across = Math.abs(Math.sin(((Math.atan2(dy, dx) + h * 40) * blades) / 2))
  const leaf = smooth(0.5 * (1 - d) + 0.06, 0.02, across) * smooth(1, 0.75, d)
  if (leaf <= 0) return
  const k = (0.75 + 0.35 * (0.5 + 0.5 * Math.sin(d * 46))) * (0.8 + 0.4 * (1 - d))
  mixTo(c, 50 * k, 86 * k, 40 * k, w * leaf)
}

/**
 * 地面的固有色（不含方向光，光照在着色器里随太阳、月亮与火把实时算），ppu 是每格多少像素，只画第 r0 到 r1 行。
 * 洞底是灰黄的流石，流石上有一道道细小的边石坝，低处积着褐色的泥、干了裂成小块，散着几块圆石；洞壁脚下潮湿、堆着碎石；
 * 天窗下是塌落的石块，长着苔藓与蕨；水潭是钙华坝围着的清水，潭底发白、越深越青；石笋是一圈圈长高的钙华锥，尖上湿亮；
 * 石柱是一截粗壮的钙华柱，顶面斑驳、边上一道道竖棱，脚下一圈流石裙；石笋与石柱朝天窗的一侧亮，背着天窗拖一条淡影；洞壁是垂下的石幔与一道道岩层，越往上越暗，再往外是岩体
 */
export function paintAlbedo(L: CaveLayout, ppu: number, out: Uint8ClampedArray, r0: number, r1: number): void {
  const f = fieldOf(L)
  const W = Math.round((f.w / UNIT) * ppu)
  const s = L.seed
  const wallPx = L.wallU * UNIT
  const c: Rgb = [0, 0, 0]
  const near = L.near
  for (let py = r0; py < r1; py++) {
    const wy = f.y0 + ((py + 0.5) / ppu) * UNIT
    const gy = wy / UNIT
    for (let px = 0; px < W; px++) {
      const wx = f.x0 + ((px + 0.5) / ppu) * UNIT
      const gx = wx / UNIT
      const shell = roomOf(L.shell, wx, wy)
      const grain = valueNoise(gx * 6, gy * 6, s + 9) * 0.5 + valueNoise(gx * 15, gy * 15, s + 11) * 0.5
      if (shell < 0) {
        const t = -shell / wallPx
        const n = outward(L.shell, wx, wy)
        const along = gx * -n.y + gy * n.x
        const drape = 0.5 + 0.5 * Math.sin(along * 7 + fbm(along * 0.9, t * 0.5, s + 71, 3) * 9)
        const bed = smooth(0.35, 0.65, fbm(along * 0.35, t * 3.2, s + 75, 2))
        c[0] = 112
        c[1] = 95
        c[2] = 76
        mixTo(c, 86, 70, 55, smooth(0.4, 0.7, fbm(along * 0.5, t * 1.8, s + 81, 2)))
        scale(c, (0.8 + 0.2 * drape) * (0.92 + 0.12 * bed) * (1 - 0.72 * Math.min(1, t) ** 1.15))
        const mass = smooth(0.85, 1.15, t)
        if (mass > 0) {
          const k = (0.8 + 0.4 * fbm(gx / 2.5, gy / 2.5, s + 85, 2)) * (1 - 0.35 * smooth(0.06, 0.015, cellEdge(gx * 0.7, gy * 0.7, s + 87)))
          mixTo(c, 31 * k, 27 * k, 24 * k, mass)
        }
      } else {
        // 流石：灰黄的石灰岩，大片的明暗起伏，一道道小坝的坝顶亮、坝下暗
        const big = fbm(gx / 6, gy / 6, s + 3, 2)
        c[0] = 100 + 34 * big
        c[1] = 87 + 28 * big
        c[2] = 70 + 20 * big
        const mud = smooth(0.56, 0.72, fbm(gx / 4.5, gy / 4.5, s + 21, 2))
        const step = frac(fbm(gx / 1.7 + 3, gy / 1.7, s + 31, 3) * 6.5)
        scale(c, 1 + (0.12 * smooth(0.8, 0.97, step) - 0.12 * smooth(0.1, 0, step)) * (1 - mud))
        // 泥：低处的褐色黏土，干了裂成小块
        if (mud > 0) {
          const k = 0.92 + 0.12 * grain
          mixTo(c, 82 * k, 64 * k, 49 * k, mud * 0.9)
          scale(c, 1 - 0.38 * mud * smooth(0.07, 0.02, cellEdge(gx * 2.2, gy * 2.2, s + 23)))
        }
        // 洞壁脚下：潮湿发暗，堆着从壁上掉下的碎石，越贴着壁越多
        const shellU = shell / UNIT
        const wet = 1 - smooth(0.2, 1.8, shellU)
        scale(c, 1 - 0.26 * wet)
        c[2] += 3 * wet
        const q = cellNearest(gx * 2.3, gy * 2.3, s + 41)
        if (q.h > 0.9 - 0.62 * (1 - smooth(0.1, 1.3, shellU))) {
          const rad = (0.16 + 0.12 * frac(q.h * 37.7)) * (1.15 - 0.4 * smooth(0.1, 1.3, shellU))
          const k = 1 - 0.26 * wet
          pebble(c, q.dx, q.dy, rad, 112 * k, 100 * k, 84 * k, 1)
        }
        scale(c, 1 - 0.24 * (1 - smooth(0, 0.9, shellU)))
        const { from, to } = nearAt(near, wx, wy)
        for (let k = from; k < to; k++) {
          const code = near.items[k]!
          const kind = code >> 16
          const idx = code & 0xffff
          if (kind === NEAR.mound) {
            const m = L.mounds[idx]!
            const o = L.openings[idx]!
            const d = Math.hypot(wx - m.x, wy - m.y) / m.r + 0.14 * (fbm(gx * 1.2, gy * 1.2, s + 53, 2) - 0.5)
            const wM = smooth(1.05, 0.72, d)
            if (wM > 0) {
              rubble(c, gx, gy, 1.25, s + 51, wM)
              const b = cellNearest(gx * 3.4, gy * 3.4, s + 57)
              if (b.h > 0.5) pebble(c, b.dx, b.dy, 0.2 + 0.14 * b.h, 116, 106, 92, wM)
            }
            // 天窗下见得着天的地方长苔藓与蕨
            const rel = Math.hypot(wx - o.x, wy - o.y) / o.r
            const moss = smooth(1.25, 0.6, rel) * smooth(0.36, 0.58, fbm(gx * 0.8, gy * 0.8, s + 61, 2))
            if (moss > 0) {
              const tuft = 0.78 + 0.44 * grain
              mixTo(c, 70 * tuft, 94 * tuft, 46 * tuft, moss * 0.85)
              const fq = cellNearest(gx * 1.6, gy * 1.6, s + 63)
              if (fq.h > 0.3) fern(c, fq.dx, fq.dy, 0.45 + 0.2 * fq.h, fq.h, smooth(0.2, 0.5, moss))
            }
          } else if (kind === NEAR.pool) {
            const pf = poolField(L.pools[idx]!, wx, wy)
            if (pf > -0.3) {
              // 潭边渗湿的一圈
              if (pf < 0) scale(c, 1 - 0.2 * smooth(-0.3, -0.04, pf))
              if (pf > 0) {
                // 潭底是白一些的钙华，隔着清水偏青，越深越暗；潭里还有一级低一些的坝
                const depth = Math.min(1, pf * 2.2)
                mixTo(c, 146, 138, 118, 0.6)
                c[0] *= 0.74 - 0.42 * depth
                c[1] *= 0.88 - 0.3 * depth
                c[2] *= 0.9 - 0.25 * depth
                mixTo(c, 150, 158, 140, Math.exp(-(((pf - 0.34) / 0.03) ** 2)) * 0.22)
              }
              // 坝顶：一圈奶白的钙华
              mixTo(c, 204, 190, 158, Math.exp(-(((pf + 0.02) / 0.05) ** 2)) * 0.85)
            }
          } else if (kind === NEAR.column) {
            const col = L.columns[idx]!
            const dx = wx - col.x
            const dy = wy - col.y
            const dd = Math.hypot(dx, dy)
            const light = skyward(L, col.x, col.y)
            if (dd < col.r) {
              // 石柱从上往下看是一截粗壮的钙华柱：顶面是斑驳的石面，边上一道道竖棱，朝天窗的边亮、背着的边暗
              const flute = 0.5 + 0.5 * Math.sin(Math.atan2(dy, dx) * 13 + 3 * fbm(gx * 2, gy * 2, s + 93, 2))
              const bevel = smooth(0.72, 1, dd / col.r)
              const facing = (dx * light.x + dy * light.y) / (dd || 1)
              const k = (0.82 + 0.18 * fbm(gx * 2.6, gy * 2.6, s + 95, 3) + bevel * (0.34 * facing - 0.14)) * (1 - 0.14 * bevel * flute)
              mixTo(c, 140 * k, 124 * k, 100 * k, smooth(col.r, col.r - 0.04 * UNIT, dd))
            } else {
              // 柱脚一圈流石裙，贴着柱子的地方暗；背着天窗拖一条淡影
              const apron = 1 - (dd - col.r) / (0.6 * UNIT)
              if (apron > 0) {
                mixTo(c, 146, 130, 106, apron * 0.45)
                scale(c, 1 - 0.3 * smooth(0.5, 1, apron))
              }
              castShadow(c, dx, dy, col.r, Math.min(1.6 * UNIT, (1.4 * UNIT * Math.hypot(light.x, light.y)) / Math.max(light.z, 0.3)), light, 0.32)
            }
          } else if (kind === NEAR.stalagmite) {
            const st = L.stalagmites[idx]!
            const dx = wx - st.x
            const dy = wy - st.y
            const dd = Math.hypot(dx, dy)
            const d = dd / st.r
            const light = skyward(L, st.x, st.y)
            if (d < 1) {
              // 圆锥的坡面按坡度与朝向受天窗的光；一圈圈长高留下的环纹，尖上是湿亮的新钙华
              const slope = (st.h * UNIT) / st.r
              const ux = dx / (dd || 1)
              const uy = dy / (dd || 1)
              const lit = Math.max(0, (ux * slope * light.x + uy * slope * light.y + light.z) / Math.hypot(slope, 1))
              const ring = 0.5 + 0.5 * Math.sin((dd / UNIT) * 38 + st.h * 3)
              const tip = (1 - d) ** 2
              const tone = (0.55 + 0.7 * lit) * (0.94 + 0.06 * ring)
              mixTo(c, (130 + 70 * tip) * tone, (112 + 74 * tip) * tone, (88 + 72 * tip) * tone, smooth(1, 0.9, d))
              if (d < 0.2) mixTo(c, 228, 222, 204, smooth(0.2, 0.04, d) * 0.8)
            } else {
              // 脚下一圈接触阴影，背着天窗拖一条淡影，越高拖得越长
              if (d < 1.45) scale(c, 1 - 0.3 * smooth(1.45, 1, d))
              castShadow(c, dx, dy, st.r, Math.min(STALAGMITE_SHADOW_U * UNIT, (0.5 * st.h * UNIT * Math.hypot(light.x, light.y)) / Math.max(light.z, 0.3)), light, 0.3)
            }
          } else if (kind === NEAR.glow) {
            const g = L.glows[idx]!
            const d = Math.hypot(wx - g.x, wy - g.y) / g.r
            if (d < 1.3) {
              // 荧光丛：一片潮湿的暗绿苔，上面一簇簇小菌盖
              mixTo(c, 56, 62, 50, smooth(1.3, 0.55, d) * 0.5)
              const cap = cellNearest(gx * 7, gy * 7, s + 91 + idx)
              const cd = Math.hypot(cap.dx, cap.dy) / (0.12 + 0.12 * cap.h)
              if (cap.h > 0.35 && cd < 1 && d < 1) {
                const k = 0.75 + 0.35 * Math.max(0, (cap.dy / (0.12 + 0.12 * cap.h)) * BAKE_Y + Math.sqrt(Math.max(0, 1 - cd * cd)) * BAKE_Z)
                if (g.hue < 0.5) mixTo(c, 170 * k, 214 * k, 200 * k, smooth(1, 0.7, cd))
                else mixTo(c, 196 * k, 220 * k, 150 * k, smooth(1, 0.7, cd))
              }
            }
          }
        }
      }
      scale(c, 0.95 + 0.1 * grain)
      const o = ((py - r0) * W + px) * 4
      out[o] = c[0]
      out[o + 1] = c[1]
      out[o + 2] = c[2]
      out[o + 3] = 255
    }
  }
}

/** 高度图每格多少像素 */
export const RELIEF_PPU = 16
/** 高度按 16 位存，范围从洞底以下 1 米到洞顶以上 1 米 */
export function heightRange(L: CaveLayout): { lo: number; span: number } {
  return { lo: -1, span: L.ceilingM + 2 }
}

/** 高度图与法线图：geo 的 R、G 是 16 位的高度、B 是水潭；norm 的 R、G、B 是法线（按 0.5 偏移） */
export function paintRelief(L: CaveLayout, geo: Uint8ClampedArray, norm: Uint8ClampedArray): void {
  const f = fieldOf(L)
  const W = Math.round((f.w / UNIT) * RELIEF_PPU)
  const H = Math.round((f.h / UNIT) * RELIEF_PPU)
  const hs = new Float32Array(W * H)
  const { lo, span } = heightRange(L)
  for (let py = 0; py < H; py++) {
    const wy = f.y0 + ((py + 0.5) / RELIEF_PPU) * UNIT
    for (let px = 0; px < W; px++) {
      const wx = f.x0 + ((px + 0.5) / RELIEF_PPU) * UNIT
      const z = heightM(L, wx, wy)
      const i = py * W + px
      hs[i] = z
      const v = Math.round(clamp01((z - lo) / span) * 65535)
      let water = 0
      for (const p of L.pools) water = Math.max(water, smooth(0, 0.08, poolField(p, wx, wy)))
      geo[i * 4] = v >> 8
      geo[i * 4 + 1] = v & 255
      geo[i * 4 + 2] = water * 255
      geo[i * 4 + 3] = 255
    }
  }
  const step = 1 / RELIEF_PPU
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px
      const dx = (hs[py * W + Math.min(W - 1, px + 1)]! - hs[py * W + Math.max(0, px - 1)]!) / (2 * step)
      const dy = (hs[Math.min(H - 1, py + 1) * W + px]! - hs[Math.max(0, py - 1) * W + px]!) / (2 * step)
      const l = Math.hypot(dx, dy, 1)
      norm[i * 4] = Math.round((-dx / l) * 127.5 + 127.5)
      norm[i * 4 + 1] = Math.round((-dy / l) * 127.5 + 127.5)
      norm[i * 4 + 2] = Math.round((1 / l) * 255)
      norm[i * 4 + 3] = 255
    }
  }
}

/** 天窗图每格多少像素 */
export const SKY_PPU = 4

/** 洞顶的天窗图：R 是正上方有多少天，边上柔和过渡 */
export function paintSky(L: CaveLayout, out: Uint8ClampedArray): void {
  const f = fieldOf(L)
  const W = Math.round((f.w / UNIT) * SKY_PPU)
  const H = Math.round((f.h / UNIT) * SKY_PPU)
  for (let py = 0; py < H; py++) {
    const wy = f.y0 + ((py + 0.5) / SKY_PPU) * UNIT
    for (let px = 0; px < W; px++) {
      const wx = f.x0 + ((px + 0.5) / SKY_PPU) * UNIT
      const o = (py * W + px) * 4
      out[o] = skyAbove(L, wx, wy, 0.12 * UNIT) * 255
      out[o + 1] = 0
      out[o + 2] = 0
      out[o + 3] = 255
    }
  }
}

/** 照度场按对数存进 16 位：log10(勒克斯) 落在 [−5, 5] */
export const LOG_LUX_MIN = -5
export const LOG_LUX_SPAN = 10

/** 照度场编码成数据图：R、G 是 16 位的对数照度，B 是反光占的比例；必须满 alpha（画布会按透明度预乘） */
export function encodeField(Lt: CaveLight, out: Uint8ClampedArray): void {
  for (let i = 0; i < Lt.cols * Lt.rows; i++) {
    const v = Math.round(clamp01((Math.log10(Lt.diffuse[i]! + 1e-5) - LOG_LUX_MIN) / LOG_LUX_SPAN) * 65535)
    out[i * 4] = v >> 8
    out[i * 4 + 1] = v & 255
    out[i * 4 + 2] = Lt.warm[i]! * 255
    out[i * 4 + 3] = 255
  }
}

/** 火把影子图：每支火把一行，每行按方位角分这么多格 */
export const SHADE_BINS = 256
export const SHADE_ROWS = 8
/** 火把影子图记到多远，格 */
export const SHADE_RANGE_U = 14

/** 从火把 (x, y) 朝每个方位角走到碰上岩石为止，把走了多远（占 SHADE_RANGE_U 的比例）写进第 row 行 */
export function castShade(r: Rock, x: number, y: number, out: Uint8ClampedArray, row: number): void {
  const range = SHADE_RANGE_U * UNIT
  const minStep = r.cell * 0.5
  for (let b = 0; b < SHADE_BINS; b++) {
    const a = ((b + 0.5) / SHADE_BINS) * Math.PI * 2 - Math.PI
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    let t = 0
    for (let k = 0; k < 128 && t < range; k++) {
      const d = roomOf(r, x + dx * t, y + dy * t)
      if (d < 0) break
      t += Math.max(d, minStep)
    }
    const o = (row * SHADE_BINS + b) * 4
    out[o] = clamp01(t / range) * 255
    out[o + 1] = 0
    out[o + 2] = 0
    out[o + 3] = 255
  }
}

/** 着色器共用的取样：世界坐标落在数据图上的纹理坐标（画布纹理上传时上下翻了） */
const SAMPLE = `
vec2 fieldUv(vec2 world) {
  vec2 uv = (world - uField0.xy) / uField0.zw;
  return vec2(uv.x, 1.0 - uv.y);
}
float height(vec2 world) {
  vec4 g = texture2D(uGeo, fieldUv(world));
  return (g.r * 65280.0 + g.g * 255.0) / 65535.0 * uHeight.y + uHeight.x;
}
float skyAt(vec2 world) {
  return texture2D(uSky, fieldUv(world)).r;
}
`

const HEADER = `
#pragma phaserTemplate(shaderName)
#pragma phaserTemplate(extensions)
#pragma phaserTemplate(features)
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#pragma phaserTemplate(fragmentDefine)
varying vec2 outTexCoord;
#pragma phaserTemplate(outVariables)
#pragma phaserTemplate(fragmentHeader)
`

/** 挡太阳与月光的石头最多几块：石柱一直挡，石笋只挡比它矮的光线 */
export const MAX_BLOCKS = 32
/** 同时点着的火把最多几支 */
export const MAX_TORCHES = SHADE_ROWS

/** 光照层按 2 倍调制叠在画面上：画面 × 2 × 输出，输出 0.5 是原样，往上提亮、往下压暗 */
const LIGHT_GAIN = 2

const MODULATE = new WeakMap<Phaser.Renderer.WebGL.WebGLRenderer, number>()

/** 光照层用的混合模式：DST_COLOR·输出 + SRC_COLOR·画面 = 2·输出·画面，正好是 LIGHT_GAIN 倍；每个渲染器只登记一次 */
export function modulateMode(r: Phaser.Renderer.WebGL.WebGLRenderer): number {
  const known = MODULATE.get(r)
  if (known !== undefined && r.blendModes[known]) return known
  r.addBlendMode([r.gl.DST_COLOR, r.gl.SRC_COLOR], r.gl.FUNC_ADD)
  const mode = r.blendModes.length - 1
  MODULATE.set(r, mode)
  return mode
}
/** 色调曲线 TONE_MAX·x/(x + TONE_KNEE)：x 是照度比眼睛适应的亮度，适应的亮度上约是原色，阳光直射处亮到 TONE_MAX 倍 */
const TONE_MAX = 1.6
const TONE_KNEE = 0.7

/**
 * 洞里的光，按 2 倍调制叠在整个战斗画面上（地面、角色、子弹、特效一起变亮变暗）：
 * 天光与反光从照度场来；直射看这一点朝太阳（月亮）的那条线在洞顶的高度上是不是落在天窗里，再看半路有没有石柱、石笋挡着；
 * 火把按点光源 I·cosθ/d² 照（w 是火把的高度，米），沿影子图判断有没有被岩石挡住，坡面上的明暗只取一半，免得近处的火光把小坡照出一圈黑影；
 * 有方向的光按法线图照出起伏。
 * 照度除以眼睛适应的亮度后按色调曲线压成倍数，直射的光斑亮过原色；越暗越偏冷偏灰；最暗也留一点暖褐，不是纯黑；加一点抖动免得暗处出色带
 */
export const LIGHT_FRAG = `${HEADER}
uniform sampler2D uField;
uniform sampler2D uGeo;
uniform sampler2D uNorm;
uniform sampler2D uSky;
uniform sampler2D uShade;
uniform vec4 uRect;
uniform vec4 uField0;
uniform vec2 uHeight;
uniform float uUnit;
uniform float uCeil;
uniform vec4 uSun;
uniform vec3 uSunCol;
uniform vec4 uMoon;
uniform vec3 uMoonCol;
uniform vec3 uSkyCol;
uniform vec3 uBounceCol;
uniform vec3 uTorchCol;
uniform float uLogAdapt;
uniform vec4 uTorch[${MAX_TORCHES}];
uniform float uTorchCount;
uniform vec4 uBlock[${MAX_BLOCKS}];
uniform float uBlockCount;
uniform vec3 uFloor;
${SAMPLE}
float blocked(vec2 p, float z, vec2 dir, float cotE) {
  float lit = 1.0;
  for (int i = 0; i < ${MAX_BLOCKS}; i++) {
    if (float(i) >= uBlockCount) break;
    vec4 b = uBlock[i];
    vec2 c = b.xy - p;
    if (dot(c, c) < b.z * b.z) continue;
    float along = dot(c, dir);
    if (along < 0.0) continue;
    float perp = abs(c.x * dir.y - c.y * dir.x);
    if (perp > b.z * 1.1) continue;
    float rise = max(along - sqrt(max(b.z * b.z - perp * perp, 0.0)), 0.0) / uUnit / cotE;
    float top = b.w < 0.0 ? 1e4 : b.w * pow(max(1.0 - perp / b.z, 0.0), 1.35);
    if (z + rise < top) lit *= smoothstep(b.z * 0.8, b.z * 1.1, perp);
  }
  return lit;
}
float beam(vec2 p, float z, vec3 n, vec4 body) {
  if (body.w <= 0.0) return 0.0;
  vec2 q = p + body.xy * (uCeil - z) * body.z * uUnit;
  float open = skyAt(q);
  if (open <= 0.0) return 0.0;
  vec3 l = normalize(vec3(body.xy, 1.0 / max(body.z, 0.0001)));
  return body.w * max(dot(n, l), 0.0) * open * blocked(p, z, body.xy, body.z);
}
void main ()
{
  vec2 tc = outTexCoord;
  vec2 world = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  vec2 uv = fieldUv(world);
  vec4 f = texture2D(uField, uv);
  float logE = (f.r * 65280.0 + f.g * 255.0) / 65535.0 * ${LOG_LUX_SPAN.toFixed(1)} + ${LOG_LUX_MIN.toFixed(1)};
  float eDiff = pow(10.0, logE - uLogAdapt);
  float z = height(world);
  vec3 nm = texture2D(uNorm, uv).rgb;
  vec3 n = normalize(vec3(nm.xy * 2.0 - 1.0, max(nm.z, 0.05)));
  float eSun = beam(world, z, n, uSun);
  float eMoon = beam(world, z, n, uMoon);
  float eTorch = 0.0;
  for (int k = 0; k < ${MAX_TORCHES}; k++) {
    if (float(k) >= uTorchCount) break;
    vec4 t = uTorch[k];
    vec2 d = (t.xy - world) / uUnit;
    float dist = length(d);
    if (dist > ${SHADE_RANGE_U.toFixed(1)}) continue;
    float a = atan(-d.y, -d.x);
    float free = texture2D(uShade, vec2(a / 6.2831853 + 0.5, 1.0 - (float(k) + 0.5) / ${SHADE_ROWS.toFixed(1)})).r * ${SHADE_RANGE_U.toFixed(1)};
    float see = smoothstep(free + 0.15, free - 0.15, dist);
    vec3 l = vec3(d, t.w - z);
    float r2 = dot(l, l);
    vec3 ld = l / sqrt(r2);
    eTorch += t.z * mix(max(ld.z, 0.0), max(dot(n, ld), 0.0), 0.5) / r2 * see;
  }
  float e = eDiff + eSun + eMoon + eTorch;
  vec3 col = (eDiff * mix(uSkyCol, uBounceCol, f.b) + eSun * uSunCol + eMoon * uMoonCol + eTorch * uTorchCol) / max(e, 1e-6);
  float lux = log2(max(e, 1e-12)) * 0.30103 + uLogAdapt;
  float scot = 1.0 - smoothstep(-2.0, 0.6, lux);
  float grey = dot(col, vec3(0.3, 0.5, 0.2));
  col = mix(col, vec3(0.62, 0.72, 0.95) * grey, scot * 0.8);
  col /= max(max(col.r, col.g), max(col.b, 0.0001));
  float tone = ${TONE_MAX.toFixed(2)} * e / (e + ${TONE_KNEE.toFixed(2)});
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  gl_FragColor = vec4(max(col * tone, uFloor) / ${LIGHT_GAIN.toFixed(1)} + dither / 255.0, 1.0);
}
`

/**
 * 洞里会发光的空气与水面，按叠加画在光的上面：天窗射进来的光柱照亮半空里的水雾与浮尘，
 * 俯看时一根竖直的空气柱有多少段在光柱里，就亮多少（取样点按像素错开，免得出一道道条纹）；浮尘一闪一闪、水雾慢慢往上飘；天窗正下方的水潭倒映着天
 */
export const GLOW_FRAG = `${HEADER}
uniform sampler2D uGeo;
uniform sampler2D uSky;
uniform vec4 uRect;
uniform vec4 uField0;
uniform vec2 uHeight;
uniform float uUnit;
uniform float uCeil;
uniform vec4 uSun;
uniform vec3 uSunCol;
uniform vec4 uMoon;
uniform vec3 uMoonCol;
uniform vec3 uSkyCol;
uniform float uSkyBright;
uniform float uScatter;
uniform float uTime;
uniform float uMist;
${SAMPLE}
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float shaft(vec2 p, float z, vec4 body, float jitter) {
  if (body.w <= 0.0) return 0.0;
  vec2 end = p + body.xy * (uCeil - z) * body.z * uUnit;
  float acc = 0.0;
  for (int i = 0; i < 12; i++) {
    acc += skyAt(mix(p, end, (float(i) + jitter) / 12.0));
  }
  return acc / 12.0 * body.w * uScatter;
}
void main ()
{
  vec2 tc = outTexCoord;
  vec2 world = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  vec2 g = world / uUnit;
  float z = height(world);
  vec2 drift = vec2(uTime * 0.07, -uTime * 0.11);
  float mist = 0.55 + 0.45 * vnoise(g * 0.45 + drift) * (0.6 + 0.4 * vnoise(g * 1.3 - drift * 1.7));
  float motes = smoothstep(0.93, 0.99, vnoise(g * 9.0 + vec2(uTime * 0.21, uTime * 0.13))) * (0.5 + 0.5 * sin(uTime * 3.0 + hash(floor(g * 9.0)) * 6.28));
  float density = mist * (0.7 + 0.3 * uMist) + motes * 1.6;
  float jitter = hash(gl_FragCoord.xy);
  vec3 col = (shaft(world, z, uSun, jitter) * uSunCol + shaft(world, z, uMoon, jitter) * uMoonCol) * density;
  vec4 geo = texture2D(uGeo, fieldUv(world));
  float ripple = 0.75 + 0.5 * vnoise(g * 3.0 + vec2(uTime * 0.4, uTime * 0.25));
  col += uSkyCol * geo.b * skyAt(world) * uSkyBright * 0.035 * ripple;
  gl_FragColor = vec4(min(col, vec3(0.7)), 0.0);
}
`

/** 火苗：上尖下圆的一团，芯是白黄，往外橙红、淡出 */
export function drawFlame(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w - 0.5
      const v = (y + 0.5) / h
      const half = 0.42 * Math.sin(Math.PI * Math.min(1, (1 - v) * 1.15)) ** 0.8 * (0.35 + 0.65 * v)
      const d = half > 0 ? Math.abs(u) / half : 2
      const a = clamp01(1 - d) ** 0.8 * smooth(0, 0.25, v) * smooth(1, 0.82, v)
      const core = clamp01(1 - d * 1.6) * smooth(0.3, 0.75, v)
      const o = (y * w + x) * 4
      img.data[o] = 255
      img.data[o + 1] = Math.round(120 + 110 * core + 25 * a)
      img.data[o + 2] = Math.round(30 + 150 * core)
      img.data[o + 3] = Math.round(a * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 柔和的光晕：中心实、往外按平方淡出，靠着色得到颜色 */
export function drawHalo(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c
      const o = (y * size + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = Math.round(clamp01(1 - d) ** 2 * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 一团烟：中心实、边缘絮状地淡出 */
export function drawSmoke(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c
      const fluff = 0.7 + 0.3 * fbm(x / 8, y / 8, 23, 3)
      const o = (y * size + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = Math.round(clamp01(1 - d) ** 1.5 * fluff * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 从上往下看的蝙蝠：深褐的身子，两片带骨的膜翼 */
export function drawBat(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2
  const cy = h * 0.5
  ctx.fillStyle = '#2b2019'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(cx, cy - h * 0.12)
    ctx.quadraticCurveTo(cx + side * w * 0.2, cy - h * 0.42, cx + side * w * 0.48, cy - h * 0.18)
    ctx.lineTo(cx + side * w * 0.4, cy + h * 0.05)
    ctx.quadraticCurveTo(cx + side * w * 0.34, cy - h * 0.02, cx + side * w * 0.28, cy + h * 0.14)
    ctx.quadraticCurveTo(cx + side * w * 0.2, cy + h * 0.02, cx + side * w * 0.12, cy + h * 0.2)
    ctx.quadraticCurveTo(cx + side * w * 0.06, cy + h * 0.08, cx, cy + h * 0.12)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#1a130e'
  ctx.beginPath()
  ctx.ellipse(cx, cy, w * 0.05, h * 0.26, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy - h * 0.26, w * 0.035, 0, Math.PI * 2)
  ctx.fill()
}

/** 天窗口的一圈植物：从上往下看，蕨叶与藤蔓从洞顶的边缘伸进天窗，树根垂下来；ppu 是每格多少像素，画布的中心是天窗的圆心 */
export function drawRim(ctx: CanvasRenderingContext2D, o: Opening, ppu: number, size: number, seed: number): void {
  const rng = new Rng(seed)
  const k = ppu / UNIT
  const c = size / 2
  ctx.save()
  ctx.translate(c, c)
  ctx.lineCap = 'round'
  const steps = Math.ceil(((o.r * 2 * Math.PI) / UNIT) * 3.2)
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2 + (rng.next() - 0.5) * 0.08
    const rr = (o.r * (1 + o.wob[0]! * Math.sin(a + o.wob[1]!) + o.wob[2]! * Math.sin(2 * a + o.wob[3]!) + o.wob[4]! * Math.sin(3 * a + o.wob[5]!))) * k
    const ex = Math.cos(a)
    const ey = Math.sin(a)
    // 垂下的树根与藤：从边缘往天窗里伸一小段
    if (rng.next() < 0.55) {
      const len = (0.25 + rng.next() * 0.55) * ppu
      const bend = (rng.next() - 0.5) * 0.6
      ctx.strokeStyle = rng.next() < 0.5 ? 'rgba(74,54,36,0.85)' : 'rgba(58,82,40,0.85)'
      ctx.lineWidth = (0.03 + rng.next() * 0.04) * ppu
      ctx.beginPath()
      ctx.moveTo(ex * rr, ey * rr)
      ctx.quadraticCurveTo(ex * (rr - len * 0.5) - ey * bend * len, ey * (rr - len * 0.5) + ex * bend * len, ex * (rr - len), ey * (rr - len))
      ctx.stroke()
    }
    // 蕨叶：几片细长的叶子从边缘外往里探
    const fronds = 1 + Math.floor(rng.next() * 3)
    for (let j = 0; j < fronds; j++) {
      const base = rr + (rng.next() * 0.5 - 0.1) * ppu
      const ang = a + Math.PI + (rng.next() - 0.5) * 1.2
      const len = (0.35 + rng.next() * 0.5) * ppu
      const g = 70 + Math.floor(rng.next() * 50)
      ctx.fillStyle = `rgba(${Math.floor(g * 0.55)},${g},${Math.floor(g * 0.45)},0.82)`
      ctx.save()
      ctx.translate(ex * base, ey * base)
      ctx.rotate(ang)
      ctx.beginPath()
      ctx.ellipse(len / 2, 0, len / 2, len * (0.1 + rng.next() * 0.08), 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
  ctx.restore()
}
