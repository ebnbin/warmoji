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
 * 崖下的山谷，四边形盖住镜头能去的整片地方，压在地面贴图底下：地面在崖边以外透明，这里才露出来。坐标以格计、y 朝下；
 * 四边形的纹理坐标 y 朝上，画布纹理上传时也上下翻了，所以按地图坐标算出的纹理坐标要上下翻过来采样。
 * 按透视画：镜头在草地上方 uDrop.x 格，谷底再往下 uDrop.y 格；从镜头中心 c 看过地图平面上的一点 p，视线在往下 z 格处落在 c + (p − c)·s，s = 1 + z/镜高：
 * 越深的东西显得越小、跟着镜头移得越慢。视线一路往下，钻进崖边那条线以里就是碰上了朝着镜头的崖壁（崖湾、崖头的侧面），否则落到谷底。
 * 半山腰飘着两层薄雾，顺着山风慢慢漂；谷底贴图外是一片雾色
 */
export const VALLEY_FRAG = `${HEADER}
uniform sampler2D uValley;
uniform sampler2D uLip;
uniform vec4 uArea;
uniform vec4 uRect;
uniform vec3 uCam;
uniform vec2 uDrop;
uniform vec2 uMist;
uniform float uTime;
uniform vec2 uWind;
uniform vec3 uHaze;
uniform vec4 uFrame;
uniform vec2 uTan;
uniform vec4 uLipMap;
uniform vec3 uLipCode;
uniform vec2 uLipSpan;
uniform vec2 uSun;
${NOISE}
vec2 toLocal(vec2 q) {
  vec2 d = q - uFrame.xy;
  return vec2(dot(d, uFrame.zw), dot(d, uTan));
}

/** 崖边在 b 处离断崖那条地图边多远（x）与这里的斜率（y）：贴图里每个样是两个字节的值加一个字节的到下一个样的差 */
vec2 lipAt(float b) {
  float f = clamp((b - uLipMap.x) * uLipMap.y, 0.0, uLipMap.z - 1.0);
  float i = floor(f);
  vec3 t = texture2D(uLip, vec2((i + 0.5) / uLipMap.z, 0.5)).rgb;
  float d = (t.b * 2.0 - 1.0) * uLipCode.z;
  return vec2(uLipCode.x + (t.r * 65280.0 + t.g * 255.0) / 65535.0 * uLipCode.y + d * (f - i), d * uLipMap.y);
}

/** 视线在 s 处钻进崖里多深：正的在崖里 */
float gapAt(vec2 Lc, vec2 Ld, float s) {
  vec2 L = Lc + Ld * s;
  return L.x - lipAt(L.y).x;
}

/**
 * 崖壁上顺着崖边 b 格、视线 s 处的一点：一层层的岩层、竖着的裂缝，石缝里长着灌木，崖顶垂下一溜草皮；岩层按 1 − 1/s 排，远近一样密。
 * 崖壁是竖的，按它朝哪打光；越往下越暗、越蒙在雾里
 */
vec3 cliffFace(float b, float s, float slope) {
  vec2 n = normalize(-uFrame.zw + uTan * slope);
  float w = 1.0 - 1.0 / s;
  float band = vnoise(vec2(b * 0.1, w * 22.0)) * 0.6 + vnoise(vec2(b * 0.35 + 9.0, w * 60.0)) * 0.4;
  float crack = smoothstep(0.08, 0.0, abs(vnoise(vec2(b * 0.9, w * 5.0)) - 0.5));
  float grain = vnoise(vec2(b * 3.0, w * 160.0));
  vec3 rock = mix(vec3(0.5, 0.47, 0.42), vec3(0.66, 0.62, 0.55), band) * (0.86 + 0.22 * grain) * (1.0 - 0.3 * crack);
  float ledge = smoothstep(0.62, 0.7, vnoise(vec2(b * 0.25 + 1.7, w * 26.0)));
  rock = mix(rock, vec3(0.72, 0.68, 0.6), ledge * 0.5);
  float shrub = smoothstep(0.72, 0.8, vnoise(vec2(b * 0.7 + 3.1, w * 40.0))) * (0.4 + 0.6 * ledge);
  rock = mix(rock, vec3(0.22, 0.32, 0.18), shrub * 0.85);
  rock = mix(rock, vec3(0.24, 0.3, 0.16), smoothstep(0.012, 0.003, w + (grain - 0.5) * 0.006));
  float deep = (s - 1.0) * uDrop.x / uDrop.y;
  vec3 col = rock * (0.44 + 0.84 * max(0.0, dot(n, uSun))) * (1.0 - 0.35 * deep);
  return mix(col, uHaze, 0.06 + 0.3 * deep);
}

void main ()
{
  vec2 tc = outTexCoord;
  vec2 p = uArea.xy + vec2(tc.x, 1.0 - tc.y) * uArea.zw;
  vec2 c = uCam.xy;
  vec2 Lc = toLocal(c);
  vec2 Ld = toLocal(p) - Lc;
  if (gapAt(Lc, Ld, 1.0) > 0.0) {
    gl_FragColor = vec4(uHaze, 1.0);
    return;
  }
  // 视线往下走，本地的 a 一路变小或变大：只在它还可能钻进崖里的那一段找崖壁
  float sFloor = 1.0 / uCam.z;
  float sEnd = sFloor;
  if (Ld.x < -1e-4) sEnd = min(sEnd, (uLipSpan.x - Lc.x) / Ld.x);
  else if (Ld.x > 1e-4) sEnd = min(sEnd, (uLipSpan.y - Lc.x) / Ld.x + 0.05);
  float hit = 0.0;
  if (sEnd > 1.0) {
    float lo = 1.0;
    for (int i = 1; i <= 20; i++) {
      float s = 1.0 + (sEnd - 1.0) * float(i) / 20.0;
      if (gapAt(Lc, Ld, s) > 0.0) {
        float hi = s;
        for (int j = 0; j < 6; j++) {
          float m = 0.5 * (lo + hi);
          if (gapAt(Lc, Ld, m) > 0.0) hi = m;
          else lo = m;
        }
        hit = hi;
        break;
      }
      lo = s;
    }
  }
  vec3 col;
  float sHit = sFloor;
  if (hit > 0.0) {
    float b = Lc.y + Ld.y * hit;
    col = cliffFace(b, hit, lipAt(b).y);
    sHit = hit;
  } else {
    vec2 uv = (c + (p - c) * sFloor - uRect.xy) / uRect.zw;
    col = texture2D(uValley, vec2(uv.x, 1.0 - uv.y)).rgb;
    float inside = smoothstep(0.0, 0.03, uv.x) * smoothstep(1.0, 0.97, uv.x) * smoothstep(0.0, 0.03, uv.y) * smoothstep(1.0, 0.97, uv.y);
    col = mix(uHaze, col, inside);
  }
  for (int i = 0; i < 2; i++) {
    float km = i == 0 ? uMist.y : uMist.x;
    if (1.0 / km >= sHit) continue;
    vec2 m = c + (p - c) / km;
    vec2 q = m * (0.05 + 0.02 * float(i)) - uWind * uTime * (0.03 + 0.02 * float(i));
    float n = vnoise(q) * 0.6 + vnoise(q * 2.3 + 7.1) * 0.3 + vnoise(q * 5.1 + 3.3) * 0.1;
    float a = smoothstep(0.5, 0.78, n) * (0.32 - 0.1 * float(i));
    col = mix(col, vec3(0.92, 0.94, 0.95), a);
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
