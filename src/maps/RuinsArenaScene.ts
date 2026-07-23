import Phaser from 'phaser'
import { ArenaScene } from './ArenaScene'
import { MAP } from './registry'
import { UNIT } from '../core/units'
import { Rng } from '../core/rng'
import { FlowField, WallGrid, generateRuins, reachableCells } from './ruins'
import { enemyOf } from '../enemies/enemies'
import type { Point } from '../core/vec'
import type { Enemy } from '../enemies/enemies'
import type { TargetInfo } from '../abilities/types'
import type { ImageObj } from '../battle/BaseArenaScene'

const COLS = MAP.width
const ROWS = MAP.height

// 布局参数 + 视觉
const RUINS = {
  blocks: 15,
  maxLen: 4,
  centerClearU: 3.5,
  /** 刷怪点离队伍中心的最小格距（别贴脸刷） */
  spawnMinCellDist: 5,
  /** 流场重算节流（ms）：队伍格没变就不重算 */
  reflowMs: 120,
} as const

// 残垣（kind='ruins'）：有界竞技场里铺断壁——墙同时挡移动 / 挡子弹 / 挡索敌视线。
// 复用 ArenaScene 整套盒子世界规则，叠加：断壁网格（WallGrid）+ 流场寻路（FlowField）。
export class RuinsArenaScene extends ArenaScene {
  private grid!: WallGrid
  private flow?: FlowField
  private flowCellX = -1
  private flowCellY = -1
  private reflowAcc = 0
  /** 可刷怪的通行格索引（从中心 4 连通可达） */
  private spawnCells: number[] = []
  private wallGroup?: Phaser.Physics.Arcade.StaticGroup

  constructor() {
    super('arenaRuins')
  }

  protected resetWorldFields(): void {
    super.resetWorldFields()
    this.flow = undefined
    this.flowCellX = -1
    this.flowCellY = -1
    this.reflowAcc = 0
    this.spawnCells = []
    this.wallGroup = undefined
  }

  protected createWorld(): void {
    super.createWorld() // 盒子边界 + 相机 + 地面 + 装饰
    // 逐局按种子铺断壁
    const rng = new Rng(this.run.decorSeed ^ 0x5eed)
    const blocked = generateRuins(() => rng.next(), COLS, ROWS, {
      blocks: RUINS.blocks,
      maxLen: RUINS.maxLen,
      centerClearU: RUINS.centerClearU,
    })
    this.grid = new WallGrid(COLS, ROWS, UNIT, blocked)
    // 只在「从中心可达」的通行格刷怪，保证敌人总能寻路到队伍
    const midCx = Math.floor(COLS / 2)
    const midCy = Math.floor(ROWS / 2)
    this.spawnCells = [...reachableCells(this.grid, midCx, midCy)]
    this.drawWalls(blocked)
  }

  protected postCreate(): void {
    super.postCreate()
    // 敌人 × 断壁：物理硬碰撞兜底（流场不会指向墙，此处防击退/游荡把敌人挤进墙）
    if (this.wallGroup) this.physics.add.collider(this.enemies, this.wallGroup)
  }

  /** 画断壁：填充石块（清晰的「实心阻挡」读性）+ 顶沿提亮假高度 + 静态碰撞体 */
  private drawWalls(blocked: readonly boolean[]): void {
    const g = this.add.graphics().setDepth(2)
    const base = Phaser.Display.Color.IntegerToColor(this.palette.map).darken(38).color
    const top = Phaser.Display.Color.IntegerToColor(this.palette.map).darken(18).color
    this.wallGroup = this.physics.add.staticGroup()
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        if (!blocked[cy * COLS + cx]) continue
        const x = cx * UNIT
        const y = cy * UNIT
        g.fillStyle(base, 1)
        g.fillRect(x + 1, y + 1, UNIT - 2, UNIT - 2)
        // 顶部一条提亮，读出「墙有厚度/立在地上」
        g.fillStyle(top, 1)
        g.fillRect(x + 1, y + 1, UNIT - 2, Math.max(3, UNIT * 0.22))
        // 静态碰撞体（zone 不可见，视觉交给上面的填充）
        const z = this.add.zone(x + UNIT / 2, y + UNIT / 2, UNIT, UNIT)
        this.wallGroup.add(z)
      }
    }
  }

  // ── 世界规则覆写 ────────────────────────────────────────────

  /** 先按盒子钳制，再对断壁贴墙滑动 */
  protected constrainTeam(next: Point): Point {
    const box = super.constrainTeam(next)
    return this.grid.resolveMove(this.center.x, this.center.y, box.x, box.y)
  }

  /** 只在可达通行格刷怪，且离队伍中心足够远 */
  protected spawnPoint(): Point {
    return this.pickSpawn(RUINS.spawnMinCellDist)
  }

  protected bossSpawnPoint(): Point {
    return this.pickSpawn(RUINS.spawnMinCellDist + 2)
  }

  private pickSpawn(minCellDist: number): Point {
    if (this.spawnCells.length === 0) return this.spawnCenter()
    const ccx = this.grid.cellX(this.center.x)
    const ccy = this.grid.cellY(this.center.y)
    const min2 = minCellDist * minCellDist
    let fallback = this.cellCenter(this.spawnCells[0]!)
    for (let i = 0; i < 24; i++) {
      const idx = this.spawnCells[Math.floor(this.rng.next() * this.spawnCells.length)]!
      const cx = idx % COLS
      const cy = Math.floor(idx / COLS)
      const p = this.cellCenter(idx)
      fallback = p
      const dx = cx - ccx
      const dy = cy - ccy
      if (dx * dx + dy * dy >= min2) return p
    }
    return fallback
  }

  private cellCenter(idx: number): Point {
    const cx = idx % COLS
    const cy = Math.floor(idx / COLS)
    return { x: (cx + 0.5) * UNIT, y: (cy + 0.5) * UNIT }
  }

  /** 追击方向：流场绕墙寻路；不可达时回退直线（基类实现） */
  chaseDir(from: Point, to: Point): Point {
    const dir = this.flow?.sampleDir(from.x, from.y)
    if (dir && (dir.x !== 0 || dir.y !== 0)) return dir
    return super.chaseDir(from, to)
  }

  /** 游荡撞墙折返：盒子折返基础上，前方是墙就掉头 */
  wanderDir(a: Enemy): Point {
    const d = super.wanderDir(a)
    const ax = a.image.x + d.x * 0.8 * UNIT
    const ay = a.image.y + d.y * 0.8 * UNIT
    if (this.grid.pointBlocked(ax, ay)) {
      a.dirX = -d.x
      a.dirY = -d.y
      return { x: -d.x, y: -d.y }
    }
    return d
  }

  /** 视线遮挡：线段撞墙点（索敌 + 子弹裁墙共用） */
  wallHit(a: Point, b: Point): Point | null {
    return this.grid.segmentHit(a.x, a.y, b.x, b.y)
  }

  /** 敌弹：出界回收（基类）之外，进墙也销毁 */
  cullEnemyProjectile(s: ImageObj): boolean {
    return super.cullEnemyProjectile(s) || this.grid.pointBlocked(s.x, s.y)
  }

  /** 索敌视线遮挡：被断壁挡住的敌人不进玩家索敌候选（探头才打得到） */
  protected buildFrameTargets(): void {
    let awake = 0
    const targets: TargetInfo[] = []
    const c = this.center
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      awake++
      if (this.grid.segmentHit(c.x, c.y, e.x, e.y) !== null) continue // 墙后不可索敌
      targets.push({ x: e.x, y: e.y, radius: enemyOf(e).def.radius, ref: e })
    }
    this.awakeCount = awake
    this.dormantCount = 0
    this.frameTargets = targets
  }

  /** 逐帧低频重算流场（队伍格变了 / 到点就重算） */
  protected updateWorld(delta: number): void {
    super.updateWorld(delta)
    this.reflowAcc += delta
    const cx = this.grid.cellX(this.center.x)
    const cy = this.grid.cellY(this.center.y)
    if (cx !== this.flowCellX || cy !== this.flowCellY || this.reflowAcc >= RUINS.reflowMs) {
      this.flow = new FlowField(this.grid, cx, cy)
      this.flowCellX = cx
      this.flowCellY = cy
      this.reflowAcc = 0
    }
  }
}
