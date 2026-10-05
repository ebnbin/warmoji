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
 * 两圈传送带：按正多边形分扇，每扇一段带子顺着那条边走。带面是橡胶的横纹加人字纹，人字的尖朝着这一圈走的方向、随带面滚动；
 * 内圈草莓粉、外圈薄荷绿；扇与扇的接缝处是滚筒，圈与圈之间、两圈的内外沿是糖色的护栏；换向预警时人字纹一明一暗。输出按预乘透明度。
 * uRect 是这张四边形盖住的世界范围（像素），uShape 是中心、边数与第一条边的法线角，uApo 是台面、内圈、外圈的边心距（像素），
 * uRun 是内外圈的带面各走了多远（像素），uFlow 是内圈此刻往哪走（±1）与人字纹的亮度，uUnit 是一格多少像素
 */
export const BELT_FRAG = `${HEADER}
uniform vec4 uRect;
uniform vec4 uShape;
uniform vec3 uApo;
uniform vec2 uRun;
uniform vec2 uFlow;
uniform float uUnit;

const float PI = 3.14159265;

void main ()
{
  vec2 p = uRect.xy + vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uRect.zw;
  vec2 d = p - uShape.xy;
  float n = uShape.z;
  float sector = 2.0 * PI / n;
  float ang = atan(d.y, d.x) - uShape.w;
  float k = floor(ang / sector + 0.5);
  float th = uShape.w + k * sector;
  vec2 nk = vec2(cos(th), sin(th));
  vec2 tk = vec2(-nk.y, nk.x);
  float g = dot(d, nk);
  float u = dot(d, tk);
  if (g < uApo.x || g > uApo.z) {
    gl_FragColor = vec4(0.0);
    return;
  }
  bool inner = g < uApo.y;
  float lo = inner ? uApo.x : uApo.y;
  float hi = inner ? uApo.y : uApo.z;
  float width = hi - lo;
  float across = (g - lo) / width;
  float run = inner ? uRun.x : uRun.y;
  float tip = (inner ? 1.0 : -1.0) * uFlow.x;
  float s = u - run;
  float off = abs(across - 0.5) * width;
  vec3 base = inner ? vec3(1.0, 0.56, 0.74) : vec3(0.42, 0.85, 0.74);
  vec3 lite = inner ? vec3(1.0, 0.9, 0.95) : vec3(0.9, 1.0, 0.97);
  float period = uUnit * 1.1;
  float chev = fract((s + tip * off * 0.9) / period);
  float band = smoothstep(0.0, 0.06, chev) * (1.0 - smoothstep(0.34, 0.4, chev));
  float rib = smoothstep(0.82, 1.0, fract(s / (uUnit * 0.22)));
  vec3 col = mix(base, lite, band * 0.85 * uFlow.y);
  col *= 1.0 - rib * 0.08;
  col *= 0.86 + 0.14 * sin(across * PI);
  float edge = min(g - lo, hi - g) / uUnit;
  float rail = 1.0 - smoothstep(0.1, 0.16, edge);
  vec3 railCol = mix(vec3(1.0, 0.97, 0.88), vec3(1.0, 0.8, 0.35), step(0.5, fract((u + g) / (uUnit * 0.5))));
  col = mix(col, railCol * (0.85 + 0.15 * smoothstep(0.0, 0.1, edge)), rail);
  float slope = tan(PI / n);
  float seam = (abs(u) - g * slope) / uUnit;
  float drum = smoothstep(-0.2, -0.12, seam);
  float rivet = 0.5 + 0.5 * sin(g / (uUnit * 0.09));
  vec3 drumCol = mix(vec3(0.52, 0.42, 0.66), vec3(0.86, 0.8, 0.95), rivet * 0.6);
  col = mix(col, drumCol, drum * (1.0 - rail));
  gl_FragColor = vec4(col, 1.0);
}
`
