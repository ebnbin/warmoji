import type { DesertPlan } from './terrain'

/** 给地面着色器的一张数据图，按地形格子每格一个像素、不透明：G 是晒得到几成太阳，印子只在晒得到的地方照出阴阳面 */
export function encodeInfo(p: DesertPlan): Uint8ClampedArray<ArrayBuffer> {
  const n = p.cols
  const out = new Uint8ClampedArray(n * n * 4)
  for (let k = 0; k < n * n; k++) {
    out[k * 4 + 1] = p.sun[k]! * 255
    out[k * 4 + 3] = 255
  }
  return out
}

/**
 * 地面的片元着色器：四边形跟着镜头，盖住看得到的那一片，坐标按世界像素、y 朝下；画布纹理上传时上下翻了，所以纹理的 v 取 1 − y/一圈。
 * 三张图都按一圈平铺：边长不是 2 的幂的贴图显卡不肯重复，坐标先折回一圈里；沙地与印子的格子细，接缝处差不到一个格子，
 * 晒到的太阳格子粗，按四个格心自己插值才接得上。沙地照搬画好的贴图；印子按盖下以来过了多久往平地收，按太阳打出阴阳面，坑底暗、翻出来的沙略深
 */
export const GROUND_FRAG = `
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
uniform sampler2D uSand;
uniform sampler2D uTracks;
uniform sampler2D uInfo;
uniform vec4 uRect;
uniform vec2 uPeriod;
/** 晒到的太阳那张图每边几格 */
uniform float uInfoN;
/** 印子贴图每边几格、高的编码范围（米）、时刻的一档（秒）、此刻（秒） */
uniform vec4 uTrack;
/** 一圈多少格、一格多少米、印子过多少秒被吹平 */
uniform vec3 uScale;
uniform vec3 uSun;

/** 印子此刻的高（米）：盖下时的高按过了多久往平地收 */
float trackH(vec2 uv) {
  vec4 c = texture2D(uTracks, fract(uv));
  float h0 = (c.r * 255.0 - 128.0) / 127.0 * uTrack.y;
  float t0 = (c.g * 65280.0 + c.b * 255.0) * uTrack.z;
  return h0 * max(0.0, 1.0 - (uTrack.w - t0) / uScale.z);
}

/** 晒到几成太阳：四个格心按一圈折回再插值 */
float litAt(vec2 uv) {
  vec2 q = uv * uInfoN - 0.5;
  vec2 i = floor(q);
  vec2 f = q - i;
  vec2 a = (mod(i, uInfoN) + 0.5) / uInfoN;
  vec2 b = (mod(i + 1.0, uInfoN) + 0.5) / uInfoN;
  float g00 = texture2D(uInfo, a).g;
  float g10 = texture2D(uInfo, vec2(b.x, a.y)).g;
  float g01 = texture2D(uInfo, vec2(a.x, b.y)).g;
  float g11 = texture2D(uInfo, b).g;
  return mix(mix(g00, g10, f.x), mix(g01, g11, f.x), f.y);
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 p = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  vec2 uv = fract(vec2(p.x / uPeriod.x, 1.0 - p.y / uPeriod.y));
  vec3 col = texture2D(uSand, uv).rgb;
  float lit = litAt(uv);

  float tx = 1.0 / uTrack.x;
  float h = trackH(uv);
  float hx = trackH(uv + vec2(tx, 0.0)) - trackH(uv - vec2(tx, 0.0));
  float hy = trackH(uv - vec2(0.0, tx)) - trackH(uv + vec2(0.0, tx));
  float span = 2.0 * uScale.x / uTrack.x * uScale.y;
  vec3 n = normalize(vec3(-hx / span, -hy / span, 1.0));
  float direct = max(dot(n, uSun), 0.0) / uSun.z;
  float relief = mix(1.0, direct, 0.8 * lit) * (1.0 - 0.35 * clamp(-h / 0.05, 0.0, 1.0));
  float dug = smoothstep(0.0015, 0.01, abs(h));
  col *= relief * mix(vec3(1.0), vec3(0.94, 0.9, 0.87), dug);
  gl_FragColor = vec4(col, 1.0);
}
`
