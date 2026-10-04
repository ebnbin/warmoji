/** 两种着色器共用的噪声：格点哈希与平滑的值噪声 */
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
 * 崖下的山谷，四边形盖住镜头能去的整片地方，压在地面贴图底下：地面在崖壁外透明，这里才露出来。坐标以格计、y 朝下；
 * 四边形的纹理坐标 y 朝上，画布纹理上传时也上下翻了，所以按地图坐标算出的纹理坐标要上下翻过来采样。
 * 谷底按透视画：镜头在草地上方 cameraU 格，谷底再往下 depth 格，地图平面上的一点 p 看下去落在谷底的 c + (p − c)/k，c 是镜头中心、k = 镜高/(镜高 + 谷深)：
 * 越深的东西显得越小、跟着镜头移得越慢。落点钻到崖里的（本该被崖壁挡住）夹回崖脚。半山腰飘着两层薄雾，顺着山风慢慢漂；贴图外是一片雾色
 */
export const VALLEY_FRAG = `${HEADER}
uniform sampler2D uValley;
uniform vec4 uArea;
uniform vec4 uRect;
uniform vec3 uCam;
uniform vec4 uFrame;
uniform float uInland;
uniform vec2 uMist;
uniform float uTime;
uniform vec2 uWind;
uniform vec3 uHaze;
uniform vec3 uMistTint;
${NOISE}
void main ()
{
  vec2 tc = outTexCoord;
  vec2 p = uArea.xy + vec2(tc.x, 1.0 - tc.y) * uArea.zw;
  vec2 c = uCam.xy;
  vec2 v = c + (p - c) / uCam.z;
  v -= uFrame.zw * max(0.0, dot(v - uFrame.xy, uFrame.zw) - uInland);
  vec2 uv = (v - uRect.xy) / uRect.zw;
  vec3 col = texture2D(uValley, vec2(uv.x, 1.0 - uv.y)).rgb;
  float inside = smoothstep(0.0, 0.03, uv.x) * smoothstep(1.0, 0.97, uv.x) * smoothstep(0.0, 0.03, uv.y) * smoothstep(1.0, 0.97, uv.y);
  col = mix(uHaze, col, inside);
  for (int i = 0; i < 2; i++) {
    float km = i == 0 ? uMist.y : uMist.x;
    vec2 m = c + (p - c) / km;
    vec2 q = m * (0.05 + 0.02 * float(i)) - uWind * uTime * (0.03 + 0.02 * float(i));
    float n = vnoise(q) * 0.6 + vnoise(q * 2.3 + 7.1) * 0.3 + vnoise(q * 5.1 + 3.3) * 0.1;
    float a = smoothstep(0.5, 0.78, n) * (0.32 - 0.1 * float(i));
    col = mix(col, uMistTint, a);
  }
  gl_FragColor = vec4(col, 1.0);
}
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
