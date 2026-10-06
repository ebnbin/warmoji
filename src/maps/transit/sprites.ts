import { doorOffsets, trainLength } from './layout'
import type { TrainSpec } from '../../types/maps'

/** 列车贴图四周留多宽（格）：影子晕开、车灯的光 */
export const TRAIN_PAD_U = 0.7

/** 列车贴图的框（格）：车身中点在 (0, 0)，u 朝右是车头，v 朝下 */
export interface TrainFrame {
  readonly u0: number
  readonly v0: number
  readonly w: number
  readonly h: number
}

export function trainFrame(spec: TrainSpec): TrainFrame {
  const len = trainLength(spec)
  return { u0: -len / 2 - TRAIN_PAD_U, v0: -spec.widthU / 2 - TRAIN_PAD_U, w: len + TRAIN_PAD_U * 2, h: spec.widthU + TRAIN_PAD_U * 2 }
}

interface Mapper {
  readonly x: (u: number) => number
  readonly y: (v: number) => number
  readonly k: number
}

function mapper(f: TrainFrame, ppu: number): Mapper {
  return { x: (u) => (u - f.u0) * ppu, y: (v) => (v - f.v0) * ppu, k: ppu }
}

function hex(c: number, a = 1): string {
  return `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${a})`
}

/**
 * 车身的外廓：两头都收成流线的车鼻，鼻尖圆钝；inset 往里收这么多格（画车顶的高光、车厢的内壁）
 */
function bodyPath(spec: TrainSpec, m: Mapper, inset: number): Path2D {
  const len = trainLength(spec) / 2 - inset
  const hw = spec.widthU / 2 - inset
  const nose = Math.max(0.2, spec.noseU - inset * 0.5)
  const tip = hw * 0.42
  const p = new Path2D()
  p.moveTo(m.x(-len + nose), m.y(-hw))
  p.lineTo(m.x(len - nose), m.y(-hw))
  p.bezierCurveTo(m.x(len - nose * 0.35), m.y(-hw), m.x(len), m.y(-tip * 1.35), m.x(len), m.y(0))
  p.bezierCurveTo(m.x(len), m.y(tip * 1.35), m.x(len - nose * 0.35), m.y(hw), m.x(len - nose), m.y(hw))
  p.lineTo(m.x(-len + nose), m.y(hw))
  p.bezierCurveTo(m.x(-len + nose * 0.35), m.y(hw), m.x(-len), m.y(tip * 1.35), m.x(-len), m.y(0))
  p.bezierCurveTo(m.x(-len), m.y(-tip * 1.35), m.x(-len + nose * 0.35), m.y(-hw), m.x(-len + nose), m.y(-hw))
  p.closePath()
  return p
}

/** 节与节之间的风挡在哪（格，从车尾往车头） */
function joints(spec: TrainSpec): number[] {
  const len = trainLength(spec)
  const out: number[] = []
  for (let c = 1; c < spec.cars; c++) out.push(-len / 2 + c * (spec.carU + spec.gapU) - spec.gapU / 2)
  return out
}

/**
 * 车顶：白色的流线车身，正中一道高光，两侧一长条深色的车窗带，车窗下沿一道线路色的腰线；每节车顶正中一个扁圆的空调罩；
 * 节间是深灰的风挡；两头的车鼻包着一圈黑色的挡风玻璃；车门在侧面画成车窗带上两道竖缝
 */
export function drawRoof(ctx: CanvasRenderingContext2D, spec: TrainSpec, livery: number, ppu: number, express: boolean): void {
  const f = trainFrame(spec)
  const m = mapper(f, ppu)
  const len = trainLength(spec)
  const hw = spec.widthU / 2
  const body = bodyPath(spec, m, 0)
  ctx.save()
  ctx.clip(body)
  const g = ctx.createLinearGradient(0, m.y(-hw), 0, m.y(hw))
  const base = express ? [214, 220, 228] : [246, 248, 250]
  const edge = express ? [150, 158, 170] : [196, 204, 214]
  g.addColorStop(0, `rgb(${edge.join(',')})`)
  g.addColorStop(0.24, `rgb(${base.join(',')})`)
  g.addColorStop(0.5, '#ffffff')
  g.addColorStop(0.76, `rgb(${base.join(',')})`)
  g.addColorStop(1, `rgb(${edge.join(',')})`)
  ctx.fillStyle = g
  ctx.fillRect(m.x(-len / 2), m.y(-hw), len * ppu, spec.widthU * ppu)
  // 车窗带与腰线
  for (const side of [-1, 1]) {
    const v0 = side * (hw - 0.3)
    ctx.fillStyle = 'rgba(28, 40, 54, 0.92)'
    ctx.fillRect(m.x(-len / 2), Math.min(m.y(v0), m.y(v0 + side * 0.2)), len * ppu, 0.2 * ppu)
    ctx.fillStyle = 'rgba(160, 210, 240, 0.35)'
    for (let u = -len / 2; u < len / 2; u += 0.9) ctx.fillRect(m.x(u + 0.1), Math.min(m.y(v0 + side * 0.04), m.y(v0 + side * 0.08)), 0.35 * ppu, 0.04 * ppu)
    ctx.fillStyle = hex(livery, 1)
    ctx.fillRect(m.x(-len / 2), Math.min(m.y(side * (hw - 0.1)), m.y(side * (hw - 0.02))), len * ppu, 0.09 * ppu)
  }
  if (express) {
    ctx.fillStyle = hex(livery, 0.95)
    ctx.fillRect(m.x(-len / 2), m.y(-0.18), len * ppu, 0.36 * ppu)
    ctx.fillStyle = 'rgba(30, 30, 34, 0.9)'
    ctx.fillRect(m.x(-len / 2), m.y(-0.05), len * ppu, 0.1 * ppu)
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.fillRect(m.x(-len / 2), m.y(-0.05), len * ppu, 0.1 * ppu)
  }
  // 车门的竖缝
  for (const off of doorOffsets(spec)) {
    for (const side of [-1, 1]) {
      ctx.fillStyle = 'rgba(20, 26, 34, 0.9)'
      for (const e of [-1, 1]) ctx.fillRect(m.x(off + (e * spec.doorU) / 2) - 0.02 * ppu, Math.min(m.y(side * hw), m.y(side * (hw - 0.55))), 0.04 * ppu, 0.55 * ppu)
      ctx.fillRect(m.x(off) - 0.012 * ppu, Math.min(m.y(side * hw), m.y(side * (hw - 0.5))), 0.024 * ppu, 0.5 * ppu)
    }
  }
  // 节间的风挡与每节车顶的空调罩
  for (const j of joints(spec)) {
    ctx.fillStyle = 'rgba(60, 66, 76, 1)'
    ctx.fillRect(m.x(j - spec.gapU / 2), m.y(-hw), spec.gapU * ppu, spec.widthU * ppu)
    ctx.fillStyle = 'rgba(100, 108, 118, 1)'
    for (let k = 0; k < 4; k++) ctx.fillRect(m.x(j - spec.gapU / 2 + ((k + 0.5) * spec.gapU) / 4) - 0.015 * ppu, m.y(-hw), 0.03 * ppu, spec.widthU * ppu)
  }
  for (let c = 0; c < spec.cars; c++) {
    const mid = -len / 2 + c * (spec.carU + spec.gapU) + spec.carU / 2
    const pod = new Path2D()
    const pw = spec.carU * 0.32
    pod.ellipse(m.x(mid), m.y(0), (pw / 2) * ppu, spec.widthU * 0.22 * ppu, 0, 0, Math.PI * 2)
    ctx.fillStyle = express ? 'rgba(70, 72, 80, 1)' : 'rgba(222, 228, 236, 1)'
    ctx.fill(pod)
    ctx.strokeStyle = 'rgba(150, 160, 172, 0.9)'
    ctx.lineWidth = 0.03 * ppu
    ctx.stroke(pod)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.fillRect(m.x(mid - pw * 0.3), m.y(-spec.widthU * 0.12), pw * 0.6 * ppu, 0.04 * ppu)
  }
  // 车鼻的挡风玻璃
  for (const e of [-1, 1]) {
    const tip = e * (len / 2)
    const glass = new Path2D()
    const back = tip - e * spec.noseU * 0.8
    glass.moveTo(m.x(back), m.y(-hw * 0.72))
    glass.quadraticCurveTo(m.x(tip - e * 0.05), m.y(-hw * 0.5), m.x(tip - e * 0.12), m.y(0))
    glass.quadraticCurveTo(m.x(tip - e * 0.05), m.y(hw * 0.5), m.x(back), m.y(hw * 0.72))
    glass.quadraticCurveTo(m.x(back + e * spec.noseU * 0.25), m.y(0), m.x(back), m.y(-hw * 0.72))
    const gg = ctx.createLinearGradient(m.x(back), 0, m.x(tip), 0)
    gg.addColorStop(0, 'rgba(26, 36, 50, 1)')
    gg.addColorStop(1, 'rgba(50, 70, 92, 1)')
    ctx.fillStyle = gg
    ctx.fill(glass)
    ctx.strokeStyle = 'rgba(190, 225, 245, 0.55)'
    ctx.lineWidth = 0.035 * ppu
    ctx.beginPath()
    ctx.moveTo(m.x(back + e * 0.25), m.y(-hw * 0.45))
    ctx.quadraticCurveTo(m.x(tip - e * 0.35), m.y(-hw * 0.3), m.x(tip - e * 0.3), m.y(-hw * 0.05))
    ctx.stroke()
  }
  ctx.restore()
  ctx.strokeStyle = 'rgba(70, 82, 96, 0.9)'
  ctx.lineWidth = 0.05 * ppu
  ctx.stroke(body)
}

/**
 * 车厢里：暖灰的地板，正中一条过道，两侧贴着车壁一排排线路色的座椅，扶杆一根根立着；车门处的地上一道黄色的门槛；
 * 车壁是一圈白色的厚边，门洞处断开；节间的风挡是通的
 */
export function drawCabin(ctx: CanvasRenderingContext2D, spec: TrainSpec, livery: number, ppu: number): void {
  const f = trainFrame(spec)
  const m = mapper(f, ppu)
  const len = trainLength(spec)
  const hw = spec.widthU / 2
  const w = spec.wallU
  const outer = bodyPath(spec, m, 0)
  const inner = bodyPath(spec, m, w)
  ctx.save()
  ctx.clip(inner)
  ctx.fillStyle = 'rgb(222, 216, 206)'
  ctx.fillRect(m.x(-len / 2), m.y(-hw), len * ppu, spec.widthU * ppu)
  ctx.fillStyle = 'rgba(200, 192, 180, 1)'
  ctx.fillRect(m.x(-len / 2), m.y(-0.22), len * ppu, 0.44 * ppu)
  const doors = doorOffsets(spec)
  const half = spec.doorU / 2
  for (let u = -len / 2 + 0.4; u < len / 2 - 0.4; u += 0.62) {
    if (doors.some((d) => Math.abs(u - d) < half + 0.25)) continue
    if (joints(spec).some((j) => Math.abs(u - j) < spec.gapU / 2 + 0.3)) continue
    if (Math.abs(u) > len / 2 - spec.noseU * 0.9) continue
    for (const side of [-1, 1]) {
      const v = side * (hw - w - 0.3)
      const seat = new Path2D()
      seat.roundRect(m.x(u - 0.25), m.y(v - 0.24), 0.5 * ppu, 0.48 * ppu, 0.1 * ppu)
      ctx.fillStyle = hex(livery, 1)
      ctx.fill(seat)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
      ctx.fillRect(m.x(u - 0.25), Math.min(m.y(v + side * 0.14), m.y(v + side * 0.24)), 0.5 * ppu, 0.1 * ppu)
    }
  }
  for (const d of doors) {
    for (const side of [-1, 1]) {
      ctx.fillStyle = 'rgba(244, 200, 52, 0.95)'
      ctx.fillRect(m.x(d - half), Math.min(m.y(side * (hw - w)), m.y(side * (hw - w - 0.12))), spec.doorU * ppu, 0.12 * ppu)
      ctx.fillStyle = 'rgba(150, 156, 164, 1)'
      for (const e of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(m.x(d + e * (half + 0.12)), m.y(side * (hw - w - 0.45)), 0.05 * ppu, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  for (const j of joints(spec)) {
    ctx.fillStyle = 'rgba(176, 170, 160, 1)'
    ctx.fillRect(m.x(j - spec.gapU / 2), m.y(-hw * 0.7), spec.gapU * ppu, hw * 1.4 * ppu)
  }
  ctx.restore()
  // 车壁：外廓减去内壁，门洞断开
  ctx.save()
  const wall = new Path2D()
  wall.addPath(outer)
  wall.addPath(inner)
  ctx.clip(wall, 'evenodd')
  ctx.fillStyle = 'rgb(236, 240, 244)'
  ctx.fillRect(m.x(-len / 2) - 2, m.y(-hw) - 2, len * ppu + 4, spec.widthU * ppu + 4)
  ctx.restore()
  for (const d of doors) {
    for (const side of [-1, 1]) {
      ctx.clearRect(m.x(d - half), Math.min(m.y(side * (hw + 0.02)), m.y(side * (hw - w - 0.02))), spec.doorU * ppu, (w + 0.04) * ppu)
    }
  }
  for (const j of joints(spec)) {
    ctx.fillStyle = 'rgba(90, 96, 106, 1)'
    for (const side of [-1, 1]) ctx.fillRect(m.x(j - spec.gapU / 2), Math.min(m.y(side * hw), m.y(side * (hw - w))), spec.gapU * ppu, w * ppu)
  }
}

/** 列车投在地上的影子：车身的剪影晕开 */
export function drawTrainShadow(ctx: CanvasRenderingContext2D, spec: TrainSpec, ppu: number): void {
  const f = trainFrame(spec)
  const m = mapper(f, ppu)
  ctx.filter = `blur(${Math.round(0.18 * ppu)}px)`
  ctx.fillStyle = 'rgba(16, 26, 40, 0.5)'
  ctx.fill(bodyPath(spec, m, -0.05))
  ctx.filter = 'none'
}

/** 一团柔和的光：车灯、隧道里透出来的车头光 */
export function drawGlow(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, 'rgba(255, 255, 255, 1)')
  g.addColorStop(0.25, 'rgba(255, 255, 255, 0.55)')
  g.addColorStop(0.6, 'rgba(255, 255, 255, 0.12)')
  g.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
}

/** 车灯往前打在地上的一道光：一头窄一头宽、越远越淡的扇形，尖在左边正中 */
export function drawBeam(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, w, 0)
  g.addColorStop(0, 'rgba(255, 255, 255, 0.9)')
  g.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(0, h * 0.42)
  ctx.lineTo(w, 0)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h * 0.58)
  ctx.closePath()
  ctx.fill()
}

