import type { Print } from './tracks'

/** 印子的高按 ±这么多米编进一个通道 */
export const HEIGHT_SPAN = 0.08
/** 盖下这一笔的时刻按这么多秒一档编进两个通道 */
export const TIME_QUANT = 0.06
/** 印子贴图按这么大的块重传，格子 */
export const TRACK_TILE = 64

/**
 * 印子贴图：每格一个像素，不透明（画布会按透明度预乘，数据必须满 alpha）。R 是盖下这一笔时的高（128 是平地，往下是坑、往上是挤出的沙），
 * G、B 是盖下的时刻（16 位）：之后风把坑与挤起的沙一点点吹平，过 life 秒就平了，着色器按此刻过了多久算出现在的高。
 * 贴图首尾相接，dirty 记下哪些块改过、要重传
 */
export interface TrackTex {
  readonly cells: number
  readonly perU: number
  readonly life: number
  readonly data: Uint8ClampedArray<ArrayBuffer>
  readonly tiles: number
  readonly dirty: Uint8Array
}

export function newTrackTex(sizeU: number, perU: number, life: number): TrackTex {
  const cells = sizeU * perU
  const data = new Uint8ClampedArray(cells * cells * 4)
  for (let i = 0; i < cells * cells; i++) {
    data[i * 4] = 128
    data[i * 4 + 3] = 255
  }
  const tiles = Math.ceil(cells / TRACK_TILE)
  return { cells, perU, life, data, tiles, dirty: new Uint8Array(tiles * tiles) }
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 第 k 格此刻（now 秒）的高，米：盖下时的高按过了多久往平地收 */
function heightNow(t: TrackTex, k: number, now: number): number {
  const d = t.data
  const h0 = ((d[k * 4]! - 128) / 127) * HEIGHT_SPAN
  const t0 = (d[k * 4 + 1]! * 256 + d[k * 4 + 2]!) * TIME_QUANT
  return h0 * Math.max(0, 1 - (now - t0) / t.life)
}

/** 在第 (i, j) 格（会按首尾相接折回）上压一笔高 dh（米）：踩下去取更深的那个，挤起的沙堆在平地上取更高的、落进旧坑就把坑填上一点 */
function add(t: TrackTex, i: number, j: number, dh: number, now: number): void {
  if (Math.abs(dh) < 1e-5) return
  const n = t.cells
  const ci = ((i % n) + n) % n
  const cj = ((j % n) + n) % n
  const k = cj * n + ci
  const cur = heightNow(t, k, now)
  const mixed = dh < 0 ? Math.min(cur, dh) : cur >= 0 ? Math.max(cur, dh) : cur + dh * 0.5
  const h = Math.max(-HEIGHT_SPAN, Math.min(HEIGHT_SPAN, mixed))
  const q = Math.min(65535, Math.round(now / TIME_QUANT))
  t.data[k * 4] = 128 + Math.round((h / HEIGHT_SPAN) * 127)
  t.data[k * 4 + 1] = q >> 8
  t.data[k * 4 + 2] = q & 255
  t.dirty[Math.floor(cj / TRACK_TILE) * t.tiles + Math.floor(ci / TRACK_TILE)] = 1
}

/**
 * 一个椭圆的坑：中心 (x, y)（格），长轴沿 (ax, ay)，两个半轴（格），深（米）；坑口外一圈挤起的沙高 rim 倍的深，
 * 前方（沿长轴正向）多挤起 push 倍：脚往后蹬，沙堆在前掌外
 */
function pit(t: TrackTex, x: number, y: number, ax: number, ay: number, ru: number, rv: number, depth: number, rim: number, push: number, now: number): void {
  const per = t.perU
  const reach = Math.max(ru, rv) * 1.5 + 1 / per
  const i0 = Math.floor((x - reach) * per)
  const i1 = Math.ceil((x + reach) * per)
  const j0 = Math.floor((y - reach) * per)
  const j1 = Math.ceil((y + reach) * per)
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = (i + 0.5) / per - x
      const dy = (j + 0.5) / per - y
      const u = (dx * ax + dy * ay) / ru
      const v = (-dx * ay + dy * ax) / rv
      const q = Math.sqrt(u * u + v * v)
      if (q >= 1.5) continue
      const dh = q < 1 ? -depth * smooth(1, 0.5, q) : depth * rim * (1 + push * Math.max(0, u)) * Math.sin(((q - 1) / 0.5) * Math.PI)
      add(t, i, j, dh, now)
    }
  }
}

/** 一道沟：从 (x0, y0) 到 (x1, y1)（格），半宽（格），深（米，负的是隆起）；两边挤起 rim 倍的沙 */
function groove(t: TrackTex, x0: number, y0: number, x1: number, y1: number, half: number, depth: number, rim: number, now: number): void {
  const per = t.perU
  const reach = half * 1.6 + 1 / per
  const ex = x1 - x0
  const ey = y1 - y0
  const l2 = ex * ex + ey * ey
  const i0 = Math.floor((Math.min(x0, x1) - reach) * per)
  const i1 = Math.ceil((Math.max(x0, x1) + reach) * per)
  const j0 = Math.floor((Math.min(y0, y1) - reach) * per)
  const j1 = Math.ceil((Math.max(y0, y1) + reach) * per)
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const px = (i + 0.5) / per
      const py = (j + 0.5) / per
      const s = l2 > 1e-9 ? clamp01(((px - x0) * ex + (py - y0) * ey) / l2) : 0
      const d = Math.hypot(px - x0 - ex * s, py - y0 - ey * s) / half
      if (d >= 1.6) continue
      const dh = d < 1 ? -depth * (1 - d * d) : depth * rim * Math.sin(((d - 1) / 0.6) * Math.PI)
      add(t, i, j, dh, now)
    }
  }
}

/**
 * 把一个印子盖进贴图：位置换成格（贴图首尾相接，哪一份都一样）。靴印是前掌与后跟两个坑，光脚多五个脚趾，爪印前后两个肉垫，
 * 蹄印是分开的两瓣，蝎子一边四个细点、尾巴拖一道浅沟，跳着落地的是并排的一对；蛇是一道 S 形的沟，钻在沙下的巨沙虫顶起一道中间裂开的隆起。
 * 拖着脚时从同一只脚的上一步一路拖出一道浅沟
 */
export function stampPrint(t: TrackTex, p: Print, unit: number, now: number): void {
  const x = p.x / unit
  const y = p.y / unit
  const r = p.size / unit
  const ax = Math.cos(p.angle)
  const ay = Math.sin(p.angle)
  const nx = -ay
  const ny = ax
  const d = p.depth
  if (p.gait === 'slither' || p.gait === 'burrow') {
    if (!Number.isFinite(p.fx)) return
    const fx = p.fx / unit
    const fy = p.fy / unit
    if (p.gait === 'slither') groove(t, fx, fy, x, y, r * 0.17, d, 0.35, now)
    else {
      groove(t, fx, fy, x, y, r * 0.3, -d * 0.9, 0, now)
      groove(t, fx, fy, x, y, r * 0.07, d * 0.5, 0, now)
    }
    return
  }
  const stride = p.stride / unit
  if (p.gait === 'legs') {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const u = (-0.42 + k * 0.28) * r
        const v = side * r * (0.62 - Math.abs(k - 1.5) * 0.08)
        pit(t, x + ax * u + nx * v, y + ay * u + ny * v, ax, ay, r * 0.06, r * 0.045, d * 0.8, 0.4, 0, now)
      }
    }
    groove(t, x - ax * r * 1.05, y - ay * r * 1.05, x - ax * r * 0.45, y - ay * r * 0.45, r * 0.06, d * 0.35, 0.3, now)
    return
  }
  const foot = r * 0.62
  if (p.gait === 'hop') {
    for (const side of [-1, 1]) {
      const cx = x + nx * side * r * 0.22
      const cy = y + ny * side * r * 0.22
      pit(t, cx, cy, ax, ay, foot * 0.45, foot * 0.16, d, 0.5, 0.8, now)
    }
    return
  }
  const stance = p.gait === 'paw' || p.gait === 'hoof' ? 0.2 : 0.28
  const cx = x + nx * p.side * r * stance
  const cy = y + ny * p.side * r * stance
  if (p.drag > 0.02) {
    // 拖着脚：同一只脚上一步落在两步之前，脚尖一路蹭过来
    const back = stride * 2
    groove(t, cx - ax * back, cy - ay * back, cx - ax * foot * 0.3, cy - ay * foot * 0.3, foot * 0.14, d * 0.32 * p.drag, 0.4, now)
  }
  if (p.gait === 'boot') {
    pit(t, cx + ax * foot * 0.18, cy + ay * foot * 0.18, ax, ay, foot * 0.33, foot * 0.22, d, 0.4, 0.9, now)
    pit(t, cx - ax * foot * 0.3, cy - ay * foot * 0.3, ax, ay, foot * 0.2, foot * 0.18, d * 0.85, 0.3, 0, now)
    return
  }
  if (p.gait === 'foot') {
    pit(t, cx, cy, ax, ay, foot * 0.45, foot * 0.19, d, 0.35, 0.6, now)
    for (let k = 0; k < 5; k++) {
      const v = (k - 2) * foot * 0.075 - p.side * foot * 0.03
      const u = foot * (0.56 - Math.abs(k - 2) * 0.05 - (k === 0 || k === 4 ? 0.04 : 0))
      pit(t, cx + ax * u + nx * v, cy + ay * u + ny * v, ax, ay, foot * 0.05, foot * 0.045, d * 0.7, 0.2, 0, now)
    }
    return
  }
  if (p.gait === 'paw') {
    pit(t, cx + ax * foot * 0.18, cy + ay * foot * 0.18, ax, ay, foot * 0.16, foot * 0.15, d, 0.4, 0.5, now)
    pit(t, cx - ax * foot * 0.16, cy - ay * foot * 0.16, ax, ay, foot * 0.15, foot * 0.14, d * 0.9, 0.35, 0, now)
    return
  }
  for (const s of [-1, 1]) {
    const hx = cx + nx * s * foot * 0.1
    const hy = cy + ny * s * foot * 0.1
    pit(t, hx, hy, ax, ay, foot * 0.2, foot * 0.08, d * 1.25, 0.45, 0.8, now)
  }
}
