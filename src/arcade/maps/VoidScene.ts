import Phaser from 'phaser'
import { UNIT } from '../../util/units'
import type { TorusConfig } from '../../types/maps'
import { MAPS } from '../../data/maps'
import type { MapDef } from '../../types/maps'
import { remapPoint, remapVector } from '../../arcade/maps/remap'
import { fitAspectRect, ghostImages, torusDelta, torusDist2, wrapCoord } from '../../arcade/maps/void'
import { Rng } from '../../util/rng'
import type { Point } from '../../util/vec'
import type { TargetInfo } from '../abilities/types'
import { emojiImage } from '../../emoji/textures'
import { viewport } from '../../util/apply'
import { ArcadeBattleScene } from '../ArcadeBattleScene'
import { enemyOf } from '../enemy/enemies'
import { projectileOf } from '../projectiles'
import { releasePooled } from '../pool'
import type { Member } from '../member'
import type { ArcadeBody, ImageObj } from '../ArcadeBattleScene'

// 环面：坐标按模回绕，没有墙；距离/方向用环面最短差；碰撞不走物理 overlap；子弹按寿命回收
export class VoidScene extends ArcadeBattleScene {
  private arenaW = 0
  private arenaH = 0
  private stripCams: Phaser.Cameras.Scene2D.Camera[] = []
  // 静态视觉层（地板/零件/门框）：条带相机忽略，只画一份
  private staticVisuals: Phaser.GameObjects.GameObject[] = []
  private frameTiles: { tile: Phaser.GameObjects.TileSprite; dx: number; dy: number }[] = []
  private frameGlow?: Phaser.GameObjects.Graphics

  constructor() {
    super('arenaVoid')
  }

  private get torusCfg(): TorusConfig {
    return MAPS[this.run.mapId].torus!
  }

  protected resetWorldFields(): void {
    // this.run 此时已就绪
    this.projectileTtlMs = this.torusCfg.projectileLifeMs
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

  protected spawnPoint(): Point {
    return { x: this.rng.next() * this.arenaW, y: this.rng.next() * this.arenaH }
  }

  /** 距队伍环面距离 ≥ 5 格；采样兜底 */
  protected bossSpawnPoint(): Point {
    let pos = this.spawnPoint()
    for (let i = 0; i < 24; i++) {
      pos = this.spawnPoint()
      if (torusDist2(pos, this.center, this.arenaW, this.arenaH) >= 5 * UNIT * (5 * UNIT)) break
    }
    return pos
  }

  worldDelta(from: Point, to: Point): Point {
    return torusDelta(from, to, this.arenaW, this.arenaH)
  }

  protected buildFrameTargets(): void {
    const targets: TargetInfo[] = []
    let count = 0
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      count++
      const radius = enemyOf(e).def.radius
      targets.push({ x: e.x, y: e.y, radius, ref: e })
      for (const g of ghostImages(e, this.arenaW, this.arenaH)) {
        targets.push({ x: g.x, y: g.y, radius, ref: e })
      }
    }
    this.awakeCount = count
    this.dormantCount = 0
    this.frameTargets = targets
  }

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

  /** 不钳制，穿缝回绕 */
  protected constrainTeam(next: Point): Point {
    return { x: wrapCoord(next.x, this.arenaW), y: wrapCoord(next.y, this.arenaH) }
  }

  /** 目标取离跟随点最近的镜像 */
  protected springTarget(m: Member, tx: number, ty: number): Point {
    const d = torusDelta({ x: m.followX, y: m.followY }, { x: tx, y: ty }, this.arenaW, this.arenaH)
    return { x: m.followX + d.x, y: m.followY + d.y }
  }

  protected constrainFollow(m: Member): void {
    m.followX = wrapCoord(m.followX, this.arenaW)
    m.followY = wrapCoord(m.followY, this.arenaH)
  }

  /** 按环面差 */
  protected memberDepthY(m: Member): number {
    return torusDelta(this.center, { x: m.followX, y: m.followY }, this.arenaW, this.arenaH).y
  }

  /** 接触判定改为手写环面圆-圆 */
  protected setupTouchOverlaps(): void {}

  protected touchStep(): void {
    this.touchChecks()
  }

  /** 回绕 */
  protected constrainEnemyPos(p: Point): Point {
    return { x: wrapCoord(p.x, this.arenaW), y: wrapCoord(p.y, this.arenaH) }
  }

  constrainCoinPos(p: Point): Point {
    return { x: wrapCoord(p.x, this.arenaW), y: wrapCoord(p.y, this.arenaH) }
  }

  /** 按寿命回收 */
  protected cullProjectiles(): void {
    for (const p of this.projectiles.getChildren() as ImageObj[]) {
      if (p.active && this.elapsedMs >= projectileOf(p).dieAt) releasePooled(p)
    }
  }

  protected updateWorld(delta: number): void {
    this.wrapEntities()
    this.updatePortals(delta)
  }

  protected debugViewSize(): { w: number; h: number } {
    return { w: this.arenaW, h: this.arenaH }
  }

  protected onShutdown(): void {
    for (const c of this.stripCams) this.cameras.remove(c)
    this.stripCams = []
  }

  // ── 相机 ──

  /** 四缝 + 四角各一台条带相机取景对侧溢出 */
  private setupCameras(): void {
    const landscape = viewport.logicalWidth >= viewport.logicalHeight
    this.arenaW = (landscape ? this.torusCfg.arenaLong : this.torusCfg.arenaShort) * UNIT
    this.arenaH = (landscape ? this.torusCfg.arenaShort : this.torusCfg.arenaLong) * UNIT
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
    const s = this.torusCfg.strip * UNIT
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
    // 左缘显示越过右缝的溢出 x ∈ [W, W+s)，其余同理
    mk(x0, y0, sPx, h, W + s / 2, H / 2)
    mk(x0 + w - sPx, y0, sPx, h, -s / 2, H / 2)
    mk(x0, y0, w, sPx, W / 2, H + s / 2)
    mk(x0, y0 + h - sPx, w, sPx, W / 2, -s / 2)
    mk(x0, y0, sPx, sPx, W + s / 2, H + s / 2)
    mk(x0 + w - sPx, y0, sPx, sPx, -s / 2, H + s / 2)
    mk(x0, y0 + h - sPx, sPx, sPx, W + s / 2, -s / 2)
    mk(x0 + w - sPx, y0 + h - sPx, sPx, sPx, -s / 2, -s / 2)
    this.applyStripIgnores()
  }

  /** 条带相机全部忽略，否则缝上重影 */
  private applyStripIgnores(): void {
    if (this.staticVisuals.length === 0) return
    for (const c of this.stripCams) c.ignore(this.staticVisuals)
  }

  // ── 回绕 ──

  /** 物理积分后调用；返回是否发生回绕 */
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
    for (const s of this.enemyProjectiles.getChildren() as ImageObj[]) {
      if (s.active) this.wrapBody(s)
    }
    for (const p of this.projectiles.getChildren() as ImageObj[]) {
      if (!p.active) continue
      // 回绕帧须重置扫掠起点，否则线段横贯全图
      if (this.wrapBody(p)) {
        const b = projectileOf(p)
        b.prevX = p.x
        b.prevY = p.y
      }
    }
    for (const c of this.coins.getChildren() as ImageObj[]) {
      if (c.active) this.wrapBody(c)
    }
  }

  // ── 手写接触判定 ──

  private touchChecks(): void {
    if (this.over) return
    const W = this.arenaW
    const H = this.arenaH
    for (const m of this.members) {
      if (!m.alive) continue
      const mp = { x: m.image.x, y: m.image.y }
      for (const e of this.enemies.getChildren() as ImageObj[]) {
        if (!e.active) continue
        const rr = m.hurtRadius + enemyOf(e).def.radius
        if (torusDist2(mp, e, W, H) <= rr * rr) this.onMemberTouched(m, e)
      }
      for (const s of this.enemyProjectiles.getChildren() as ImageObj[]) {
        if (!s.active) continue
        const rr = m.hurtRadius + projectileOf(s).radius
        if (torusDist2(mp, s, W, H) <= rr * rr) this.onMemberShot(m, s)
      }
    }
  }

  // ── 工厂视觉 ──

  /** 重建后须刷新条带相机忽略表 */
  private buildVoidVisuals(): void {
    for (const o of this.staticVisuals) o.destroy()
    this.staticVisuals = []
    this.frameTiles = []
    this.frameGlow = undefined

    const W = this.arenaW
    const H = this.arenaH
    const mapDef: MapDef = MAPS[this.run.mapId]

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

    // 种子固定，同局重建不变
    const def = mapDef.decor
    const rng = new Rng(this.run.decorSeed)
    const cells = (W / UNIT) * (H / UNIT)
    const density = def.density[0] + rng.next() * (def.density[1] - def.density[0])
    const count = Math.round(cells * density)
    for (let i = 0; i < count; i++) {
      const emoji = def.emojis[Math.floor(rng.next() * def.emojis.length)]!
      const sizeU = def.sizeU[0] + rng.next() * (def.sizeU[1] - def.sizeU[0])
      const img = emojiImage(this, rng.next() * W, rng.next() * H, emoji, sizeU * UNIT, 'player')
        .setAlpha(def.alpha[0] + rng.next() * (def.alpha[1] - def.alpha[0]))
        .setRotation((rng.next() * 2 - 1) * Math.PI)
        .setDepth(0.5)
      this.staticVisuals.push(img)
    }

    this.ensureDashTexture()
    const f = this.torusCfg.frame * UNIT
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
        .setTint(0xffb300)
      this.frameTiles.push({ tile, dx, dy })
      this.staticVisuals.push(tile)
    }
    mkTile(0, 0, W, f, 1, 0, false)
    mkTile(W - f, 0, f, H, 0, 1, true)
    mkTile(0, H - f, W, f, -1, 0, false)
    mkTile(0, 0, f, H, 0, -1, true)

    const glow = this.add.graphics().setDepth(3.6)
    this.frameGlow = glow
    this.staticVisuals.push(glow)

    this.applyStripIgnores()
  }

  /** 一次生成 */
  private ensureDashTexture(): void {
    const size = 64
    const th = Math.round(this.torusCfg.frame * UNIT)
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
      if (vertical) ctx.fillRect(th * 0.3, 10, th * 0.4, 14)
      else ctx.fillRect(10, th * 0.3, 14, th * 0.4)
      canvas.refresh()
    }
  }

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
    g.lineStyle(3, 0xff8f00, pulse)
    g.strokeRect(1.5, 1.5, W - 3, H - 3)
    g.lineStyle(1.5, 0xffe082, Math.min(1, pulse + 0.25))
    g.strokeRect(4, 4, W - 8, H - 8)
  }

  // ── 视口变化 ──

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
    for (const s of this.enemyProjectiles.getChildren() as ImageObj[]) {
      if (s.active) remapBody(s)
    }
    for (const p of this.projectiles.getChildren() as ImageObj[]) {
      if (!p.active) continue
      remapBody(p)
      const b = projectileOf(p)
      b.prevX = p.x
      b.prevY = p.y
    }
    for (const coin of this.coins.getChildren() as ImageObj[]) {
      if (coin.active) remapBody(coin)
    }
    for (const g of this.groundEffects) {
      const p = map(g)
      g.x = p.x
      g.y = p.y
      g.gfx.setPosition(p.x, p.y)
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
