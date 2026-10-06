/**
 * 谷底的雾与河：按数据图画在整张方框上。红是谷底露出来的程度（崖壁越往下越大），绿是河，蓝是晒着的程度。
 * 雾是慢慢飘的分形噪声，影子里偏蓝紫、晒着的地方透出一点暖；河面顺着水流起一道道细纹，晒着的地方闪着碎光
 */
export const GORGE_FRAG = `
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
uniform vec2 uWorld;
uniform float uTime;
uniform vec2 uWind;

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

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int k = 0; k < 4; k++) {
    s += vnoise(p) * a;
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s / 0.9375;
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 w = vec2(tc.x, 1.0 - tc.y) * uWorld;
  vec4 d = texture2D(uData, tc);
  float open = d.r;
  float water = d.g;
  float sun = d.b;
  vec3 col = vec3(0.0);
  float a = 0.0;

  // 河面：顺着水流的细纹与碎光
  if (water > 0.01) {
    float flow = w.x * 2.6 - uTime * 1.3 + vnoise(w * 1.4 + vec2(uTime * 0.2, 0.0)) * 3.0;
    float ripple = smoothstep(0.55, 1.0, sin(flow) * 0.5 + 0.5) * smoothstep(0.3, 0.8, vnoise(w * vec2(0.8, 2.2) + vec2(-uTime * 0.6, 0.0)));
    float glint = pow(vnoise(w * vec2(5.0, 9.0) + vec2(-uTime * 1.8, uTime * 0.3)), 14.0) * 5.0;
    vec3 c = mix(vec3(0.42, 0.78, 0.74), vec3(1.0, 0.95, 0.82), clamp(glint, 0.0, 1.0));
    float k = water * (ripple * (0.18 + 0.3 * sun) + clamp(glint, 0.0, 1.0) * sun * 0.9);
    col += c * k;
    a += k;
  }

  // 雾：贴着谷底慢慢飘，越往崖脚越浓
  vec2 drift = uWind * uTime;
  float n = fbm(w * 0.09 + drift);
  float m = fbm(w * 0.23 - drift * 1.7 + vec2(n * 1.3, 0.0));
  float fog = open * (0.06 + 0.4 * smoothstep(0.42, 0.85, n * 0.65 + m * 0.35)) * (1.0 - 0.35 * sun);
  vec3 fc = mix(vec3(0.42, 0.38, 0.62), vec3(0.86, 0.66, 0.6), sun * 0.45);
  col = col * (1.0 - fog) + fc * fog;
  a = a * (1.0 - fog) + fog;
  gl_FragColor = vec4(col, a);
}
`
