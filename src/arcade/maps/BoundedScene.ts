import Phaser from 'phaser'
import { MEMBER, TEAM } from '../../data/characters'
import { AI, SPAWN, enemyMixAt } from '../../data/enemies'
import type { EnemyMixEntry } from '../../data/enemies'
import { PICKUPS } from '../../data/pickups'
import { UNIT } from '../../core/units'
import { MAP } from '../../data/maps'
import { fleeSteer } from '../../data/enemies'
import { MAPS, rollDecor } from '../../data/maps'
import type { DayNightConfig, WallsConfig } from '../../data/maps'
import { fogAlphaAt, fogRadiusAt, hourAt, isDayAt, visionGridsAt } from '../../war/world/daynight'
import { FlowField, WallGrid, generateRuins, reachableCells } from '../../war/world/ruins'
import { enemyOf } from '../enemy/enemies'
import { abilityPiercesWalls } from '../../data/abilityDefs'
import type { AbilityDef } from '../../data/abilityDefs'
import type { AbilityContext } from '../abilities/types'
import { Rng } from '../../core/rng'
import { randomMapPoint } from '../../war/spawn'
import type { Point } from '../../core/vec'
import { emojiImage } from '../../emoji/textures'
import { viewport } from '../../core/apply'
import { ArcadeBattleScene } from '../ArcadeBattleScene'
import type { ArcadeBody, ImageObj } from '../ArcadeBattleScene'
import type { Enemy } from '../enemy/enemies'

// 夜幕迷雾覆盖层（dayNight 特性）：以队伍为心的圆内清明、圈外昏暗（几何遮罩反相）
const FOG_COLOR = 0x0a0a1a
const FOG_DEPTH = 90
// 暗幕铺满可视区即可（正午视野约 30 格≈1920px，远小于此），一律世界坐标
const FOG_SPAN = 9000

// 有界竞技场（kind='bounded'）：矩形地图（缺省 25×25，按 map.size 可放大）+ 相机跟随。
// 世界规则：四周硬墙——队伍/敌人/Boss 钳制在图内，游荡撞边折返、
// 逃跑贴边沿墙滑行，敌弹与金币不出图。战斗引擎全在 ArcadeBattleScene。
// 可选特性（按 MapDef 数据装配，可挂到任意有界图）：dayNight（昼夜相机/迷雾/两批怪）。
export class BoundedScene extends ArcadeBattleScene {
  // 夜幕迷雾层（仅当地图配置了 dayNight 特性时创建）
  private fogRect?: Phaser.GameObjects.Rectangle
  private fogMaskShape?: Phaser.GameObjects.Graphics
  private lastDay = true

  // 断壁/流场（仅当地图配置了 walls 特性时创建）
  private wallGrid?: WallGrid
  private flow?: FlowField
  private flowCellX = -1
  private flowCellY = -1
  private reflowAcc = 0
  private spawnCells: number[] = []
  private wallGroup?: Phaser.Physics.Arcade.StaticGroup
  private readonly wallTiles = new Map<number, Phaser.GameObjects.GameObject[]>()
  private wallCols = 0
  private wallRows = 0

  // 场景键可覆写：残垣图复用整套有界世界规则（盒子边界/相机/落点），只叠加断壁机制
  constructor(key = 'arena') {
    super(key)
  }

  /** 本图配置（数据） */
  protected get mapDef() {
    return MAPS[this.run.mapId]
  }
  /** 昼夜特性配置：存在即启用昼夜相机/迷雾/两批怪（可挂到任意有界图） */
  private get dayNight(): DayNightConfig | undefined {
    return this.mapDef.dayNight
  }
  /** 断壁特性配置：存在即启用墙 + 流场寻路（可挂到任意有界图） */
  private get wallsCfg(): WallsConfig | undefined {
    return this.mapDef.walls
  }

  // 地图尺寸按图取（map.size 缺省用 MAP.width/height=25×25；昼夜图 30×30）——
  // 每帧访问（钳制/游荡/逃跑），走 getter 现算即可，重启换图自动跟随
  protected get mapW(): number {
    return (MAPS[this.run.mapId].size?.w ?? MAP.width) * UNIT
  }
  protected get mapH(): number {
    return (MAPS[this.run.mapId].size?.h ?? MAP.height) * UNIT
  }
  protected get margin(): number {
    return MAP.cameraMargin * UNIT
  }

  protected createWorld(): void {
    this.physics.world.setBounds(0, 0, this.mapW, this.mapH)
    this.drawFloor()
    this.drawDecor()
    const cam = this.cameras.main
    cam.setZoom(viewport.renderScale)
    cam.setBounds(
      -this.margin,
      -this.margin,
      this.mapW + this.margin * 2,
      this.mapH + this.margin * 2,
    )
    if (this.dayNight) this.createFog()
    if (this.wallsCfg) this.createWalls()
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

  protected resetWorldFields(): void {
    this.fogRect = undefined
    this.fogMaskShape = undefined
    this.lastDay = true
    this.wallGrid = undefined
    this.flow = undefined
    this.flowCellX = -1
    this.flowCellY = -1
    this.reflowAcc = 0
    this.spawnCells = []
    this.wallGroup = undefined
    this.wallTiles.clear()
  }

  protected attachCamera(target: Phaser.GameObjects.Zone): void {
    this.cameras.main.startFollow(target)
  }

  protected spawnCenter(): Point {
    return { x: this.mapW / 2, y: this.mapH / 2 }
  }

  protected spawnPoint(): Point {
    // 断壁特性：只在可达通行格刷怪，且离队伍中心足够远
    const cfg = this.wallsCfg
    if (cfg) return this.pickSpawn(cfg.spawnMinCellDist)
    return randomMapPoint(
      this.rng,
      this.mapW,
      this.mapH,
      SPAWN.edgeInset * UNIT,
      this.center,
      SPAWN.minPlayerDist * UNIT,
    )
  }

  protected bossSpawnPoint(): Point {
    const cfg = this.wallsCfg
    if (cfg) return this.pickSpawn(cfg.spawnMinCellDist + 2)
    return randomMapPoint(
      this.rng,
      this.mapW,
      this.mapH,
      2 * UNIT,
      this.center,
      SPAWN.minPlayerDist * UNIT * 1.6,
    )
  }

  // ── dayNight 特性（仅当 map.dayNight 存在时生效）──────────────────

  private createFog(): void {
    const dn = this.dayNight!
    this.fogRect = this.add
      .rectangle(0, 0, FOG_SPAN, FOG_SPAN, FOG_COLOR, 0)
      .setDepth(FOG_DEPTH)
      .setVisible(false)
    // 反相遮罩：雾是整块矩形，圆形遮罩在其上「挖洞」露出玩家周围。
    // v4 的 GeometryMask 在 WebGL 无实现，改用 Mask filter 的 invert 参数；
    // 遮罩圆每帧在 updateFog 里重画，filter 默认自动跟随更新。
    this.fogMaskShape = this.add.graphics().setVisible(false)
    this.fogRect.enableFilters()
    this.fogRect.filters?.internal.addMask(this.fogMaskShape, true)
    // 相位基线：据开场时刻定，供 updateWorld 检测昼夜翻转
    this.lastDay = isDayAt(hourAt(this.run.combatMs / 1000, dn))
  }

  private clockHour(): number {
    return hourAt((this.run.combatMs + this.elapsedMs) / 1000, this.dayNight!)
  }

  /** 出怪表：dayNight 图按相位取白天/黑夜两批之一；否则走基座默认（全表） */
  protected buildEnemyMix(): EnemyMixEntry[] {
    const dn = this.dayNight
    if (!dn) return super.buildEnemyMix()
    const m = this.mapDef
    const rows = (isDayAt(this.clockHour()) ? m.dayMix : m.nightMix) ?? m.mix
    return enemyMixAt(rows, this.testMode ? 10 : this.run.wave)
  }

  /** dayNight 图白天更密、夜晚更疏；否则常速 */
  protected spawnIntervalScale(): number {
    const dn = this.dayNight
    return dn ? (isDayAt(this.clockHour()) ? dn.daySpawnScale : dn.nightSpawnScale) : 1
  }

  protected updateWorld(delta: number): void {
    const dn = this.dayNight
    if (dn) {
      const hour = this.clockHour()
      // 相机随时刻平滑缩放：视野 V 格 → zoom = 标准 ×(visionMid/V)
      this.cameras.main.setZoom((viewport.renderScale * dn.visionMid) / visionGridsAt(hour, dn))
      this.updateFog(hour)
      // 昼夜翻转：改写出怪表（白天/黑夜两批），波内也能实时换批
      const day = isDayAt(hour)
      if (day !== this.lastDay) {
        this.lastDay = day
        this.enemyMix = this.buildEnemyMix()
      }
    }
    this.reflowWalls(delta)
  }

  private updateFog(hour: number): void {
    const rect = this.fogRect
    const shape = this.fogMaskShape
    const dn = this.dayNight
    if (!rect || !shape || !dn) return
    const alpha = fogAlphaAt(hour, dn)
    if (alpha <= 0.001) {
      rect.setVisible(false)
      return
    }
    const r = fogRadiusAt(hour, dn) * UNIT
    shape.clear()
    shape.fillStyle(0xffffff)
    shape.fillCircle(this.center.x, this.center.y, r)
    rect.setPosition(this.center.x, this.center.y).setFillStyle(FOG_COLOR, alpha).setVisible(true)
  }

  // ── walls 特性（仅当 map.walls 存在时生效）：断壁网格 + 流场寻路 ─────

  private createWalls(): void {
    const cfg = this.wallsCfg!
    this.wallCols = Math.round(this.mapW / UNIT)
    this.wallRows = Math.round(this.mapH / UNIT)
    const rng = new Rng(this.run.decorSeed ^ 0x5eed)
    const blocked = generateRuins(() => rng.next(), this.wallCols, this.wallRows, {
      blocks: cfg.blocks,
      maxLen: cfg.maxLen,
      centerClearU: cfg.centerClearU,
    })
    this.wallGrid = new WallGrid(this.wallCols, this.wallRows, UNIT, blocked)
    // 只在「从中心可达」的通行格刷怪，保证敌人总能寻路到队伍
    const midCx = Math.floor(this.wallCols / 2)
    const midCy = Math.floor(this.wallRows / 2)
    this.spawnCells = [...reachableCells(this.wallGrid, midCx, midCy)]
    this.drawWalls(blocked)
  }

  /** 画断壁：逐格填充石块 + 顶沿提亮假高度 + 静态碰撞体；逐格存引用供碾墙单格销毁 */
  private drawWalls(blocked: readonly boolean[]): void {
    const cols = this.wallCols
    const rows = this.wallRows
    const base = Phaser.Display.Color.IntegerToColor(this.palette.map).darken(38).color
    const top = Phaser.Display.Color.IntegerToColor(this.palette.map).darken(18).color
    const capH = Math.max(3, UNIT * 0.22)
    this.wallGroup = this.physics.add.staticGroup()
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (!blocked[cy * cols + cx]) continue
        const cxp = cx * UNIT + UNIT / 2
        const cyp = cy * UNIT + UNIT / 2
        const body = this.add.rectangle(cxp, cyp, UNIT - 2, UNIT - 2, base).setDepth(2)
        const cap = this.add.rectangle(cxp, cy * UNIT + 1 + capH / 2, UNIT - 2, capH, top).setDepth(2.1)
        const z = this.add.zone(cxp, cyp, UNIT, UNIT)
        this.wallGroup.add(z)
        this.wallTiles.set(cy * cols + cx, [body, cap, z])
      }
    }
  }

  /** 碾碎 (x,y) 处断壁：网格置通行 + 拆视觉/碰撞体 + 扬尘 + 逼流场下帧重算 */
  smashWallAt(x: number, y: number): void {
    const grid = this.wallGrid
    if (!grid) return
    const cx = grid.cellX(x)
    const cy = grid.cellY(y)
    if (!grid.isBlockedCell(cx, cy)) return
    grid.setBlocked(cx, cy, false)
    const idx = cy * this.wallCols + cx
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

  private pickSpawn(minCellDist: number): Point {
    const grid = this.wallGrid!
    if (this.spawnCells.length === 0) return this.spawnCenter()
    const ccx = grid.cellX(this.center.x)
    const ccy = grid.cellY(this.center.y)
    const min2 = minCellDist * minCellDist
    let fallback = this.cellCenter(this.spawnCells[0]!)
    for (let i = 0; i < 24; i++) {
      const idx = this.spawnCells[Math.floor(this.rng.next() * this.spawnCells.length)]!
      const cx = idx % this.wallCols
      const cy = Math.floor(idx / this.wallCols)
      const p = this.cellCenter(idx)
      fallback = p
      const dx = cx - ccx
      const dy = cy - ccy
      if (dx * dx + dy * dy >= min2) return p
    }
    return fallback
  }

  private cellCenter(idx: number): Point {
    const cx = idx % this.wallCols
    const cy = Math.floor(idx / this.wallCols)
    return { x: (cx + 0.5) * UNIT, y: (cy + 0.5) * UNIT }
  }

  /** 追击方向：穿墙敌人（幽灵）直线穿行；其余走流场绕墙寻路，不可达回退直线 */
  chaseDir(a: Enemy, to: Point): Point {
    const grid = this.wallGrid
    if (!grid || a.def.phasesWalls) return super.chaseDir(a, to)
    const dir = this.flow?.sampleDir(a.image.x, a.image.y)
    if (dir && (dir.x !== 0 || dir.y !== 0)) return dir
    return super.chaseDir(a, to)
  }

  /** 视线遮挡：线段撞墙点（索敌 + 子弹裁墙共用） */
  wallHit(a: Point, b: Point): Point | null {
    return this.wallGrid?.segmentHit(a.x, a.y, b.x, b.y) ?? null
  }

  /** 穿墙攻击按武器分流：非穿墙武器索敌受断壁遮挡（探头才打得到） */
  protected wallAwareCtx(def: AbilityDef, base: AbilityContext, slot: number): AbilityContext {
    const grid = this.wallGrid
    if (!grid || abilityPiercesWalls(def)) return base
    return {
      ...base,
      targets: () => {
        const m = this.members[slot]
        const all = base.targets()
        if (!m) return all
        const from = m.image
        return all.filter((t) => grid.segmentHit(from.x, from.y, t.x, t.y) === null)
      },
    }
  }

  /** 逐帧低频重算流场（队伍格变了 / 到点就重算） */
  private reflowWalls(delta: number): void {
    const grid = this.wallGrid
    if (!grid) return
    this.reflowAcc += delta
    const cx = grid.cellX(this.center.x)
    const cy = grid.cellY(this.center.y)
    if (cx !== this.flowCellX || cy !== this.flowCellY || this.reflowAcc >= this.wallsCfg!.reflowMs) {
      this.flow = new FlowField(grid, cx, cy)
      this.flowCellX = cx
      this.flowCellY = cy
      this.reflowAcc = 0
    }
  }

  /** 刷怪上限按实时活跃数（有界图无休眠，全场敌人都算） */
  protected spawnCapCount(): number {
    return this.enemies.countActive(true)
  }

  protected constrainTeam(next: Point): Point {
    // 钳制边距 = 队伍环半径 + 队员判定半径，整环都留在图内（格值需 ×UNIT 换算成 px）
    const clampMin = (TEAM.ringRadius + MEMBER.radius) * UNIT
    const box = {
      x: Phaser.Math.Clamp(next.x, clampMin, this.mapW - clampMin),
      y: Phaser.Math.Clamp(next.y, clampMin, this.mapH - clampMin),
    }
    // 断壁特性：先按盒子钳制，再对断壁贴墙滑动
    return this.wallGrid ? this.wallGrid.resolveMove(this.center.x, this.center.y, box.x, box.y) : box
  }

  protected configureEnemyBody(enemy: ImageObj): void {
    ;(enemy.body as ArcadeBody).setCollideWorldBounds(true)
  }

  protected configureBossBody(enemy: ImageObj): void {
    ;(enemy.body as ArcadeBody).setCollideWorldBounds(true)
  }

  protected constrainEnemyPos(p: Point): Point {
    return {
      x: Phaser.Math.Clamp(p.x, 0, this.mapW),
      y: Phaser.Math.Clamp(p.y, 0, this.mapH),
    }
  }

  constrainCoinPos(p: Point): Point {
    const r = PICKUPS.coin.radius * UNIT // 格值需 ×UNIT 换算成 px，整枚币都留在图内
    return {
      x: Phaser.Math.Clamp(p.x, r, this.mapW - r),
      y: Phaser.Math.Clamp(p.y, r, this.mapH - r),
    }
  }

  constrainShardTarget(p: Point): Point {
    return {
      x: Phaser.Math.Clamp(p.x, 0, this.mapW),
      y: Phaser.Math.Clamp(p.y, 0, this.mapH),
    }
  }

  /** 游荡撞边折返：接近地图边缘时翻转对应方向分量 */
  wanderDir(a: Enemy): Point {
    if (this.elapsedMs >= a.turnAt) {
      const ang = this.rng.next() * Math.PI * 2
      a.dirX = Math.cos(ang)
      a.dirY = Math.sin(ang)
      a.turnAt = this.elapsedMs + AI.wander.turnMinMs + this.rng.next() * AI.wander.turnJitterMs
    }
    const e = a.image
    let dx = a.dirX
    let dy = a.dirY
    const margin = 0.6 * UNIT
    if ((e.x < margin && dx < 0) || (e.x > this.mapW - margin && dx > 0)) dx = -dx
    if ((e.y < margin && dy < 0) || (e.y > this.mapH - margin && dy > 0)) dy = -dy
    a.dirX = dx
    a.dirY = dy
    // 断壁特性：盒子折返基础上，前方是墙就掉头
    const grid = this.wallGrid
    if (grid && grid.pointBlocked(e.x + dx * 0.8 * UNIT, e.y + dy * 0.8 * UNIT)) {
      a.dirX = -dx
      a.dirY = -dy
      return { x: -dx, y: -dy }
    }
    return { x: dx, y: dy }
  }

  /** 逃离方向贴边时沿墙滑行，不顶出地图 */
  fleeDir(a: Enemy, away: Point): Point {
    return fleeSteer(a.image.x, a.image.y, away.x, away.y, this.mapW, this.mapH, 1.5 * UNIT)
  }

  cullEnemyProjectile(s: ImageObj): boolean {
    const off = s.x < -UNIT || s.x > this.mapW + UNIT || s.y < -UNIT || s.y > this.mapH + UNIT
    // 断壁特性：出界回收之外，进墙也销毁
    return off || (this.wallGrid ? this.wallGrid.pointBlocked(s.x, s.y) : false)
  }

  /** 地面 = 纯色面 + 右下阴影；地表纹理交给 emoji 装饰层（不再画网格线） */
  private drawFloor(): void {
    const g = this.add.graphics()
    const shadowOffset = 0.25 * UNIT
    g.fillStyle(this.palette.shadow, 1)
    g.fillRect(shadowOffset, shadowOffset, this.mapW, this.mapH)
    g.fillStyle(this.palette.map, 1)
    g.fillRect(0, 0, this.mapW, this.mapH)
  }

  /** 地图装饰：按 run 内种子随机散布的低透明度 emoji（一局一景，同局各波不变）。
   * 静态贴地（depth 1）：在地面/网格之上、毒液池（2）与所有战斗实体之下 */
  private drawDecor(): void {
    const rng = new Rng(this.run.decorSeed)
    const cols = Math.round(this.mapW / UNIT)
    const rows = Math.round(this.mapH / UNIT)
    for (const d of rollDecor(MAPS[this.run.mapId].decor, () => rng.next(), cols, rows)) {
      emojiImage(this, d.xU * UNIT, d.yU * UNIT, d.emoji, d.sizeU * UNIT, 'player')
        .setAlpha(d.alpha)
        .setRotation(d.rotation)
        .setDepth(1)
    }
  }
}
