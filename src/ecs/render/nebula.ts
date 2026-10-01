import { cellEdge, cellNearest, fbm, valueNoise } from '../../util/noise'

/** 星云数据贴图每格多少像素：气体是软的，细节交给着色器 */
export const NEBULA_PPU = 16

/** 要画的那一块，以球心为原点、格计：左上角与边长；hole 是黑洞离球心的偏移 */
export interface NebulaSheet {
  readonly x0: number
  readonly y0: number
  readonly sizeU: number
  readonly innerU: number
  readonly outerU: number
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

/** 一根尘埃柱：尖端在 (x, y)，沿 (ux, uy) 往外伸 len 格，最宽 width 格；从黑洞那边看过去它正对着黑洞，是被它的光一点点削出来的 */
interface Pillar {
  readonly x: number
  readonly y: number
  readonly ux: number
  readonly uy: number
  readonly len: number
  readonly width: number
  readonly seed: number
}

/** 尘埃柱立在空腔边上一圈，尖端朝着黑洞 */
function pillarsOf(s: NebulaSheet): Pillar[] {
  const out: Pillar[] = []
  const n = 13
  for (let i = 0; i < n; i++) {
    const h = (k: number): number => valueNoise(i * 3.7 + k * 11.3, k * 5.1 + 0.5, s.seed + 61)
    const a = ((i + 0.5 + (h(1) - 0.5) * 0.7) / n) * Math.PI * 2
    const r = s.innerU * (0.66 + 0.24 * h(2))
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    const dx = x - s.holeX
    const dy = y - s.holeY
    const d = Math.hypot(dx, dy) || 1
    out.push({ x, y, ux: dx / d, uy: dy / d, len: 3 + 4 * h(3), width: 0.55 + 0.75 * h(4), seed: s.seed + 71 + i * 13 })
  }
  return out
}

/** 一根柱子在 (x, y) 处的柱密度与被照亮的边：越往根部越粗，轮廓带着絮状的起伏，里面疏密不匀，尖端圆钝，根部埋进内壁；亮边是被光蒸发出来的气体，裹在朝着黑洞的尖端外面 */
function pillarAt(p: Pillar, x: number, y: number): { d: number; rim: number } {
  const ox = x - p.x
  const oy = y - p.y
  const t = ox * p.ux + oy * p.uy
  if (t < -2.5 || t > p.len + 1.5) return { d: 0, rim: 0 }
  const across = ox * p.uy - oy * p.ux
  const side = Math.abs(across)
  const grow = 0.35 + 0.65 * Math.sqrt(Math.max(0, Math.min(1, t / p.len)))
  const ragged = (fbm(t * 0.9, across * 0.9, p.seed, 2) - 0.5) * 0.7 + (fbm(t * 2.6, across * 2.6, p.seed + 5, 2) - 0.5) * 0.35
  const w = p.width * grow * (1 + ragged)
  const dist = t < 0 ? Math.hypot(t, side) : side
  const core = 0.65 + 0.35 * fbm(t * 1.4, across * 1.4, p.seed + 9, 2)
  const body = smooth(w * 1.05, w * 0.55, dist) * smooth(p.len + 1.5, p.len - 1, t) * core
  const front = smooth(w * 1.6, w, dist) * (1 - smooth(w, w * 0.7, dist))
  return { d: body, rim: front * smooth(p.len * 0.7, 0, t) }
}

/**
 * 星云数据贴图：俯视时空腔下面是球壳下半部的内壁，壳层与外面的深空按离球心多远分开。逐像素：
 * R 是会发光的气体（大团的云、里面翻卷的湍流与细丝，按扭曲过的坐标采样），G 是尘埃的柱密度（暗带、零散的球状体与尘埃柱），
 * B 是尘埃柱尖端朝着黑洞那一圈被照亮的边。数据图必须满 alpha：画布会按透明度预乘
 */
export function paintNebula(s: NebulaSheet, out: Uint8ClampedArray, r0: number, r1: number): void {
  const size = sheetPx(s)
  const ppu = s.ppu
  const pillars = pillarsOf(s)
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
      const wx = (fbm(x / 7, y / 7, s.seed + 2, 2) - 0.5) * 5
      const wy = (fbm(x / 7 + 9, y / 7 - 7, s.seed + 3, 2) - 0.5) * 5
      const cloud = smooth(0.28, 0.78, fbm(x / 10, y / 10, s.seed + 1, 3))
      const churn = smooth(0.3, 0.85, fbm((x + wx) / 3.4, (y + wy) / 3.4, s.seed + 4, 4))
      const thread = ridge(fbm((x + wx * 0.7) / 2.1, (y + wy * 0.7) / 2.1, s.seed + 5, 3)) ** 6
      let e = cloud * (0.3 + 0.7 * churn) + thread * (0.08 + 0.32 * cloud)
      const lanes = smooth(0.52, 0.8, fbm((x - wy) / 5, (y + wx) / 5, s.seed + 21, 4)) * 0.75
      const g = cellNearest(x / 2.6, y / 2.6, s.seed + 23)
      const globule = g.h > 0.94 ? smooth(0.32, 0.1, Math.hypot(g.dx, g.dy)) * 0.7 : 0
      let d = Math.max(lanes, globule)
      let rim = 0
      for (const p of pillars) {
        const c = pillarAt(p, x, y)
        if (c.d > d) d = c.d
        if (c.rim > rim) rim = c.rim
      }
      e *= 1 - 0.6 * d
      if (r > s.innerU) {
        const depth = smooth(s.innerU, s.innerU + 1.6, r)
        d = d + (1 - d) * (0.55 + 0.35 * depth)
        e *= 1 - 0.6 * depth
        rim *= 1 - depth
      }
      const edge = smooth(s.outerU, s.outerU - 1.5, r)
      out[o] = clamp01(e * edge) * 255
      out[o + 1] = clamp01(d * edge) * 255
      out[o + 2] = clamp01(rim * edge) * 255
    }
  }
}

/** 一块画好的像素在贴图上的行范围：[r0, r1) */
export interface SheetBand {
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

export function bandBuffer(s: NebulaSheet, band: SheetBand): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray(sheetPx(s) * (band.r1 - band.r0) * 4)
}

/**
 * 星云的片元着色器：四边形盖住镜头能到的整片，坐标以格计、以球心为原点。
 * 空腔里看到的是球壳下半部的内壁：从这个像素竖直往下的光线先被黑洞按 α = 2r_s/b + (15π/16)(r_s/b)² 弯折，再打到内壁上，
 * 所以黑洞周围的星云被扭曲，正下方那一片成像成爱因斯坦环；b 小于阴影半径的光线掉进黑洞，是黑的。
 * 内壁只有被吸积盘照到的一层薄皮发光：亮度按到黑洞的距离平方反比、入射角与薄盘朝下更亮的辐射方向，光度取光传过来那一刻的（光回波）；
 * 薄皮斜着看光程更长，碗沿更亮。壳层在平面上是厚厚的尘埃，只有朝空腔那一面被照亮；外缘以外是深空的星。
 * 吸积盘是正对着看的薄盘：开普勒较差转动，温度按 T ∝ x^(−3/4)(1 − √(3/x))^(1/4) 随半径变，光度涨了温度按四分之一次方涨，颜色取黑体色
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
uniform sampler2D uNeb;
uniform float uTime;
uniform vec4 uRect;
uniform float uUnit;
uniform vec2 uCenter;
uniform vec4 uSheet;
uniform vec2 uShell;
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

const float DISK_GAIN = 2.6;
const float LIMB_MAX = 3.2;
const vec4 SHEET_MEAN = vec4(0.3, 0.35, 0.0, 1.0);

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

vec3 blackbody(float k) {
  float t = clamp(k, 1000.0, 15000.0) / 100.0;
  float r = t <= 66.0 ? 1.0 : clamp(1.2929 * pow(t - 60.0, -0.1332), 0.0, 1.0);
  float g = t <= 66.0 ? clamp(0.3901 * log(t) - 0.6318, 0.0, 1.0) : clamp(1.1299 * pow(t - 60.0, -0.0755), 0.0, 1.0);
  float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.5432 * log(t - 10.0) - 1.1963, 0.0, 1.0));
  return vec3(r, g, b);
}

float starLayer(vec2 p, float scale, float seed, float rare) {
  vec2 g = p * scale;
  vec2 i = floor(g);
  vec2 f = fract(g);
  float h = hash(i + seed);
  float on = step(rare, h);
  vec2 at = vec2(hash(i + seed + 17.1), hash(i + seed + 41.7)) * 0.7 + 0.15;
  float d = length(f - at) / scale * uUnit;
  float b = pow((h - rare) / (1.0 - rare), 3.0);
  return on * b * exp(-d * d * 0.35);
}

float stars(vec2 p) {
  return starLayer(p, 1.7, uSeed, 0.86) * 1.4 + starLayer(p, 3.9, uSeed + 7.0, 0.93) * 0.8 + starLayer(p, 0.6, uSeed + 3.0, 0.95) * 2.4;
}

vec3 litColor(float flux) {
  float heat = flux / (flux + 0.8);
  vec3 c = mix(vec3(0.78, 0.26, 0.24), vec3(1.0, 0.58, 0.3), smoothstep(0.25, 0.75, heat));
  return mix(c, vec3(1.0, 0.88, 0.72), smoothstep(0.8, 1.0, heat));
}

/** 吸积盘上第 i 圈薄环里的湍流：整圈按环心的开普勒（Paczyński–Wiita）角速度转，里圈比外圈转得快 */
float diskBand(float i, float ang, float t, float rs, float c) {
  float r = exp((i + 0.5) / 9.0) * rs;
  float ph = ang - c * sqrt(rs / (2.0 * r)) / (r - rs) * t;
  vec2 s = vec2(cos(ph), sin(ph)) * 2.2 + vec2(i * 7.31 + t * 0.2, i * 3.17);
  return vnoise(s) * 0.6 + vnoise(s * 2.6 + 11.0) * 0.4;
}

/** 从 p 竖直往下看的光线被黑洞弯折后打到内壁上的点：xy 是那一点在平面上的位置，z 是它在平面下多深 */
vec3 floorHit(vec2 p, vec2 hole, float rs, float a) {
  vec2 q = p - hole;
  float b = length(q);
  float u = rs / b;
  vec2 k = q / b * tan(2.0 * u + 2.945 * u * u);
  float pk = dot(p, k);
  float kk = dot(k, k);
  float z = (pk + sqrt(max(0.0, pk * pk - (kk + 1.0) * (dot(p, p) - a * a)))) / (kk + 1.0);
  return vec3(p - k * z, z);
}

vec4 sheetAt(vec2 s) {
  vec2 uv = (s - uSheet.xy) / uSheet.zw;
  return texture2D(uNeb, vec2(uv.x, 1.0 - uv.y));
}

vec3 starTint(vec2 p) {
  float h = hash(floor(p * 1.7) + uSeed + 5.0);
  return mix(vec3(1.0, 0.82, 0.62), vec3(0.78, 0.86, 1.0), step(0.7, h));
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 world = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  vec2 p = (world - uCenter) / uUnit;
  vec2 hole = uHole.xy;
  float rs = uHole.z;
  float a = uShell.x;
  float outer = uShell.y;
  vec2 q = p - hole;
  float b = length(q);
  float shadowR = 2.598 * rs;
  float now = uTime;
  float c = uLight.x;
  vec3 col = vec3(0.01, 0.008, 0.01);
  vec2 hm = uMeteor.xy;
  float r = length(p);

  if (b > shadowR) {
    if (r < a) {
      vec3 hit = floorHit(p, hole, rs, a);
      vec2 s = hit.xy;
      float z = hit.z;
      float blur = 0.0;
      if (rs / b > 0.06) {
        vec2 rq = q / b;
        float px = 1.0 / uUnit;
        float foot = max(length(floorHit(p + rq * px, hole, rs, a).xy - s), length(floorHit(p + vec2(-rq.y, rq.x) * px, hole, rs, a).xy - s));
        blur = smoothstep(0.06, 0.4, foot);
      }
      vec4 nb = mix(sheetAt(s), SHEET_MEAN, blur);
      vec3 P = vec3(s, -z);
      vec3 L = vec3(hole, 0.0) - P;
      float d = length(L);
      vec3 Ld = L / d;
      vec3 n = -P / a;
      float inc = max(dot(n, Ld), 0.0);
      float beam = 0.3 + 0.7 * abs(Ld.z);
      float limb = min(LIMB_MAX, 1.0 / max(0.05, sqrt(max(0.0, 1.0 - dot(s, s) / (a * a)))));
      float lum = lumAt(now - d / c);
      float flux = lum * inc * beam / (d * d) * 260.0;
      vec3 M = vec3(hm, 0.0) - P;
      float dm = length(M);
      flux += uMeteor.z * max(dot(n, M / dm), 0.0) / (dm * dm + 1.0) * 40.0 * uMeteor.w;
      float grain = mix(0.8 + 0.4 * vnoise(s * 4.3 + uSeed), 1.0, blur);
      float e = nb.r * limb * grain;
      float dustv = nb.g;
      vec3 glow = e * (vec3(0.09, 0.035, 0.045) + litColor(flux) * flux * 0.6);
      vec3 rim = nb.b * (flux * vec3(1.0, 0.62, 0.38) * 0.4 * (0.4 + 1.2 * vnoise(s * 3.1 + uSeed + 9.0)) + vec3(0.05, 0.015, 0.03));
      vec3 scatter = dustv * flux * vec3(0.3, 0.17, 0.1) * 0.12;
      col = (glow + col) * (1.0 - 0.8 * dustv) + dustv * vec3(0.025, 0.016, 0.012) + rim + scatter;
      col += starTint(s) * stars(s) * 0.35 * (1.0 - dustv) * (1.0 - min(1.0, nb.r * 1.5)) * (1.0 - blur);
    } else if (r < outer) {
      vec4 nb = sheetAt(p);
      vec2 nIn = -p / r;
      vec2 L = hole - p;
      float d = length(L);
      float inc = max(dot(nIn, L / d), 0.0);
      float lum = lumAt(now - d / c);
      float into = r - a;
      float skin = exp(-into / 0.7);
      float flux = lum * inc * 0.3 / (d * d) * 260.0;
      vec2 M = hm - p;
      float dm = length(M);
      flux += uMeteor.z * max(dot(nIn, M / dm), 0.0) / (dm * dm + 1.0) * 40.0 * uMeteor.w;
      vec3 deep = vec3(0.045, 0.028, 0.024) * (0.4 + nb.r);
      vec3 face = nb.r * LIMB_MAX * skin * (vec3(0.09, 0.035, 0.045) + litColor(flux) * flux * 0.6) + nb.b * flux * vec3(1.0, 0.62, 0.38) * 0.4 * skin;
      float clear = smoothstep(outer - 2.5, outer, r) * (1.0 - nb.g);
      col = mix(deep, col, clear) + face;
      col += starTint(p) * stars(p) * clear;
    } else {
      col += starTint(p) * stars(p);
    }

    float ri = 3.0 * rs;
    float ro = uHole.w * rs;
    float tq = uGlow;
    if (b < ro * 1.15) {
      float x = b / rs;
      float prof = pow(3.0 / x, 0.75) * pow(max(0.0, 1.0 - sqrt(3.0 / x)), 0.25) / 0.488;
      float temp = uLight.w * prof * sqrt(max(0.0, 1.0 - 1.5 / x)) * tq;
      float ang = atan(q.y, q.x);
      float rb = log(x) * 9.0 - 0.5;
      float i = floor(rb);
      float churn = mix(diskBand(i, ang, now, rs, c), diskBand(i + 1.0, ang, now, rs, c), smoothstep(0.0, 1.0, fract(rb)));
      float heat = temp / uLight.w;
      vec3 disk = blackbody(temp) * heat * heat * heat * heat * (0.6 + 0.8 * churn) * DISK_GAIN;
      float cover = smoothstep(ri * 0.97, ri * 1.05, b) * (1.0 - smoothstep(ro * 0.55, ro * 1.15, b)) * (0.55 + 0.45 * churn);
      col = mix(col, disk, cover);
    }
    if (b < shadowR * 1.2) {
      float ring = exp(-pow((b - shadowR * 1.02) / (rs * 0.05), 2.0));
      float tr = uLight.w * 0.8 * tq;
      col += blackbody(tr) * pow(tr / uLight.w, 4.0) * DISK_GAIN * 0.5 * ring;
    }
  } else {
    col = vec3(0.0);
  }

  vec2 mq = p - hm;
  float mglow = uMeteor.z * uMeteor.w / (dot(mq, mq) * 9.0 + 1.0);
  col += vec3(1.0, 0.55, 0.25) * mglow * 0.08;
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

/** 流星的本体：一块不规则的暗色石头，迎着黑洞的那一面被照亮，裂缝里透着被冲压烧红的光 */
export function drawRock(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c
      const dy = (y - c) / c
      const a = Math.atan2(dy, dx)
      const edge = 0.74 + 0.14 * Math.sin(a * 3 + 1.1) + 0.07 * Math.sin(a * 7 + 0.4)
      const d = Math.hypot(dx, dy) / edge
      const o = (y * size + x) * 4
      if (d > 1.2) {
        img.data[o + 3] = 0
        continue
      }
      const crack = cellEdge(x / 5, y / 5, 47)
      const hot = Math.max(smooth(0.1, 0, crack) * 0.85, smooth(0.78, 1, d) * 0.7)
      const shade = 0.7 + 0.3 * (dx * 0.6 - dy * 0.8)
      img.data[o] = 46 * shade + (255 - 46 * shade) * hot
      img.data[o + 1] = 34 * shade + (150 - 34 * shade) * hot
      img.data[o + 2] = 32 * shade + (70 - 32 * shade) * hot
      img.data[o + 3] = (d <= 1 ? 1 : smooth(1.2, 1, d) * 0.6) * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}
