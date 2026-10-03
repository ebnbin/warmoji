import { fbm } from '../../util/noise'
import type { Frame } from './layout'
import type { Dust, Masonry } from './masonry'

/** 视线环分这么多个方位 */
export const SIGHT_BINS = 720
/** 视线环记到多远，格：再远的按看不看得见这一圈的边算 */
export const SIGHT_RANGE_U = 22

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
 * 看不见的地方压暗：按正片叠底盖在画面上。每个像素按它在队长的哪个方位、离多远，跟视线环上那个方位穿出第一堵挡视线的墙的距离比，
 * 远过它就压暗、偏冷；边上软一点
 */
export const SIGHT_FRAG = `${HEADER}
uniform sampler2D uSight;
uniform vec4 uRect;
uniform vec2 uEye;
uniform float uRange;
uniform float uSoft;
uniform vec3 uDim;
void main ()
{
  vec2 tc = outTexCoord;
  vec2 world = uRect.xy + vec2(tc.x, 1.0 - tc.y) * uRect.zw;
  vec2 d = world - uEye;
  float dist = length(d);
  float a = atan(d.y, d.x);
  float free = texture2D(uSight, vec2(a / 6.2831853 + 0.5, 0.5)).r * uRange;
  float open = step(uRange * 0.995, free);
  float seen = max(open, smoothstep(free + uSoft, free - uSoft * 0.25, dist));
  gl_FragColor = vec4(mix(uDim, vec3(1.0), seen), 1.0);
}
`

/**
 * 视线环：从世界 (x, y) 格、眼高 eye 米朝四周看，每个方位上一路的墙高过眼睛（或木板、攒够了尘雾）就挡住；
 * 记下视线穿出第一堵挡住它的墙的距离（墙本身算看得见），按 SIGHT_RANGE_U 归一写进 out 的 R
 */
export function sightRing(m: Masonry, dust: Dust, opaqueTau: number, f: Frame, x: number, y: number, eye: number, out: Uint8ClampedArray): void {
  const g = m.grid
  const hc = m.courseM
  const a0 = x - f.cx
  const b0 = y - f.cy
  const u0 = (a0 * f.cos + b0 * f.sin + f.w / 2 - g.u0) / g.cell
  const v0 = (-a0 * f.sin + b0 * f.cos + f.h / 2 - g.v0) / g.cell
  const step = 0.5
  const range = SIGHT_RANGE_U / g.cell
  const stepM = step * m.cellM
  for (let b = 0; b < SIGHT_BINS; b++) {
    const a = ((b + 0.5) / SIGHT_BINS) * Math.PI * 2 - Math.PI
    const cx = Math.cos(a)
    const cy = Math.sin(a)
    const du = cx * f.cos + cy * f.sin
    const dv = -cx * f.sin + cy * f.cos
    let free = range
    let tau = 0
    let inWall = false
    for (let t = step; t < range; t += step) {
      const i = Math.floor(u0 + du * t)
      const j = Math.floor(v0 + dv * t)
      if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) {
        if (inWall) free = t
        break
      }
      const k = j * g.cols + i
      const wall = m.n[k]! * hc > eye || m.timber[k]! * hc > eye
      if (wall) {
        inWall = true
        continue
      }
      if (inWall) {
        free = t
        break
      }
      tau += dust.sigma[(j >> 1) * dust.cols + (i >> 1)]! * stepM
      if (tau >= opaqueTau) {
        free = t
        break
      }
    }
    const o = b * 4
    out[o] = Math.round((Math.min(free, range) / range) * 255)
    out[o + 1] = 0
    out[o + 2] = 0
    out[o + 3] = 255
  }
}

/** 一团扬尘：边沿被噪声扰得参差，里面一絮一絮的浓淡；贴图边上一定透明 */
export function drawDust(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c) / c
      const d = r * (1 + (0.5 - fbm(x / 9, y / 9, 37, 4)) * 0.8)
      const a = Math.min(1, Math.max(0, 1 - d) ** 1.2 * (0.6 + 0.55 * fbm(x / 5, y / 5, 41, 3))) * Math.min(1, Math.max(0, 1 - r) * 3)
      const o = (y * size + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = a * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 一块碎石：不规则的多边形，左上方受光、右下方背光 */
export function drawChip(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const pts: [number, number][] = []
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + Math.sin(k * 2.7) * 0.3
    const r = size * (0.32 + 0.12 * Math.abs(Math.sin(k * 1.9 + 0.4)))
    pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r])
  }
  const g = ctx.createLinearGradient(size * 0.2, size * 0.2, size * 0.8, size * 0.85)
  g.addColorStop(0, '#e6dcc4')
  g.addColorStop(0.5, '#b8a888')
  g.addColorStop(1, '#6e624e')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(pts[0]![0], pts[0]![1])
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1])
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(60,50,38,0.55)'
  ctx.lineWidth = size * 0.04
  ctx.stroke()
}

/** 一根木头碎片：细长的浅色木条，带一道木纹 */
export function drawSplinter(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#9c7650'
  ctx.beginPath()
  ctx.moveTo(w * 0.04, h * 0.5)
  ctx.lineTo(w * 0.3, h * 0.18)
  ctx.lineTo(w * 0.96, h * 0.38)
  ctx.lineTo(w * 0.7, h * 0.82)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(60,40,22,0.6)'
  ctx.lineWidth = h * 0.08
  ctx.beginPath()
  ctx.moveTo(w * 0.15, h * 0.5)
  ctx.lineTo(w * 0.85, h * 0.52)
  ctx.stroke()
}

/**
 * 从上往下看的鸽子，三帧排成一行：收着翅膀站着、翅膀展平、翅膀往上收；灰蓝的身子，翅上两道深色横斑，颈上一圈绿紫的光泽
 */
export function drawPigeon(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let k = 0; k < 3; k++) {
    const cx = k * w + w / 2
    const cy = h * 0.5
    ctx.save()
    if (k > 0) {
      const span = k === 1 ? 0.48 : 0.3
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#8e95a3'
        ctx.beginPath()
        ctx.moveTo(cx, cy - h * 0.08)
        ctx.quadraticCurveTo(cx + side * w * span * 0.55, cy - h * 0.26, cx + side * w * span, cy - h * 0.02)
        ctx.quadraticCurveTo(cx + side * w * span * 0.6, cy + h * 0.05, cx, cy + h * 0.1)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#3d414b'
        ctx.beginPath()
        ctx.moveTo(cx + side * w * span * 0.78, cy - h * 0.1)
        ctx.quadraticCurveTo(cx + side * w * span * 0.92, cy - h * 0.1, cx + side * w * span, cy - h * 0.02)
        ctx.quadraticCurveTo(cx + side * w * span * 0.86, cy, cx + side * w * span * 0.74, cy - h * 0.02)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = 'rgba(40,42,50,0.7)'
        ctx.lineWidth = h * 0.025
        ctx.beginPath()
        ctx.moveTo(cx + side * w * span * 0.25, cy - h * 0.06)
        ctx.lineTo(cx + side * w * span * 0.32, cy + h * 0.04)
        ctx.moveTo(cx + side * w * span * 0.38, cy - h * 0.08)
        ctx.lineTo(cx + side * w * span * 0.45, cy + h * 0.03)
        ctx.stroke()
      }
    }
    ctx.fillStyle = '#9aa1ae'
    ctx.beginPath()
    ctx.ellipse(cx, cy + h * 0.04, w * 0.07, h * 0.26, 0, 0, Math.PI * 2)
    ctx.fill()
    if (k === 0) {
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#878e9c'
        ctx.beginPath()
        ctx.ellipse(cx + side * w * 0.035, cy + h * 0.1, w * 0.05, h * 0.2, side * 0.12, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(40,42,50,0.7)'
        ctx.lineWidth = h * 0.025
        ctx.beginPath()
        ctx.moveTo(cx + side * w * 0.02, cy + h * 0.06)
        ctx.lineTo(cx + side * w * 0.07, cy + h * 0.08)
        ctx.moveTo(cx + side * w * 0.02, cy + h * 0.14)
        ctx.lineTo(cx + side * w * 0.07, cy + h * 0.16)
        ctx.stroke()
      }
    }
    ctx.fillStyle = '#5d6b72'
    ctx.beginPath()
    ctx.ellipse(cx, cy - h * 0.18, w * 0.055, h * 0.07, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(110,150,120,0.75)'
    ctx.beginPath()
    ctx.ellipse(cx, cy - h * 0.13, w * 0.06, h * 0.04, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2f3138'
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.04, cy + h * 0.27)
    ctx.lineTo(cx + w * 0.04, cy + h * 0.27)
    ctx.lineTo(cx, cy + h * 0.36)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#d9b26a'
    ctx.beginPath()
    ctx.arc(cx, cy - h * 0.255, w * 0.012, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}
