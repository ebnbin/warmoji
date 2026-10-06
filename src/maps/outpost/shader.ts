/** 着色器一次画得下多少段围栏、多少圈涟漪 */
export const SEG_SLOTS = 32
export const RIPPLE_SLOTS = 12

/**
 * 能量围栏：每段从地上的导轨往上立起一道光墙，高 uH 像素（斜俯视里往画面上方），uCol.a 是它此刻立起了多少（亮起时从导轨长上去，熄灭时塌下来）。
 * 光墙底下浓、往上淡，一道道竖纹顺着往上流，横的扫描带往上走，顶上是两根柱头之间的一线光束，底边贴着导轨一线亮；
 * 撞上的涟漪从撞点一圈圈在光墙上荡开；uFx.x 是预警时一抽一抽的明暗，uFx.y 是过载时的电火花；光墙在地上照出一片同色的光。
 * 熄着的段只在导轨上留一道同色的虚线，看得出它归哪一组；柱头的发射器亮着时是一团光，熄着时只剩一点
 */
export const FENCE_FRAG = `
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
#define SEGS ${SEG_SLOTS}
#define RIPS ${RIPPLE_SLOTS}
uniform vec2 uSize;
uniform vec2 uOrigin;
uniform float uTime;
uniform float uUnit;
uniform float uH;
uniform float uCap;
uniform float uThick;
uniform float uCount;
uniform vec4 uSeg[SEGS];
uniform vec4 uCol[SEGS];
uniform vec4 uFx[SEGS];
uniform vec4 uRip[RIPS];

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

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  return length(p - a - ab * t);
}

/** p 起往下 len 那一截竖线 p + (0, h)（h 在 0 到 len 之间）与段 a + u·t 最近的两点：返回 (t, h) */
vec2 closest(vec2 p, float len, vec2 a, vec2 u) {
  vec2 d1 = vec2(0.0, len);
  vec2 r = p - a;
  float aa = dot(d1, d1);
  float e = dot(u, u);
  float f = dot(u, r);
  float s;
  float t;
  if (aa < 1e-4) {
    s = 0.0;
    t = clamp(f / e, 0.0, 1.0);
  } else {
    float c = dot(d1, r);
    float b = dot(d1, u);
    float den = aa * e - b * b;
    s = den > 1e-3 ? clamp((b * f - c * e) / den, 0.0, 1.0) : 0.0;
    t = (b * s + f) / e;
    if (t < 0.0) {
      t = 0.0;
      s = clamp(-c / aa, 0.0, 1.0);
    } else if (t > 1.0) {
      t = 1.0;
      s = clamp((b - c) / aa, 0.0, 1.0);
    }
  }
  return vec2(t, s * len);
}

void main ()
{
  vec2 p = uOrigin + vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uSize;
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  vec3 glow = vec3(0.0);
  float reach = uUnit * 1.4;
  for (int i = 0; i < SEGS; i++) {
    if (float(i) >= uCount) break;
    vec4 s = uSeg[i];
    vec4 c = uCol[i];
    vec4 fx = uFx[i];
    vec2 A = s.xy;
    vec2 B = s.zw;
    vec2 lo = min(A, B) - vec2(reach, uCap + reach * 0.5);
    vec2 hi = max(A, B) + vec2(reach);
    if (p.x < lo.x || p.y < lo.y || p.x > hi.x || p.y > hi.y) continue;
    vec2 u = B - A;
    float len = length(u);
    vec2 dir = u / len;
    float level = c.a;
    float flick = fx.x;
    float crackle = fx.y;
    float dg = segDist(p, A, B);
    float along = clamp(dot(p - A, dir), 0.0, len);
    // 地上的光
    glow += c.rgb * exp(-dg / (uUnit * 0.5)) * 0.3 * level * flick;
    // 熄着的段：导轨上一道同色的虚线，预警时它也一抽一抽
    if (level < 0.999) {
      float dash = step(0.5, fract(along / (uUnit * 0.32) - uTime * 0.25));
      float rail = (1.0 - smoothstep(uThick * 0.3, uThick * 0.7, dg)) * dash * (1.0 - level);
      float k = rail * (0.32 + 0.5 * (1.0 - flick) + crackle * 0.6);
      col += c.rgb * k;
      alpha += k * 0.6;
    }
    // 过载：导轨上乱跳的电火花
    if (crackle > 0.0) {
      float spark = step(0.86, hash(vec2(floor(along / (uUnit * 0.09)), floor(uTime * 24.0) + float(i) * 7.0)));
      float k = spark * (1.0 - smoothstep(uThick * 0.2, uThick * 1.6, dg)) * crackle;
      col += mix(c.rgb, vec3(1.0), 0.6) * k * 1.4;
      alpha += k * 0.8;
    }
    // 柱头：发射器亮着时一团光
    for (int e = 0; e < 2; e++) {
      vec2 tip = (e == 0 ? A : B) - vec2(0.0, uCap);
      float dc = length((p - tip) * vec2(1.0, 1.25));
      float core = exp(-dc / (uUnit * 0.05));
      float halo = exp(-dc / (uUnit * 0.16));
      float on = mix(0.18, 1.0, level * flick);
      col += (vec3(1.0) * core * 0.9 + c.rgb * halo * 0.55) * on;
      alpha += (core * 0.9 + halo * 0.35) * on;
    }
    if (level <= 0.001) continue;
    // 光墙：竖直往上的一片。p 往下挪 h 落在段上就在光墙里：按 p 往上那一截竖线与段最近的两点求出沿段的 t 与高 h
    float hgt = uH * level;
    vec2 cl = closest(p, hgt, A, u);
    float t = cl.x;
    float h = cl.y;
    float lateral = length(p + vec2(0.0, h) - (A + u * t));
    float halfT = uThick * 0.5;
    float side = 1.0 - smoothstep(halfT, halfT + 1.5, lateral);
    if (side <= 0.0 || h > hgt + 1.5) continue;
    float sv = clamp(h / max(uH, 1.0), 0.0, 1.0);
    float top = clamp(h / max(hgt, 1.0), 0.0, 1.0);
    float x = t * len / uUnit;
    float body = 0.16 + 0.42 * pow(1.0 - sv, 1.6);
    float streak = vnoise(vec2(x * 7.0, sv * 2.5 - uTime * 1.6)) * 0.75 + vnoise(vec2(x * 19.0, sv * 6.0 - uTime * 3.1)) * 0.35;
    float scan = 0.5 + 0.5 * sin((sv * 9.0 - uTime * 2.4) * 3.14159);
    float hex = smoothstep(0.82, 0.95, abs(sin(x * 11.0 + sv * 6.0)) * abs(sin(x * 11.0 - sv * 6.0 + 1.0)));
    float edgeTop = exp(-pow((hgt - h) / 1.4, 2.0)) * 1.2;
    float edgeBot = exp(-pow(h / 1.6, 2.0)) * 0.8;
    float a = body * (0.35 + 0.95 * streak) + scan * 0.07 + hex * 0.06;
    float ripple = 0.0;
    for (int r = 0; r < RIPS; r++) {
      vec4 rp = uRip[r];
      if (rp.w <= 0.0) continue;
      if (segDist(rp.xy, A, B) > uUnit * 0.45) continue;
      float tr = clamp(dot(rp.xy - A, dir), 0.0, len);
      float dd = length(vec2(t * len - tr, h - uH * 0.4));
      float rad = rp.z * uUnit * 2.6;
      float ring = exp(-pow((dd - rad) / (uUnit * 0.07), 2.0)) * exp(-rp.z * 2.4) * rp.w;
      float spot = exp(-dd / (uUnit * 0.12)) * exp(-rp.z * 7.0) * rp.w;
      ripple += ring * 1.3 + spot * 1.6;
    }
    float breakup = crackle > 0.0 ? step(0.45, vnoise(vec2(x * 9.0, sv * 4.0 + uTime * 9.0))) : 1.0;
    float k = (a + edgeTop * (0.6 + 0.4 * (1.0 - top)) + edgeBot * 0.6 + ripple) * side * flick * breakup;
    vec3 tone = mix(c.rgb * 1.15, vec3(1.0), clamp(edgeTop * 0.35 + edgeBot * 0.15 + ripple * 0.5, 0.0, 0.85));
    col += tone * k;
    alpha += min(k, 1.0) * 0.72;
  }
  col += glow;
  alpha = clamp(alpha + dot(glow, vec3(0.08)), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`
