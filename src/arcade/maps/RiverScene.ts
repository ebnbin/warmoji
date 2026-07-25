import Phaser from 'phaser'
import { MEMBER, TEAM } from '../../characters/registry'
import { UNIT } from '../../core/units'
import type { RiverConfig, InfiniteConfig } from '../../maps/registry'
import { MAPS, bossFor } from '../../maps/registry'
import type { MapDef } from '../../maps/registry'
import { isHorizontal, remapPoint, remapVector } from '../../war/remap'
import { clampToRiver, driftProfile, flowVector, pastDownstream, riverRect } from '../../war/world/river'
import type { RiverRect } from '../../war/world/river'
import { Rng } from '../../core/rng'
import type { Point } from '../../core/vec'
import { emojiImage } from '../../emoji/textures'
import { viewport } from '../../core/apply'
import { ArcadeBattleScene } from '../ArcadeBattleScene'
import { enemyOf } from '../enemy/enemies'
import { projectileOf } from '../projectiles'
import type { ArcadeBody, ImageObj } from '../ArcadeBattleScene'

// 河流竞技场（kind='river'）：单屏世界——相机静止，世界 = 逻辑视口 × 1.2
// （viewScale 经相机 zoom 实现，实体速度/尺寸全不变）。世界规则：
// · 河道沿长轴居中、宽恒 this.riverCfg.width，短边余量为两岸暗带（不可进入）
// · 水流：恒定漂移矢量（横屏右→左，竖屏上→下）逐帧加在所有实体上
//   （子弹除外）——顺流快/逆流慢/挂机漂向下游全部由此自然涌现
// · 钳制：队伍中心与 Boss 被钳在河道内；敌人只钳跨向（不能上岸），
//   上下游可自由出屏——沿用无限图休眠机制（32 格）并会逆流游回；
//   金币漂出下游一段距离即清理（玩家钳在屏内永远追不回）
// · 旋转：横竖屏是同一条河，视口变化时按「流向进度 + 跨向偏移」重映射
//   全部实体（等价于逆时针 90° 旋转），水面视觉层整体重建
// · 流动感三层：双层水纹视差滚动 + 漂浮物顺流循环 + 两岸静态植被反衬

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

/** 颜色明暗缩放（水面横向深浅渐变用） */
function shade(color: number, mul: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * mul))
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * mul))
  const b = Math.min(255, Math.round((color & 0xff) * mul))
  return (r << 16) | (g << 8) | b
}

export class RiverScene extends ArcadeBattleScene {
  // 河道世界：视口尺寸/朝向 + 河道矩形 + 流速矢量
  private viewW = 0
  private viewH = 0
  private horizontal = true
  private river!: RiverRect
  private flow: Point = { x: 0, y: 0 }
  // 水面视觉层（视口变化时整体销毁重建）
  private waterObjs: Phaser.GameObjects.GameObject[] = []
  private waveTiles: { tile: Phaser.GameObjects.TileSprite; speed: number }[] = []
  private drifts: Drift[] = []

  constructor() {
    super('arenaRiver')
  }

  /** 奔流特性配置（来自 MapDef 数据；奔流图必配 river） */
  private get riverCfg(): RiverConfig {
    return MAPS[this.run.mapId].river!
  }

  /** 无限世界特性配置（奔流借用其休眠活跃半边长） */
  private get infCfg(): InfiniteConfig {
    return MAPS[this.run.mapId].infinite!
  }

  protected resetWorldFields(): void {
    this.waterObjs = []
    this.waveTiles = []
    this.drifts = []
  }

  /** 单屏世界：相机静止，视野按 viewScale 放大（世界 = 逻辑视口 × 1.2） */
  protected createWorld(): void {
    this.setupCamera()
    this.buildRiverVisuals()
  }

  protected spawnCenter(): Point {
    return { x: this.viewW / 2, y: this.viewH / 2 }
  }

  /** 河道内均匀随机（贴边留半格；与有界图的全图随机同思路） */
  protected spawnPoint(): Point {
    const pad = 0.5 * UNIT
    return {
      x: this.river.x + pad + this.rng.next() * (this.river.w - pad * 2),
      y: this.river.y + pad + this.rng.next() * (this.river.h - pad * 2),
    }
  }

  /** Boss 落点：河道内取距队伍 ≥5 格的随机点（采样兜底取最后一次） */
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


  /** 休眠：同无限图机制（32 格，屏内永不触发） */
  protected buildFrameTargets(): void {
    this.dormancyFrameTargets(this.infCfg.activeHalf * UNIT)
  }

  /** 自主移动 + 水流漂移，然后钳入河道（挂机会被推到下游边并卡住） */
  protected constrainTeam(next: Point): Point {
    return clampToRiver(next, this.river, (TEAM.ringRadius + MEMBER.radius) * UNIT)
  }

  protected teamDrift(delta: number): Point {
    const dt = delta / 1000
    return { x: this.flow.x * dt, y: this.flow.y * dt }
  }

  /** 落点跨向钳入河道（分裂怪贴岸溅出等边缘情况兜底；沿流向不钳） */
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

  /** 漂出下游边界外一段距离：河水冲走（玩家钳在屏内，永远追不回） */
  cullCoin(c: ImageObj): boolean {
    return pastDownstream(c, this.viewW, this.viewH, this.riverCfg.coinCullPad * UNIT)
  }

  /** 不在磁吸范围：纯随波逐流 */
  coinIdleVelocity(): Point {
    return this.flow
  }

  protected updateWorld(delta: number): void {
    this.updateWater(delta)
  }

  /** 河流图上报世界尺寸（= 逻辑视口 × viewScale），供探针换算位置 */
  protected debugViewSize(): { w: number; h: number } {
    return { w: this.viewW, h: this.viewH }
  }

  protected debugExtras(): { dormant?: number } {
    return { dormant: this.dormantCount }
  }

  // ── 视口变化：同一条河的重映射 ──────────────────────────────

  /** 横竖屏切换/窗口缩放：按「流向进度 + 跨向偏移」重映射全部实体，
   * 速度与朝向矢量随坐标系旋转，水面视觉层整体重建 */
  protected onViewportChanged(): void {
    const fromW = this.viewW
    const fromH = this.viewH
    const fromHorizontal = this.horizontal
    this.setupCamera()

    const map = (p: Point): Point => remapPoint(p, fromW, fromH, this.viewW, this.viewH)
    const rot = (v: Point): Point => remapVector(v, fromHorizontal, this.horizontal)

    // 队伍：中心 + 每个成员的弹簧状态一起搬（视觉偏移/血条随帧刷新）
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

    // 动力学实体：位置 body.reset + 速度/朝向数据旋转
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
    // 刷怪预告：闭包共享的 pos 对象原位改写，落地点自动跟随
    for (const pm of this.pendingMarks) {
      const p = map(pm.pos)
      pm.pos.x = p.x
      pm.pos.y = p.y
      pm.mark.setPosition(p.x, p.y)
    }

    this.buildRiverVisuals()
  }

  /** 静止相机 + 河流图专属视野倍率，并同步派生的世界几何 */
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

  // ── 水流与钳制 ──────────────────────────────────────────────

  /** 普通敌人：加水流后钳住跨向速度（不能上岸），越界一帧内硬拉回岸线；
   * 沿流向不钳——漂出上下游屏外是设计的一部分 */
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

  /** Boss 与玩家同款钳制：加水流后，把会把它推出河道的速度分量清零 */
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

  // ── 水面视觉层：两岸 + 深浅渐变 + 岸线浪花 + 双层水纹 + 漂浮物 ──

  /** 整体重建（create 与视口变化时调用）；战斗实体不在此列 */
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
    // 大地/树干棕：与浅蓝河水强对比
    const bank = 0x54402a
    const bankFar = 0x40301f

    // 两岸暗带（河道以外的短边余量；河道贯穿长轴，只有跨轴两侧有岸）
    const gBank = this.add.graphics().setDepth(0)
    gBank.fillStyle(bank, 1)
    gBank.fillRect(0, 0, vw, vh)
    // 岸的外缘更暗一点，给一点纵深
    gBank.fillStyle(bankFar, 1)
    if (this.horizontal) {
      if (r.y > 24) gBank.fillRect(0, 0, vw, Math.max(0, r.y - 18))
      gBank.fillRect(0, Math.min(vh, r.y + r.h + 18), vw, vh)
    } else {
      if (r.x > 24) gBank.fillRect(0, 0, Math.max(0, r.x - 18), vh)
      gBank.fillRect(Math.min(vw, r.x + r.w + 18), 0, vw, vh)
    }
    this.waterObjs.push(gBank)

    // 河水：跨向「岸暗心亮」的两段渐变
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

    // 岸线浪花：贴岸白线 + 断续泡点（种子固定，同局重建不变）
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

    // 双层水纹（视差滚动）
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

    // 岸上静态植被：沿长轴等距掷点（种子固定），只落在岸带内
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

    // 漂浮物（顺流循环）：初始均匀铺满，之后 updateWater 推进
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

  /** 无缝水纹贴图（按朝向各生成一次）：沿流向的白色弧形流痕 */
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

  /** 水面动效逐帧推进：水纹贴图偏移 + 漂浮物顺流/摇摆/自旋 */
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
        // 漂出下游 → 回上游重新进场（换个横位/速度）
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
