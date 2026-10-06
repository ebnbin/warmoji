import { FRAME_U } from '../../util/units'

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

const NOISE = `
float hash1(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
`

/**
 * 虚空：平台底下望得见底的深处。深蓝的底上铺着一张淡淡的网格，每隔几格一道粗一点的线；
 * 有的线上一节节数据光流缓缓流过去；正中的核心柱往深处一路照下去，越深越暗，四周罩着它的一团光。
 * 只铺满方框，画面上和地图一起往四周平铺，所以网格、光流与核心柱的光都按方框的周期接得上；线多细按屏幕上的像素定（uPx 是一个设备像素合几格）；uRect 是铺的范围（格）
 */
export const VOID_FRAG = `${HEADER}
uniform vec4 uRect;
uniform float uTime;
uniform float uSeed;
uniform vec2 uCore;
uniform float uPx;
${NOISE}
const float N = ${FRAME_U.toFixed(1)};
const vec3 DEEP = vec3(0.0, 0.012, 0.035);
const vec3 HAZE = vec3(0.0, 0.06, 0.12);
const vec3 LINE = vec3(0.0, 1.0, 1.0);
const vec3 DATA = vec3(0.35, 1.0, 1.0);
const vec3 CORE = vec3(0.6, 1.0, 1.0);

/** 离最近一条间距 g 的网格线多远，格 */
float lineDist(float v, float g) {
  float m = mod(v, g);
  return min(m, g - m);
}

/** 一个方向上的数据光流：间距 g 的线里约三成在流，一节节亮光沿 along 流过去，各条线快慢、方向不一 */
float stream(float across, float along, float g, float salt) {
  float id = mod(floor(across / g + 0.5), N / g);
  float h = hash1(vec2(id, salt + uSeed));
  if (h > 0.32) return 0.0;
  float w = exp(-pow(lineDist(across, g) / (uPx * 1.6 + 0.02), 2.0));
  if (w < 0.01) return 0.0;
  float dir = h < 0.16 ? 1.0 : -1.0;
  float speed = 0.8 + 2.2 * hash1(vec2(id, salt + 7.0));
  float len = 9.0 + 14.0 * hash1(vec2(id, salt + 3.0));
  float s = fract((along * dir - uTime * speed) / len + hash1(vec2(id, salt + 5.0)));
  return w * smoothstep(0.0, 0.02, s) * (1.0 - smoothstep(0.02, 0.26, s));
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 p = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  // 画面四周平铺：离核心柱按最近的那一份算，方框边上接得上
  vec2 c = p - uCore;
  c -= N * floor((c + N * 0.5) / N);
  float r = length(c);
  vec3 col = DEEP + HAZE * (0.35 + 0.65 * exp(-r / 16.0));
  float fine = min(lineDist(p.x, 2.0), lineDist(p.y, 2.0));
  float major = min(lineDist(p.x, 8.0), lineDist(p.y, 8.0));
  float aa = uPx * 1.2;
  col += LINE * 0.22 * (1.0 - smoothstep(0.0, aa, fine));
  col += LINE * 0.38 * (1.0 - smoothstep(0.0, aa * 1.4, major));
  float pulse = stream(p.x, p.y, 2.0, 1.0) + stream(p.y, p.x, 2.0, 2.0);
  col += DATA * pulse * 0.9;
  // 核心柱往深处照下去：一根直立的光柱，越往下越暗
  float down = max(0.0, c.y);
  float shaft = exp(-pow(c.x / 1.1, 2.0)) * exp(-down / 13.0) * step(0.0, c.y) * (1.0 - smoothstep(16.0, 23.0, c.y));
  col += CORE * shaft * 0.5;
  col += CORE * 0.55 * exp(-r * r / 9.0);
  col += vec3(0.0, 1.0, 1.0) * 0.22 * exp(-r / 7.0);
  col = vec3(1.0) - exp(-col * 1.6);
  gl_FragColor = vec4(col, 1.0);
}
`

/**
 * 地砖：每块瓷砖按掩码知道自己是不是会亮的瓷砖、属于哪间房、那间房的待机律动与它在律动里的相位，按着色图知道那间房的主色。
 * 闲着时缝里透着房间的主色，按律动明灭：从中心一圈圈往外的脉冲、顺着一个方向扫过的光波、棋盘式明灭、几乎不动的微光；
 * 律动按各间房自己的钟走（uClock，秒），熄了灯的房间停在那一刻，也只剩一点微光（uPower 是各间的灯亮几成）。
 * 被队伍踩过亮信号蓝、被敌人踩过亮信号红：四边一道亮线、往里一道细线、块面淡淡染一层，光渗到隔壁；刚踩上的一脚从中心扩一圈方框。
 * 队长在传送台上充能时，一圈光从台心扩到整间房，扫过的瓷砖亮起来，圈里的都染上一层。输出按预乘透明度
 */
export const TILES_FRAG = `${HEADER}
uniform sampler2D uData;
uniform sampler2D uMask;
uniform sampler2D uTint;
uniform vec4 uClock;
uniform vec4 uPower;
uniform vec3 uTeam;
uniform vec3 uFoe;
uniform vec4 uCharge;
uniform float uChargeRoom;
uniform float uPx;
const float N = ${FRAME_U.toFixed(1)};

vec2 texel(vec2 cell) {
  return vec2((cell.x + 0.5) / N, 1.0 - (cell.y + 0.5) / N);
}

/** 第 room 间的那一份 */
float pick(vec4 v, float room) {
  return room < 0.5 ? v.x : room < 1.5 ? v.y : room < 2.5 ? v.z : v.w;
}

/** 掩码里这块瓷砖的律动：没有瓷砖为 −1 */
float kindOf(vec4 m) {
  return floor(m.r * 255.0 / 50.0 + 0.5) - 1.0;
}

float idle(float kind, float phase, vec2 cell, float t) {
  if (kind < 0.5) return pow(max(0.0, cos(6.2832 * (phase * 2.4 - t * 0.3))), 10.0);
  if (kind < 1.5) return pow(max(0.0, cos(3.1416 * (phase - t * 0.13))), 30.0);
  if (kind < 2.5) {
    float parity = mod(cell.x + cell.y, 2.0);
    float s = sin(t * 1.05 + parity * 3.1416 + phase * 0.5);
    return smoothstep(0.35, 0.95, s);
  }
  return 0.16 + 0.08 * sin(t * 0.35 + phase * 6.2832);
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 p = vec2(tc.x, 1.0 - tc.y) * N;
  vec2 cell = floor(p);
  vec2 f = p - cell;
  vec4 m = texture2D(uMask, texel(cell));
  float kind = kindOf(m);
  if (kind < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float room = floor(m.g * 255.0 / 64.0 + 0.5);
  vec3 tint = texture2D(uTint, texel(cell)).rgb;
  vec3 d = texture2D(uData, texel(cell)).rgb;
  vec2 side = f.x < 0.5 ? vec2(-1.0, 0.0) : vec2(1.0, 0.0);
  vec2 side2 = f.y < 0.5 ? vec2(0.0, -1.0) : vec2(0.0, 1.0);
  vec3 nx = texture2D(uData, texel(cell + side)).rgb;
  vec3 ny = texture2D(uData, texel(cell + side2)).rgb;
  float nxOn = kindOf(texture2D(uMask, texel(cell + side))) >= 0.0 ? 1.0 : 0.0;
  float nyOn = kindOf(texture2D(uMask, texel(cell + side2))) >= 0.0 ? 1.0 : 0.0;
  float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float aa = max(uPx * 1.1, 0.012);
  float seam = 1.0 - smoothstep(aa * 0.5, aa * 2.2, edge);
  float inset = exp(-abs(edge - 0.12) / max(aa * 0.7, 0.01));
  float rim = exp(-edge / 0.06);
  // 闲着：缝里透着房间的主色，按律动明灭
  float b = idle(kind, m.b, cell, pick(uClock, room)) * (0.25 + 0.75 * pick(uPower, room));
  vec3 col = tint * b * (0.55 * seam + 0.22 * rim + 0.05);
  float a = b * (0.5 * seam + 0.16 * rim + 0.04);
  // 踩过的瓷砖
  float glow = max(d.r, d.g);
  vec3 lit = (uTeam * d.r + uFoe * d.g) / max(d.r + d.g, 0.001);
  float body = 0.16 + 0.75 * seam + 0.45 * inset;
  col += lit * glow * body;
  a += glow * (0.12 + 0.6 * seam + 0.35 * inset);
  float fx = exp(-min(f.x, 1.0 - f.x) / 0.07) * nxOn;
  float fy = exp(-min(f.y, 1.0 - f.y) / 0.07) * nyOn;
  float bleed = 0.25 * (max(nx.r, nx.g) * fx + max(ny.r, ny.g) * fy);
  col += 0.25 * ((uTeam * nx.r + uFoe * nx.g) * fx + (uTeam * ny.r + uFoe * ny.g) * fy);
  a += bleed;
  vec3 add = vec3(1.0) * glow * seam * 0.3;
  float cheb = max(abs(f.x - 0.5), abs(f.y - 0.5));
  float ring = exp(-abs(cheb - (1.0 - d.b) * 0.5) / 0.035) * d.b;
  add += mix(lit, vec3(1.0), 0.4) * ring * 0.9;
  a += ring * 0.3;
  // 充能：一圈光从台心扩到整间房
  if (uCharge.w > 0.0 && abs(room - uChargeRoom) < 0.5) {
    float dc = length(cell + 0.5 - uCharge.xy);
    float front = exp(-pow((dc - uCharge.z) / 0.9, 2.0));
    float inside = 1.0 - smoothstep(uCharge.z - 0.5, uCharge.z + 0.5, dc);
    float k = uCharge.w * (front * (0.35 + 0.65 * seam + 0.4 * inset) + inside * (0.1 + 0.35 * seam));
    col += uTeam * k;
    add += vec3(0.8, 0.92, 1.0) * front * seam * uCharge.w * 0.5;
    a += k * 0.8;
  }
  a = clamp(a, 0.0, 0.92);
  gl_FragColor = vec4(col + add, a);
}
`

/**
 * 地砖的数据图，每格一个像素、不透明（画布会按透明度预乘，数据必须满 alpha）：
 * R 队伍踩亮的余光，G 敌人踩亮的余光，B 刚踩上那一脚还剩多少（都在 0 到 1）；每块按它那间房的钟（rooms 是每块属于哪间，−1 的不亮）
 */
export function encodeTiles(out: Uint8ClampedArray, team: Float32Array, foe: Float32Array, teamFrom: Float32Array, foeFrom: Float32Array, rooms: Int8Array, clocks: readonly number[], teamFadeMs: number, foeFadeMs: number, flashMs: number): void {
  for (let i = 0; i < team.length; i++) {
    const o = i * 4
    const now = clocks[Math.max(0, rooms[i]!)]!
    const t = Math.exp(-(now - team[i]!) / teamFadeMs)
    const e = Math.exp(-(now - foe[i]!) / foeFadeMs)
    const fl = Math.max(Math.exp(-(now - teamFrom[i]!) / flashMs), Math.exp(-(now - foeFrom[i]!) / flashMs))
    out[o] = t * 255
    out[o + 1] = e * 255
    out[o + 2] = fl * 255
    out[o + 3] = 255
  }
}
