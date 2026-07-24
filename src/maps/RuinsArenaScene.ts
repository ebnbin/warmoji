import Phaser from 'phaser'
import { ArenaScene } from './ArenaScene'
import { MAP, MAPS } from './registry'
import type { WallsConfig } from './registry'
import { UNIT } from '../core/units'
import { Rng } from '../core/rng'
import { FlowField, WallGrid, generateRuins, reachableCells } from './ruins'
import { enemyOf } from '../enemies/enemies'
import { abilityPiercesWalls } from '../abilities/defs'
import type { Point } from '../core/vec'
import type { Enemy } from '../enemies/enemies'
import type { AbilityDef } from '../abilities/defs'
import type { AbilityContext } from '../abilities/types'
import type { ImageObj } from '../battle/BaseArenaScene'

const COLS = MAP.width
const ROWS = MAP.height

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
  /** 逐格断壁的显示/碰撞对象（cellIndex → [填充, 顶沿, 碰撞 zone]），供单格碾碎 */
  private readonly wallTiles = new Map<number, Phaser.GameObjects.GameObject[]>()

  constructor() {
    super('arenaRuins')
  }

  /** 断壁特性配置（来自 MapDef 数据；残垣图必配 walls） */
  private get walls(): WallsConfig {
    return MAPS[this.run.mapId].walls!
  }

  protected resetWorldFields(): void {
    super.resetWorldFields()
    this.flow = undefined
    this.flowCellX = -1
    this.flowCellY = -1
    this.reflowAcc = 0
    this.spawnCells = []
    this.wallGroup = undefined
    this.wallTiles.clear()
  }

  protected createWorld(): void {
    super.createWorld() // 盒子边界 + 相机 + 地面 + 装饰
    // 逐局按种子铺断壁
    const rng = new Rng(this.run.decorSeed ^ 0x5eed)
    const walls = this.walls
    const blocked = generateRuins(() => rng.next(), COLS, ROWS, {
      blocks: walls.blocks,
      maxLen: walls.maxLen,
      centerClearU: walls.centerClearU,
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
    // 敌人 × 断壁：物理硬碰撞兜底（流场不会指向墙，此处防击退/游荡把敌人挤进墙）。
    // 穿墙（幽灵）/破墙（拆迁 Boss）敌人不吃墙碰撞——processCallback 放行它们穿过
    if (this.wallGroup) {
      this.physics.add.collider(this.enemies, this.wallGroup, undefined, (e) => {
        const a = enemyOf(e as ImageObj)
        return !a.def.phasesWalls && !a.def.breaksWalls
      })
    }
  }

  /** 画断壁：逐格填充石块（清晰「实心阻挡」读性）+ 顶沿提亮假高度 + 静态碰撞体。
   * 逐格存引用（wallTiles），供拆迁 Boss 碾墙时单格销毁 */
  private drawWalls(blocked: readonly boolean[]): void {
    const base = Phaser.Display.Color.IntegerToColor(this.palette.map).darken(38).color
    const top = Phaser.Display.Color.IntegerToColor(this.palette.map).darken(18).color
    const capH = Math.max(3, UNIT * 0.22)
    this.wallGroup = this.physics.add.staticGroup()
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        if (!blocked[cy * COLS + cx]) continue
        const cxp = cx * UNIT + UNIT / 2
        const cyp = cy * UNIT + UNIT / 2
        const body = this.add.rectangle(cxp, cyp, UNIT - 2, UNIT - 2, base).setDepth(2)
        const cap = this.add.rectangle(cxp, cy * UNIT + 1 + capH / 2, UNIT - 2, capH, top).setDepth(2.1)
        const z = this.add.zone(cxp, cyp, UNIT, UNIT)
        this.wallGroup.add(z)
        this.wallTiles.set(cy * COLS + cx, [body, cap, z])
      }
    }
  }

  /** 碾碎 (x,y) 处断壁：网格置通行 + 拆视觉/碰撞体 + 扬尘 + 逼流场下帧重算 */
  smashWallAt(x: number, y: number): void {
    const cx = this.grid.cellX(x)
    const cy = this.grid.cellY(y)
    if (!this.grid.isBlockedCell(cx, cy)) return
    this.grid.setBlocked(cx, cy, false)
    const idx = cy * COLS + cx
    const objs = this.wallTiles.get(idx)
    if (objs) {
      for (const o of objs) o.destroy()
      this.wallTiles.delete(idx)
    }
    this.dust((cx + 0.5) * UNIT, (cy + 0.5) * UNIT)
    this.flowCellX = -1 // 拓扑变了：逼下帧重算流场
  }

  private dust(x: number, y: number): void {
    const c = this.add.circle(x, y, UNIT * 0.4, 0xbcae95, 0.6).setDepth(5)
    this.tweens.add({ targets: c, scale: 1.8, alpha: 0, duration: 320, onComplete: () => c.destroy() })
  }

  // ── 世界规则覆写 ────────────────────────────────────────────

  /** 先按盒子钳制，再对断壁贴墙滑动 */
  protected constrainTeam(next: Point): Point {
    const box = super.constrainTeam(next)
    return this.grid.resolveMove(this.center.x, this.center.y, box.x, box.y)
  }

  /** 只在可达通行格刷怪，且离队伍中心足够远 */
  protected spawnPoint(): Point {
    return this.pickSpawn(this.walls.spawnMinCellDist)
  }

  protected bossSpawnPoint(): Point {
    return this.pickSpawn(this.walls.spawnMinCellDist + 2)
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

  /** 追击方向：穿墙敌人（幽灵）直线穿行；其余走流场绕墙寻路，不可达回退直线 */
  chaseDir(a: Enemy, to: Point): Point {
    if (a.def.phasesWalls) return super.chaseDir(a, to)
    const dir = this.flow?.sampleDir(a.image.x, a.image.y)
    if (dir && (dir.x !== 0 || dir.y !== 0)) return dir
    return super.chaseDir(a, to)
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

  /** 穿墙攻击按武器分流：非穿墙武器索敌受断壁遮挡（只能打到与本队员之间无墙的敌人，
   * 探头才打得到）；穿墙武器（机器人激光）沿用全体索敌，命中扫描本就贯穿直线。
   * 帧索敌快照（frameTargets）保持全体不变，遮挡只在各能力 ctx 局部按本队员位置裁剪 */
  protected wallAwareCtx(def: AbilityDef, base: AbilityContext, slot: number): AbilityContext {
    if (abilityPiercesWalls(def)) return base
    return {
      ...base,
      targets: () => {
        const m = this.members[slot]
        const all = base.targets()
        if (!m) return all
        const from = m.image
        return all.filter((t) => this.grid.segmentHit(from.x, from.y, t.x, t.y) === null)
      },
    }
  }

  /** 逐帧低频重算流场（队伍格变了 / 到点就重算） */
  protected updateWorld(delta: number): void {
    super.updateWorld(delta)
    this.reflowAcc += delta
    const cx = this.grid.cellX(this.center.x)
    const cy = this.grid.cellY(this.center.y)
    if (cx !== this.flowCellX || cy !== this.flowCellY || this.reflowAcc >= this.walls.reflowMs) {
      this.flow = new FlowField(this.grid, cx, cy)
      this.flowCellX = cx
      this.flowCellY = cy
      this.reflowAcc = 0
    }
  }
}
