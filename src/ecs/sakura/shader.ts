import { at, GRAVITY, project } from '../river/channel'
import { WATER_CELL_U } from '../river/water'
import { WATER_GLSL } from '../river/shader'
import { CREST_U } from './layout'
import type { Along } from '../river/channel'
import type { Water } from '../river/water'
import type { SakuraPlan } from './layout'
import type { SakuraConfig } from '../../types/maps'

/** 高程按这个范围（米）编码进两个通道：最低是跌水沟底，最高是院外的地面 */
export const Z_MIN = -6
export const Z_SPAN = 12
/** 流速按 ±这么多（米/秒）编码进一个通道 */
const SPEED_SPAN = 4
/** 干地上的水位与流速从有水的格子往外推几圈：岸线才按地形的细格子切出来，细浪的块中心落在岸上也有流向 */
const SPREAD = 4
/** 跌水沟里的水多快（米/秒）；出了堰顶这么多格以内翻白，往外慢慢平下来 */
const DITCH_SPEED = 1.4
const DITCH_WHITE_U = 4

/** 给水面着色器的三张数据图，不透明（画布会按透明度预乘，数据必须满 alpha）：地形高程（细格子）、水面高程、流速与乱流 */
interface WaterImages {
  readonly bed: Uint8ClampedArray<ArrayBuffer>
  readonly bedCols: number
  readonly bedRows: number
  readonly level: Uint8ClampedArray<ArrayBuffer>
  readonly flow: Uint8ClampedArray<ArrayBuffer>
  readonly cols: number
  readonly rows: number
}

function put16(out: Uint8ClampedArray, o: number, z: number): void {
  const v = Math.round(Math.min(1, Math.max(0, (z - Z_MIN) / Z_SPAN)) * 65535)
  out[o] = v >> 8
  out[o + 1] = v & 255
  out[o + 2] = 255
  out[o + 3] = 255
}

/**
 * 编码水面：地形高程照搬；水面高程与流速按 WATER_CELL_U 的格子铺满整片地形，有解出来的稳态水流就用它；
 * 没有的地方只有院墙外的上游溪沟（按设计水位与曼宁流速铺）与堰下的跌水沟（一沟翻白的急水）；干地上的水位与流速从水边往外推几圈，
 * 推出去的水位不高过那里的地面。乱流取弗劳德数与流速的剪切：水急水浅的浅滩、堰顶、水门下都翻白
 */
export function encodeWater(cfg: SakuraConfig, plan: SakuraPlan, w: Water): WaterImages {
  const t = plan.terrain
  const bed = new Uint8ClampedArray(t.cols * t.rows * 4)
  for (let i = 0; i < t.cols * t.rows; i++) put16(bed, i * 4, t.z[i]!)
  const step = Math.round(WATER_CELL_U / t.cell)
  const cols = Math.floor(t.cols / step)
  const rows = Math.floor(t.rows / step)
  const n = cols * rows
  const eta = new Float32Array(n)
  const u = new Float32Array(n)
  const v = new Float32Array(n)
  const wet = new Uint8Array(n)
  const white = new Float32Array(n)
  const ox = Math.round(-t.x0 / WATER_CELL_U)
  const oy = Math.round(-t.y0 / WATER_CELL_U)
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  const up = plan.upstream
  const down = plan.downstream
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      const z = t.z[cy * step * t.cols + cx * step]!
      const zs = (t.z[(cy * step + 1) * t.cols + cx * step + 1]! + z) / 2
      const wx = cx - ox
      const wy = cy - oy
      if (wx >= 0 && wy >= 0 && wx < w.cols && wy < w.rows) {
        const j = wy * w.cols + wx
        if (w.h[j]! > 1e-3 && w.sink[j]! < 0) {
          eta[i] = w.z[j]! + w.h[j]!
          u[i] = w.u[j]!
          v[i] = w.v[j]!
          wet[i] = 1
          continue
        }
      }
      const x = t.x0 + (cx + 0.5) * WATER_CELL_U
      const y = t.y0 + (cy + 0.5) * WATER_CELL_U
      project(down, x, y, tmp)
      if (tmp.s > CREST_U && tmp.d < at(down.half, tmp)) {
        eta[i] = at(down.level, tmp)
        u[i] = DITCH_SPEED * at(down.tx, tmp)
        v[i] = DITCH_SPEED * at(down.ty, tmp)
        wet[i] = 1
        white[i] = Math.max(0, 1 - tmp.s / DITCH_WHITE_U)
        continue
      }
      project(up, x, y, tmp)
      const half = at(up.half, tmp)
      if (tmp.s <= 0.05 || Math.abs(tmp.n) >= half) continue
      const level = at(up.level, tmp)
      const depth = level - zs
      if (depth <= 1e-3) continue
      const mean = cfg.flow.depthCoef * up.q ** 0.4
      const speed = up.speed * Math.min(1.6, (depth / mean) ** (2 / 3))
      eta[i] = level
      u[i] = speed * at(up.tx, tmp)
      v[i] = speed * at(up.ty, tmp)
      wet[i] = 1
    }
  }
  const rough = new Float32Array(n)
  const dxm = WATER_CELL_U * cfg.meterPerU
  for (let cy = 1; cy < rows - 1; cy++) {
    for (let cx = 1; cx < cols - 1; cx++) {
      const i = cy * cols + cx
      if (!wet[i]) continue
      const z = t.z[cy * step * t.cols + cx * step]!
      const h = Math.max(1e-3, eta[i]! - z)
      const sp = Math.hypot(u[i]!, v[i]!)
      const fr = sp / Math.sqrt(GRAVITY * h)
      const du = (Math.abs(u[i + 1]! - u[i - 1]!) + Math.abs(v[i + cols]! - v[i - cols]!) + Math.abs(u[i + cols]! - u[i - cols]!) + Math.abs(v[i + 1]! - v[i - 1]!)) / (2 * dxm)
      rough[i] = Math.max(white[i]!, Math.min(1, Math.max(0, (fr - 0.55) * 1.4) + Math.max(0, du - 1.2) * 0.12))
    }
  }
  const bedAt = (cx: number, cy: number): number => t.z[cy * step * t.cols + cx * step]!
  const known = wet.slice()
  for (let k = 0; k < SPREAD; k++) {
    const next = known.slice()
    for (let cy = 1; cy < rows - 1; cy++) {
      for (let cx = 1; cx < cols - 1; cx++) {
        const i = cy * cols + cx
        if (known[i]) continue
        let sum = 0
        let su = 0
        let sv = 0
        let cnt = 0
        for (const j of [i - 1, i + 1, i - cols, i + cols]) {
          if (!known[j]) continue
          sum += eta[j]!
          su += u[j]!
          sv += v[j]!
          cnt++
        }
        if (cnt === 0) continue
        eta[i] = Math.min(sum / cnt, bedAt(cx, cy) - 0.005)
        u[i] = su / cnt
        v[i] = sv / cnt
        next[i] = 1
      }
    }
    known.set(next)
  }
  const level = new Uint8ClampedArray(n * 4)
  const flow = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    put16(level, i * 4, known[i] ? eta[i]! : Z_MIN)
    flow[i * 4] = (u[i]! / SPEED_SPAN) * 127.5 + 127.5
    flow[i * 4 + 1] = (v[i]! / SPEED_SPAN) * 127.5 + 127.5
    flow[i * 4 + 2] = rough[i]! * 255
    flow[i * 4 + 3] = 255
  }
  return { bed, bedCols: t.cols, bedRows: t.rows, level, flow, cols, rows }
}

/**
 * 樱庭溪水的片元着色器，四边形盖住整片地形，坐标以格计、y 朝下；四边形的纹理坐标 y 朝上，画布纹理上传时也上下翻了，所以直接按它采样。
 * 泉水一样清：浅处几乎透明、透出沙底与卵石，深处青碧；细浪顺着流速漂，浅水里晃着焦散，按太阳打出高光、映出天色；
 * 院墙、桥与樱花的影子落在水面上，影子里不反光。水门下的水翻着白往外涌；堰顶的水一折落进跌水沟，沟里一沟白水。输出按预乘透明度
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
uniform sampler2D uBed;
uniform sampler2D uLevel;
uniform sampler2D uFlow;
uniform sampler2D uShade;
uniform float uTime;
uniform vec4 uArea;
uniform vec3 uCode;
uniform vec4 uWeir;
uniform float uWeirHalf;
uniform vec4 uIn;
uniform vec2 uInSize;
uniform vec3 uSun;

float decode(vec4 c) {
  return uCode.x + (c.r * 65280.0 + c.g * 255.0) / 65535.0 * uCode.y;
}

${WATER_GLSL}
void main ()
{
  vec2 tc = outTexCoord;
  vec2 p = uArea.xy + vec2(tc.x, 1.0 - tc.y) * uArea.zw;
  float bed = decode(texture2D(uBed, tc));
  float eta = decode(texture2D(uLevel, tc));
  float depth = eta - bed;
  if (depth <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec4 fl = texture2D(uFlow, tc);
  vec2 vel = (fl.rg - 0.5) * ${(SPEED_SPAN * 2).toFixed(1)};
  float rough = fl.b;
  vec2 v = vel / uCode.z;
  float speed = length(vel);
  float shade = texture2D(uShade, tc).a;

  // 堰：顺水离堰顶上游边多远、离溪中线多远；堰顶往下一折是一道白水帘，再往下是翻滚的跌水沟
  float wAlong = dot(p - uWeir.xy, uWeir.zw);
  float wSide = abs(dot(p - uWeir.xy, vec2(-uWeir.w, uWeir.z)));
  float inDitch = 1.0 - smoothstep(uWeirHalf, uWeirHalf + 0.2, wSide);
  float fall = inDitch * smoothstep(${(CREST_U - 0.05).toFixed(2)}, ${CREST_U.toFixed(2)}, wAlong) * (1.0 - smoothstep(${(CREST_U + 0.35).toFixed(2)}, ${(CREST_U + 0.7).toFixed(2)}, wAlong));
  // 水门：从墙下涌进来的水，靠墙最翻腾，往院里几格就平了
  vec2 ri = p - uIn.xy;
  float into = dot(ri, uIn.zw) - uInSize.y;
  float spout = (1.0 - smoothstep(0.0, 2.6, into)) * step(-0.2, into) * (1.0 - smoothstep(uInSize.x * 0.6, uInSize.x * 1.1, abs(dot(ri, vec2(-uIn.w, uIn.z)))));

  float lines;
  vec2 qa;
  vec2 qb;
  float w;
  vec2 slope = ripples(p, v, vel, speed, max(rough, spout * 0.6), lines, qa, qb, w);
  vec3 n = normalize(vec3(-slope, 1.0));
  float wet = smoothstep(0.0, 0.012, depth);

  float od = 1.0 - exp(-max(depth, 0.0) * 2.4);
  vec3 col = mix(vec3(0.46, 0.68, 0.6), vec3(0.06, 0.28, 0.32), pow(od, 0.9));
  float alpha = (0.05 + 0.86 * od) * wet;
  col *= 1.0 - 0.4 * shade;

  float face = dot(-slope, normalize(uSun.xy));
  float refl = (0.07 + clamp(face * 0.5, -0.06, 0.24)) * wet * (1.0 - 0.75 * shade);
  col = mix(col, vec3(0.8, 0.86, 0.86), refl / max(alpha + refl, 0.001));
  alpha = alpha + refl * (1.0 - alpha);
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
  float glint = pow(max(dot(r, uSun), 0.0), 180.0) * wet * (1.0 - shade);
  col = mix(col, vec3(1.0, 0.96, 0.86), glint);
  alpha = max(alpha, glint);

  float shoal = (1.0 - smoothstep(0.08, 0.4, depth)) * smoothstep(0.02, 0.05, depth) * (1.0 - smoothstep(0.1, 0.4, rough));
  float patchy = smoothstep(0.3, 0.7, vnoise(p * 0.6 + vec2(uTime * 0.05, 0.0)));
  float caust = mix(1.0 - smoothstep(0.0, 0.08, cells(qa * 2.6 + slope * 3.0)), 1.0 - smoothstep(0.0, 0.08, cells(qb * 2.6 + slope * 3.0 + 2.1)), w) * shoal * patchy * (1.0 - shade);
  col = mix(col, vec3(1.0, 0.98, 0.86), caust * 0.18);
  alpha = max(alpha, caust * 0.1);

  float boil = mix(vnoise(qa * 2.2 + 5.1), vnoise(qb * 2.2 + 8.3), w);
  float churn = mix(vnoise(qa * 5.0), vnoise(qb * 5.0 + 1.9), w);
  float foam = rough * smoothstep(0.5, 0.85, lines * 0.65 + churn * 0.35 + boil * 0.1);
  foam += smoothstep(0.03, 0.0, depth) * wet * 0.3 * smoothstep(0.35, 0.8, churn);
  foam += spout * smoothstep(0.4, 0.8, churn * 0.55 + boil * 0.35 + vnoise(vec2(into * 3.0 - uTime * 2.2, dot(ri, vec2(-uIn.w, uIn.z)) * 2.0)) * 0.3) * 0.9;
  foam = clamp(foam, 0.0, 1.0) * wet;
  vec3 froth = vec3(0.97, 0.96, 0.93) * (0.82 + 0.22 * max(dot(n, uSun), 0.0)) * (1.0 - 0.3 * shade);
  col = mix(col, froth, foam);
  alpha = max(alpha, foam * 0.95);

  if (fall > 0.0) {
    float sheet = vnoise(vec2(wSide * 6.0, wAlong * 3.0 - uTime * 5.0)) * 0.6 + vnoise(vec2(wSide * 14.0, wAlong * 6.0 - uTime * 8.0)) * 0.4;
    vec3 c = mix(vec3(0.66, 0.8, 0.8), vec3(0.98, 0.99, 0.97), smoothstep(0.3, 0.75, sheet));
    float a = fall * (0.55 + 0.45 * sheet);
    col = (col * alpha * (1.0 - a) + c * a) / max(alpha + a * (1.0 - alpha), 0.001);
    alpha = alpha + a * (1.0 - alpha);
  }
  gl_FragColor = vec4(col * alpha, alpha);
}
`
