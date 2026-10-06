import { SUN } from '../../data/light'
import { UNIT } from '../../util/units'
import { fbm } from '../../util/noise'
import { roomAt } from '../basin'
import { spread01 } from './model'
import { bilinear, CAVE_DEPTH_U, clamp01, FRAG_PRELUDE, SHADOW_STEPS, smooth, WIND } from './render'
import type { LavaField } from './model'
import type { CellRect, GroundMarks } from './render'
import type { VolcanoConfig } from '../../types/maps'

/** 雪面光照图每格几个像素 */
export const SHINE_PPC = 2

/** 化雪：每秒化掉多少积雪，乘上受的热 */
const MELT_RATE = 0.9
/** 熔岩辉光场的值乘它算受的热：辉光出了熔岩边一两格就很弱，放大了熔岩四周才化得出一圈 */
const GLOW_HEAT = 2.5
/** 受的热低于它不化雪，雪照常积 */
const HEAT_FLOOR = 0.02
/** 化雪留下的湿地多久干透，毫秒 */
const DRY_MS = 40000

/**
 * 积雪的格子场，和熔岩场同一套格子。fall、full、fan、dist、grime 开局定下，其余随时间变；只是画面，不碰玩法
 */
export interface Snow {
  /** 这里的雪下得多大，0 到 1：火山周围一大片是 1，往外由大变小到 0 */
  readonly fall: Float32Array
  /** 积满时有多厚，0 到 1：雪下得小的地方薄，洼处、背阴处厚，凸起、向阳处薄，山体陡坡上露出一道道顺坡的石棱；火山口、喷气孔、洞口与陡崖留不住雪 */
  readonly full: Float32Array
  /** 当下的积雪，0 到 1：着色器拿它和噪声比，薄的时候先积在一个个洼处，成片斑驳 */
  readonly cover: Float32Array
  /** 雪面上的火山灰，0 到 1 */
  readonly ash: Float32Array
  /** 雪化了露出的湿地，0 到 1 */
  readonly wet: Float32Array
  /** 冒汽的强度：熔岩四周正在化雪，或雪落在还没凉透的岩石上 */
  readonly steam: Float32Array
  /** 喷发时落灰的多少，0 到 1：顺风拉长的一把扇子，火山口四周也落一圈 */
  readonly fan: Float32Array
  /** 离火山口多远，格：火山口一带化雪按它算，抖过一点，化出的边不是正圆 */
  readonly dist: Float32Array
  /** 口沿一带常年落着的灰，0 到 1：雪上的灰盖得再干净也不少于它 */
  readonly grime: Float32Array
}

/** 火山口一带受的热：离火山口 reachU 格以内的雪按 heat 化 */
export interface CraterHeat {
  readonly reachU: number
  readonly heat: number
}

/**
 * 开局的积雪：雪区以朝地图里挪过的火山口为心，半径按方位起伏、边界再抖一抖；洼处、背阴处积得厚，山体陡坡上露出顺坡的石棱，陡崖只在台阶上留雪，口沿一圈落着灰。
 * 已有的岩石按凉了多久积了一部分，熔岩上没有雪
 */
export function makeSnow(f: LavaField, cfg: VolcanoConfig, marks: GroundMarks, now: number): Snow {
  const n = f.cols * f.rows
  const s: Snow = {
    fall: new Float32Array(n),
    full: new Float32Array(n),
    cover: new Float32Array(n),
    ash: new Float32Array(n),
    wet: new Float32Array(n),
    steam: new Float32Array(n),
    fan: new Float32Array(n),
    dist: new Float32Array(n),
    grime: new Float32Array(n),
  }
  const c = cfg.snow
  const cone = cfg.cone
  const seed = f.seed
  const cellU = f.cell / UNIT
  const mountain = cone.blockU * (1 + cone.blockJitter)
  const sx = f.craterX + f.inX * c.shiftU * UNIT
  const sy = f.craterY + f.inY * c.shiftU * UNIT
  const wl = Math.hypot(WIND.x, WIND.y)
  const wx = WIND.x / wl
  const wy = WIND.y / wl
  const g = f.ground
  for (let row = 0; row < f.rows; row++) {
    for (let col = 0; col < f.cols; col++) {
      const i = row * f.cols + col
      const x = f.x0 + (col + 0.5) * f.cell
      const y = f.y0 + (row + 0.5) * f.cell
      const xu = x / UNIT
      const yu = y / UNIT
      const zx = (x - sx) / UNIT
      const zy = (y - sy) / UNIT
      const a = Math.atan2(zy, zx)
      const reach =
        c.radiusU * (1 + c.wobble * (spread01(fbm(Math.cos(a) * 1.4 + 23, Math.sin(a) * 1.4 + 41, seed + 211, 2)) * 2 - 1)) + (fbm(xu / 3, yu / 3, seed + 223, 2) - 0.5) * 2.5
      const fall = smooth(reach, reach - c.edgeU, Math.hypot(zx, zy))
      const ox = (x - f.craterX) / UNIT
      const oy = (y - f.craterY) / UNIT
      const dU = Math.hypot(ox, oy)
      const rough = fbm(xu * 1.6, yu * 1.6, seed + 229, 2)
      let keep = smooth(cone.craterU + 0.05, cone.craterU + 0.55, dU + (rough - 0.5) * 0.6)
      for (const p of marks.vents) keep *= smooth(0.25, 0.8, (Math.hypot(x - p.x, y - p.y) / UNIT) * (0.7 + 0.6 * rough))
      for (const cave of marks.caves) {
        const w = cave.r / UNIT
        const hx = cave.x - cave.nx * CAVE_DEPTH_U * 0.5 * UNIT
        const hy = cave.y - cave.ny * CAVE_DEPTH_U * 0.5 * UNIT
        keep *= smooth(w + 0.15, w + 0.75, Math.hypot(x - hx, y - hy) / UNIT)
      }
      const roomU = roomAt(f.basin, x, y) / UNIT
      const face = smooth(-0.05, 0.25, -roomU) * smooth(cfg.rim.cliffU + 0.35, cfg.rim.cliffU - 0.15, -roomU) * smooth(mountain + 0.5, mountain + 2, dU)
      keep *= 1 - 0.85 * face * (1 - smooth(0.45, 0.7, fbm(xu * 1.1, yu * 1.1, seed + 227, 2)))
      const l = g[row * f.cols + Math.max(0, col - 1)]!
      const r = g[row * f.cols + Math.min(f.cols - 1, col + 1)]!
      const u = g[Math.max(0, row - 1) * f.cols + col]!
      const d = g[Math.min(f.rows - 1, row + 1) * f.cols + col]!
      const lap = (l + r + u + d - 4 * g[i]!) / (cellU * cellU)
      const gx = (r - l) / (2 * cellU)
      const gy = (d - u) / (2 * cellU)
      const lambert = Math.max(0, (-gx * SUN.x - gy * SUN.y + SUN.z) / Math.sqrt(gx * gx + gy * gy + 1))
      const lift = Math.max(-0.35, Math.min(0.25, lap * 0.3)) - 0.35 * (lambert - SUN.z)
      const steep = smooth(cone.blockU + 0.3, cone.blockU - 0.6, dU) * smooth(cone.craterU, cone.craterU + 0.5, dU)
      const bearing = Math.atan2(oy, ox)
      const rib = smooth(0.52, 0.72, fbm(Math.cos(bearing) * 14 + 5, Math.sin(bearing) * 14 + dU * 0.35, seed + 81, 2)) * steep
      const full = 1.2 * fall - 0.05 + lift * (1 - 0.7 * fall) - 0.75 * rib
      s.full[i] = clamp01(full) * keep
      s.fall[i] = fall
      s.dist[i] = dU + (rough - 0.5) * 1.2
      s.grime[i] = 0.55 * Math.exp(-Math.max(0, dU - cone.craterU) / 1.3) * (0.6 + 0.8 * rough)
      const along = ox * wx + oy * wy
      const across = -ox * wy + oy * wx
      const down = Math.max(0, along)
      const plume = Math.exp(-down / 13) * Math.exp(-((across / (1.3 + 0.3 * down)) ** 2)) * smooth(-2.5, 0.5, along)
      s.fan[i] = Math.max(plume, 0.8 * Math.exp(-dU / 3.5))
      s.cover[i] = f.lava[i]! > 0 ? 0 : s.full[i]! * clamp01((now - f.rockAt[i]! - c.warmMs) / c.coverMs)
      s.ash[i] = s.grime[i]!
    }
  }
  return s
}

/**
 * 积雪随时间变，dtMs 是这一步过了多久。熔岩盖住的地方没有雪；熔岩四周与火山口一带受热化雪，化出湿地、冒汽；
 * 新岩石凉透前落上去的雪化成汽，凉透了按雪下得多大往上积，coverMs 积满。雪上的灰按 fan 落，被新雪盖住
 */
export function stepSnow(s: Snow, f: LavaField, cfg: VolcanoConfig, on: Uint8Array, glow: Float32Array, crater: CraterHeat, ashRate: number, now: number, dtMs: number): void {
  const c = cfg.snow
  const dt = dtMs / 1000
  const grow = dtMs / c.coverMs
  const bury = dtMs / c.buryMs
  const dry = dtMs / DRY_MS
  for (let i = 0; i < s.cover.length; i++) {
    if (on[i]) {
      s.cover[i] = 0
      s.ash[i] = 0
      s.wet[i] = 0
      s.steam[i] = 0
      continue
    }
    const ring = crater.heat > 0 ? crater.heat * smooth(crater.reachU + 0.5, crater.reachU - 0.5, s.dist[i]!) : 0
    const hot = Math.max(glow[i]! * GLOW_HEAT, ring)
    const was = s.cover[i]!
    let snow = was
    if (hot > HEAT_FLOOR) snow = Math.max(0, snow - dt * MELT_RATE * hot)
    const age = now - f.rockAt[i]!
    const warm = age < c.warmMs
    const full = s.full[i]!
    if (!warm && hot <= HEAT_FLOOR && snow < full) snow = Math.min(full, snow + grow * full)
    const melt = Math.max(0, was - snow)
    s.cover[i] = snow
    s.wet[i] = clamp01(s.wet[i]! + melt * 2 - dry)
    s.steam[i] = (dt > 0 ? (melt / dt) * 1.5 : 0) + (warm ? s.fall[i]! * (1 - age / c.warmMs) : 0)
    s.ash[i] = Math.max(s.grime[i]!, Math.min(1, s.ash[i]! + ashRate * dt * s.fan[i]!) * (1 - bury * s.fall[i]!))
  }
}

/** 火山弹砸在雪上：砸出一个坑，雪化成湿地 */
export function punchSnow(s: Snow, f: LavaField, x: number, y: number, r: number): void {
  const c0 = Math.max(0, Math.floor((x - r - f.x0) / f.cell))
  const c1 = Math.min(f.cols - 1, Math.floor((x + r - f.x0) / f.cell))
  const r0 = Math.max(0, Math.floor((y - r - f.y0) / f.cell))
  const r1 = Math.min(f.rows - 1, Math.floor((y + r - f.y0) / f.cell))
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const d = Math.hypot(f.x0 + (cx + 0.5) * f.cell - x, f.y0 + (cy + 0.5) * f.cell - y) / r
      if (d >= 1) continue
      const i = cy * f.cols + cx
      const k = smooth(1, 0.4, d)
      s.wet[i] = Math.max(s.wet[i]!, s.cover[i]! * k)
      s.cover[i] = s.cover[i]! * (1 - k)
    }
  }
}

/**
 * 给积雪着色器的数据图，每格一个像素、不透明：R 是积雪，G 是雪上的灰，B 是湿地。
 * 积雪按 1-2-1 的核平滑一遍：相邻格子凝固的时刻差几秒，积雪就差一截，不平滑的话雪的边顺着格子走成锯齿
 */
export function encodeSnow(s: Snow, cols: number, rows: number, out: Uint8ClampedArray): void {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      let sum = 0
      for (let j = -1; j <= 1; j++) {
        const yy = Math.min(rows - 1, Math.max(0, y + j))
        for (let k = -1; k <= 1; k++) sum += s.cover[yy * cols + Math.min(cols - 1, Math.max(0, x + k))]! * (k === 0 ? 2 : 1) * (j === 0 ? 2 : 1)
      }
      out[i * 4] = (sum / 16) * 255
      out[i * 4 + 1] = s.ash[i]! * 255
      out[i * 4 + 2] = s.wet[i]! * 255
      out[i * 4 + 3] = 255
    }
  }
}

/** 雪的反照率与照到雪上的阳光、天光：线性的颜色，最后压一下高光。雪区头上压着云，天光多、阳光弱，影子是淡淡的蓝 */
const SNOW_RGB = [0.93, 0.945, 0.97] as const
const SUN_RGB = [1.0, 0.95, 0.87] as const
const SKY_RGB = [0.56, 0.67, 0.86] as const
const SUN_I = 0.75
const SKY_I = 0.8

/** 高光柔和地压到 1 以内 */
function tone(c: number): number {
  if (c <= 0.8) return c < 0 ? 0 : c
  return 0.8 + 0.2 * (1 - Math.exp(-(c - 0.8) / 0.2))
}

/**
 * 雪面受的光：按高度场打光，朝阳的一面暖白，背阴与被挡住太阳的地方泛蓝；云底下的影子发虚，挡光的只压暗七成。盆地外越远越暗，和地面一样。
 * 每格 SHINE_PPC 个像素，只画 rect 里的格子，out 按整张图逐行排
 */
export function shineSnow(f: Pick<LavaField, 'basin' | 'cols' | 'rows' | 'cell' | 'x0' | 'y0' | 'ground'>, cfg: VolcanoConfig, out: Uint8ClampedArray, rect: CellRect): void {
  const ppc = SHINE_PPC
  const w = f.cols * ppc
  const cellU = cfg.cellU
  const lxy = Math.hypot(SUN.x, SUN.y)
  const sunU = SUN.x / lxy / cellU
  const sunV = SUN.y / lxy / cellU
  const sunRise = SUN.z / lxy
  const e = 0.5
  for (let py = rect.r0 * ppc; py < rect.r1 * ppc; py++) {
    for (let px = rect.c0 * ppc; px < rect.c1 * ppc; px++) {
      const u = (px + 0.5) / ppc - 0.5
      const v = (py + 0.5) / ppc - 0.5
      const g0 = bilinear(f.ground, f, u, v)
      const nx = -(bilinear(f.ground, f, u + e, v) - bilinear(f.ground, f, u - e, v)) / (2 * e * cellU)
      const ny = -(bilinear(f.ground, f, u, v + e) - bilinear(f.ground, f, u, v - e)) / (2 * e * cellU)
      const nl = 1 / Math.sqrt(nx * nx + ny * ny + 1)
      const lambert = Math.max(0, (nx * SUN.x + ny * SUN.y + SUN.z) * nl)
      let over = 0
      for (const k of SHADOW_STEPS) over = Math.max(over, bilinear(f.ground, f, u + sunU * k, v + sunV * k) - g0 - k * sunRise)
      const sun = lambert * (1 - 0.7 * smooth(0, 0.6, over)) * SUN_I
      const sky = (0.6 + 0.4 * nl) * SKY_I
      const roomU = roomAt(f.basin, f.x0 + (u + 0.5) * f.cell, f.y0 + (v + 0.5) * f.cell) / UNIT
      const far = 1 - 0.45 * smooth(0.6, 4.5, -roomU)
      const o = (py * w + px) * 4
      out[o] = tone(SNOW_RGB[0] * (SUN_RGB[0] * sun + SKY_RGB[0] * sky) * far) * 255
      out[o + 1] = tone(SNOW_RGB[1] * (SUN_RGB[1] * sun + SKY_RGB[1] * sky) * far) * 255
      out[o + 2] = tone(SNOW_RGB[2] * (SUN_RGB[2] * sun + SKY_RGB[2] * sky) * far) * 255
      out[o + 3] = 255
    }
  }
}

/**
 * 积雪的片元着色器，四边形盖住整块场地，取样同熔岩着色器。积雪量和噪声比出盖没盖住：薄的时候只盖住噪声低的洼处，斑驳成片，越厚连成一片；雪的边按一个像素宽抗锯齿，不会大片发虚；
 * 雪面的明暗来自光照图，顺风有浅浅的雪纹，向阳干净的雪上零星闪光；灰顺着风一缕缕染在雪上；熔岩与火山口的红光映在雪上。
 * 雪化了的地方按湿地压暗地面。输出按预乘透明度
 */
export const SNOW_FRAG = `${FRAG_PRELUDE}
uniform sampler2D uSnow;
uniform sampler2D uShine;
uniform sampler2D uAux;
uniform float uTime;
uniform vec2 uGrid;
uniform vec2 uWind;
uniform vec3 uCrater;
uniform float uCraterGlow;

void main ()
{
  vec2 tc = outTexCoord;
  vec2 cell = vec2(tc.x, 1.0 - tc.y) * uGrid;
  vec4 sn = texture2D(uSnow, tc);
  float n = vnoise(cell * 0.45 + 3.1) * 0.55 + vnoise(cell * 1.2 + 7.7) * 0.3 + vnoise(cell * 3.1 + 1.3) * 0.15;
  n = clamp((n - 0.5) * 1.8 + 0.5, 0.02, 0.98);
#ifdef GL_OES_standard_derivatives
  float aa = clamp(fwidth(sn.r - n) * 0.75, 0.002, 0.05);
#else
  float aa = 0.04;
#endif
  float cover = smoothstep(-aa, aa, sn.r - n);
  float wet = sn.b * (1.0 - cover);
  if (cover < 0.002 && wet < 0.002) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 lit = texture2D(uShine, tc).rgb;
  float thick = max(smoothstep(0.0, 0.12, sn.r - n), smoothstep(0.96, 1.0, sn.r));
  vec2 q = vec2(dot(cell, uWind), dot(cell, vec2(-uWind.y, uWind.x)));
  float swell = vnoise(cell * 0.35 + 31.0) - 0.5 + (vnoise(cell * 9.0 + 5.0) - 0.5) * 0.3;
  vec3 col = lit * (1.0 + 0.06 * swell) * mix(0.82, 1.0, thick);
  float lum = dot(lit, vec3(0.3, 0.5, 0.2));
  float streak = vnoise(vec2(q.x * 0.35, q.y * 2.6) + 9.0);
  float dirty = clamp(sn.g * (0.6 + 0.8 * streak), 0.0, 1.0);
  col = mix(col, vec3(0.31, 0.30, 0.29) * (0.45 + 0.65 * lum), dirty * 0.85);
  vec2 sp = cell * 7.0;
  vec2 h = hash2(floor(sp));
  float twinkle = 0.5 + 0.5 * sin(uTime * (1.5 + 2.5 * h.y) + h.x * 60.0);
  float glint = step(0.972, h.x) * (1.0 - smoothstep(0.05, 0.3, length(fract(sp) - 0.5))) * twinkle * twinkle;
  col += vec3(0.55) * glint * smoothstep(0.7, 0.9, lum) * (1.0 - dirty) * thick;
  float glow = texture2D(uAux, tc).r;
  float rim = uCraterGlow * (1.0 - smoothstep(uCrater.z, uCrater.z * 3.0, length(cell - uCrater.xy)));
  col += vec3(1.0, 0.42, 0.15) * (glow * 0.5 + rim * 0.45);
  gl_FragColor = vec4(col * cover, cover + wet * 0.22);
}
`
