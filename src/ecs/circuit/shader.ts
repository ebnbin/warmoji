import { COPPER_REACH_U, NET_SLOTS } from './layout'
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
 * 带电的铜：盖在地面贴图上，只在带电的铜边上画，铜本身还是金的。通着电时铜边上一圈细光断断续续、乱跳乱闪，
 * 铜面微微泛冷光，边外一层薄光晕；刚通电那一下整片闪白；快通电时铜边上零星蹦出亮点，越临近越密。
 * 图案按很短的间隔整个跳成新的样子，不朝哪个方向移动。输出按预乘透明度：铜边的光盖上去，光晕和闪白只往上加
 */
export const CURRENT_FRAG = `${HEADER}
uniform sampler2D uCopper;
uniform sampler2D uDist;
uniform sampler2D uNets;
uniform vec4 uArea;
uniform float uTime;
uniform float uReach;
uniform float uSlots;
${NOISE}
void main ()
{
  vec2 tc = outTexCoord;
  float id = floor(texture2D(uCopper, tc).r * 255.0 + 0.5) - 1.0;
  if (id < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 net = texture2D(uNets, vec2((id + 0.5) / uSlots, 0.5)).rgb;
  float level = net.r;
  float warn = net.g * (1.0 - level);
  float flash = net.b;
  if (level < 0.01 && warn < 0.01 && flash < 0.01) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float d = texture2D(uDist, tc).r * (uReach + 1.0) - 1.0;
  vec2 p = uArea.xy + vec2(tc.x, 1.0 - tc.y) * uArea.zw;
  float cover = 1.0 - smoothstep(-0.03, 0.03, d);
  float edge = exp(-abs(d) / 0.05);
  float halo = exp(-max(d, 0.0) / 0.2) * (1.0 - cover);
  vec3 deep = vec3(0.36, 0.42, 1.0);
  vec3 glow = vec3(0.56, 0.61, 1.0);
  vec3 core = vec3(0.96, 0.97, 1.0);
  vec2 jump = hash2(vec2(mod(floor(uTime * 18.0), 997.0), id)) * 97.0;
  float flick = 0.55 + 0.45 * hash2(vec2(mod(floor(uTime * 26.0), 997.0), id + 7.0)).x;
  float bits = smoothstep(0.42, 0.8, vnoise(p * 2.4 + jump));
  float lit = edge * bits * level * flick;
  vec2 spot = hash2(vec2(mod(floor(uTime * 22.0), 997.0), id + 3.0)) * 89.0;
  float spit = edge * warn * (0.1 + step(1.0 - 0.32 * warn, vnoise(p * 3.3 + spot)));
  // 铜边上的光盖上去（金面上也是蓝紫的），光晕与刚通电的白光往上加
  float a = clamp((lit + spit) * 0.6, 0.0, 0.8);
  vec3 col = deep * (lit + spit) * 0.9 + glow * halo * 0.14 * level * flick + core * cover * 0.05 * level;
  col += (core * cover * 0.85 + glow * (halo + edge) * 0.7) * flash;
  gl_FragColor = vec4(col, a);
}
`

/**
 * 带电的铜编成两张数据图，每格一个像素、不透明（画布会按透明度预乘，数据必须满 alpha）：
 * copper 的 R 是网络编号加一（0 是没有），按最近点取；dist 的 R 是离铜多远（铜里为负），按 [−1, COPPER_REACH_U] 格拉开，能线性插值
 */
export function encodeCopper(g: CopperGrid): { copper: Uint8ClampedArray<ArrayBuffer>; dist: Uint8ClampedArray<ArrayBuffer> } {
  const n = g.cols * g.rows
  const copper = new Uint8ClampedArray(n * 4)
  const dist = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    copper[i * 4] = g.net[i]! + 1
    copper[i * 4 + 3] = 255
    dist[i * 4] = Math.round(((Math.min(COPPER_REACH_U, Math.max(-1, g.dist[i]!)) + 1) / (COPPER_REACH_U + 1)) * 255)
    dist[i * 4 + 3] = 255
  }
  return { copper, dist }
}

/** 网络状态图：每条网络一个像素，R 通没通电，G 离通电还有多近，B 刚通电闪白还剩多少（0 到 1） */
export function encodeNets(out: Uint8ClampedArray, nets: readonly { level: number; warn: number }[], flash: readonly number[]): void {
  out.fill(0)
  for (let i = 0; i < NET_SLOTS; i++) {
    const n = nets[i]
    const o = i * 4
    if (n) {
      out[o] = n.level * 255
      out[o + 1] = n.warn * 255
      out[o + 2] = (flash[i] ?? 0) * 255
    }
    out[o + 3] = 255
  }
}
