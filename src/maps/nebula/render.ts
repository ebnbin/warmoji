import { cellNearest, fbm, valueNoise } from '../../util/noise'
import { COSMOS_SLOTS, SN_COOL_K, SN_COOL_S, SN_FALL_S, SN_HOT_K, SN_RISE_S } from './cosmos'
import { paintRemnants, REMNANT_PLANETARY, REMNANT_PX, REMNANT_SPAN } from './remnants'
import { C2, hue, LAMBDA, planck, scattered, WHITE_K } from './spectrum'
import type { Rgb } from './spectrum'

/** 星云数据贴图每格多少像素：气体是软的，细节交给着色器 */
export const NEBULA_PPU = 16

/** 要画的那一块，以球心为原点、格计：左上角与边长；壳层从 innerU 起有质量，密度按 rise 次方往外涨，wallU 是看得见的内壁；hole 是黑洞离球心的偏移 */
export interface NebulaSheet {
  readonly x0: number
  readonly y0: number
  readonly sizeU: number
  readonly innerU: number
  readonly wallU: number
  readonly outerU: number
  readonly rise: number
  readonly holeX: number
  readonly holeY: number
  readonly seed: number
  readonly ppu: number
}

/** 贴图边长，像素 */
export function sheetPx(s: NebulaSheet): number {
  return Math.ceil(s.sizeU * s.ppu)
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const ridge = (n: number): number => 1 - Math.abs(2 * n - 1)

/** 一根尘埃柱：尖端在 (x, y)，沿 (ux, uy) 往外伸 len 格直到埋进内壁，最宽 width 格；它正对着黑洞，是被它的光一点点削出来的 */
interface Pillar {
  readonly x: number
  readonly y: number
  readonly ux: number
  readonly uy: number
  readonly len: number
  readonly width: number
  readonly seed: number
}

/** 尘埃柱立在空腔边上一圈，尖端朝着黑洞，根部埋进内壁 */
function pillarsOf(s: NebulaSheet): Pillar[] {
  const out: Pillar[] = []
  const n = 9
  for (let i = 0; i < n; i++) {
    const h = (k: number): number => valueNoise(i * 3.7 + k * 11.3, k * 5.1 + 0.5, s.seed + 61)
    const a = ((i + 0.5 + (h(1) - 0.5) * 0.7) / n) * Math.PI * 2
    const r = s.wallU * (0.74 + 0.16 * h(2))
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    const dx = x - s.holeX
    const dy = y - s.holeY
    const d = Math.hypot(dx, dy) || 1
    const ux = dx / d
    const uy = dy / d
    const along = x * ux + y * uy
    const wall = -along + Math.sqrt(Math.max(0, along * along - r * r + s.wallU * s.wallU))
    out.push({ x, y, ux, uy, len: wall + 0.8, width: 0.5 + 0.5 * h(4), seed: s.seed + 71 + i * 13 })
  }
  return out
}

/**
 * 一根柱子在 (x, y) 处的尘埃与被照亮的边：越往根部越粗，轮廓带着絮状的起伏，里面疏密不匀，尖端圆钝；
 * 尘埃不是实心的，挡掉一部分后面的光；亮边是朝着黑洞的尖端被光蒸发出来的气体，裹在尖端外面，也透进尖端里
 */
function pillarAt(p: Pillar, x: number, y: number): { d: number; rim: number } {
  const ox = x - p.x
  const oy = y - p.y
  const t = ox * p.ux + oy * p.uy
  if (t < -2 || t > p.len + 1) return { d: 0, rim: 0 }
  const across = ox * p.uy - oy * p.ux
  const side = Math.abs(across)
  const grow = 0.4 + 0.6 * Math.sqrt(Math.max(0, Math.min(1, t / p.len)))
  const ragged = (fbm(t * 0.9, across * 0.9, p.seed, 2) - 0.5) * 0.6 + (fbm(t * 2.4, across * 2.4, p.seed + 5, 2) - 0.5) * 0.3
  const w = p.width * grow * (1 + ragged)
  const dist = t < 0 ? Math.hypot(t, side) : side
  const core = 0.55 + 0.45 * fbm(t * 1.2, across * 1.2, p.seed + 9, 3)
  const body = smooth(w * 1.1, w * 0.45, dist) * core
  const front = smooth(w * 1.7, w, dist) * (1 - smooth(w, w * 0.6, dist))
  const head = smooth(p.len * 0.45, 0, t)
  return { d: body * 0.75, rim: (front + body * 0.35) * head }
}

/** 气体的密度，0～1：大团柔软的云，按两层扭曲过的坐标采样，边缘被细碎的湍流撕成絮状，云团之间是空的 */
function gasAt(s: NebulaSheet, x: number, y: number): number {
  const wx = (fbm(x / 9, y / 9, s.seed + 2, 2) - 0.5) * 7
  const wy = (fbm(x / 9 + 9, y / 9 - 7, s.seed + 3, 2) - 0.5) * 7
  return fbm((x + wx) / 6.5, (y + wy) / 6.5, s.seed + 1, 4) + (fbm(x / 1.7, y / 1.7, s.seed + 6, 3) - 0.5) * 0.09
}

/**
 * 星云数据贴图：空腔下面是球壳下半部的内壁，壳层与外面的深空按离球心多远分开。逐像素：
 * R 是电离气体的发光：密度适中的云团最亮，太稠的云核还没被电离，是暗的；云团之间几乎是空的。G 是尘埃（稠密的云核、暗带、球状体与尘埃柱）。
 * B 是电离前沿：云团朝着黑洞的那一面（密度往背离黑洞的方向升高处）被光削出一条亮边，尘埃柱的尖端也是。数据图必须满 alpha：画布会按透明度预乘
 */
export function paintNebula(s: NebulaSheet, out: Uint8ClampedArray, r0: number, r1: number): void {
  const size = sheetPx(s)
  const ppu = s.ppu
  const pillars = pillarsOf(s)
  const step = 0.2
  for (let py = r0; py < r1; py++) {
    for (let px = 0; px < size; px++) {
      const x = s.x0 + (px + 0.5) / ppu
      const y = s.y0 + (py + 0.5) / ppu
      const r = Math.hypot(x, y)
      const o = ((py - r0) * size + px) * 4
      out[o + 3] = 255
      if (r > s.outerU) {
        out[o] = 0
        out[o + 1] = 0
        out[o + 2] = 0
        continue
      }
      const rho = gasAt(s, x, y)
      const hx = x - s.holeX
      const hy = y - s.holeY
      const hd = Math.hypot(hx, hy) || 1
      const rise = (gasAt(s, x + (hx / hd) * step, y + (hy / hd) * step) - rho) / step
      const cloud = smooth(0.36, 0.53, rho)
      const core = smooth(0.6, 0.74, rho)
      const soft = fbm(x / 2.8, y / 2.8, s.seed + 4, 3)
      const wisp = ridge(fbm(x / 4.6, y / 4.6, s.seed + 5, 3)) ** 3 * smooth(0.3, 0.46, rho)
      let e = cloud * (1 - 0.7 * core) * (0.4 + 0.6 * soft) + wisp * 0.3
      const facing = smooth(1.5, 6, hd)
      const edgeBand = smooth(0.42, 0.46, rho) * (1 - smooth(0.48, 0.55, rho))
      let rim = edgeBand * (facing * smooth(0.04, 0.16, rise) + (1 - facing) * 0.5)
      const lanes = smooth(0.58, 0.78, fbm((x - 3) / 5.5, (y + 5) / 5.5, s.seed + 21, 4)) * 0.55
      const g = cellNearest(x / 3, y / 3, s.seed + 23)
      const globule = g.h > 0.965 ? smooth(0.3, 0.08, Math.hypot(g.dx, g.dy)) * 0.6 : 0
      let d = Math.max(core * 0.6, lanes, globule)
      for (const p of pillars) {
        const c = pillarAt(p, x, y)
        if (c.d > d) d = c.d
        if (c.rim > rim) rim = c.rim
      }
      e *= 1 - 0.5 * d
      if (r > s.wallU) {
        const lit = Math.exp(1 - ((r - s.innerU) / (s.wallU - s.innerU)) ** (s.rise + 1))
        d = d + (1 - d) * (1 - 0.45 * lit)
        e = Math.max(e, 0.35 * soft) * (0.4 + 0.6 * lit)
        rim *= lit
      }
      const edge = smooth(s.outerU, s.outerU - 1.5, r)
      out[o] = clamp01(e * edge) * 255
      out[o + 1] = clamp01(d * edge) * 255
      out[o + 2] = clamp01(rim * edge) * 255
    }
  }
}

/** 要画的是哪一张：星云的数据贴图，或超新星遗迹与行星状星云的图集 */
export type SheetLayer = 'sheet' | 'remnant'

/** 一块画好的像素在贴图上的行范围：[r0, r1) */
export interface SheetBand {
  readonly layer: SheetLayer
  readonly r0: number
  readonly r1: number
}

/** 发给画星云的线程：先 setup，再一条一条要 */
export type SheetJob = { readonly kind: 'setup'; readonly sheet: NebulaSheet } | { readonly kind: 'paint'; readonly index: number; readonly band: SheetBand }

/** 画好的一条 */
export interface SheetPiece {
  readonly index: number
  readonly band: SheetBand
  readonly pixels: Uint8ClampedArray<ArrayBuffer>
}

/** 这一张有多宽，像素 */
export function layerPx(s: NebulaSheet, layer: SheetLayer): number {
  return layer === 'sheet' ? sheetPx(s) : REMNANT_PX
}

export function bandBuffer(s: NebulaSheet, band: SheetBand): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray(layerPx(s, band.layer) * (band.r1 - band.r0) * 4)
}

export function paintBand(s: NebulaSheet, band: SheetBand, out: Uint8ClampedArray): void {
  if (band.layer === 'sheet') paintNebula(s, out, band.r0, band.r1)
  else paintRemnants(s.seed, out, band.r0, band.r1)
}

/** GLSL 的浮点字面量 */
const glsl = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x))
const glslRgb = (c: Rgb): string => `vec3(${c.map(glsl).join(', ')})`
/** 星场按色温分布上色的四个节点：冷的红矮星、橙黄的星、白的星、蓝白的热星 */
const STAR_HUES = [3300, 4800, 6800, 20000].map((k) => glslRgb(hue(planck(k))))

/**
 * 星云的片元着色器：四边形盖住镜头能到的整片，坐标以格计、以球心为原点。画面是透视相机拍的：镜头在活动的平面上方 H 格，
 * 平面上的东西照原样，平面以下越深的东西在画面上越小、跟着镜头移得越慢。
 * 空腔里看到的是球壳下半部的内壁：从镜头经过这个像素往下的光线先被黑洞按 α = 2r_s/b + (15π/16)(r_s/b)² 弯折（b 是光线离黑洞最近的距离），
 * 再打到内壁上，所以黑洞周围的星云被扭曲，正对黑洞后面那一片成像成爱因斯坦环；b 小于阴影半径的光线掉进黑洞，是黑的。
 * 颜色都是真彩色。内壁上是一层稀薄的气体，谁照它、照得多硬，它就发什么光：电离参数高的地方氧被电离两次，[O III] 500.7 nm 发青绿，再高氦也电离两次，
 * He II 468.6 nm 发蓝；低一些是氢复合的 Hα、Hβ、Hγ 按 2.86 : 1 : 0.47 混成的玫红；再低电离度不够，[N II] 与 [S II] 让它偏深红；全电离了就不再更亮。
 * 电离区的边上是一圈电离前沿，云团朝着电离源的那一面被削出亮边。电离源是黑洞的吸积盘（亮度按距离平方反比、入射角与薄盘朝下更亮的方向，
 * 光度取光传过来那一刻的）与天象里的恒星：O 型星电离出一个按斯特龙根半径长大的泡，主星死后氢慢慢复合，二次电离的氧先暗。
 * 尘埃自己不发光，把星光按波长的 −1.7 次方散射出来：被热星照着发蓝，被红超巨星照着发金黄；挡在前面的尘埃按波长消光，蓝光比红光挡得多。
 * 超新星亮起来再边冷却边暗下去，它的光按光速传开、照亮周围的气体与尘埃（光回波）；遗迹按图集画，撞上越稠的气体越亮。
 * 恒星按黑体色上色，少数缓慢地脉动；壳层外缘以外是无穷远处的星与星系。薄层斜着看光程更长，碗沿更亮。
 * 壳层的密度从内壁往外涨：光深到 1 的那一层是看得见的内壁（碗按它的半径画），再往外光照不进去，迅速暗成厚厚的尘埃。
 * 吸积盘是平面上的薄盘：开普勒较差转动，温度按 T ∝ x^(−3/4)(1 − √(3/x))^(1/4) 随半径变，光度涨了温度按四分之一次方涨；
 * 盘面的光按引力红移与横向多普勒 g = √(1 − 3r_s/2r) 降温，颜色与亮度都按普朗克定律取
 */
export const NEBULA_FRAG = `
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
#define SLOTS ${COSMOS_SLOTS}
uniform sampler2D uNeb;
uniform sampler2D uRem;
uniform float uTime;
uniform vec4 uRect;
uniform float uUnit;
uniform vec2 uCenter;
uniform vec3 uCam;
uniform vec4 uSheet;
uniform vec4 uShell;
uniform vec4 uHole;
uniform vec4 uLight;
uniform vec2 uShape;
uniform vec4 uFlareT;
uniform vec4 uFlareT2;
uniform vec4 uFlareK;
uniform vec4 uFlareK2;
uniform vec4 uMeteor;
uniform float uSeed;
uniform float uGlow;
uniform vec3 uDisk;
uniform float uHard;
uniform vec4 uCone;
uniform vec4 uEvAt[SLOTS];
uniform vec4 uEvStar[SLOTS];
uniform vec4 uEvIon[SLOTS];
uniform vec4 uEvScatter[SLOTS];
uniform vec4 uEvRemnant[SLOTS];
uniform vec4 uEvFlash[SLOTS];

const float DISK_GAIN = 0.4;
const float LIMB_MAX = 2.4;
const float ION_SAT = 1.2;
const float HOLE_FLUX = 110.0;
const vec4 SHEET_MEAN = vec4(0.22, 0.3, 0.05, 1.0);
const vec3 LAMBDA = ${glslRgb(LAMBDA)};
const float C2 = ${glsl(C2)};
const float WHITE_K = ${glsl(WHITE_K)};
const vec3 SCATTER = ${glslRgb(scattered([1, 1, 1]))};
const vec3 BALMER = vec3(1.0, 0.16, 0.32);
const vec3 OIII = vec3(0.0, 1.0, 0.7);
const vec3 HEII = vec3(0.12, 0.4, 1.0);
const vec3 LOWEX = vec3(1.0, 0.02, 0.07);
const vec3 SHOCK = vec3(1.0, 0.3, 0.07);
const vec3 SYNC = vec3(0.55, 0.68, 1.0);
const vec3 EXTINCTION = vec3(1.0, 1.25, 1.46);
const float DUST_TAU = 1.0;
const vec3 WALL = vec3(0.008, 0.008, 0.013);
const vec3 DUST = vec3(0.13, 0.115, 0.11);
const vec3 DIFFUSE = vec3(0.07, 0.008, 0.024);
const vec3 METEOR = vec3(1.0, 0.55, 0.25);
const vec3 STAR_RED = ${STAR_HUES[0]};
const vec3 STAR_ORANGE = ${STAR_HUES[1]};
const vec3 STAR_WHITE = ${STAR_HUES[2]};
const vec3 STAR_BLUE = ${STAR_HUES[3]};
const vec3 GALAXY_CORE = ${glslRgb(hue(planck(4500)))};
const vec3 GALAXY_DISK = ${glslRgb(hue(planck(11000)))};
const float SN_RISE = ${glsl(SN_RISE_S)};
const float SN_FALL = ${glsl(SN_FALL_S)};
const float SN_HOT_K = ${glsl(SN_HOT_K)};
const float SN_COOL_K = ${glsl(SN_COOL_K)};
const float SN_COOL_S = ${glsl(SN_COOL_S)};
const float SPAN = ${glsl(REMNANT_SPAN)};
const float PLANETARY = ${glsl(REMNANT_PLANETARY)};

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

float shapeAt(float t) {
  if (t <= 0.0) return 0.0;
  return (uShape.x + uShape.y) / (uShape.y * uShape.y) * (1.0 - exp(-t / uShape.x)) * exp(-t / uShape.y);
}

float lumAt(float t) {
  float l = uLight.y;
  if (dot(uFlareK, vec4(1.0)) + dot(uFlareK2, vec4(1.0)) <= 0.0) return l;
  l += uFlareK.x * shapeAt(t - uFlareT.x) + uFlareK.y * shapeAt(t - uFlareT.y) + uFlareK.z * shapeAt(t - uFlareT.z) + uFlareK.w * shapeAt(t - uFlareT.w);
  l += uFlareK2.x * shapeAt(t - uFlareT2.x) + uFlareK2.y * shapeAt(t - uFlareT2.y) + uFlareK2.z * shapeAt(t - uFlareT2.z) + uFlareK2.w * shapeAt(t - uFlareT2.w);
  return l;
}

/** 黑体在三个通道上的亮度，以白点色温的黑体为 1 */
vec3 planck(float k) {
  vec3 x = C2 / (LAMBDA * max(k, 800.0));
  vec3 x0 = C2 / (LAMBDA * WHITE_K);
  return exp(x0 - x) * (1.0 - exp(-x0)) / (1.0 - exp(-x));
}

vec3 tint(vec3 c) {
  return c / max(max(c.r, c.g), max(c.b, 1e-6));
}

/** 星按色温分布上色：多数是橙黄的冷星，少数是蓝白的热星 */
vec3 starHue(float h) {
  vec3 c = mix(STAR_RED, STAR_ORANGE, smoothstep(0.0, 0.45, h));
  c = mix(c, STAR_WHITE, smoothstep(0.45, 0.78, h));
  return mix(c, STAR_BLUE, smoothstep(0.84, 0.98, h));
}

vec3 starLayer(vec2 p, float scale, float seed, float rare) {
  vec2 g = p * scale;
  vec2 i = floor(g);
  vec2 f = fract(g);
  float h = hash(i + seed);
  float on = step(rare, h);
  vec2 at = vec2(hash(i + seed + 17.1), hash(i + seed + 41.7)) * 0.7 + 0.15;
  float d = length(f - at) / scale * uUnit;
  float b = pow((h - rare) / (1.0 - rare), 3.0);
  float t = hash(i + seed + 5.3);
  float pulse = 1.0 + 0.45 * step(0.88, hash(i + seed + 23.9)) * sin(uTime * (0.7 + hash(i + seed + 31.1)) + h * 40.0);
  return starHue(t) * on * b * (0.7 + 0.6 * t) * pulse * exp(-d * d * 0.35);
}

vec3 stars(vec2 p) {
  return starLayer(p, 1.7, uSeed, 0.86) * 1.4 + starLayer(p, 3.9, uSeed + 7.0, 0.93) * 0.8 + starLayer(p, 0.6, uSeed + 3.0, 0.95) * 2.4;
}

/** 极远处的星系：椭圆星系是一团橙黄的老星，旋涡星系是橙黄的核球外面一圈蓝白的盘 */
vec3 galaxies(vec2 p) {
  vec2 i = floor(p * 0.2);
  if (hash(i + uSeed + 91.0) < 0.5) return vec3(0.0);
  vec2 at = (i + vec2(hash(i + uSeed + 13.0), hash(i + uSeed + 29.0)) * 0.6 + 0.2) / 0.2;
  vec2 d = p - at;
  float ang = hash(i + uSeed + 47.0) * 6.2832;
  vec2 q = vec2(cos(ang) * d.x + sin(ang) * d.y, (cos(ang) * d.y - sin(ang) * d.x) / (0.25 + 0.7 * hash(i + uSeed + 53.0)));
  float size = 0.2 + 0.4 * hash(i + uSeed + 61.0);
  float rr = dot(q, q) / (size * size);
  float spiral = step(0.4, hash(i + uSeed + 71.0));
  float bright = 0.2 + 0.45 * hash(i + uSeed + 83.0) * hash(i + uSeed + 89.0);
  return (GALAXY_CORE * exp(-rr * mix(3.0, 9.0, spiral)) + GALAXY_DISK * exp(-rr * 1.4) * 0.45 * spiral) * bright;
}

/** 吸积盘上第 i 圈薄环里的湍流：整圈按环心的开普勒（Paczyński–Wiita）角速度转，里圈比外圈转得快 */
float diskBand(float i, float ang, float t, float rs, float c) {
  float r = exp((i + 0.5) / 9.0) * rs;
  float ph = ang - c * sqrt(rs / (2.0 * r)) / (r - rs) * t;
  vec2 s = vec2(cos(ph), sin(ph)) * 2.2 + vec2(i * 7.31 + t * 0.2, i * 3.17);
  return vnoise(s) * 0.6 + vnoise(s * 2.6 + 11.0) * 0.4;
}

/** 光线离黑洞最近的距离：它从镜头出发、在平面上过 p 点，每往下一格水平走 v */
float impactAt(vec2 q, vec2 v) {
  return sqrt(max(1e-6, dot(q, q) - pow(dot(q, v), 2.0) / (1.0 + dot(v, v))));
}

/** 光线被黑洞弯过之后，在平面以下每往下一格水平往回走多少：打到的点是 p − K·z */
vec2 bentSlope(vec2 p, vec2 v, vec2 hole, float rs) {
  vec2 q = p - hole;
  float u = rs / impactAt(q, v);
  return q / length(q) * tan(2.0 * u + 2.945 * u * u) - v;
}

/** 沿 p − K·z 往下的光线打到空腔下半部内壁上的点：xy 是那一点在平面上的位置，z 是它在平面下多深 */
vec3 floorHit(vec2 p, vec2 K, float a) {
  float pk = dot(p, K);
  float kk = dot(K, K);
  float z = (pk + sqrt(max(0.0, pk * pk - (kk + 1.0) * (dot(p, p) - a * a)))) / (kk + 1.0);
  return vec3(p - K * z, z);
}

/** 电离气体的复合发光跟着照进来的光走；照得再亮，气体全电离了也就不再更亮 */
float ionized(float flux) {
  return ION_SAT * (1.0 - exp(-flux / ION_SAT));
}

vec4 sheetAt(vec2 s) {
  vec2 uv = (s - uSheet.xy) / uSheet.zw;
  return texture2D(uNeb, vec2(uv.x, 1.0 - uv.y));
}

/** 遗迹图集第 tile 块在局部坐标 l（以遗迹半径为 1）处 */
vec3 remnantAt(vec2 l, float tile) {
  vec2 cell = vec2(mod(tile, 2.0), floor(tile / 2.0));
  vec2 uv = (cell + clamp(l / (2.0 * SPAN) + 0.5, 0.004, 0.996)) * 0.5;
  return texture2D(uRem, vec2(uv.x, 1.0 - uv.y)).rgb;
}

/** 超新星爆发 t 秒后的光变（峰值约 0.8）与色温 */
float snShape(float t) {
  return t <= 0.0 ? 0.0 : (1.0 - exp(-t / SN_RISE)) * exp(-t / SN_FALL);
}

float snTemp(float t) {
  return SN_COOL_K + SN_HOT_K * exp(-max(t, 0.0) / SN_COOL_S);
}

/** 一颗星：亮的核加一圈淡淡的晕，d 以格计 */
float starShape(float d) {
  return exp(-d * d / 0.006) + 0.12 * exp(-d * d / 0.12);
}

/** 嵌在内壁云里的年轻恒星，照亮身边一小团尘埃：热星照出蓝的、冷星照出金黄的反射星云 */
vec3 nests(vec2 p, float dust) {
  vec2 i = floor(p * 0.2);
  float h = hash(i + uSeed + 101.0);
  if (h < 0.7) return vec3(0.0);
  vec2 at = (i + 0.3 + vec2(hash(i + uSeed + 107.0), hash(i + uSeed + 113.0)) * 0.4) / 0.2;
  vec2 d = p - at;
  float rr = dot(d, d);
  float size = 0.35 + 0.3 * hash(i + uSeed + 127.0);
  vec3 c = starHue(hash(i + uSeed + 131.0) * 0.45 + 0.55 * step(0.5, hash(i + uSeed + 137.0)));
  float bright = 0.4 + 0.6 * (h - 0.7) / 0.3;
  return c * bright * (SCATTER * exp(-rr / (size * size)) * (0.2 + dust) * 0.7 + starShape(sqrt(rr)) * 0.9);
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 world = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  vec2 p = (world - uCenter) / uUnit;
  vec2 v = (world - uCam.xy) / uUnit / uCam.z;
  vec2 hole = uHole.xy;
  float rs = uHole.z;
  float a = uShell.x;
  float outer = uShell.y;
  float inner = uShell.z;
  vec2 q = p - hole;
  float b = length(q);
  float shadowR = 2.598 * rs;
  float bp = impactAt(q, v);
  float now = uTime;
  float c = uLight.x;
  vec2 hm = uMeteor.xy;
  float r = length(p);
  vec3 col = vec3(0.0);

  if (bp > shadowR) {
    vec2 K = bentSlope(p, v, hole, rs);
    vec2 sky = -K * uCam.z;
    float floorOn = step(r, a);
    float shellOn = step(a, r) * step(r, outer);
    float body = floorOn + shellOn;
    vec3 hit = floorHit(p, K, a);
    vec2 s = mix(p, hit.xy, floorOn);
    vec3 P = vec3(s, -hit.z * floorOn);
    vec3 n = floorOn > 0.5 ? -P / a : vec3(-p / max(r, 1e-3), 0.0);
    float blur = smoothstep(0.25, 0.35, rs / bp) * floorOn;
    float sharp = 1.0 - blur;
    vec4 raw = sheetAt(s);
    vec4 nb = mix(raw, SHEET_MEAN, blur) * body;
    vec2 grad = (vec2(sheetAt(s + vec2(0.2, 0.0)).r, sheetAt(s + vec2(0.0, 0.2)).r) - raw.r) * 5.0 * sharp * body;
    float skin = mix(exp(1.0 - pow(max(0.0, r - inner) / (a - inner), uShell.w + 1.0)), 1.0, floorOn);
    float limb = floorOn > 0.5 ? min(LIMB_MAX, 1.0 / max(0.05, abs(dot(normalize(vec3(-K, -1.0)), n)))) : LIMB_MAX * skin;

    vec3 L = vec3(hole, 0.0) - P;
    float d = length(L);
    vec3 Ld = L / d;
    float flux = lumAt(now - d / c) * max(dot(n, Ld), 0.0) * (0.3 + 0.7 * abs(Ld.z)) / (d * d) * HOLE_FLUX;
    float cone = smoothstep(uCone.w - 0.08, uCone.w + 0.04, dot(-Ld, uCone.xyz));
    flux *= 1.0 + 0.6 * cone;
    float lit = ionized(flux);
    float U = flux / (0.35 + nb.r) * (0.6 + 0.9 * uHard) * (1.0 + 3.0 * cone);
    float hi = smoothstep(0.35, 1.8, U);
    float he = smoothstep(4.0, 10.0, U);
    float low = 1.0 - smoothstep(0.1, 0.7, U);
    vec3 line = DIFFUSE + lit * 0.7 * (mix(BALMER, LOWEX, low * 0.7) * (1.0 - 0.75 * hi) + mix(OIII, HEII, he) * hi * 1.1);
    vec3 glow = uDisk * SCATTER * flux * 0.05;
    vec3 rims = mix(BALMER, OIII, hi) * nb.b * lit * 0.55 * skin;

    vec3 M = vec3(hm, 0.0) - P;
    float dm = length(M);
    float mflux = uMeteor.z * max(dot(n, M / dm), 0.0) / (dm * dm + 1.0) * 40.0 * uMeteor.w;
    glow += METEOR * mflux * 0.1;
    line += SHOCK * ionized(mflux) * 0.4;

    vec3 fil = vec3(0.0);
    vec3 pts = vec3(0.0);
    for (int i = 0; i < SLOTS; i++) {
      vec4 at = uEvAt[i];
      if (at.w < 0.5) continue;
      vec3 D = P - at.xyz;
      float dd = length(D);
      vec4 ion = uEvIon[i];
      if (ion.z > 0.0) {
        float R = ion.x * (1.15 - 0.5 * nb.r);
        float inside = 1.0 - smoothstep(R * 0.72, R, dd);
        float high = 1.0 - smoothstep(ion.y * 0.5, ion.y, dd);
        line += ion.z * inside * (BALMER * (1.0 - 0.75 * high) + OIII * high * 1.1);
        line += ion.w * LOWEX * exp(-pow((dd - R) / (0.1 * R + 0.3), 2.0));
        rims += ion.z * inside * max(0.0, dot(grad, D.xy) / max(dd, 1e-3)) * mix(BALMER, OIII, high) * 0.35 * skin;
      }
      vec4 sc = uEvScatter[i];
      glow += sc.rgb / (dd * dd + 2.0) * (1.0 - smoothstep(sc.w * 0.5, sc.w, dd));
      vec4 fl = uEvFlash[i];
      vec4 rem = uEvRemnant[i];
      vec3 nC = normalize(at.xyz);
      vec3 t1 = normalize(vec3(-nC.y, nC.x, 0.0) + vec3(1e-4, 0.0, 0.0));
      vec3 t2 = cross(nC, t1);
      vec4 st = uEvStar[i];
      if (dd < 3.0 && sharp > 0.0) {
        float k0 = starShape(dd);
        if (st.w > 0.0) {
          for (int k = 1; k < 5; k++) {
            float fk = float(k);
            vec2 off = (vec2(hash(vec2(fl.z, fk)), hash(vec2(fk, fl.z + 3.1))) - 0.5) * 2.0 * st.w;
            k0 += (0.3 + 0.4 * hash(vec2(fl.z + fk, 7.7))) * starShape(length(D - t1 * off.x - t2 * off.y));
          }
        }
        pts += st.rgb * k0 * sharp;
      }
      if (fl.y > 0.0) {
        float te = now - fl.x;
        if (dd < 3.0) pts += tint(planck(snTemp(te))) * snShape(te) * (starShape(dd) * 6.0 + 0.5 * exp(-dd * dd / 1.2)) * sharp;
        float echo = snShape(te - dd / c) / (dd * dd + 1.0) * 30.0;
        line += ionized(echo) * mix(BALMER, OIII, 0.6);
        glow += tint(planck(snTemp(te - dd / c))) * SCATTER * echo * 0.08;
      }
      if (rem.z > 0.0 && dd < rem.x * SPAN) {
        vec2 l = vec2(dot(D, t1), dot(D, t2)) / rem.x;
        float ca = cos(rem.w);
        float sa = sin(rem.w);
        l = vec2(ca * l.x - sa * l.y, (sa * l.x + ca * l.y) / fl.w);
        vec3 m = remnantAt(l, rem.y) * rem.z * sharp;
        if (abs(rem.y - PLANETARY) < 0.5) fil += m.r * mix(OIII, HEII, 0.35) + m.g * mix(BALMER, LOWEX, 0.5) + m.b * LOWEX * 0.6;
        else fil += (m.r * OIII + m.g * SHOCK + m.b * SYNC) * (0.5 + nb.r);
      }
    }

    float dust = nb.g;
    vec3 ext = exp(-dust * DUST_TAU * EXTINCTION);
    vec2 starAt = mix(sky, s, floorOn);
    vec3 star = stars(starAt) * sharp;
    vec3 shine = (nb.r * limb * line + fil * skin) * ext + pts * skin * sqrt(ext) + glow * (dust + 0.25 * nb.r) * skin + rims;
    float clear = smoothstep(outer - 2.5, outer, r) * (1.0 - dust);
    vec3 far = star;
    if (floorOn < 0.5 && (shellOn < 0.5 || clear > 0.0)) far += galaxies(sky);
    vec3 onFloor = (WALL + star * 0.5) * (1.0 - dust) + DUST * dust * 0.05 + shine + nests(s, dust) * sharp * sqrt(ext);
    vec3 inShell = mix(DUST * 0.06 * (0.4 + nb.r), far, clear) + shine;
    col = floorOn * onFloor + shellOn * inShell + (1.0 - body) * far;
  }

  float ri = 3.0 * rs;
  float ro = uHole.w * rs;
  float tq = uGlow;
  if (b < ro && b > ri * 0.97) {
    float x = b / rs;
    float prof = pow(3.0 / x, 0.75) * pow(max(0.0, 1.0 - sqrt(3.0 / x)), 0.25) / 0.488;
    float temp = uLight.w * prof * sqrt(max(0.0, 1.0 - 1.5 / x)) * tq;
    float ang = atan(q.y, q.x);
    float rb = log(x) * 9.0 - 0.5;
    float i = floor(rb);
    float churn = mix(diskBand(i, ang, now, rs, c), diskBand(i + 1.0, ang, now, rs, c), smoothstep(0.0, 1.0, fract(rb)));
    vec3 disk = planck(temp) * (0.6 + 0.8 * churn) * DISK_GAIN;
    float cover = smoothstep(ri * 0.97, ri * 1.05, b) * (1.0 - smoothstep(ro * 0.82, ro, b)) * (0.75 + 0.25 * churn);
    col = mix(col, disk, cover);
  }
  if (bp < shadowR * 1.2) {
    float ring = exp(-pow((bp - shadowR * 1.02) / (rs * 0.05), 2.0));
    col += planck(uLight.w * 0.8 * tq) * DISK_GAIN * 0.5 * ring;
  }

  vec2 mq = p - hm;
  float mglow = uMeteor.z * uMeteor.w / (dot(mq, mq) * 9.0 + 1.0);
  col += METEOR * mglow * 0.08;
  col = 1.0 - exp(-col * uLight.z);
  gl_FragColor = vec4(col, 1.0);
}
`

/** 柔软的一团：中心实、边缘淡出，带一点絮状 */
export function drawCloud(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c
      const fluff = 0.7 + 0.3 * fbm(x / 8, y / 8, 19, 3)
      const o = (y * size + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = clamp01(1 - d) ** 1.7 * fluff * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 发光的点：星尘、火星都用它，靠着色得到颜色 */
export function drawGlint(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c
      const o = (y * size + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = clamp01(1 - d) ** 2.4 * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * 吸积盘照在周围身体上的光：从阴影的边往外按距离平方反比变暗，阴影里没有光。
 * 贴图半径对应 edge 个阴影半径，叠加混合
 */
export function drawHalo(ctx: CanvasRenderingContext2D, size: number, edge: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const rho = (Math.hypot(x - c, y - c) / c) * edge
      const o = (y * size + x) * 4
      const inner = smooth(1, 1.25, rho)
      const fall = 1 / (1 + (rho - 1) * (rho - 1) * 0.9)
      const fade = smooth(edge, edge * 0.7, rho)
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = clamp01(inner * fall * fade) * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}
