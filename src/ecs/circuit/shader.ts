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
 * 光洒到旁边的板面上；电正沿线冲过去时，冲到的那一头格外亮；快要通电的时钟线上细碎的火花沿线爬，忽明忽暗。
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
  vec4 c = texture2D(uCopper, tc);
  float id = floor(c.r * 255.0 + 0.5) - 1.0;
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
  float along = decode16(c.gb) * uSpan;
  float front = decode16(na.gb) * uSpan;
  float d = texture2D(uDist, tc).r * (uReach + 1.0) - 1.0;
  vec2 p = uArea.xy + vec2(tc.x, 1.0 - tc.y) * uArea.zw;
  float travelling = step(front, uSpan * 0.99);
  float lit = level * smoothstep(front + 0.12, front - 0.12, along);
  float head = level * travelling * exp(-pow((along - front) / 0.45, 2.0));
  float cover = smoothstep(0.035, -0.035, d);
  float core = smoothstep(0.0, 0.32, -d);
  float flow = 0.7 + 0.3 * sin(along * 2.4 - uTime * 9.0);
  float flick = 0.86 + 0.14 * vnoise(vec2(along * 3.0 - uTime * 21.0, (p.x + p.y) * 0.8));
  vec3 neon = vec3(0.3, 0.9, 1.0);
  vec3 hot = vec3(0.86, 1.0, 1.0);
  float e = lit * flow * flick;
  vec3 col = mix(neon * 0.9, hot, core * 0.75) * (0.55 + 0.45 * e);
  float a = cover * clamp(lit * 0.94 + head, 0.0, 1.0);
  float spill = exp(-max(d, 0.0) / 0.5) * (1.0 - cover);
  vec3 glow = neon * spill * lit * 0.42 * flow;
  vec3 spark = hot * head * (cover * 0.8 + spill * 0.9);
  float w = warn * (1.0 - level);
  float crawl = step(0.8, vnoise(vec2(along * 4.5 - uTime * 16.0, floor(uTime * 14.0) + id * 7.0)));
  float pulse = 0.5 + 0.5 * sin(uTime * (14.0 + 30.0 * w));
  vec3 hint = neon * w * (cover * (0.12 + 0.55 * crawl * pulse) + spill * 0.1 * pulse);
  gl_FragColor = vec4(col * a + glow + spark + hint, a);
}
`

/**
 * 带电的铜编成两张数据图，每格一个像素、不透明（画布会按透明度预乘，数据必须满 alpha）：
 * copper 的 R 是网络编号加一（0 是没有），G、B 是沿铜离电源多远的高低字节；dist 的 R 是离铜多远（铜里为负），按 [−1, COPPER_REACH_U] 格拉开
 */
export function encodeCopper(g: CopperGrid): { copper: Uint8ClampedArray<ArrayBuffer>; dist: Uint8ClampedArray<ArrayBuffer> } {
  const n = g.cols * g.rows
  const copper = new Uint8ClampedArray(n * 4)
  const dist = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    const net = g.net[i]!
    const a = Math.round(Math.min(1, Math.max(0, g.along[i]! / ALONG_SPAN_U)) * 65535)
    copper[i * 4] = net + 1
    copper[i * 4 + 1] = a >> 8
    copper[i * 4 + 2] = a & 255
    copper[i * 4 + 3] = 255
    dist[i * 4] = Math.round(((Math.min(COPPER_REACH_U, Math.max(-1, g.dist[i]!)) + 1) / (COPPER_REACH_U + 1)) * 255)
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
