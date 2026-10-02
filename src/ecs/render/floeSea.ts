import { UNIT } from '../../util/units.ts'
import { Rng } from '../../util/rng.ts'
import { bilinear, smooth } from '../worlds/floe.ts'
import type { FloeField } from '../worlds/floe.ts'
import { clamp01, TOWARD } from './floe.ts'

/** 冰缘图存的范围：水里离冰缘 −4 到 12 格（冰上为负） */
const SHORE_MIN_U = -4
const SHORE_SPAN_U = 16

/**
 * 给海面着色器的冰缘图：每个距离场的格子一个像素。水里离冰缘多远（格）拆成 16 位放进 R、G，线性插值后仍是线性的；
 * B 是浮冰挡住低低的太阳在水面投下的影子：朝太阳看 shadeU 格以内有冰就在影子里
 */
export function drawShore(ctx: CanvasRenderingContext2D, f: FloeField, shadeU: number): void {
  const img = ctx.createImageData(f.cols, f.rows)
  const steps = Math.max(2, Math.ceil(shadeU / 0.1))
  for (let j = 0; j < f.rows; j++) {
    for (let i = 0; i < f.cols; i++) {
      const k = j * f.cols + i
      const water = -f.edge[k]!
      const v = Math.round(clamp01((water - SHORE_MIN_U) / SHORE_SPAN_U) * 65535)
      let near = Infinity
      if (water > -0.3 && water < shadeU + 0.3) {
        for (let s = 1; s <= steps; s++) {
          const t = (s / steps) * shadeU * UNIT
          near = Math.min(near, -bilinear(f.edge, f.cols, f.rows, f.cell, 0, 0, (i + 0.5) * f.cell + TOWARD.x * t, (j + 0.5) * f.cell + TOWARD.y * t, -9))
        }
      }
      img.data[k * 4] = v >> 8
      img.data[k * 4 + 1] = v & 255
      img.data[k * 4 + 2] = Math.round(smooth(0.15, -0.25, near) * 255)
      img.data[k * 4 + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

export const NOISE_TILE = 256

/** 一块能无缝平铺的噪声：R、G、B 是三层互不相干的值噪声，各叠三个八度；给油脂冰、碎冰、冰脚、海烟用。按画布的 y 往下算 */
export function drawSeaNoise(ctx: CanvasRenderingContext2D, seed: number): void {
  const n = NOISE_TILE
  const lattice = 16
  const r = new Rng(seed)
  const layers = [0, 1, 2].map(() => Float32Array.from({ length: lattice * lattice }, () => r.next()))
  const value = (v: Float32Array, x: number, y: number): number => {
    const fx = (x / n) * lattice
    const fy = (y / n) * lattice
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const tx = fx - ix
    const ty = fy - iy
    const sx = tx * tx * (3 - 2 * tx)
    const sy = ty * ty * (3 - 2 * ty)
    const at = (a: number, b: number): number => v[(((b % lattice) + lattice) % lattice) * lattice + (((a % lattice) + lattice) % lattice)]!
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx
    const bot = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx
    return top + (bot - top) * sy
  }
  const img = ctx.createImageData(n, n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4
      for (let c = 0; c < 3; c++) {
        const v = layers[c]!
        img.data[i + c] = Math.round((value(v, x, y) * 0.6 + value(v, x * 2 + 37, y * 2 + 11) * 0.3 + value(v, x * 4 + 5, y * 4 + 71) * 0.1) * 255)
      }
      // 画布纹理按预乘 alpha 上传，A 不满会把 R、G、B 一起压掉
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}


/**
 * 南大洋的海面，四边形盖住整片海，坐标按地图像素、y 朝下；纹理坐标 y 朝上，画布纹理上传时也上下翻了，采样时取反。
 * 没有风，深而暗的冷水平得像镜子，只随远处传来的长涌缓缓起伏，朝着低低的太阳那一面略亮；冷静的水面上漂着一片片发乌的油脂冰，
 * 随水慢慢聚散。冰缘外一圈是水下的冰脚，清水里透出青绿，越往外越深越暗；水线上一道细细的亮边。
 * 浮冰挡住低低的太阳，在背阳的一侧水面投下影子。四周浮着大大小小的碎冰，九成在水下、四周透出青绿；极冷的空气压在稍暖的海水上，
 * 水面冒起一缕缕白汽，没有风就在原地慢慢翻腾
 */
export const FLOE_SEA_FRAG = `
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
uniform sampler2D uNoise;
uniform sampler2D uShore;
uniform float uTime;
uniform vec4 uRect;
uniform vec3 uGrid;
uniform vec3 uSun;
uniform vec4 uSwell;
uniform float uSwellSlope;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

vec2 hash2(vec2 p) {
  return vec2(hash(p), hash(p + 17.31));
}

// 冰缘图：x 是水里离冰缘多远（格，冰上为负），y 是浮冰投在水面上的影子
vec2 shore(vec2 world) {
  vec2 uv = world / uGrid.xy;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return vec2(12.0, 0.0);
  vec4 e = texture2D(uShore, vec2(uv.x, 1.0 - uv.y));
  return vec2((e.r * 65280.0 + e.g * 255.0) / 65535.0 * ${SHORE_SPAN_U.toFixed(1)} + ${SHORE_MIN_U.toFixed(1)}, e.b);
}

vec3 noise(vec2 q) {
  return texture2D(uNoise, vec2(q.x, -q.y)).rgb;
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 world = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  vec2 edge = shore(world);
  float d = edge.x;
  float shadow = edge.y;
  if (d < -0.2) {
    gl_FragColor = vec4(0.04, 0.07, 0.08, 1.0);
    return;
  }
  float unit = uGrid.z;
  vec2 p = world / unit;
  vec2 sunH = normalize(uSun.xy);

  // 长涌：两列按深水的色散推过来，第二列短一些、矮一半
  vec2 sw2 = normalize(vec2(uSwell.y, -uSwell.x) * 0.6 + uSwell.xy * 0.8);
  float ph = dot(p, uSwell.xy) * uSwell.z - uSwell.w * uTime;
  float ph2 = dot(p, sw2) * uSwell.z * 1.7 - uSwell.w * 1.3 * uTime + 1.7;
  vec2 slope = (uSwell.xy * cos(ph) + sw2 * 0.85 * cos(ph2)) * uSwellSlope;

  // 冷水深而暗，映着头顶偏蓝的天；涌浪朝着太阳的一面略亮
  vec3 nl = normalize(vec3(-slope * 6.0, 1.0));
  float relief = clamp((dot(nl, uSun) - uSun.z) * 2.5, -1.0, 1.0) * (1.0 - 0.6 * shadow);
  vec3 col = mix(vec3(0.02, 0.075, 0.095), vec3(0.065, 0.18, 0.21), clamp(0.45 + relief * 0.35, 0.0, 1.0));
  col = mix(col, vec3(0.3, 0.42, 0.52), 0.05);

  // 油脂冰：一片片发乌发哑的冰屑浆，压住了水面的反光，随水慢慢聚散
  float n1 = noise(p / 60.0 + vec2(0.11, 0.37) + uTime * vec2(0.0006, 0.0004)).r;
  float n2 = noise(p / 27.0 + vec2(0.71, 0.05) - uTime * vec2(0.0009, 0.0013)).g;
  float grease = smoothstep(0.52, 0.72, n1 * 0.7 + n2 * 0.3) * smoothstep(0.2, 1.0, d);
  float grain = noise(p / 2.5 + 0.21).b;
  col = mix(col, vec3(0.09, 0.13, 0.15) + 0.05 * (grain - 0.5), grease * 0.6);

  // 水下的冰脚：冰缘外一圈在清水里泛着青绿，越往外越深越暗
  float ram = 0.55 + 0.45 * noise(p / 23.0 + 0.37).b;
  float under = exp(-max(d, 0.0) / (0.6 + 0.8 * ram)) * smoothstep(-0.05, 0.04, d);
  col = mix(col, vec3(0.1, 0.42, 0.46) * (0.85 + 0.15 * relief), under * 0.75 * (1.0 - 0.6 * grease));
  col *= 1.0 - 0.4 * shadow;

  // 碎冰：大大小小有棱有角的冰块，冰缘边上最密、越往外越稀；冰块九成在水下，四周透出一圈青绿
  vec2 bp = p / 0.7;
  vec2 ip = floor(bp);
  vec2 fp = fract(bp);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 c1 = vec2(0.0);
  float h1 = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = g + hash2(ip + g) * 0.85 + 0.075 - fp;
      float e2 = dot(o, o);
      if (e2 < d1) {
        d2 = d1;
        d1 = e2;
        c1 = o;
        h1 = hash(ip + g + 7.3);
      } else if (e2 < d2) {
        d2 = e2;
      }
    }
  }
  // 一块冰有没有按它中心那一点的疏密定，免得被疏密的等值线切开
  vec2 cw = world + c1 * 0.7 * unit;
  float cd = shore(cw).x;
  float cclump = smoothstep(0.3, 0.7, noise((p + c1 * 0.7) / 31.0 + 0.13).g);
  if (h1 < (0.5 * exp(-max(cd, 0.0) / 1.5) + 0.07 * cclump) * smoothstep(0.1, 0.45, cd)) {
    float inside = sqrt(d2) - sqrt(d1);
    float gap = 0.1 + 0.34 * fract(h1 * 17.3);
    float plate = smoothstep(gap, gap + 0.025, inside);
    float halo = smoothstep(gap - 0.2, gap, inside) * (1.0 - plate);
    float rim = smoothstep(gap + 0.14, gap + 0.02, inside);
    float face = dot(normalize(-c1 + 0.0001), sunH);
    // 有的块顶着雪，有的是光冰，有的薄得透出海水；背阳的一边在水上落一小片影子
    float kind = fract(h1 * 29.0);
    vec3 top = kind < 0.5 ? vec3(0.9, 0.94, 0.96) : kind < 0.82 ? vec3(0.66, 0.79, 0.84) : mix(col, vec3(0.5, 0.66, 0.7), 0.55);
    float lit = 0.9 + 0.24 * rim * face + 0.1 * (noise(bp * 0.37 + h1).g - 0.5);
    col = mix(col, vec3(0.1, 0.42, 0.46), halo * 0.6);
    col *= 1.0 - 0.35 * halo * max(-face, 0.0);
    col = mix(col, top * lit * (1.0 - 0.32 * shadow), plate);
  }

  // 水线：冰缘贴着水面一道细细的亮边
  float line = (1.0 - smoothstep(0.02, 0.09, d)) * smoothstep(-0.12, -0.02, d);
  col = mix(col, vec3(0.78, 0.88, 0.9) * (1.0 - 0.3 * shadow), line * 0.7);

  // 海烟：一缕缕白汽贴着水面冒起来，在原地慢慢翻腾
  float m1 = noise(p / 70.0 + vec2(0.5, 0.2) + uTime * vec2(0.0012, -0.0008)).r;
  float m2 = noise(p / 30.0 + vec2(0.13, 0.77) - uTime * vec2(0.0021, 0.0027)).g;
  float mist = smoothstep(0.55, 0.85, m1 * 0.6 + m2 * 0.4) * smoothstep(0.5, 3.0, d);
  col = mix(col, vec3(0.74, 0.82, 0.87), mist * 0.1);
  gl_FragColor = vec4(col, 1.0);
}
`
