/** 着色器用的噪声：格点哈希与平滑的值噪声，叠几层成 fbm */
const NOISE = `
vec2 hash2(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
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

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    s += vnoise(p) * a;
    p = r * p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s / 0.9375;
}
`

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
 * 水面：只画在开阔的水上（遮罩的红），睡莲叶上不画（蓝）。微风吹皱的水面一道道细纹慢慢漂，迎着天光的纹亮一下，
 * 一片片亮暗随着风慢慢挪；离岸越远（绿）纹越清楚。输出按预乘透明度
 */
export const WATER_FRAG = `${HEADER}
uniform sampler2D uMask;
uniform vec4 uArea;
uniform float uTime;
uniform vec2 uWind;
${NOISE}
void main ()
{
  vec2 tc = outTexCoord;
  vec4 m = texture2D(uMask, tc);
  float water = m.r * (1.0 - m.b);
  if (water < 0.01) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec2 p = uArea.xy + vec2(tc.x, 1.0 - tc.y) * uArea.zw;
  vec2 drift = uWind * uTime * 0.12;
  float swell = fbm(p * 0.22 - drift * 0.5);
  vec2 q = p * 2.6 + vec2(swell * 2.5, -swell * 1.5) - drift * 2.0;
  float ripple = vnoise(q) * 0.6 + vnoise(q * 2.3 + vec2(uTime * 0.3, 0.0)) * 0.4;
  float glint = smoothstep(0.74, 0.92, ripple) * (0.4 + 0.6 * smoothstep(0.45, 0.75, swell));
  float far = 0.35 + 0.65 * m.g;
  float a = glint * 0.13 * water * far;
  float dark = smoothstep(0.3, 0.12, ripple) * 0.06 * water * far;
  vec3 c = vec3(1.0, 0.95, 0.8);
  gl_FragColor = vec4(c * a, a + dark);
}
`

/**
 * 晨雾：贴着水面的一片片雾，随风慢慢漂、慢慢聚散；水上浓、岸上淡，方框边上更浓，把四周的水面藏进雾里；
 * 朝着太阳那边的雾被照得发暖。输出按预乘透明度
 */
export const MIST_FRAG = `${HEADER}
uniform sampler2D uMask;
uniform vec4 uArea;
uniform float uTime;
uniform vec2 uWind;
uniform float uFrame;
${NOISE}
void main ()
{
  vec2 tc = outTexCoord;
  vec2 p = uArea.xy + vec2(tc.x, 1.0 - tc.y) * uArea.zw;
  vec2 px = vec2(1.0) / vec2(uArea.z, uArea.w);
  float water = 0.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) water += texture2D(uMask, tc + vec2(float(i), float(j)) * px * 1.5).r;
  }
  water /= 9.0;
  vec2 drift = uWind * uTime * 0.09;
  float bank = fbm(p * 0.09 - drift * 0.25 + vec2(0.0, uTime * 0.004));
  float wisp = fbm(p * 0.32 - drift + vec2(bank * 2.0, 0.0));
  float cloud = smoothstep(0.38, 0.78, bank * 0.6 + wisp * 0.4);
  float edge = max(abs(p.x - uFrame * 0.5), abs(p.y - uFrame * 0.5)) / (uFrame * 0.5);
  float rim = smoothstep(0.7, 1.0, edge);
  float a = cloud * mix(0.07, 0.36, water) + rim * 0.34 + 0.03;
  a = clamp(a, 0.0, 0.7);
  float warm = smoothstep(0.0, 1.0, 1.0 - (p.x + p.y) / (uFrame * 2.0));
  vec3 c = mix(vec3(0.83, 0.88, 0.85), vec3(1.0, 0.93, 0.78), warm * 0.7);
  // 晨光：从太阳那边斜斜地照过来一层淡金，只提亮、不遮挡
  float glow = 0.1 * warm * warm;
  gl_FragColor = vec4(c * a + vec3(1.0, 0.84, 0.55) * glow * (1.0 - a), a);
}
`
