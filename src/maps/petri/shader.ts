import type { ColonyField } from './model'

/** 把菌落场编进数据图：红是密度，蓝是熟度（长熟 matureS 秒算满） */
export function encodeColony(f: ColonyField, matureS: number, out: Uint8ClampedArray): void {
  const n = f.u.length
  for (let i = 0; i < n; i++) {
    const o = i * 4
    out[o] = f.u[i]! * 255
    out[o + 1] = 0
    out[o + 2] = Math.min(1, f.age[i]! / matureS) * 255
    out[o + 3] = 255
  }
}

/**
 * 菌落：按数据图画在琼脂上。密度过 uEdge 的地方是奶白、不透光的菌落，边缘按噪声扭得高低不齐，别处什么都不画、露出干净的琼脂；
 * 厚度是密度乘熟度，熟的地方表面起皱，按厚度的梯度朝着灯打光，圆顶上一点湿亮的高光
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
uniform float uEdge;

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
  float mature = d.b;
  float ragged = (vnoise(cell * 1.3) - 0.5) * 0.12 + (vnoise(cell * 3.1 + 5.0) - 0.5) * 0.03;
  float a = smoothstep(uEdge - 0.03, uEdge + 0.03, u + ragged);

  float hR = height(at + vec2(px.x, 0.0), cell + vec2(1.0, 0.0));
  float hL = height(at - vec2(px.x, 0.0), cell - vec2(1.0, 0.0));
  float hD = height(at - vec2(0.0, px.y), cell + vec2(0.0, 1.0));
  float hU = height(at + vec2(0.0, px.y), cell - vec2(0.0, 1.0));
  vec3 n = normalize(vec3(-(hR - hL) * 1.3, -(hD - hU) * 1.3, 1.0));
  vec3 l = normalize(uLight);
  vec3 h = normalize(l + vec3(0.0, 0.0, 1.0));
  float dif = max(dot(n, l), 0.0);
  float spec = pow(max(dot(n, h), 0.0), 24.0);
  vec3 cream = mix(vec3(0.97, 0.945, 0.89), vec3(0.935, 0.9, 0.81), mature);
  vec3 shade = vec3(0.84, 0.77, 0.65);
  vec3 col = mix(shade, cream, clamp(0.8 + (dif - 0.52) * 1.2, 0.0, 1.0)) + vec3(1.0, 0.99, 0.95) * spec * 0.45;

  float inDish = 1.0 - smoothstep(uDish.z - 0.6, uDish.z, length(cell - uDish.xy));
  a *= inDish;
  gl_FragColor = vec4(col * a, a);
}
`
