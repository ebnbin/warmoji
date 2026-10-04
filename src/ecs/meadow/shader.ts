/** 着色器用的噪声：格点哈希与平滑的值噪声 */
const NOISE = `
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
 * 草浪：盖在地面贴图上，只在草地与牧场上画。山风一阵阵顺着风刮过来，压弯的草叶翻出发白的一面，成片地亮一下，顺着风一道道漂过去；
 * 阵风之间的草直起来，暗一点；叶尖还有细碎的抖动。输出按预乘透明度
 */
export const GRASS_FRAG = `${HEADER}
uniform sampler2D uMask;
uniform vec4 uArea;
uniform float uTime;
uniform vec2 uWind;
${NOISE}
void main ()
{
  vec2 tc = outTexCoord;
  float grass = texture2D(uMask, tc).r;
  if (grass < 0.01) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec2 p = uArea.xy + vec2(tc.x, 1.0 - tc.y) * uArea.zw;
  vec2 across = vec2(-uWind.y, uWind.x);
  float along = dot(p, uWind);
  float side = dot(p, across);
  float gust = vnoise(vec2(along * 0.16 - uTime * 0.55, side * 0.07)) * 0.65 + vnoise(vec2(along * 0.4 - uTime * 1.3, side * 0.18 + 5.0)) * 0.35;
  float lift = smoothstep(0.56, 0.86, gust);
  float lull = smoothstep(0.46, 0.22, gust);
  float shimmer = vnoise(vec2(along * 3.0 - uTime * 4.0, side * 1.2)) - 0.5;
  float a = clamp(lift * 0.11 + shimmer * 0.025 * lift, 0.0, 1.0) * grass;
  float d = lull * 0.06 * grass;
  gl_FragColor = vec4(vec3(0.86, 0.9, 0.7) * a, a + d);
}
`
