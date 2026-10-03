import { UNIT } from '../../util/units'
import { floorAt } from './terrain'
import type { DesertPlan } from './terrain'

/**
 * 给地面着色器的一张数据图，按地形格子每格一个像素、不透明：R 是沙有多松，G 是晒得到几成太阳，B 是盐壳占几成。
 * 着色器按它定风沙贴着哪里跑、印子在哪里有太阳照出的阴阳面、蜃景浮在哪里
 */
export function encodeInfo(p: DesertPlan): Uint8ClampedArray<ArrayBuffer> {
  const n = p.cols
  const out = new Uint8ClampedArray(n * n * 4)
  const f = { gravel: 0, crust: 0, sheet: 0 }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      floorAt(p, (i + 0.5) * p.cell, (j + 0.5) * p.cell, f)
      out[k * 4] = p.soft[k]! * 255
      out[k * 4 + 1] = p.sun[k]! * 255
      out[k * 4 + 2] = f.crust * (1 - p.soft[k]!) * 255
      out[k * 4 + 3] = 255
    }
  }
  return out
}

/**
 * 地面的片元着色器：四边形跟着镜头，盖住看得到的那一片，坐标按世界像素、y 朝下；画布纹理上传时上下翻了，所以纹理的 v 取 1 − y/一圈。
 * 三张图都按一圈平铺，接缝处严丝合缝。沙地照搬画好的贴图；印子按此刻落了多深的沙算出现在的高，按太阳打出阴阳面，坑底暗、翻出来的沙略深；
 * 起沙的风把沙粒贴着地面吹成一条条顺风摆动的沙带，带子里细亮的沙纹飞快地往下风跑，松沙上多、沙暴时满地都是；风平时远处的盐壳上浮着天色的蜃景，走近就没了；沙暴遮住太阳，地面发暗发黄
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
/** 印子贴图每边几格、高的编码范围（米）、风沙深度的一档（米）、此刻一共落了多深（米） */
uniform vec4 uTrack;
/** 一圈多少格、一格多少米 */
uniform vec2 uScale;
uniform vec3 uSun;
uniform float uTime;
uniform vec4 uWind;
uniform float uStorm;
uniform vec3 uCam;

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

/** 印子此刻的高（米）：盖下时的高按之后又落下的沙往平地收 */
float trackH(vec2 uv) {
  vec4 c = texture2D(uTracks, uv);
  float h0 = (c.r * 255.0 - 128.0) / 127.0 * uTrack.y;
  float f0 = (c.g * 65280.0 + c.b * 255.0) * uTrack.z;
  float left = max(0.0, abs(h0) - max(0.0, uTrack.w - f0));
  return h0 < 0.0 ? -left : left;
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 p = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  vec2 uv = vec2(p.x / uPeriod.x, 1.0 - p.y / uPeriod.y);
  vec3 col = texture2D(uSand, uv).rgb;
  vec4 info = texture2D(uInfo, uv);
  float loose = info.r;
  float lit = info.g * (1.0 - 0.75 * uStorm);
  float crust = info.b;

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

  vec2 wd = vec2(uWind.x, uWind.y);
  vec2 q = p / ${UNIT.toFixed(1)};
  float along = dot(q, wd);
  float across = dot(q, vec2(-wd.y, wd.x));
  float run = uWind.z / uScale.y * 0.35;
  float band = smoothstep(0.42, 0.8, vnoise(vec2(along * 0.25 - uTime * run * 0.08, across * 1.3)));
  float s1 = vnoise(vec2((along - uTime * run) * 0.8, across * 16.0));
  float s2 = vnoise(vec2((along - uTime * run * 1.3) * 1.3 + 9.0, across * 29.0 + 4.0));
  float sheet = band * smoothstep(0.38, 0.88, s1 * 0.6 + s2 * 0.4);
  float blow = clamp(uWind.w, 0.0, 1.5) * (0.4 + 0.6 * loose);
  col = mix(col, vec3(0.97, 0.87, 0.71), sheet * blow * 0.5);

  float far = length(p - uCam.xy) / max(uCam.z, 1.0);
  float shimmer = vnoise(vec2(q.x * 1.5, q.y * 6.0 - uTime * 1.2)) * 0.6 + vnoise(vec2(q.x * 4.0 + 7.0, q.y * 11.0 - uTime * 2.3)) * 0.4;
  float mirage = smoothstep(0.62, 0.95, far) * crust * (1.0 - uStorm) * smoothstep(0.3, 0.7, shimmer);
  col = mix(col, vec3(0.66, 0.76, 0.9), mirage * 0.55);

  col *= mix(vec3(1.0), vec3(0.86, 0.76, 0.6), uStorm * 0.55);
  gl_FragColor = vec4(col, 1.0);
}
`
