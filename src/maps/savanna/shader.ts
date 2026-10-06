/** 水面上最多同时几处喝水的涟漪 */
export const MAX_RIPPLES = 8

/**
 * 水面：盖在画好的水上，只画亮的那一层。风吹出一道道细浪，浪尖映着天发亮；低低的太阳在水面上铺一条碎金，一闪一闪；
 * 水边一线湿亮；喝水的动物嘴边一圈圈荡开涟漪。水坑的岸按 uPond 与 uLobe 算，和规则里的一样
 */
export const WATER_FRAG = `
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
uniform vec2 uSize;
uniform vec3 uPond;
uniform vec3 uLobe[3];
uniform float uTime;
uniform vec2 uWind;
uniform vec2 uSun;
uniform vec4 uRipple[${MAX_RIPPLES}];

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

void main ()
{
  vec2 p = vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uSize;
  vec2 q = p - uPond.xy;
  float d = length(q);
  float ang = atan(q.y, q.x);
  float k = 1.0;
  for (int i = 0; i < 3; i++) k += uLobe[i].x * cos(uLobe[i].y * ang + uLobe[i].z);
  float R = uPond.z * k;
  float inside = smoothstep(R + 1.0, R - 2.0, d);
  if (inside <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float unit = 64.0;
  vec2 g = p / unit;
  vec2 w = normalize(uWind);
  float along = dot(g, w);
  float across = dot(g, vec2(-w.y, w.x));
  float wave = vnoise(vec2(along * 3.0 - uTime * 0.9, across * 1.1)) * 0.6 + vnoise(vec2(along * 7.0 - uTime * 1.7, across * 2.6 + 3.0)) * 0.4;
  float crest = smoothstep(0.62, 0.8, wave);
  vec3 col = vec3(1.0, 0.86, 0.9) * crest * 0.22;
  float a = crest * 0.22;

  // 低低的太阳铺在水上的一条碎金：从岸的迎光一侧斜着穿过来
  vec2 s = normalize(uSun);
  float band = dot(q, vec2(-s.y, s.x)) / R;
  float lane = exp(-band * band * 6.0) * smoothstep(-1.1, 0.2, dot(q, s) / R);
  // 碎金是一粒粒圆的亮点，各自按自己的节拍一闪
  vec2 cellG = floor(g * 7.0);
  vec2 center = (cellG + 0.25 + 0.5 * vec2(hash(cellG + 3.1), hash(cellG + 7.7))) / 7.0;
  float tw = 0.5 + 0.5 * sin(uTime * (2.0 + 3.0 * hash(cellG)) + hash(cellG + 1.3) * 6.28);
  float dot0 = smoothstep(0.035, 0.0, length(g - center)) * step(0.45, hash(cellG + 9.1));
  float glint = lane * dot0 * tw * (0.6 + 0.4 * crest) * 1.4;
  col += vec3(1.0, 0.86, 0.6) * glint;
  a += glint;
  col += vec3(1.0, 0.8, 0.7) * lane * 0.1;
  a += lane * 0.1;

  // 水边一线湿亮
  float rim = smoothstep(4.0, 0.0, abs(d - R + 2.5)) * 0.35;
  col += vec3(1.0, 0.85, 0.88) * rim;
  a += rim;

  // 喝水的涟漪：一圈圈往外荡，越远越淡
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRipple[i];
    if (r.w <= 0.0) continue;
    float rd = length(p - r.xy) / unit;
    float ring = sin(rd * 14.0 - uTime * 5.0 + r.z) * 0.5 + 0.5;
    float fade = exp(-rd * 1.6) * smoothstep(0.05, 0.3, rd) * r.w;
    float rr = smoothstep(0.75, 0.95, ring) * fade * 0.5;
    col += vec3(1.0, 0.9, 0.92) * rr;
    a += rr;
  }
  a = clamp(a, 0.0, 0.9) * inside;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0) * inside, a);
}
`
