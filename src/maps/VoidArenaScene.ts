import Phaser from 'phaser'
import { UNIT } from '../lib/units'
import { VOID } from './void'
import { MAPS } from './registry'
import type { MapSpec } from './registry'
import { remapPoint, remapVector } from '../screen/remap'
import { fitAspectRect, ghostImages, torusDelta, torusDist2, wrapCoord } from './void'
import { Rng } from '../lib/rng'
import type { Point } from '../lib/vec'
import type { TargetInfo } from '../weapons/types'
import { emojiImage } from '../emoji/textures'
import { viewport } from '../screen/apply'
import { BaseArenaScene } from '../battle/BaseArenaScene'
import { enemyOf } from '../battle/enemies'
import { bulletOf } from '../battle/bullets'
import type { Member } from '../battle/members'
import type { ArcadeBody, ImageObj } from '../battle/BaseArenaScene'

// 虚空竞技场（kind='void'）：环面世界。世界规则：
// · 环面：固定 16:9 竞技场（横屏 24×13.5 格，竖屏互换），四边两两粘合成
//   传送门——没有任何墙，所有实体（玩家/敌人/Boss/子弹/金币）坐标按模回绕
// · 几何环面化：索敌喂「真身 + 三个镜像坐标」（武器零改动即隔门瞄准）；
//   AI 追击/磁吸/接触判定全用环面最短差；面积效果的判定半径远小于半场，
//   镜像永不重复命中同一真身
// · 碰撞不走物理 overlap：队员×敌人/敌弹改为手写环面圆-圆判定，缝上精确；
//   物理引擎只负责速度积分
// · 子弹按寿命回收（环面上永远飞不出屏幕）；扫掠线段在回绕帧重置起点
// · 渲染分身：主相机视口裁剪出屏幕内最大居中 16:9（余量留空白），四缝
//   + 四角各挂一个条带相机取景对侧溢出——实体跨缝时两侧同时可见，
//   全体实体/血条/粒子零逐实体管理；地板/门框/星空在条带相机中忽略
// · 传送门：四边流光门框（顺时针流动的虚线光带 + 脉动）
export class VoidArenaScene extends BaseArenaScene {
  private arenaW = 0
  private arenaH = 0
  private stripCams: Phaser.Cameras.Scene2D.Camera[] = []
  // 静态视觉层（地板/星空/门框）：条带相机忽略，只画一份
  private staticVisuals: Phaser.GameObjects.GameObject[] = []
  private frameTiles: { tile: Phaser.GameObjects.TileSprite; dx: number; dy: number }[] = []
  private frameGlow?: Phaser.GameObjects.Graphics

  constructor() {
    super('arenaVoid')
    // 环面上子弹永不出屏：按寿命回收（基座 spawnProjectile 消费）
    this.projectileTtlMs = VOID.projectileLifeMs
  }

  protected resetWorldFields(): void {
    this.staticVisuals = []
    this.frameTiles = []
    this.frameGlow = undefined
    this.stripCams = []
  }

  protected createWorld(): void {
    this.setupCameras()
    this.buildVoidVisuals()
  }

  protected spawnCenter(): Point {
    return { x: this.arenaW / 2, y: this.arenaH / 2 }
  }

  /** 全场随机（环面上无所谓贴边） */
  protected spawnPoint(): Point {
    return { x: this.rng.next() * this.arenaW, y: this.rng.next() * this.arenaH }
  }

  /** Boss 落点：距队伍环面距离 ≥5 格的随机点（采样兜底） */
  protected bossSpawnPoint(): Point {
    let pos = this.spawnPoint()
    for (let i = 0; i < 24; i++) {
      pos = this.spawnPoint()
      if (torusDist2(pos, this.center, this.arenaW, this.arenaH) >= 5 * UNIT * (5 * UNIT)) break
    }
    return pos
  }

  protected finalWaveWarningSub(): string {
    return '环形战场无处可退，正面迎战！'
  }

  /** 索敌/追击/磁吸的几何基元：环面最短差 */
  worldDelta(from: Point, to: Point): Point {
    return torusDelta(from, to, this.arenaW, this.arenaH)
  }

  /** 索敌目标：真身 + 三镜像（武器隔门瞄准的关键） */
  protected buildFrameTargets(): void {
    const targets: TargetInfo[] = []
    let count = 0
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      count++
      const radius = enemyOf(e).spec.radius
      targets.push({ x: e.x, y: e.y, radius, ref: e })
      for (const g of ghostImages(e, this.arenaW, this.arenaH)) {
        targets.push({ x: g.x, y: g.y, radius, ref: e })
      }
    }
    this.awakeCount = count
    this.dormantCount = 0
    this.frameTargets = targets
  }

  /** 敌方武器的索敌目标：真身 + 三镜像（持械敌人隔门瞄准队员） */
  protected buildMemberTargets(): TargetInfo[] {
    const targets: TargetInfo[] = []
    for (const m of this.members) {
      if (!m.alive) continue
      targets.push({ x: m.image.x, y: m.image.y, radius: m.hurtRadius, ref: m.image })
      for (const g of ghostImages(m.image, this.arenaW, this.arenaH)) {
        targets.push({ x: g.x, y: g.y, radius: m.hurtRadius, ref: m.image })
      }
    }
    return targets
  }

  /** 环面：不钳制，穿缝回绕 */
  protected constrainTeam(next: Point): Point {
    return { x: wrapCoord(next.x, this.arenaW), y: wrapCoord(next.y, this.arenaH) }
  }

  /** 环面弹簧：目标取离当前跟随点最近的镜像——中心穿缝时队员各自
   * 走最短路穿门，阵型全程连贯（配条带相机即两侧同时可见） */
  protected springTarget(m: Member, tx: number, ty: number): Point {
    const d = torusDelta({ x: m.followX, y: m.followY }, { x: tx, y: ty }, this.arenaW, this.arenaH)
    return { x: m.followX + d.x, y: m.followY + d.y }
  }

  /** 跟随点回绕，弹簧状态保持在竞技场内 */
  protected constrainFollow(m: Member): void {
    m.followX = wrapCoord(m.followX, this.arenaW)
    m.followY = wrapCoord(m.followY, this.arenaH)
  }

  /** 遮挡纵深按环面差（贴缝时不跳变） */
  protected memberDepthY(m: Member): number {
    return torusDelta(this.center, { x: m.followX, y: m.followY }, this.arenaW, this.arenaH).y
  }

  /** 无物理 overlap：接触判定改为手写环面圆-圆（touchStep），缝上精确 */
  protected setupTouchOverlaps(): void {}

  protected touchStep(): void {
    this.touchChecks()
  }

  /** 落点回绕（分裂怪贴缝溅出等情况直接绕到对侧） */
  protected constrainEnemyPos(p: Point): Point {
    return { x: wrapCoord(p.x, this.arenaW), y: wrapCoord(p.y, this.arenaH) }
  }

  constrainCoinPos(p: Point): Point {
    return { x: wrapCoord(p.x, this.arenaW), y: wrapCoord(p.y, this.arenaH) }
  }

  /** 子弹按寿命回收（环面上永远飞不出屏幕，位置回收不适用） */
  protected cullProjectiles(): void {
    for (const p of this.projectiles.getChildren() as ImageObj[]) {
      if (p.active && this.elapsedMs >= bulletOf(p).dieAt) p.destroy()
    }
  }

  protected updateWorld(delta: number): void {
    this.wrapEntities()
    this.updatePortals(delta)
  }

  /** 虚空图上报竞技场世界尺寸，供探针换算位置 */
  protected debugViewSize(): { w: number; h: number } {
    return { w: this.arenaW, h: this.arenaH }
  }

  protected onShutdown(): void {
    for (const c of this.stripCams) this.cameras.remove(c)
    this.stripCams = []
  }

  // ── 相机：视口裁剪 + 条带分身 ───────────────────────────────

  /** 主相机视口 = 屏幕内最大居中 16:9（多余留空白）；四缝 + 四角挂
   * 条带相机取景对侧溢出——跨缝实体两侧同时可见（渲染层的幽灵分身） */
  private setupCameras(): void {
    const landscape = viewport.logicalWidth >= viewport.logicalHeight
    this.arenaW = (landscape ? VOID.arenaLong : VOID.arenaShort) * UNIT
    this.arenaH = (landscape ? VOID.arenaShort : VOID.arenaLong) * UNIT
    const cw = Math.round(viewport.cssWidth * viewport.dpr)
    const ch = Math.round(viewport.cssHeight * viewport.dpr)
    const rect = fitAspectRect(cw, ch, this.arenaW, this.arenaH)
    const zoom = rect.w / this.arenaW
    const cam = this.cameras.main
    cam.setViewport(Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h))
    cam.setZoom(zoom)
    cam.centerOn(this.arenaW / 2, this.arenaH / 2)

    for (const c of this.stripCams) this.cameras.remove(c)
    this.stripCams = []
    const s = VOID.strip * UNIT
    const sPx = Math.max(2, Math.round(s * zoom))
    const x0 = Math.round(rect.x)
    const y0 = Math.round(rect.y)
    const w = Math.round(rect.w)
    const h = Math.round(rect.h)
    const mk = (vx: number, vy: number, vw: number, vh: number, cx: number, cy: number): void => {
      const c = this.cameras.add(vx, vy, vw, vh)
      c.setZoom(zoom)
      c.centerOn(cx, cy)
      this.stripCams.push(c)
    }
    const W = this.arenaW
    const H = this.arenaH
    // 屏幕左缘显示「越过右缝的溢出」（世界 x∈[W, W+s)），其余同理
    mk(x0, y0, sPx, h, W + s / 2, H / 2)
    mk(x0 + w - sPx, y0, sPx, h, -s / 2, H / 2)
    mk(x0, y0, w, sPx, W / 2, H + s / 2)
    mk(x0, y0 + h - sPx, w, sPx, W / 2, -s / 2)
    // 四角（对角溢出）
    mk(x0, y0, sPx, sPx, W + s / 2, H + s / 2)
    mk(x0 + w - sPx, y0, sPx, sPx, -s / 2, H + s / 2)
    mk(x0, y0 + h - sPx, sPx, sPx, W + s / 2, -s / 2)
    mk(x0 + w - sPx, y0 + h - sPx, sPx, sPx, -s / 2, -s / 2)
    this.applyStripIgnores()
  }

  /** 静态视觉层只画一份：条带相机全部忽略（否则门框/地板会在缝上重影） */
  private applyStripIgnores(): void {
    if (this.staticVisuals.length === 0) return
    for (const c of this.stripCams) c.ignore(this.staticVisuals)
  }

  // ── 世界步进：回绕 ──────────────────────────────────────────

  /** 动力学实体逐帧回绕（物理积分已完成后调用）；返回是否发生回绕 */
  private wrapBody(obj: ImageObj): boolean {
    const nx = wrapCoord(obj.x, this.arenaW)
    const ny = wrapCoord(obj.y, this.arenaH)
    if (nx === obj.x && ny === obj.y) return false
    const body = obj.body as ArcadeBody
    const vx = body.velocity.x
    const vy = body.velocity.y
    body.reset(nx, ny)
    body.setVelocity(vx, vy)
    return true
  }

  private wrapEntities(): void {
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (e.active) this.wrapBody(e)
    }
    for (const s of this.enemyShots.getChildren() as ImageObj[]) {
      if (s.active) this.wrapBody(s)
    }
    for (const p of this.projectiles.getChildren() as ImageObj[]) {
      if (!p.active) continue
      // 回绕帧重置扫掠线段起点：否则线段会横贯全图产生假命中
      if (this.wrapBody(p)) {
        const b = bulletOf(p)
        b.prevX = p.x
        b.prevY = p.y
      }
    }
    for (const c of this.coins.getChildren() as ImageObj[]) {
      if (c.active) this.wrapBody(c)
    }
  }

  // ── 手写接触判定（环面圆-圆，替代物理 overlap；缝上精确）────

  private touchChecks(): void {
    if (this.over) return
    const W = this.arenaW
    const H = this.arenaH
    for (const m of this.members) {
      if (!m.alive) continue
      const mp = { x: m.image.x, y: m.image.y }
      for (const e of this.enemies.getChildren() as ImageObj[]) {
        if (!e.active) continue
        const rr = m.hurtRadius + enemyOf(e).spec.radius
        if (torusDist2(mp, e, W, H) <= rr * rr) this.onMemberTouched(m, e)
      }
      for (const s of this.enemyShots.getChildren() as ImageObj[]) {
        if (!s.active) continue
        const rr = m.hurtRadius + bulletOf(s).radius
        if (torusDist2(mp, s, W, H) <= rr * rr) this.onMemberShot(m, s)
      }
    }
  }

  // ── 虚空视觉：深空地板 + 星空 + 传送门流光门框 ────────────────

  /** 静态视觉整体重建（create 与视口变化时）；随后刷新条带相机忽略表 */
  private buildVoidVisuals(): void {
    for (const o of this.staticVisuals) o.destroy()
    this.staticVisuals = []
    this.frameTiles = []
    this.frameGlow = undefined

    const W = this.arenaW
    const H = this.arenaH
    const mapSpec: MapSpec = MAPS[this.run.mapId]

    // 深空地板（中心朝亮的多层软渐变，避免硬边椭圆的「盘子感」）
    const gFloor = this.add.graphics().setDepth(0)
    gFloor.fillStyle(this.palette.map, 1)
    gFloor.fillRect(0, 0, W, H)
    const inner = Phaser.Display.Color.IntegerToColor(this.palette.map).brighten(7).color
    for (const [k, a] of [
      [0.95, 0.1],
      [0.75, 0.1],
      [0.55, 0.12],
    ] as const) {
      gFloor.fillStyle(inner, a)
      gFloor.fillEllipse(W / 2, H / 2, W * k, H * k)
    }
    this.staticVisuals.push(gFloor)

    // 星空点缀（种子固定：同局重建不变）
    const spec = mapSpec.decor
    const rng = new Rng(this.run.decorSeed)
    const cells = (W / UNIT) * (H / UNIT)
    const density = spec.density[0] + rng.next() * (spec.density[1] - spec.density[0])
    const count = Math.round(cells * density)
    for (let i = 0; i < count; i++) {
      const emoji = spec.emojis[Math.floor(rng.next() * spec.emojis.length)]!
      const sizeU = spec.sizeU[0] + rng.next() * (spec.sizeU[1] - spec.sizeU[0])
      const img = emojiImage(this, rng.next() * W, rng.next() * H, emoji, sizeU * UNIT, 'player')
        .setAlpha(spec.alpha[0] + rng.next() * (spec.alpha[1] - spec.alpha[0]))
        .setRotation((rng.next() * 2 - 1) * Math.PI)
        .setDepth(0.5)
      this.staticVisuals.push(img)
    }

    // 传送门门框：流动虚线光带（TileSprite 滚动）+ 脉动描边
    this.ensureDashTexture()
    const f = VOID.frame * UNIT
    const mkTile = (
      x: number,
      y: number,
      w: number,
      h: number,
      dx: number,
      dy: number,
      vertical: boolean,
    ): void => {
      const tile = this.add
        .tileSprite(x, y, w, h, vertical ? 'void-dash-v' : 'void-dash-h')
        .setOrigin(0)
        .setDepth(3.5)
        .setAlpha(0.42)
        .setTint(0x7de8ff)
      this.frameTiles.push({ tile, dx, dy })
      this.staticVisuals.push(tile)
    }
    // 顺时针流动：上→右→下→左
    mkTile(0, 0, W, f, 1, 0, false)
    mkTile(W - f, 0, f, H, 0, 1, true)
    mkTile(0, H - f, W, f, -1, 0, false)
    mkTile(0, 0, f, H, 0, -1, true)

    const glow = this.add.graphics().setDepth(3.6)
    this.frameGlow = glow
    this.staticVisuals.push(glow)

    this.applyStripIgnores()
  }

  /** 门框虚线贴图（横/竖两个变体，一次生成） */
  private ensureDashTexture(): void {
    const size = 64
    const th = Math.round(VOID.frame * UNIT)
    for (const [key, vertical] of [
      ['void-dash-h', false],
      ['void-dash-v', true],
    ] as const) {
      if (this.textures.exists(key)) continue
      const canvas = this.textures.createCanvas(key, vertical ? th : size, vertical ? size : th)
      if (!canvas) continue
      const ctx = canvas.getContext()
      ctx.clearRect(0, 0, vertical ? th : size, vertical ? size : th)
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      // 一节亮虚线 + 留空（滚动后呈流动光点带）
      if (vertical) ctx.fillRect(th * 0.3, 10, th * 0.4, 14)
      else ctx.fillRect(10, th * 0.3, 14, th * 0.4)
      canvas.refresh()
    }
  }

  /** 门框逐帧动效：光带顺时针流动 + 边线脉动 */
  private updatePortals(delta: number): void {
    const flow = (56 * delta) / 1000
    for (const t of this.frameTiles) {
      t.tile.tilePositionX += t.dx * flow
      t.tile.tilePositionY += t.dy * flow
    }
    const g = this.frameGlow
    if (!g) return
    const pulse = 0.4 + 0.22 * Math.sin(this.elapsedMs / 420)
    const W = this.arenaW
    const H = this.arenaH
    g.clear()
    g.lineStyle(3, 0xb388ff, pulse)
    g.strokeRect(1.5, 1.5, W - 3, H - 3)
    g.lineStyle(1.5, 0xe1f5fe, Math.min(1, pulse + 0.25))
    g.strokeRect(4, 4, W - 8, H - 8)
  }

  // ── 视口变化：横竖互换 = 纯 90° 旋转重映射 ───────────────────

  protected onViewportChanged(): void {
    const fromW = this.arenaW
    const fromH = this.arenaH
    const fromHorizontal = fromW >= fromH
    this.setupCameras()
    const toHorizontal = this.arenaW >= this.arenaH

    const map = (p: Point): Point => remapPoint(p, fromW, fromH, this.arenaW, this.arenaH)
    const rot = (v: Point): Point => remapVector(v, fromHorizontal, toHorizontal)

    const c = map(this.center)
    this.center.x = c.x
    this.center.y = c.y
    this.centerObj.setPosition(c.x, c.y)
    for (const m of this.members) {
      const p = map({ x: m.followX, y: m.followY })
      const v = rot({ x: m.followVx, y: m.followVy })
      m.followX = p.x
      m.followY = p.y
      m.followVx = v.x
      m.followVy = v.y
      m.image.setPosition(p.x + m.visualOffset.x, p.y + m.visualOffset.y)
      ;(m.image.body as ArcadeBody).updateFromGameObject()
      m.hpBar.setPosition(m.image.x, m.image.y)
      m.deadText.setPosition(m.image.x, m.image.y)
    }

    const remapBody = (obj: ImageObj): void => {
      const body = obj.body as ArcadeBody
      const p = map({ x: obj.x, y: obj.y })
      const v = rot({ x: body.velocity.x, y: body.velocity.y })
      body.reset(p.x, p.y)
      body.setVelocity(v.x, v.y)
    }
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      remapBody(e)
      const a = enemyOf(e)
      const d = rot({ x: a.dirX, y: a.dirY })
      a.dirX = d.x
      a.dirY = d.y
      const kv = rot({ x: a.kvx, y: a.kvy })
      a.kvx = kv.x
      a.kvy = kv.y
    }
    for (const s of this.enemyShots.getChildren() as ImageObj[]) {
      if (s.active) remapBody(s)
    }
    for (const p of this.projectiles.getChildren() as ImageObj[]) {
      if (!p.active) continue
      remapBody(p)
      const b = bulletOf(p)
      b.prevX = p.x
      b.prevY = p.y
    }
    for (const coin of this.coins.getChildren() as ImageObj[]) {
      if (coin.active) remapBody(coin)
    }
    for (const pool of this.poisonPools) {
      const p = map(pool)
      pool.x = p.x
      pool.y = p.y
      pool.gfx.setPosition(p.x, p.y)
    }
    for (const z of this.burnZones) {
      const p = map(z)
      z.x = p.x
      z.y = p.y
      z.gfx.setPosition(p.x, p.y)
    }
    for (const pm of this.pendingMarks) {
      const p = map(pm.pos)
      pm.pos.x = p.x
      pm.pos.y = p.y
      pm.mark.setPosition(p.x, p.y)
    }

    this.buildVoidVisuals()
  }
}
