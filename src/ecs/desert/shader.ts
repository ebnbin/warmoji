import { UNIT } from '../../util/units'
import type { DesertPlan } from './terrain'

/**
 * 给地面着色器的一张数据图，按地形格子每格一个像素、不透明：R 是沙有多松，G 是晒得到几成太阳。
 * 着色器按它定风沙贴着哪里跑、印子在哪里有太阳照出的阴阳面
 */
export function encodeInfo(p: DesertPlan): Uint8ClampedArray<ArrayBuffer> {
  const n = p.cols
  const out = new Uint8ClampedArray(n * n * 4)
  for (let k = 0; k < n * n; k++) {
    out[k * 4] = p.soft[k]! * 255
    out[k * 4 + 1] = p.sun[k]! * 255
    out[k * 4 + 3] = 255
  }
  return out
}

/** 两个着色器共用的开头与值噪声 */
const HEAD = `
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

/**
 * 地面的片元着色器：四边形跟着镜头，盖住看得到的那一片，坐标按世界像素、y 朝下；画布纹理上传时上下翻了，所以纹理的 v 取 1 − y/一圈。
 * 三张图都按一圈平铺，接缝处严丝合缝。沙地照搬画好的贴图；印子按此刻落了多深的沙算出现在的高，按太阳打出阴阳面，坑底暗、翻出来的沙略深；
 * 起沙的风把沙粒贴着地面吹成一条条顺风摆动的沙带，带子里细亮的沙纹飞快地往下风跑，松沙上多、沙暴时满地都是；沙暴遮住太阳，地面发暗发黄
 */
export const GROUND_FRAG = `${HEAD}
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

  col *= mix(vec3(1.0), vec3(0.86, 0.76, 0.6), uStorm * 0.55);
  gl_FragColor = vec4(col, 1.0);
}
`

/**
 * 沙暴的片元着色器：四边形跟着镜头、盖住看得到的那一片，坐标按世界像素，输出预乘了透明度的颜色。
 * 大团的沙云顺风翻滚着过去，比风慢；沙云里一缕一缕的跑得快一些；贴着视线飞过一道道细长的沙线，和风一样快。
 * 离镜头中心越远越看不清，看得清的那一圈边缘被沙云扰得参差；沙暴刮到几成，整片就浓到几成
 */
export const STORM_FRAG = `${HEAD}
uniform vec4 uRect;
uniform float uTime;
/** 风吹去的方向、风速（米/秒）与输沙率 */
uniform vec4 uWind;
uniform float uLevel;
/** 镜头中心（世界像素）与看得清的半径（像素） */
uniform vec3 uFocus;
/** 一格多少米 */
uniform float uMeter;

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    a *= 0.5;
  }
  return s / 0.9375;
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 p = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  vec2 q = p / ${UNIT.toFixed(1)};
  vec2 wd = uWind.xy;
  vec2 a = vec2(dot(q, wd), dot(q, vec2(-wd.y, wd.x)));
  float run = uWind.z / uMeter;

  vec2 c1 = vec2((a.x - uTime * run * 0.25) * 0.16, a.y * 0.2);
  float warp = fbm(c1 * 1.7 + vec2(3.1, 7.7) + uTime * 0.05);
  float cloud = fbm(c1 + vec2(warp * 1.1, warp * 0.6));
  vec2 c2 = vec2((a.x - uTime * run * 0.5) * 0.35, a.y * 0.6);
  float wisp = fbm(c2 + vec2(cloud * 1.3, 4.2));
  float line = smoothstep(0.78, 0.98, vnoise(vec2((a.x - uTime * run) * 0.35, a.y * 9.0)));

  float d = length(p - uFocus.xy) / max(uFocus.z, 1.0);
  float fog = smoothstep(0.35, 1.1, d + (cloud - 0.5) * 0.8);
  float dense = 0.1 + 0.55 * fog + 0.45 * smoothstep(0.4, 0.8, cloud) + 0.22 * smoothstep(0.45, 0.8, wisp);
  float alpha = clamp(uLevel * dense, 0.0, 0.94);
  vec3 col = mix(vec3(0.86, 0.69, 0.47), vec3(0.4, 0.27, 0.16), clamp(smoothstep(0.3, 0.85, cloud) * 0.85 + fog * 0.1, 0.0, 1.0));
  float streak = uLevel * line * 0.35;
  col = mix(col, vec3(0.96, 0.86, 0.68), streak / max(alpha + streak, 0.001));
  alpha = alpha + streak * (1.0 - alpha);
  gl_FragColor = vec4(col * alpha, alpha);
}
`
