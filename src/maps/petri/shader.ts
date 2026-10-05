import type { ColonyField } from './model'

/** 数据图里溶菌物质的浓度按这么多倍最低抑菌浓度存满一个字节：再浓也只画成最浓 */
export const LYSIN_SCALE = 4

/** 把菌落场编进数据图：红是密度，绿是溶菌物质的浓度，蓝是熟度（长熟 matureS 秒算满） */
export function encodeColony(f: ColonyField, matureS: number, out: Uint8ClampedArray): void {
  const n = f.u.length
  for (let i = 0; i < n; i++) {
    const o = i * 4
    out[o] = f.u[i]! * 255
    out[o + 1] = Math.min(1, f.m[i]! / LYSIN_SCALE) * 255
    out[o + 2] = Math.min(1, f.age[i]! / matureS) * 255
    out[o + 3] = 255
  }
}

/**
 * 菌落：按数据图画在琼脂上。密度过一半的地方是奶白、不透光的菌落，边缘按噪声扭得高低不齐；前沿是一层半透明的薄膜，被灯箱从下面透亮；
 * 厚度是密度乘熟度，熟的地方表面起皱，按厚度的梯度朝着灯打光，圆顶上一点湿亮的高光；正被溶掉的菌落变得半透明。
 * 抑菌圈里铺一层金黄的透明光，边界上一道亮线，随浓度衰减慢慢缩小；前沿外一圈琼脂被溶血，透得亮一点
 */
export const COLONY_FRAG = `
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
uniform sampler2D uData;
uniform vec2 uGrid;
uniform vec3 uDish;
uniform vec3 uLight;
uniform float uLysin;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float height(vec2 at, vec2 cell) {
  vec4 d = texture2D(uData, at);
  float swell = vnoise(cell * 0.45) * 0.7 + vnoise(cell * 1.1 + 7.0) * 0.3;
  return d.r * (0.5 + 0.5 * d.b) + (swell - 0.5) * 0.08 * d.b * d.r;
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 cell = vec2(tc.x, 1.0 - tc.y) * uGrid;
  vec2 px = 1.0 / uGrid;
  vec2 wob = vec2(vnoise(cell * 0.5 + 3.0), vnoise(cell * 0.5 + 19.0)) - 0.5;
  vec2 at = tc + vec2(wob.x, -wob.y) * 1.2 * px;
  vec4 d = texture2D(uData, at);
  float u = d.r;
  float m = d.g * uLysin;
  float mature = d.b;
  float ragged = (vnoise(cell * 1.3) - 0.5) * 0.12 + (vnoise(cell * 3.1 + 5.0) - 0.5) * 0.03;
  float body = smoothstep(0.4, 0.46, u + ragged);
  float film = smoothstep(0.06, 0.14, u + ragged * 0.5) * 0.24;
  float a = max(body, film) * (1.0 - 0.6 * smoothstep(0.55, 1.0, m));

  float hR = height(at + vec2(px.x, 0.0), cell + vec2(1.0, 0.0));
  float hL = height(at - vec2(px.x, 0.0), cell - vec2(1.0, 0.0));
  float hD = height(at - vec2(0.0, px.y), cell + vec2(0.0, 1.0));
  float hU = height(at + vec2(0.0, px.y), cell - vec2(0.0, 1.0));
  vec3 n = normalize(vec3(-(hR - hL) * 1.3, -(hD - hU) * 1.3, 1.0));
  vec3 l = normalize(uLight);
  vec3 h = normalize(l + vec3(0.0, 0.0, 1.0));
  float dif = max(dot(n, l), 0.0);
  float spec = pow(max(dot(n, h), 0.0), 24.0);
  vec3 cream = mix(vec3(0.97, 0.94, 0.86), vec3(0.94, 0.89, 0.75), mature);
  vec3 shade = vec3(0.84, 0.76, 0.62);
  vec3 col = mix(shade, cream, clamp(0.8 + (dif - 0.52) * 1.2, 0.0, 1.0)) + vec3(1.0, 0.99, 0.95) * spec * 0.45;
  float thin = film * (1.0 - body);
  col = mix(col, vec3(0.98, 0.84, 0.8), thin * 0.5);

  float zone = smoothstep(0.9, 1.5, m) * (0.14 + 0.1 * smoothstep(1.5, 4.0, m));
  float ring = exp(-pow((m - 1.0) / 0.1, 2.0)) * step(0.3, m) * 0.5;
  float ha = clamp(zone + ring, 0.0, 0.8);
  float lead = smoothstep(0.004, 0.03, u) * (1.0 - smoothstep(0.06, 0.16, u + ragged * 0.5)) * 0.18;

  float inDish = 1.0 - smoothstep(uDish.z - 0.6, uDish.z, length(cell - uDish.xy));
  a *= inDish;
  ha *= inDish;
  lead *= inDish;
  vec3 pre = vec3(1.0, 0.8, 0.36) * ha + vec3(1.0, 0.45, 0.3) * lead * (1.0 - ha);
  float pa = ha + lead * (1.0 - ha);
  pre = col * a + pre * (1.0 - a);
  pa = a + pa * (1.0 - a);
  gl_FragColor = vec4(pre, pa);
}
`
