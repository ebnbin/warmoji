import { norm } from '../../util/vec'
import type { Point } from '../../util/vec'

/** cellPx = 每格世界像素边长 */
export class WallGrid {
  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly cellPx: number,
    /** 行优先 blocked[y * cols + x]，可变 */
    readonly blocked: boolean[],
  ) {}

  /** 越界忽略；返回是否发生变化 */
  setBlocked(cx: number, cy: number, value: boolean): boolean {
    if (cx < 0 || cx >= this.cols || cy < 0 || cy >= this.rows) return false
    const i = cy * this.cols + cx
    if (this.blocked[i] === value) return false
    this.blocked[i] = value
    return true
  }

  cellX(worldX: number): number {
    return Math.floor(worldX / this.cellPx)
  }
  cellY(worldY: number): number {
    return Math.floor(worldY / this.cellPx)
  }
  /** 越界视为通行 */
  isBlockedCell(cx: number, cy: number): boolean {
    if (cx < 0 || cx >= this.cols || cy < 0 || cy >= this.rows) return false
    return this.blocked[cy * this.cols + cx]!
  }
  pointBlocked(x: number, y: number): boolean {
    return this.isBlockedCell(this.cellX(x), this.cellY(y))
  }

  /** 不撞返回 null；Amanatides–Woo 网格步进 */
  segmentHit(ax: number, ay: number, bx: number, by: number): Point | null {
    const cs = this.cellPx
    const x = ax / cs
    const y = ay / cs
    const ex = bx / cs
    const ey = by / cs
    let ix = Math.floor(x)
    let iy = Math.floor(y)
    const eix = Math.floor(ex)
    const eiy = Math.floor(ey)
    if (this.isBlockedCell(ix, iy)) return { x: ax, y: ay }
    const dx = ex - x
    const dy = ey - y
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0
    const tDeltaX = dx !== 0 ? 1 / Math.abs(dx) : Infinity
    const tDeltaY = dy !== 0 ? 1 / Math.abs(dy) : Infinity
    let tMaxX = stepX > 0 ? (ix + 1 - x) * tDeltaX : stepX < 0 ? (x - ix) * tDeltaX : Infinity
    let tMaxY = stepY > 0 ? (iy + 1 - y) * tDeltaY : stepY < 0 ? (y - iy) * tDeltaY : Infinity
    for (let guard = 0; guard < 4096; guard++) {
      if (ix === eix && iy === eiy) return null
      let t: number
      if (tMaxX < tMaxY) {
        t = tMaxX
        ix += stepX
        tMaxX += tDeltaX
      } else {
        t = tMaxY
        iy += stepY
        tMaxY += tDeltaY
      }
      if (t > 1) return null
      if (this.isBlockedCell(ix, iy)) return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t }
    }
    return null
  }

  /** 目标格被挡就分轴放行 */
  resolveMove(fromX: number, fromY: number, toX: number, toY: number): Point {
    let nx = toX
    let ny = toY
    if (this.pointBlocked(toX, toY)) {
      if (this.pointBlocked(toX, fromY)) nx = fromX
      if (this.pointBlocked(nx, toY)) ny = fromY
    }
    return { x: nx, y: ny }
  }
}

/** 4 连通 */
export function reachableCells(grid: WallGrid, startCx: number, startCy: number): Set<number> {
  const out = new Set<number>()
  if (grid.isBlockedCell(startCx, startCy)) return out
  const stack = [startCy * grid.cols + startCx]
  out.add(stack[0]!)
  while (stack.length > 0) {
    const idx = stack.pop()!
    const cx = idx % grid.cols
    const cy = Math.floor(idx / grid.cols)
    for (const [nx, ny] of [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ] as const) {
      if (nx < 0 || nx >= grid.cols || ny < 0 || ny >= grid.rows) continue
      if (grid.isBlockedCell(nx, ny)) continue
      const ni = ny * grid.cols + nx
      if (out.has(ni)) continue
      out.add(ni)
      stack.push(ni)
    }
  }
  return out
}

/** 从目标格 BFS 出距离场 */
export class FlowField {
  private readonly dist: Int32Array

  constructor(
    private readonly grid: WallGrid,
    targetCx: number,
    targetCy: number,
  ) {
    const { cols, rows } = grid
    this.dist = new Int32Array(cols * rows).fill(-1)
    if (grid.isBlockedCell(targetCx, targetCy)) return
    let frontier = [targetCy * cols + targetCx]
    this.dist[frontier[0]!] = 0
    let d = 0
    while (frontier.length > 0) {
      const next: number[] = []
      d++
      for (const idx of frontier) {
        const cx = idx % cols
        const cy = Math.floor(idx / cols)
        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ] as const) {
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
          if (grid.isBlockedCell(nx, ny)) continue
          const ni = ny * cols + nx
          if (this.dist[ni] !== -1) continue
          this.dist[ni] = d
          next.push(ni)
        }
      }
      frontier = next
    }
  }

  private distAt(cx: number, cy: number): number {
    if (cx < 0 || cx >= this.grid.cols || cy < 0 || cy >= this.grid.rows) return Infinity
    const v = this.dist[cy * this.grid.cols + cx]!
    return v < 0 ? Infinity : v
  }

  /** 8 邻，斜向禁穿墙角；不可达或已在目标返回 {0,0} */
  sampleDir(x: number, y: number): Point {
    const cx = this.grid.cellX(x)
    const cy = this.grid.cellY(y)
    const here = this.distAt(cx, cy)
    if (here === Infinity) return { x: 0, y: 0 }
    let best = here
    let bx = 0
    let by = 0
    for (const [dx, dy] of NEIGH8) {
      if (dx !== 0 && dy !== 0) {
        if (this.grid.isBlockedCell(cx + dx, cy) || this.grid.isBlockedCell(cx, cy + dy)) continue
      }
      const nd = this.distAt(cx + dx, cy + dy)
      if (nd < best) {
        best = nd
        bx = dx
        by = dy
      }
    }
    if (bx === 0 && by === 0) return { x: 0, y: 0 }
    return norm(bx, by)
  }
}

const NEIGH8: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

export function generateRuins(
  rand: () => number,
  cols: number,
  rows: number,
  opts: { blocks: number; maxLen: number; centerClearU: number },
): boolean[] {
  const blocked = new Array<boolean>(cols * rows).fill(false)
  const set = (cx: number, cy: number): void => {
    if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) blocked[cy * cols + cx] = true
  }
  const midX = cols / 2
  const midY = rows / 2
  for (let b = 0; b < opts.blocks; b++) {
    const long = 1 + Math.floor(rand() * opts.maxLen)
    const short = 1 + Math.floor(rand() * 2)
    const horizontal = rand() < 0.5
    const w = horizontal ? long : short
    const h = horizontal ? short : long
    const x0 = Math.floor(rand() * (cols - w))
    const y0 = Math.floor(rand() * (rows - h))
    for (let yy = y0; yy < y0 + h; yy++) {
      for (let xx = x0; xx < x0 + w; xx++) set(xx, yy)
    }
  }
  // 中心留空，保证出生连通
  const r2 = opts.centerClearU * opts.centerClearU
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const dx = cx + 0.5 - midX
      const dy = cy + 0.5 - midY
      if (dx * dx + dy * dy <= r2) blocked[cy * cols + cx] = false
    }
  }
  return blocked
}
