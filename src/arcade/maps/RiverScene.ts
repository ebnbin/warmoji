import Phaser from 'phaser'
import { MEMBER, TEAM } from '../../data/characters'
import { UNIT } from '../../util/units'
import type { RiverConfig, InfiniteConfig } from '../../types/maps'
import { MAPS, bossFor } from '../../data/maps'
import type { MapDef } from '../../types/maps'
import { isHorizontal, remapPoint, remapVector } from '../../arcade/maps/remap'
import { clampToRiver, driftProfile, flowVector, pastDownstream, riverRect } from '../../arcade/maps/river'
import type { RiverRect } from '../../arcade/maps/river'
import { Rng } from '../../util/rng'
import type { Point } from '../../util/vec'
import { emojiImage } from '../../emoji/textures'
import { viewport } from '../../util/apply'
import { ArcadeBattleScene } from '../ArcadeBattleScene'
import { enemyOf } from '../enemy/enemies'
import { projectileOf } from '../projectiles'
import type { ArcadeBody, ImageObj } from '../ArcadeBattleScene'

// 单屏世界：世界 = 逻辑视口 × viewScale，相机静止

/** 漂浮物：uPx = 距上游边缘的流向距离，baseCross = 跨向基准偏移 */
interface Drift {
  image: ImageObj
  uPx: number
  baseCross: number
  speedMul: number
  swayPhase: number
  swayAmp: number
  spin: number
}

function shade(color: number, mul: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * mul))
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * mul))
  const b = Math.min(255, Math.round((color & 0xff) * mul))
  return (r << 16) | (g << 8) | b
}

export class RiverScene extends ArcadeBattleScene {
  private viewW = 0
  private viewH = 0
  private horizontal = true
  private river!: RiverRect
  private flow: Point = { x: 0, y: 0 }
  // 视口变化时整体重建
  private waterObjs: Phaser.GameObjects.GameObject[] = []
  private waveTiles: { tile: Phaser.GameObjects.TileSprite; speed: number }[] = []
  private drifts: Drift[] = []

  constructor() {
    super('arenaRiver')
  }

  private get riverCfg(): RiverConfig {
    return MAPS[this.run.mapId].river!
  }

  /** 只用其休眠参数 */
  private get infCfg(): InfiniteConfig {
    return MAPS[this.run.mapId].infinite!
  }

  protected resetWorldFields(): void {
    this.waterObjs = []
    this.waveTiles = []
    this.drifts = []
  }

  protected createWorld(): void {
    this.setupCamera()
    this.buildRiverVisuals()
  }

  protected spawnCenter(): Point {
    return { x: this.viewW / 2, y: this.viewH / 2 }
  }

  protected spawnPoint(): Point {
    const pad = 0.5 * UNIT
    return {
      x: this.river.x + pad + this.rng.next() * (this.river.w - pad * 2),
      y: this.river.y + pad + this.rng.next() * (this.river.h - pad * 2),
    }
  }

  /** 距队伍 ≥ 5 格；采样兜底取最后一次 */
  protected bossSpawnPoint(): Point {
    let pos = this.spawnPoint()
    for (let i = 0; i < 24; i++) {
      pos = this.spawnPoint()
      const dx = pos.x - this.center.x
      const dy = pos.y - this.center.y
      if (dx * dx + dy * dy >= 5 * UNIT * (5 * UNIT)) break
    }
    return pos
  }

  protected buildFrameTargets(): void {
    this.dormancyFrameTargets(this.infCfg.activeHalf * UNIT)
  }

  protected constrainTeam(next: Point): Point {
    return clampToRiver(next, this.river, (TEAM.ringRadius + MEMBER.radius) * UNIT)
  }

  protected teamDrift(delta: number): Point {
    const dt = delta / 1000
    return { x: this.flow.x * dt, y: this.flow.y * dt }
  }

  /** 只钳跨向 */
  protected constrainEnemyPos(p: Point, radius: number): Point {
    const r = this.river
    if (this.horizontal) {
      return { x: p.x, y: Math.min(Math.max(p.y, r.y + radius), r.y + r.h - radius) }
    }
    return { x: Math.min(Math.max(p.x, r.x + radius), r.x + r.w - radius), y: p.y }
  }

  protected postSteerEnemy(e: ImageObj, body: ArcadeBody, def: { radius: number }): void {
    this.applyFlowAndBankClamp(e, body, def.radius)
  }

  protected postSteerBoss(e: ImageObj, body: ArcadeBody): void {
    this.applyFlowAndClampBoss(e, body)
  }

  cullCoin(c: ImageObj): boolean {
    return pastDownstream(c, this.viewW, this.viewH, this.riverCfg.coinCullPad * UNIT)
  }

  coinIdleVelocity(): Point {
    return this.flow
  }

  protected updateWorld(delta: number): void {
    this.updateWater(delta)
  }

  protected debugViewSize(): { w: number; h: number } {
    return { w: this.viewW, h: this.viewH }
  }

  protected debugExtras(): { dormant?: number } {
    return { dormant: this.dormantCount }
  }

  // ── 视口变化 ──

  protected onViewportChanged(): void {
    const fromW = this.viewW
    const fromH = this.viewH
    const fromHorizontal = this.horizontal
    this.setupCamera()

    const map = (p: Point): Point => remapPoint(p, fromW, fromH, this.viewW, this.viewH)
    const rot = (v: Point): Point => remapVector(v, fromHorizontal, this.horizontal)

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
    // pos 对象原位改写，落地点自动跟随
    for (const pm of this.pendingMarks) {
      const p = map(pm.pos)
      pm.pos.x = p.x
      pm.pos.y = p.y
      pm.mark.setPosition(p.x, p.y)
    }

    this.buildRiverVisuals()
  }

  private setupCamera(): void {
    this.viewW = viewport.logicalWidth * this.riverCfg.viewScale
    this.viewH = viewport.logicalHeight * this.riverCfg.viewScale
    const cam = this.cameras.main
    cam.setZoom(viewport.renderScale / this.riverCfg.viewScale)
    cam.centerOn(this.viewW / 2, this.viewH / 2)
    this.horizontal = isHorizontal(this.viewW, this.viewH)
    this.river = riverRect(this.viewW, this.viewH, this.riverCfg.width * UNIT)
    this.flow = flowVector(this.horizontal, this.riverCfg.flow * UNIT)
  }

  // ── 水流与钳制 ──

  /** 只钳跨向 */
  private applyFlowAndBankClamp(e: ImageObj, body: ArcadeBody, radius: number): void {
    body.velocity.x += this.flow.x
    body.velocity.y += this.flow.y
    const r = this.river
    if (this.horizontal) {
      const lo = r.y + radius
      const hi = r.y + r.h - radius
      if (e.y <= lo && body.velocity.y < 0) body.velocity.y = 0
      if (e.y >= hi && body.velocity.y > 0) body.velocity.y = 0
      if (e.y < lo - 1 || e.y > hi + 1) body.reset(e.x, Math.min(Math.max(e.y, lo), hi))
    } else {
      const lo = r.x + radius
      const hi = r.x + r.w - radius
      if (e.x <= lo && body.velocity.x < 0) body.velocity.x = 0
      if (e.x >= hi && body.velocity.x > 0) body.velocity.x = 0
      if (e.x < lo - 1 || e.x > hi + 1) body.reset(Math.min(Math.max(e.x, lo), hi), e.y)
    }
  }

  /** Boss 两轴都钳 */
  private applyFlowAndClampBoss(e: ImageObj, body: ArcadeBody): void {
    body.velocity.x += this.flow.x
    body.velocity.y += this.flow.y
    const pad = bossFor(this.run.mapId).radius
    const r = this.river
    if (e.x <= r.x + pad && body.velocity.x < 0) body.velocity.x = 0
    if (e.x >= r.x + r.w - pad && body.velocity.x > 0) body.velocity.x = 0
    if (e.y <= r.y + pad && body.velocity.y < 0) body.velocity.y = 0
    if (e.y >= r.y + r.h - pad && body.velocity.y > 0) body.velocity.y = 0
  }

  // ── 水面视觉层 ──

  /** create 与视口变化时整体重建 */
  private buildRiverVisuals(): void {
    for (const o of this.waterObjs) o.destroy()
    this.waterObjs = []
    this.waveTiles = []
    for (const d of this.drifts) d.image.destroy()
    this.drifts = []

    const vw = this.viewW
    const vh = this.viewH
    const r = this.river
    const water = this.palette.map
    const bank = 0x54402a
    const bankFar = 0x40301f

    const gBank = this.add.graphics().setDepth(0)
    gBank.fillStyle(bank, 1)
    gBank.fillRect(0, 0, vw, vh)
    gBank.fillStyle(bankFar, 1)
    if (this.horizontal) {
      if (r.y > 24) gBank.fillRect(0, 0, vw, Math.max(0, r.y - 18))
      gBank.fillRect(0, Math.min(vh, r.y + r.h + 18), vw, vh)
    } else {
      if (r.x > 24) gBank.fillRect(0, 0, Math.max(0, r.x - 18), vh)
      gBank.fillRect(Math.min(vw, r.x + r.w + 18), 0, vw, vh)
    }
    this.waterObjs.push(gBank)

    const gWater = this.add.graphics().setDepth(0.2)
    const edge = shade(water, 0.78)
    const mid = shade(water, 1.12)
    if (this.horizontal) {
      gWater.fillGradientStyle(edge, edge, mid, mid, 1)
      gWater.fillRect(r.x, r.y, r.w, r.h / 2)
      gWater.fillGradientStyle(mid, mid, edge, edge, 1)
      gWater.fillRect(r.x, r.y + r.h / 2, r.w, r.h / 2)
    } else {
      gWater.fillGradientStyle(edge, mid, edge, mid, 1)
      gWater.fillRect(r.x, r.y, r.w / 2, r.h)
      gWater.fillGradientStyle(mid, edge, mid, edge, 1)
      gWater.fillRect(r.x + r.w / 2, r.y, r.w / 2, r.h)
    }
    this.waterObjs.push(gWater)

    // 种子固定，同局重建不变
    const gFoam = this.add.graphics().setDepth(0.4)
    gFoam.lineStyle(2, 0xffffff, 0.3)
    const foamRng = new Rng(this.run.decorSeed ^ 0xf0a8)
    const alongLen = this.horizontal ? r.w : r.h
    const edges = this.horizontal ? [r.y, r.y + r.h] : [r.x, r.x + r.w]
    for (const e of edges) {
      if (this.horizontal) gFoam.lineBetween(0, e, vw, e)
      else gFoam.lineBetween(e, 0, e, vh)
      let along = foamRng.next() * 40
      while (along < alongLen) {
        const size = 1.5 + foamRng.next() * 2.5
        const off = (foamRng.next() - 0.5) * 6
        gFoam.fillStyle(0xffffff, 0.14 + foamRng.next() * 0.14)
        if (this.horizontal) gFoam.fillCircle(along, e + off, size)
        else gFoam.fillCircle(e + off, along, size)
        along += 24 + foamRng.next() * 60
      }
    }
    this.waterObjs.push(gFoam)

    this.ensureWaveTexture()
    const texKey = this.horizontal ? 'river-wave-h' : 'river-wave-v'
    for (const [alpha, speed] of [
      [0.1, this.riverCfg.waveSlow * UNIT],
      [0.16, this.riverCfg.waveFast * UNIT],
    ] as const) {
      const tile = this.add
        .tileSprite(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, texKey)
        .setAlpha(alpha)
        .setDepth(0.6)
      tile.tilePositionX = Math.random() * 256
      tile.tilePositionY = Math.random() * 256
      this.waveTiles.push({ tile, speed })
      this.waterObjs.push(tile)
    }

    // 种子固定，只落在岸带内
    const mapDef: MapDef = MAPS[this.run.mapId]
    const def = mapDef.decor
    const decorRng = new Rng(this.run.decorSeed)
    const bankBands: [number, number][] = this.horizontal
      ? [
          [0, r.y],
          [r.y + r.h, vh],
        ]
      : [
          [0, r.x],
          [r.x + r.w, vw],
        ]
    for (const [b0, b1] of bankBands) {
      const bandW = b1 - b0
      if (bandW < 0.3 * UNIT) continue
      for (let along = 0.5 * UNIT; along < alongLen; along += UNIT * (0.9 + decorRng.next() * 0.7)) {
        if (decorRng.next() > 0.7) continue
        const emoji = def.emojis[Math.floor(decorRng.next() * def.emojis.length)]!
        const sizeU = def.sizeU[0] + decorRng.next() * (def.sizeU[1] - def.sizeU[0])
        const size = Math.min(sizeU * UNIT, bandW * 0.9)
        const cross = b0 + size / 2 + decorRng.next() * Math.max(1, bandW - size)
        const img = emojiImage(
          this,
          this.horizontal ? along : cross,
          this.horizontal ? cross : along,
          emoji,
          size,
          'player',
        )
          .setAlpha(def.alpha[0] + decorRng.next() * (def.alpha[1] - def.alpha[0]))
          .setRotation((decorRng.next() * 2 - 1) * 0.6)
          .setDepth(0.8)
        this.waterObjs.push(img)
      }
    }

    const driftPool = mapDef.drift ?? ['1f343']
    for (let i = 0; i < this.riverCfg.driftCount; i++) {
      const emoji = driftPool[Math.floor(Math.random() * driftPool.length)]!
      const img = emojiImage(this, 0, 0, emoji, (0.35 + Math.random() * 0.25) * UNIT, 'player')
        .setAlpha(0.5)
        .setDepth(1.5)
      const d: Drift = {
        image: img,
        uPx: Math.random() * alongLen,
        baseCross: (Math.random() * 2 - 1) * (r.horizontal ? r.h : r.w) * 0.46,
        speedMul: 1,
        swayPhase: Math.random() * Math.PI * 2,
        swayAmp: (0.06 + Math.random() * 0.12) * UNIT,
        spin: (Math.random() * 2 - 1) * 0.5,
      }
      d.speedMul =
        driftProfile(d.baseCross / ((r.horizontal ? r.h : r.w) / 2)) *
        (this.riverCfg.driftSpeedMul[0] + Math.random() * (this.riverCfg.driftSpeedMul[1] - this.riverCfg.driftSpeedMul[0]))
      this.drifts.push(d)
      this.placeDrift(d)
    }
  }

  /** 按朝向各生成一次 */
  private ensureWaveTexture(): void {
    const key = this.horizontal ? 'river-wave-h' : 'river-wave-v'
    if (this.textures.exists(key)) return
    const size = 256
    const canvas = this.textures.createCanvas(key, size, size)
    if (!canvas) return
    const ctx = canvas.getContext()
    ctx.clearRect(0, 0, size, size)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineCap = 'round'
    const rng = new Rng(0x5117e5)
    for (let i = 0; i < 14; i++) {
      const cx = 20 + rng.next() * (size - 40)
      const cy = 20 + rng.next() * (size - 40)
      const len = 20 + rng.next() * 36
      const bow = 3 + rng.next() * 5
      ctx.lineWidth = 1.5 + rng.next() * 1.5
      ctx.beginPath()
      if (this.horizontal) {
        ctx.moveTo(cx - len / 2, cy)
        ctx.quadraticCurveTo(cx, cy - bow, cx + len / 2, cy)
      } else {
        ctx.moveTo(cx, cy - len / 2)
        ctx.quadraticCurveTo(cx + bow, cy, cx, cy + len / 2)
      }
      ctx.stroke()
    }
    canvas.refresh()
  }

  private placeDrift(d: Drift): void {
    const r = this.river
    const cross =
      (this.horizontal ? r.y + r.h / 2 : r.x + r.w / 2) +
      d.baseCross +
      Math.sin(this.elapsedMs / 1250 + d.swayPhase) * d.swayAmp
    if (this.horizontal) d.image.setPosition(this.viewW - d.uPx, cross)
    else d.image.setPosition(cross, d.uPx)
  }

  private updateWater(delta: number): void {
    const dt = delta / 1000
    for (const w of this.waveTiles) {
      if (this.horizontal) w.tile.tilePositionX += w.speed * dt
      else w.tile.tilePositionY -= w.speed * dt
    }
    const alongLen = this.horizontal ? this.viewW : this.viewH
    const margin = UNIT
    for (const d of this.drifts) {
      d.uPx += this.riverCfg.flow * UNIT * d.speedMul * dt
      if (d.uPx > alongLen + margin) {
        d.uPx = -margin
        const halfCross = (this.horizontal ? this.river.h : this.river.w) / 2
        d.baseCross = (Math.random() * 2 - 1) * halfCross * 0.92
        d.speedMul =
          driftProfile(d.baseCross / halfCross) *
          (this.riverCfg.driftSpeedMul[0] + Math.random() * (this.riverCfg.driftSpeedMul[1] - this.riverCfg.driftSpeedMul[0]))
      }
      d.image.rotation += d.spin * dt
      this.placeDrift(d)
    }
  }
}
