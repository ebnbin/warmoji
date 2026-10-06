/** 着色器的开头：Phaser 的模板与精度 */
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
 * 礁湖海水对红、绿、蓝三色光的衰减系数，每米：红光走几米就弱下去，绿、蓝走得远，浅处的白沙透出一层青绿；
 * 清澈的热带浅海大致是这个量级
 */
export const ATTENUATION = [0.11, 0.036, 0.012] as const

/**
 * 礁湖的光：地面的固有色乘上照到它的光，再隔着一层海水看过去。
 * 太阳从斜上方照下来，穿过水面时被波纹聚成一张张晃动的光斑（两层按时间漂移的细胞网格交叠出亮线），水面起伏又投下大片柔和的明暗；
 * 光往下走、再从地面走回眼睛，一路按三色的衰减系数吃掉，水越深越只剩青绿，坎外沉成深蓝；水里散射回来的光按水深补上，斜射进来的光柱在水里一道道地晃。
 * 被搅起的细沙和气泡叠在最上面。最后按曝光压成画面的颜色，加一点抖动免得出色带
 */
export const SEABED_FRAG = `${HEADER}
uniform sampler2D uAlbedo;
uniform sampler2D uGeo;
uniform sampler2D uNorm;
uniform sampler2D uTrail;
uniform vec4 uRect;
uniform vec4 uField0;
uniform vec2 uHeight;
uniform float uMpp;
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform float uSurf;
uniform vec3 uDeep;
uniform vec3 uSky;
uniform float uExposure;
const vec3 ATT = vec3(${ATTENUATION.map((v) => v.toFixed(3)).join(', ')});
vec2 fieldUv(vec2 world) {
  vec2 uv = (world - uField0.xy) / uField0.zw;
  return vec2(uv.x, 1.0 - uv.y);
}
float heightAt(vec2 uv) {
  vec4 g = texture2D(uGeo, uv);
  return (g.r * 65280.0 + g.g * 255.0) / 65535.0 * uHeight.y + uHeight.x;
}
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float hash1(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
// 细胞网格里离两条最近的边多远：边上为 0
float cells(vec2 p, float t) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash2(i + g);
      o = 0.5 + 0.42 * sin(t + 6.2831 * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return sqrt(d2) - sqrt(d1);
}
// 光斑：两层细胞网格的亮边交叠，按时间漂、扭；p 以米计
float caustic(vec2 p, float t) {
  vec2 w = p + 0.18 * vec2(sin(p.y * 2.7 + t * 0.9), cos(p.x * 2.4 - t * 0.8));
  float a = cells(w * 1.9, t * 1.1);
  float b = cells(w * 3.0 + vec2(3.1, 7.7), -t * 1.3);
  float la = 1.0 - smoothstep(0.0, 0.16, a);
  float lb = 1.0 - smoothstep(0.0, 0.13, b);
  return la * la * 0.75 + lb * lb * 0.55 + la * lb * 0.6;
}
// 水面起伏投下的大片明暗：几道慢慢走的长波互相扭着
float swell(vec2 p, float t) {
  float a = sin(p.x * 0.42 + t * 0.55 + 1.6 * sin(p.y * 0.31 - t * 0.27));
  float b = sin(p.y * 0.37 - t * 0.47 + 1.4 * sin(p.x * 0.29 + t * 0.21));
  return a * b;
}
// 光柱：顺着太阳的方位一道道斜着，宽窄不一，慢慢平移
float shafts(vec2 p, float t) {
  vec2 d = normalize(uSun.xy + vec2(0.0001));
  float u = dot(p, vec2(-d.y, d.x));
  float v = dot(p, d);
  float s = sin(u * 0.55 + t * 0.12 + 1.3 * sin(u * 0.17 - t * 0.05)) * sin(u * 1.31 - t * 0.09 + v * 0.03);
  return smoothstep(0.35, 1.0, s);
}
void main ()
{
  vec2 tc = outTexCoord;
  vec2 world = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  vec2 uv = fieldUv(world);
  vec3 albedo = texture2D(uAlbedo, uv).rgb;
  float z = heightAt(uv);
  vec3 nm = texture2D(uNorm, uv).rgb;
  vec3 n = normalize(vec3(nm.xy * 2.0 - 1.0, max(nm.z, 0.05)));
  vec2 q = world * uMpp;
  float depth = max(uSurf - z, 0.05);
  float down = depth / max(uSun.z, 0.2);
  float c = caustic(q, uTime) * exp(-depth * 0.09);
  float sw = swell(q, uTime);
  vec3 sun = uSunColor * max(dot(n, uSun) * 0.75 + 0.25, 0.0) * (0.62 + 0.95 * c) * (1.0 + 0.16 * sw) * exp(-ATT * down);
  vec3 sky = uSky * (0.75 + 0.25 * max(n.z, 0.0)) * exp(-ATT * depth * 0.6);
  vec3 lit = albedo * (sun + sky);
  vec3 through = exp(-ATT * depth);
  vec3 water = mix(uSky * 0.95, uDeep, smoothstep(4.0, 18.0, depth));
  vec3 col = lit * through + water * (1.0 - through);
  col += uSunColor * vec3(0.55, 0.9, 0.85) * shafts(q, uTime) * 0.07 * (1.0 - through.r);
  float trail = texture2D(uTrail, uv).r;
  if (trail > 0.002) {
    float grain = hash1(floor(world * 0.9) + floor(uTime * 8.0));
    col = mix(col, vec3(0.93, 0.97, 0.95), clamp(trail * (0.45 + 0.55 * grain), 0.0, 0.7));
  }
  col = vec3(1.0) - exp(-col * uExposure);
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  gl_FragColor = vec4(col + dither / 255.0, 1.0);
}
`
