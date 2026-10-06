import type { Look } from './author'

/** 把每块此刻的样子编进状态图：每块一列，上一行是铅笔稿、墨线、色块到了几成，下一行是褪到几成、画成哪一季、橡皮来回擦的方向 */
export function encodeState(looks: readonly Look[], seasons: Uint8Array, scrub: Float32Array, out: Uint8ClampedArray): void {
  const n = looks.length
  for (let i = 0; i < n; i++) {
    const l = looks[i]!
    const a = i * 4
    const b = (n + i) * 4
    out[a] = l.pencil * 255
    out[a + 1] = l.line * 255
    out[a + 2] = l.fill * 255
    out[a + 3] = 255
    out[b] = l.fade * 255
    out[b + 1] = (seasons[i]! / 3) * 255
    out[b + 2] = (((scrub[i]! % Math.PI) + Math.PI) % Math.PI / Math.PI) * 255
    out[b + 3] = 255
  }
}

/**
 * 这一页上的三种状态，按每块此刻的样子合成，盖在纸上：
 * 铅笔稿是淡灰的线，按绕块心的方向一笔笔起出来，墨稿盖上去就看不见了；墨线跟着笔尖绕块边描深，色块从块边往块心填满，正在填的那一圈颜色湿一点、深一点；
 * 褪去时颜色先变灰、再变淡，墨线跟着淡下去，按橡皮擦的方向一道道不匀地褪，褪尽就只剩纸
 */
export const PAGE_FRAG = `
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
uniform sampler2D uId;
uniform sampler2D uLine;
uniform sampler2D uPencil;
uniform sampler2D uInk;
uniform sampler2D uState;
uniform float uCount;
uniform vec2 uSize;

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

void main ()
{
  vec2 tc = outTexCoord;
  float id = floor(texture2D(uId, tc).r * 255.0 + 0.5);
  if (id < 0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float u = (id - 0.5) / uCount;
  vec4 s0 = texture2D(uState, vec2(u, 0.75));
  vec4 s1 = texture2D(uState, vec2(u, 0.25));
  float season = floor(s1.g * 3.0 + 0.5);
  vec2 q = vec2(mod(season, 2.0), floor(season / 2.0));
  vec2 at = vec2(q.x * 0.5 + tc.x * 0.5, 0.5 - q.y * 0.5 + tc.y * 0.5);
  vec4 L = texture2D(uLine, tc);
  vec4 P = texture2D(uPencil, at);
  vec3 ink = texture2D(uInk, at).rgb;
  vec2 wp = vec2(tc.x, 1.0 - tc.y) * uSize;

  float arc = L.g;
  float order = P.g;
  float pencil = P.r * smoothstep(arc - 0.025, arc, s0.r) * step(0.002, s0.r);
  float lineOn = smoothstep(arc, arc + 0.006, s0.g + 0.003) * step(0.002, s0.g);
  float fillOn = smoothstep(order - 0.05, order, s0.b) * step(0.002, s0.b);
  float wet = s0.b < 0.999 ? 1.0 - smoothstep(0.0, 0.07, s0.b - order) : 0.0;
  float cf = L.b * fillOn;
  float cl = L.r * lineOn;

  // 橡皮按一个方向来回擦：沿着擦的方向拉长的噪声，让各处褪得不匀
  float ang = s1.b * 3.14159265;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 sp = vec2(dot(wp, dir), dot(wp, vec2(-dir.y, dir.x)));
  float streak = vnoise(sp * vec2(0.025, 0.35)) * 0.7 + vnoise(sp * vec2(0.05, 0.9)) * 0.3;
  float e = clamp(s1.r * 1.3 - streak * 0.3, 0.0, 1.0);
  float gray = smoothstep(0.0, 0.45, e);
  float gone = smoothstep(0.45, 1.0, e);

  vec3 fc = ink * (1.0 - 0.16 * wet);
  float lum = dot(fc, vec3(0.299, 0.587, 0.114));
  fc = mix(fc, vec3(lum) * 0.55 + vec3(0.42), gray);
  cf *= 1.0 - gone;
  vec3 lc = mix(vec3(0.15, 0.12, 0.11), vec3(0.62, 0.6, 0.58), gray);
  cl *= (1.0 - smoothstep(0.15, 0.9, e)) * 0.95;
  float cp = pencil * 0.62 * (1.0 - cf);

  vec3 col = vec3(0.4, 0.41, 0.44) * cp;
  float a = cp;
  col = fc * cf + col * (1.0 - cf);
  a = cf + a * (1.0 - cf);
  col = lc * cl + col * (1.0 - cl);
  a = cl + a * (1.0 - cl);
  gl_FragColor = vec4(col, a);
}
`
