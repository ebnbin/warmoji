import { ALONG_SPAN_U, COPPER_REACH_U, NET_SLOTS } from './layout'
import type { CopperGrid } from './layout'


/** 着色器用的噪声：格点哈希与平滑的值噪声 */
const NOISE = `
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash2(i).x;
  float b = hash2(i + vec2(1.0, 0.0)).x;
  float c = hash2(i + vec2(0.0, 1.0)).x;
  float d = hash2(i + vec2(1.0, 1.0)).x;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
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

/**
 * 电流：盖在地面贴图上，只在带电的铜和它周围画。通着电的铜发出霓虹青光，铜心更白，一道道亮纹顺着电流从电源往外淌，
 * 光洒到旁边的板面上；电正沿线冲过去时，冲到的那一头格外亮；快要通电的时钟线上一节节青光沿线往外爬，越临近通电越快越急。
 * 输出按预乘透明度：通电的铜盖住底下的金，洒出去的光只往上加
 */
export const CURRENT_FRAG = `${HEADER}
uniform sampler2D uCopper;
uniform sampler2D uDist;
uniform sampler2D uNets;
uniform vec4 uArea;
uniform float uTime;
uniform float uSpan;
uniform float uReach;
uniform float uSlots;
${NOISE}
float decode16(vec2 hl) {
  return (hl.x * 255.0 * 256.0 + hl.y * 255.0) / 65535.0;
}

void main ()
{
  vec2 tc = outTexCoord;
  float id = floor(texture2D(uCopper, tc).r * 255.0 + 0.5) - 1.0;
  if (id < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec4 na = texture2D(uNets, vec2((id * 2.0 + 0.5) / (uSlots * 2.0), 0.5));
  vec4 nb = texture2D(uNets, vec2((id * 2.0 + 1.5) / (uSlots * 2.0), 0.5));
  float level = na.r;
  float warn = nb.r;
  if (level < 0.01 && warn < 0.01) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec4 f = texture2D(uDist, tc);
  float d = f.r * (uReach + 1.0) - 1.0;
  float along = f.g * uSpan;
  float front = decode16(na.gb) * uSpan;
  vec2 p = uArea.xy + vec2(tc.x, 1.0 - tc.y) * uArea.zw;
  float travelling = step(front, uSpan * 0.99);
  float lit = level * smoothstep(front + 0.2, front - 0.2, along);
  float head = level * travelling * exp(-pow((along - front) / 0.45, 2.0));
  float cover = smoothstep(0.035, -0.035, d);
  float depth = -d;
  // 一道道亮纹顺着电流从电源往外淌
  float flow = 0.72 + 0.28 * sin(along * 2.4 - uTime * 9.0);
  float flick = 0.86 + 0.14 * vnoise(p * 6.0 + vec2(uTime * 17.0, -uTime * 13.0));
  // 大块的铜面上电一团团地翻涌
  float sheet = smoothstep(0.45, 0.9, depth);
  float boil = mix(1.0, 0.7 + 0.45 * vnoise(p * 2.2 + vec2(uTime * 2.3, uTime * 1.7)), sheet);
  vec3 neon = vec3(0.1, 0.82, 1.0);
  vec3 hot = vec3(0.78, 1.0, 1.0);
  float e = lit * flow * flick * boil;
  float white = smoothstep(0.2, 0.55, depth) * (1.0 - sheet * 0.6) * 0.65;
  vec3 col = mix(neon, hot, white) * (0.5 + 0.6 * e);
  float a = cover * clamp(lit * 0.95 + head, 0.0, 1.0);
  float spill = exp(-max(d, 0.0) / 0.38) * (1.0 - cover);
  vec3 glow = neon * spill * lit * 0.5 * flow;
  vec3 spark = hot * head * (cover * 0.9 + spill * 1.1);
  // 预警：一节节青光顺着线往外爬，越临近通电爬得越快、闪得越急
  float w = warn * (1.0 - level);
  float march = smoothstep(0.45, 0.95, sin(along * 3.2 - uTime * (7.0 + 9.0 * w)));
  float blink = 0.55 + 0.45 * step(0.0, sin(uTime * (10.0 + 26.0 * w)));
  vec3 hint = neon * w * blink * (cover * (0.1 + 0.75 * march) + spill * 0.18 * march);
  gl_FragColor = vec4(col * a + glow + spark + hint, a);
}
`

/**
 * 带电的铜编成两张数据图，每格一个像素、不透明（画布会按透明度预乘，数据必须满 alpha）：
 * copper 的 R 是网络编号加一（0 是没有），按最近点取；dist 的 R 是离铜多远（铜里为负），按 [−1, COPPER_REACH_U] 格拉开，
 * G 是沿铜离电源多远，按 [0, ALONG_SPAN_U] 格拉开，都能线性插值
 */
export function encodeCopper(g: CopperGrid): { copper: Uint8ClampedArray<ArrayBuffer>; dist: Uint8ClampedArray<ArrayBuffer> } {
  const n = g.cols * g.rows
  const copper = new Uint8ClampedArray(n * 4)
  const dist = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    copper[i * 4] = g.net[i]! + 1
    copper[i * 4 + 3] = 255
    dist[i * 4] = Math.round(((Math.min(COPPER_REACH_U, Math.max(-1, g.dist[i]!)) + 1) / (COPPER_REACH_U + 1)) * 255)
    dist[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, g.along[i]! / ALONG_SPAN_U)) * 255)
    dist[i * 4 + 3] = 255
  }
  return { copper, dist }
}

/** 网络状态图：每条网络两个像素，头一个是通没通电与电冲到了多远（高低字节），后一个是预警的程度 */
export function encodeNets(out: Uint8ClampedArray, nets: readonly { level: number; front: number; warn: number }[]): void {
  out.fill(0)
  nets.forEach((n, i) => {
    if (i >= NET_SLOTS) return
    const f = Math.round(Math.min(1, Math.max(0, n.front / ALONG_SPAN_U)) * 65535)
    const o = i * 8
    out[o] = n.level * 255
    out[o + 1] = f >> 8
    out[o + 2] = f & 255
    out[o + 3] = 255
    out[o + 4] = n.warn * 255
    out[o + 7] = 255
  })
  for (let i = nets.length; i < NET_SLOTS; i++) {
    out[i * 8 + 3] = 255
    out[i * 8 + 7] = 255
  }
}
