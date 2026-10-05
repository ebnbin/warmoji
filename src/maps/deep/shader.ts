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

/** 朝前照的灯最多几盏：队员的头灯，加上潜艇艇首的两盏探照灯 */
export const MAX_LAMPS = 8

/**
 * 海水对红、绿、蓝三色光的衰减系数，每米：红光一两米就被吃掉，蓝光走得最远，灯光照远了只剩青蓝。
 * 清澈的深海水大致是这个量级
 */
export const ATTENUATION = [0.45, 0.16, 0.05] as const

/**
 * 谷底的光：地面的固有色乘上照到它的光，再加上水里散射回来的光与被搅亮的浮游生物。
 * 头顶的天光只剩一丝深蓝，朝上的地方吃得多，越高越亮（离海面近一点）、越往陡坎下越暗；潜艇门上的灯朝下照，按 I·cosθ/r² 落在地面上，光走过的每一米按三色的衰减系数吃掉，远处只剩青蓝；
 * 队员的头灯与艇首的探照灯朝着各自的方向亮，身后也漏一点。灯光在水里被悬浮的颗粒散射回镜头，灯四周罩着一团泛青的光晕。
 * 被搅动的浮游生物发出蓝绿的冷光，叠在最上面。最后按曝光压成画面的颜色，加一点抖动免得暗处出色带
 */
export const SEABED_FRAG = `${HEADER}
uniform sampler2D uAlbedo;
uniform sampler2D uGeo;
uniform sampler2D uNorm;
uniform sampler2D uGlow;
uniform vec4 uRect;
uniform vec4 uField0;
uniform vec2 uHeight;
uniform float uMpp;
uniform vec4 uDoor;
uniform vec4 uLamp[${MAX_LAMPS}];
uniform vec4 uLampDir[${MAX_LAMPS}];
uniform float uLampCount;
uniform vec3 uSky;
uniform float uGlowGain;
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
void main ()
{
  vec2 tc = outTexCoord;
  vec2 world = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  vec2 uv = fieldUv(world);
  vec3 albedo = texture2D(uAlbedo, uv).rgb;
  float z = heightAt(uv);
  vec3 nm = texture2D(uNorm, uv).rgb;
  vec3 n = normalize(vec3(nm.xy * 2.0 - 1.0, max(nm.z, 0.05)));
  vec3 p = vec3(world * uMpp, z);
  float sky = (0.55 + 0.45 * max(n.z, 0.0)) * exp(0.05 * min(z, 16.0) + 0.03 * min(z, 0.0));
  vec3 light = uSky * sky;
  vec3 haze = vec3(0.0);
  if (uDoor.w > 0.0) {
    vec3 l = vec3(uDoor.xy * uMpp, uDoor.z) - p;
    float r = length(l);
    vec3 ld = l / max(r, 0.001);
    float spot = smoothstep(0.22, 0.8, ld.z);
    vec3 fall = exp(-ATT * r);
    light += uDoor.w * spot * max(dot(n, ld), 0.0) / (r * r + 0.4) * fall;
    float dh = length(l.xy);
    haze += uDoor.w * 0.0026 * exp(-ATT * (dh * 0.8 + 1.5)) / (dh * dh * 0.25 + 1.0);
  }
  for (int k = 0; k < ${MAX_LAMPS}; k++) {
    if (float(k) >= uLampCount) break;
    vec4 lamp = uLamp[k];
    vec3 l = vec3(lamp.xy * uMpp, lamp.z) - p;
    float r = length(l);
    vec3 ld = l / max(r, 0.001);
    vec2 away = -l.xy / max(length(l.xy), 0.001);
    float ahead = dot(away, uLampDir[k].xy);
    float spot = mix(0.12, 1.0, smoothstep(0.0, 0.85, ahead));
    spot = mix(1.0, spot, smoothstep(0.4, 1.4, length(l.xy)));
    vec3 fall = exp(-ATT * r);
    light += lamp.w * spot * max(dot(n, ld), 0.0) / (r * r + 0.3) * fall;
    float dh = length(l.xy);
    haze += lamp.w * 0.003 * exp(-ATT * (dh * 0.8 + 1.0)) / (dh * dh * 0.8 + 1.0) * mix(0.5, 1.0, smoothstep(-0.3, 0.6, ahead));
  }
  vec3 glow = vec3(0.12, 0.78, 1.0) * texture2D(uGlow, uv).r * uGlowGain;
  vec3 col = albedo * light + haze + glow;
  col = vec3(1.0) - exp(-col * uExposure);
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  gl_FragColor = vec4(col + dither / 255.0, 1.0);
}
`
