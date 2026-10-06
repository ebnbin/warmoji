import type Phaser from 'phaser'
import { UNIT } from '../../util/units'
import { reliefAt, ROCK_KEEP } from './light'
import type { Lighting } from './light'

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** 照度场按对数存进 16 位：log10(勒克斯) 落在 [LOG_MIN, LOG_MIN + LOG_SPAN] */
const LOG_MIN = -6
const LOG_SPAN = 12

/** 画面上洞壁那一圈（岩体里往外 LINING_RINGS 圈，每圈半格）每往里一圈只暗到 LINING_KEEP：长满晶体的洞壁朝着洞里，比照度场按岩体算的亮 */
const LINING_RINGS = 4
const LINING_KEEP = 0.75

/** 照度场编码成数据图：R、G 是 16 位的对数照度（天光与反光），B 是反光占的比例；必须满 alpha（画布会按透明度预乘） */
export function encodeLux(lt: Lighting, out: Uint8ClampedArray): void {
  for (let i = 0; i < lt.cols * lt.rows; i++) {
    const lift = (LINING_KEEP / ROCK_KEEP) ** Math.min(lt.rank[i]!, LINING_RINGS)
    const v = Math.round(clamp01((Math.log10(lt.diffuse[i]! * lift + 1e-6) - LOG_MIN) / LOG_SPAN) * 65535)
    out[i * 4] = v >> 8
    out[i * 4 + 1] = v & 255
    out[i * 4 + 2] = lt.share[i]! * 255
    out[i * 4 + 3] = 255
  }
}

/** 火把影子图：每支火把一行，每行按方位角分这么多格；记到多远，格 */
export const SHADE_BINS = 256
export const SHADE_ROWS = 8
const SHADE_RANGE_U = 14
/** 同时点着的火把最多几支 */
export const MAX_TORCHES = SHADE_ROWS

/** 从高 z 米的火把 (x, y) 朝每个方位角走，碰上比火把还高的洞壁或晶体为止，把走了多远（占 SHADE_RANGE_U 的比例）写进第 row 行 */
export function castShade(lt: Lighting, x: number, y: number, z: number, out: Uint8ClampedArray, row: number): void {
  const range = SHADE_RANGE_U * UNIT
  const step = 0.12 * UNIT
  for (let b = 0; b < SHADE_BINS; b++) {
    const a = ((b + 0.5) / SHADE_BINS) * Math.PI * 2 - Math.PI
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    let t = step
    while (t < range && reliefAt(lt, x + dx * t, y + dy * t) < z - 0.15) t += step
    const o = (row * SHADE_BINS + b) * 4
    out[o] = clamp01(t / range) * 255
    out[o + 1] = 0
    out[o + 2] = 0
    out[o + 3] = 255
  }
}

/** 光照层叠到画面上的倍数：画面 × 2 × 输出，输出 0.5 是原样，往上提亮、往下压暗 */
const GAIN = 2
const BLENDS = new WeakMap<Phaser.Renderer.WebGL.WebGLRenderer, number>()

/** 光照层的混合模式：目标色 × 输出 + 输出 × 目标色 = 2 × 输出 × 画面；每个渲染器只登记一次 */
export function doubleMultiply(r: Phaser.Renderer.WebGL.WebGLRenderer): number {
  const known = BLENDS.get(r)
  if (known !== undefined && r.blendModes[known]) return known
  r.addBlendMode([r.gl.DST_COLOR, r.gl.SRC_COLOR], r.gl.FUNC_ADD)
  const mode = r.blendModes.length - 1
  BLENDS.set(r, mode)
  return mode
}

/** 色调曲线 TONE_MAX·(1 − e^(−TONE_K·x))：x 是照度比眼睛适应的亮度，适应的亮度上正好是原色，阳光直射处亮到将近 TONE_MAX 倍 */
const TONE_MAX = 1.9
const TONE_K = 0.75
/** 光柱里浮尘把多少直射光散向镜头，最多叠上多亮 */
const SHAFT_MAX = 0.38
/** 晶面的镜面有多尖：越大，晶面要越正对着反射方向才闪 */
const SHINE = 56.0
/** 直射查遮挡时沿光线取几个点 */
const MARCH = 12
/** 火光在晶壁之间来回反射回来的光：离火把水平 d 格处照到 TORCH_BOUNCE·I/(TORCH_ROOM² + d²)，被挡住的地方也照进去三成 */
const TORCH_BOUNCE = 0.35
const TORCH_ROOM = 2.5

const PRELUDE = `
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
uniform sampler2D uGeo;
uniform sampler2D uFace;
uniform sampler2D uShade;
uniform vec4 uRect;
uniform vec4 uField;
uniform vec2 uHeight;
uniform float uUnit;
uniform float uCeil;
uniform vec4 uSun;
uniform vec4 uMoon;
uniform vec3 uSunCol;
uniform vec3 uMoonCol;
uniform vec3 uTorchCol;
uniform vec4 uTorch[${MAX_TORCHES}];
uniform float uTorchCount;
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec2 worldOf(vec2 tc) {
  return uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
}
vec2 fieldUv(vec2 w) {
  vec2 uv = (w - uField.xy) / uField.zw;
  return vec2(uv.x, 1.0 - uv.y);
}
float heightAt(vec2 w) {
  vec4 g = texture2D(uGeo, fieldUv(w));
  return (g.r * 65280.0 + g.g * 255.0) / 65535.0 * uHeight.y + uHeight.x;
}
float skyAt(vec2 w) {
  return texture2D(uGeo, fieldUv(w)).b;
}
vec3 normalOf(vec4 f) {
  vec2 xy = f.rg * 2.0 - 1.0;
  return normalize(vec3(xy, sqrt(max(0.02, 1.0 - dot(xy, xy)))));
}
float through(vec2 p, float z, vec4 body, int steps) {
  float run = (uCeil - z) * body.z;
  vec2 dir = body.xy * run * uUnit;
  float open = skyAt(p + dir);
  if (open <= 0.003) return 0.0;
  float lit = 1.0;
  for (int i = 0; i < ${MARCH}; i++) {
    if (i >= steps) break;
    float t = (float(i) + 0.5) / float(steps);
    t *= t;
    float ray = z + 0.12 + (uCeil - z - 0.12) * t;
    lit = min(lit, clamp((ray - heightAt(p + dir * t)) / 0.3 + 0.5, 0.0, 1.0));
    if (lit <= 0.0) break;
  }
  return open * lit;
}
float shadeOf(int k, vec2 d, float dist) {
  float a = atan(-d.y, -d.x);
  float free = texture2D(uShade, vec2(a / 6.2831853 + 0.5, 1.0 - (float(k) + 0.5) / ${SHADE_ROWS.toFixed(1)})).r * ${SHADE_RANGE_U.toFixed(1)};
  return smoothstep(free + 0.2, free - 0.2, dist);
}
`

/**
 * 洞里的光，按 2 倍调制叠在整个战斗画面上（地面、角色、子弹、特效一起变亮变暗）：天光与反光从照度场来，朝上的面受的天光多，反光染成晶体的紫；
 * 直射看朝太阳（月亮）的那条光线在洞顶的高度上是不是落在开口里，再沿光线查高度图有没有被洞壁与晶体挡住；火把按点光源 I·cosθ/d² 照，沿影子图看有没有被挡住，火光被晶壁反回来的染成紫色。
 * 有方向的光按法线图照出晶面与起伏；立着的东西（遮罩图里盖住的地方）不随地面的起伏，明暗交给精灵按光从哪边来画。
 * 照度除以眼睛适应的亮度后按色调曲线压成倍数，直射的光斑亮过原色；越暗越偏冷偏灰、泛着一点紫；最暗也留一点紫黑，不是纯黑；加一点抖动免得暗处出色带
 */
export const LIGHT_FRAG = `${PRELUDE}
uniform sampler2D uLux;
uniform sampler2D uMask;
uniform vec4 uMask0;
uniform vec3 uSkyCol;
uniform vec3 uBounceCol;
uniform float uLogAdapt;
uniform vec3 uFloor;
uniform vec3 uTorchBounce;
float upright(vec2 w) {
  vec2 uv = (w - uMask0.xy) / uMask0.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture2D(uMask, vec2(uv.x, 1.0 - uv.y)).a;
}
void main ()
{
  vec2 world = worldOf(outTexCoord);
  vec2 uv = fieldUv(world);
  vec4 lx = texture2D(uLux, uv);
  float logE = (lx.r * 65280.0 + lx.g * 255.0) / 65535.0 * ${LOG_SPAN.toFixed(1)} + ${LOG_MIN.toFixed(1)};
  float up = upright(world);
  vec3 n = normalize(mix(normalOf(texture2D(uFace, uv)), vec3(0.0, 0.0, 1.0), up));
  float z = heightAt(world);
  float eDiff = pow(10.0, logE - uLogAdapt) * mix(0.55 + 0.45 * n.z, 1.0, up);
  float eSun = 0.0;
  if (uSun.w > 0.0) {
    vec3 l = normalize(vec3(uSun.xy, 1.0 / max(uSun.z, 1e-4)));
    eSun = uSun.w * mix(max(dot(n, l), 0.0), 1.0, up) * through(world, z, uSun, ${MARCH});
  }
  float eMoon = 0.0;
  if (uMoon.w > 0.0) {
    vec3 l = normalize(vec3(uMoon.xy, 1.0 / max(uMoon.z, 1e-4)));
    eMoon = uMoon.w * mix(max(dot(n, l), 0.0), 1.0, up) * through(world, z, uMoon, ${MARCH});
  }
  float eTorch = 0.0;
  float eBounce = 0.0;
  for (int k = 0; k < ${MAX_TORCHES}; k++) {
    if (float(k) >= uTorchCount) break;
    vec4 t = uTorch[k];
    vec2 d = (t.xy - world) / uUnit;
    float dist = length(d);
    if (dist > ${SHADE_RANGE_U.toFixed(1)}) continue;
    vec3 l = vec3(d, t.w - z);
    float r2 = max(dot(l, l), 0.04);
    vec3 ld = l * inversesqrt(r2);
    float open = shadeOf(k, d, dist);
    eTorch += t.z * mix(mix(max(ld.z, 0.0), max(dot(n, ld), 0.0), 0.75), 1.0, up) / r2 * open;
    eBounce += t.z * ${TORCH_BOUNCE.toFixed(2)} / (${(TORCH_ROOM * TORCH_ROOM).toFixed(2)} + dist * dist) * mix(0.3, 1.0, open);
  }
  float e = eDiff + eSun + eMoon + eTorch + eBounce;
  vec3 col = (eDiff * mix(uSkyCol, uBounceCol, lx.b) + eSun * uSunCol + eMoon * uMoonCol + eTorch * uTorchCol + eBounce * uTorchBounce) / max(e, 1e-6);
  float lux = log(max(e, 1e-12)) * 0.4342945 + uLogAdapt;
  float scot = 1.0 - smoothstep(-2.0, 0.7, lux);
  float grey = dot(col, vec3(0.3, 0.5, 0.2));
  col = mix(col, vec3(0.74, 0.6, 1.0) * grey, scot * 0.75);
  col /= max(max(col.r, col.g), max(col.b, 0.0001));
  float tone = ${TONE_MAX.toFixed(2)} * (1.0 - exp(-${TONE_K.toFixed(2)} * e));
  float dither = hash(gl_FragCoord.xy) - 0.5;
  gl_FragColor = vec4(max(col * tone, uFloor) / ${GAIN.toFixed(1)} + dither / 255.0, 1.0);
}
`

/**
 * 叠加在光上面会发亮的东西：晶面按镜面反射闪光——太阳、月亮从开口照下来时朝着反射方向的晶面一闪一闪，火把凑近时近处的晶壁一片片亮起来；
 * 开口射下来的光柱照亮半空里的浮尘与细小的晶尘，俯看时一根竖直的空气柱有多少段在光柱里就亮多少（取样点按像素错开，免得出条纹），到 SHAFT_MAX 就饱和；
 * 晶尘一闪一闪、浮尘慢慢飘；月光下的晶面闪得慢一些，像星星
 */
export const SHINE_FRAG = `${PRELUDE}
uniform float uTime;
uniform float uScatter;
uniform float uMist;
float shaft(vec2 p, float z, vec4 body, float jitter) {
  if (body.w <= 0.0) return 0.0;
  vec2 end = p + body.xy * (uCeil - z) * body.z * uUnit;
  float acc = 0.0;
  for (int i = 0; i < 10; i++) acc += skyAt(mix(p, end, (float(i) + jitter) / 10.0));
  return ${SHAFT_MAX.toFixed(2)} * (1.0 - exp(-acc / 10.0 * body.w * uScatter));
}
float glint(vec3 n, vec3 l) {
  vec3 h = normalize(l + vec3(0.0, 0.0, 1.0));
  return pow(max(dot(n, h), 0.0), ${SHINE.toFixed(1)});
}
void main ()
{
  vec2 world = worldOf(outTexCoord);
  vec2 uv = fieldUv(world);
  vec2 g = world / uUnit;
  float z = heightAt(world);
  vec4 f = texture2D(uFace, uv);
  vec3 col = vec3(0.0);
  if (f.b > 0.05) {
    vec3 n = normalOf(f);
    vec3 spark = vec3(0.0);
    if (uSun.w > 0.0) {
      float s = glint(n, normalize(vec3(uSun.xy, 1.0 / max(uSun.z, 1e-4))));
      if (s > 0.002) spark += uSunCol * uSun.w * s * through(world, z, uSun, 6);
    }
    if (uMoon.w > 0.0) {
      float s = glint(n, normalize(vec3(uMoon.xy, 1.0 / max(uMoon.z, 1e-4))));
      float twinkle = 0.55 + 0.45 * sin(uTime * 2.3 + hash(floor(g * 6.0)) * 6.2832);
      if (s > 0.002) spark += uMoonCol * uMoon.w * s * twinkle * through(world, z, uMoon, 6);
    }
    for (int k = 0; k < ${MAX_TORCHES}; k++) {
      if (float(k) >= uTorchCount) break;
      vec4 t = uTorch[k];
      vec2 d = (t.xy - world) / uUnit;
      float dist = length(d);
      if (dist > ${SHADE_RANGE_U.toFixed(1)}) continue;
      vec3 l = vec3(d, t.w - z);
      float r2 = max(dot(l, l), 0.04);
      spark += uTorchCol * t.z / r2 * glint(n, l * inversesqrt(r2)) * shadeOf(k, d, dist);
    }
    col += spark * f.b * 0.4;
  }
  vec2 drift = vec2(uTime * 0.06, -uTime * 0.09);
  float mist = 0.55 + 0.45 * vnoise(g * 0.45 + drift) * (0.6 + 0.4 * vnoise(g * 1.3 - drift * 1.7));
  float motes = smoothstep(0.92, 0.99, vnoise(g * 9.0 + vec2(uTime * 0.19, uTime * 0.11))) * (0.5 + 0.5 * sin(uTime * 3.0 + hash(floor(g * 9.0)) * 6.28));
  float density = mist * (0.7 + 0.3 * uMist) + motes * 1.8;
  float jitter = hash(gl_FragCoord.xy);
  vec3 dust = vec3(0.86, 0.76, 1.0);
  col += (shaft(world, z, uSun, jitter) * mix(uSunCol, dust, 0.25) + shaft(world, z, uMoon, jitter) * mix(uMoonCol, dust, 0.3)) * density;
  gl_FragColor = vec4(min(col, vec3(0.85)), 0.0);
}
`
