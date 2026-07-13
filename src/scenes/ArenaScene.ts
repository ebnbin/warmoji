import Phaser from 'phaser'
import { GEM, GHOST, MAP, MEMBER, SPAWN, STRESS, TEAM, UNIT, ZOMBIE } from '../core/config'
import type { EnemySpec } from '../core/config'
import type { ProjectileSpec, WeaponSpec } from '../core/weapons'
import { slotOffset } from '../core/formation'
import { browserStorage, submitScore } from '../core/highscore'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { randomMapPoint } from '../core/spawn'
import { norm } from '../core/vec'
import { waveAt } from '../core/waves'
import { gainXp, xpToNext } from '../core/xp'
import type { XpState } from '../core/xp'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { isStress } from '../ui/dev'
import { emojiImage } from '../ui/emoji'
import { UI_FONT } from '../ui/fonts'
import { textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'
import { createWeapon } from '../weapons/create'
import type { EnemyTarget, WeaponContext, WeaponOwner, WeaponRuntime } from '../weapons/types'
import type { UIScene } from './UIScene'

interface TeamStats {
  damageMul: number
  cooldownMul: number
  moveSpeed: number
  maxHp: number
}

type ArcadeBody = Phaser.Physics.Arcade.Body
type ImageObj = Phaser.GameObjects.Image

export interface HudSnapshot {
  xp: number
  xpNext: number
  level: number
  kills: number
  seconds: number
  over: boolean
}

export interface GameOverInfo {
  seconds: number
  kills: number
  level: number
  newBest: boolean
  bestSeconds: number
  bestKills: number
}

interface Member {
  emoji: string
  slot: number
  image: ImageObj
  weapons: WeaponRuntime[]
  handle: WeaponOwner
  visualOffset: { x: number; y: number }
  hp: number
  alive: boolean
  reviveAt: number
  lastHitMs: number
  hpBar: Phaser.GameObjects.Graphics
  shownHpRatio: number
  deadText: Phaser.GameObjects.Text
  shownCountdown: number
}

// 碰撞圆按逻辑半径换算回源纹理坐标（body 随对象缩放）
function circleBody(obj: ImageObj, radius: number): void {
  const body = obj.body as ArcadeBody
  const frame = obj.width
  const r = (radius / obj.displayWidth) * frame
  body.setCircle(r, frame / 2 - r, frame / 2 - r)
}

function held(key?: Phaser.Input.Keyboard.Key): boolean {
  return key?.isDown ?? false
}

export class ArenaScene extends Phaser.Scene {
  private members: Member[] = []
  private memberGroup!: Phaser.GameObjects.Group
  private center = { x: 0, y: 0 }
  private centerObj!: Phaser.GameObjects.Zone
  private enemies!: Phaser.GameObjects.Group
  private projectiles!: Phaser.GameObjects.Group
  private gems!: Phaser.GameObjects.Group
  private frameTargets: EnemyTarget[] = []
  private weaponCtx: WeaponContext = {
    scene: this,
    enemyTargets: () => this.frameTargets,
    damageEnemy: (e, d) => this.applyDamage(e as ImageObj, d),
    spawnProjectile: (x, y, angle, spec, damage) => this.spawnProjectile(x, y, angle, spec, damage),
    damageMul: () => this.stats.damageMul,
    cooldownMul: () => this.stats.cooldownMul,
  }
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>

  private rng = new Rng(1)
  private palette!: Palette
  private stats!: TeamStats
  private xpState!: XpState
  private kills = 0
  private elapsedMs = 0
  private spawnCooldownMs = 0
  private pendingSpawns = 0
  private stress = false
  private over = false
  gameOverInfo?: GameOverInfo

  constructor() {
    super('arena')
  }

  perfSnapshot(): { enemies: number; projectiles: number; gems: number; pending: number; objects: number } {
    return {
      enemies: this.enemies.countActive(true),
      projectiles: this.projectiles.getLength(),
      gems: this.gems.getLength(),
      pending: this.pendingSpawns,
      objects: this.children.list.length,
    }
  }

  hudSnapshot(): HudSnapshot {
    return {
      xp: this.xpState.xp,
      xpNext: xpToNext(this.xpState.level),
      level: this.xpState.level,
      kills: this.kills,
      seconds: Math.floor(this.elapsedMs / 1000),
      over: this.over,
    }
  }

  create(): void {
    // scene.restart() 复用同一实例，所有局内状态必须在这里重置
    this.rng = new Rng(Date.now() >>> 0)
    this.palette = randomPalette(this.rng)
    applyBackground(this.palette)
    this.stress = isStress()
    this.stats = {
      damageMul: 1,
      cooldownMul: this.stress ? STRESS.cooldownMul : 1,
      moveSpeed: TEAM.moveSpeed,
      maxHp: this.stress ? STRESS.maxHp : MEMBER.maxHp,
    }
    this.xpState = { level: 1, xp: 0 }
    this.kills = 0
    this.elapsedMs = 0
    this.spawnCooldownMs = 300
    this.pendingSpawns = 0
    this.over = false
    this.gameOverInfo = undefined

    this.physics.world.setBounds(0, 0, MAP.width, MAP.height)
    this.drawFloor()

    this.center = { x: MAP.width / 2, y: MAP.height / 2 }
    this.centerObj = this.add.zone(this.center.x, this.center.y, 1, 1)

    this.memberGroup = this.add.group()
    this.members = TEAM.lineup.map((spec, slot) => this.createMember(spec.emoji, spec.weapons, slot))

    const cam = this.cameras.main
    cam.setZoom(viewport.renderScale)
    cam.setBounds(
      -MAP.cameraMargin,
      -MAP.cameraMargin,
      MAP.width + MAP.cameraMargin * 2,
      MAP.height + MAP.cameraMargin * 2,
    )
    cam.startFollow(this.centerObj)

    this.enemies = this.add.group()
    this.projectiles = this.add.group()
    this.gems = this.add.group()

    this.cursors = this.input.keyboard?.createCursorKeys()
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D') as
      | Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
      | undefined

    this.physics.add.overlap(this.projectiles, this.enemies, (a, b) =>
      this.onProjectileHit(a as unknown as ImageObj, b as unknown as ImageObj),
    )
    this.physics.add.overlap(this.memberGroup, this.enemies, (m, e) =>
      this.onMemberTouched(m as unknown as ImageObj, e as unknown as ImageObj),
    )
    this.physics.add.overlap(this.memberGroup, this.gems, (_m, g) =>
      this.collectGem(g as unknown as ImageObj),
    )

    this.layoutTeam()
    this.scene.launch('ui')

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      this.scene.stop('ui')
    })
  }

  update(_time: number, delta: number): void {
    if (this.over) return
    this.elapsedMs += delta

    this.moveTeam(delta)
    this.frameTargets = (this.enemies.getChildren() as ImageObj[])
      .filter((e) => e.active)
      .map((e) => ({ x: e.x, y: e.y, radius: (e.getData('spec') as EnemySpec).radius, ref: e }))
    this.updateMembers(delta)
    this.spawn(delta)
    this.steerEnemies()
    this.magnetGems()
    this.cullProjectiles()

    const cam = this.cameras.main
    reportDebug({
      scene: 'arena',
      elapsed: this.elapsedMs / 1000,
      hp: this.members.reduce((sum, m) => sum + m.hp, 0),
      alive: this.members.filter((m) => m.alive).length,
      kills: this.kills,
      level: this.xpState.level,
      enemies: this.enemies.countActive(true),
      pending: this.pendingSpawns,
      fps: Math.round(this.game.loop.actualFps),
      viewW: viewport.logicalWidth,
      viewH: viewport.logicalHeight,
      playerX: this.center.x,
      playerY: this.center.y,
      camX: cam.worldView.centerX,
      camY: cam.worldView.centerY,
    })
  }

  private onViewportChanged(): void {
    this.cameras.main.setZoom(viewport.renderScale)
  }

  // ── 队伍 ────────────────────────────────────────────────────

  private createMember(emoji: string, weaponSpecs: readonly WeaponSpec[], slot: number): Member {
    const off = slotOffset(slot, TEAM.lineup.length, TEAM.ringRadius)
    const image = emojiImage(
      this,
      this.center.x + off.x,
      this.center.y + off.y,
      emoji,
      MEMBER.size,
      true,
      // 重叠时靠下的角色遮挡靠上的，聚团更自然
    ).setDepth(10 + off.y / UNIT)
    this.physics.add.existing(image)
    circleBody(image, MEMBER.radius)
    // 角色是纯随队走位的运动学对象：body 只跟随图片用于碰撞，
    // 不允许物理引擎把位移回写到图片（否则与手动定位叠加产生抖动）
    ;(image.body as ArcadeBody).moves = false
    const visualOffset = { x: 0, y: 0 }
    const handle: WeaponOwner = {
      get x() {
        return image.x
      },
      get y() {
        return image.y
      },
      setVisualOffset(dx: number, dy: number) {
        visualOffset.x = dx
        visualOffset.y = dy
      },
    }
    const member: Member = {
      emoji,
      slot,
      image,
      // 错开初始冷却，避免全队同帧齐射
      weapons: weaponSpecs.map((w, i) => createWeapon(w, this.weaponCtx, 300 + slot * 120 + i * 230)),
      handle,
      visualOffset,
      hp: this.stats.maxHp,
      alive: true,
      reviveAt: 0,
      lastHitMs: -Infinity,
      hpBar: this.add.graphics().setDepth(11),
      shownHpRatio: -1,
      deadText: this.add
        .text(0, 0, '', {
          fontFamily: UI_FONT,
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 4,
          resolution: textRes(),
        })
        .setOrigin(0.5)
        .setDepth(12)
        .setVisible(false),
      shownCountdown: -1,
    }
    image.setData('member', member)
    this.memberGroup.add(image)
    return member
  }

  private moveTeam(delta: number): void {
    const kx =
      (held(this.cursors?.left) || held(this.wasd?.A) ? -1 : 0) +
      (held(this.cursors?.right) || held(this.wasd?.D) ? 1 : 0)
    const ky =
      (held(this.cursors?.up) || held(this.wasd?.W) ? -1 : 0) +
      (held(this.cursors?.down) || held(this.wasd?.S) ? 1 : 0)

    const ui = this.scene.get('ui') as UIScene
    const dir = kx !== 0 || ky !== 0 ? norm(kx, ky) : ui.joystickVector
    const step = (this.stats.moveSpeed * delta) / 1000
    const clampMin = TEAM.ringRadius + MEMBER.radius
    this.center.x = Phaser.Math.Clamp(this.center.x + dir.x * step, clampMin, MAP.width - clampMin)
    this.center.y = Phaser.Math.Clamp(this.center.y + dir.y * step, clampMin, MAP.height - clampMin)
    this.centerObj.setPosition(this.center.x, this.center.y)
    this.layoutTeam()
  }

  private layoutTeam(): void {
    for (const m of this.members) {
      const off = slotOffset(m.slot, TEAM.lineup.length, TEAM.ringRadius)
      m.image.setPosition(
        this.center.x + off.x + m.visualOffset.x,
        this.center.y + off.y + m.visualOffset.y,
      )
      ;(m.image.body as ArcadeBody).updateFromGameObject()
      m.hpBar.setPosition(m.image.x, m.image.y)
      m.deadText.setPosition(m.image.x, m.image.y)
    }
  }

  private updateMembers(delta: number): void {
    for (const m of this.members) {
      if (m.alive) {
        this.drawMemberHp(m)
        for (const w of m.weapons) w.update(delta, m.handle)
      } else {
        if (this.elapsedMs >= m.reviveAt) {
          this.reviveMember(m)
        } else {
          const remain = Math.ceil((m.reviveAt - this.elapsedMs) / 1000)
          if (remain !== m.shownCountdown) {
            m.shownCountdown = remain
            m.deadText.setText(String(remain))
          }
        }
      }
    }
  }

  private drawMemberHp(m: Member): void {
    const ratio = Math.max(0, m.hp / this.stats.maxHp)
    if (Math.abs(ratio - m.shownHpRatio) < 0.005) return
    m.shownHpRatio = ratio
    const w = 0.8 * UNIT
    const y = MEMBER.size * 0.62
    const g = m.hpBar
    g.clear()
    g.fillStyle(0x000000, 0.45)
    g.fillRect(-w / 2, y, w, 6)
    g.fillStyle(ratio > 0.5 ? 0x66bb6a : ratio > 0.25 ? 0xffb300 : 0xef5350, 1)
    g.fillRect(-w / 2 + 1, y + 1, (w - 2) * ratio, 4)
  }

  private onMemberTouched(memberImg: ImageObj, enemy: ImageObj): void {
    if (this.over || !enemy.active) return
    const m = memberImg.getData('member') as Member
    if (!m.alive) return
    if (this.elapsedMs - m.lastHitMs < MEMBER.iframesMs) return
    m.lastHitMs = this.elapsedMs
    const spec = enemy.getData('spec') as EnemySpec
    m.hp = Math.max(0, m.hp - spec.damage)
    this.cameras.main.shake(80, 0.003)
    m.image.setTint(0xff7777)
    this.time.delayedCall(120, () => {
      if (m.alive) m.image.clearTint()
    })
    if (m.hp <= 0) this.killMember(m)
  }

  private killMember(m: Member): void {
    m.alive = false
    m.hp = 0
    m.reviveAt = this.elapsedMs + TEAM.reviveMs
    m.shownCountdown = -1
    ;(m.image.body as ArcadeBody).enable = false
    m.image.setAlpha(0.35).setTint(0x888888)
    m.hpBar.setVisible(false)
    m.deadText.setVisible(true)
    m.visualOffset.x = 0
    m.visualOffset.y = 0
    for (const w of m.weapons) w.setVisible(false)
    if (this.members.every((x) => !x.alive)) this.gameOver()
  }

  private reviveMember(m: Member): void {
    m.alive = true
    m.hp = this.stats.maxHp
    m.shownHpRatio = -1
    m.lastHitMs = this.elapsedMs
    ;(m.image.body as ArcadeBody).enable = true
    m.image.setAlpha(1).clearTint()
    m.hpBar.setVisible(true)
    m.deadText.setVisible(false)
    for (const w of m.weapons) w.setVisible(true)
    const targetScale = m.image.scale
    m.image.setScale(targetScale * 0.3)
    this.tweens.add({ targets: m.image, scale: targetScale, duration: 200, ease: 'Back.easeOut' })
  }

  private aliveMembers(): Member[] {
    return this.members.filter((m) => m.alive)
  }

  // ── 攻击与伤害 ──────────────────────────────────────────────

  private spawnProjectile(
    x: number,
    y: number,
    angle: number,
    spec: ProjectileSpec,
    damage: number,
  ): void {
    const p = emojiImage(this, x, y, spec.projectile.emoji, spec.projectile.size, true)
      .setDepth(8)
      .setRotation(angle + spec.projectile.rotationOffsetRad)
    this.physics.add.existing(p)
    circleBody(p, spec.projectile.radius)
    ;(p.body as ArcadeBody).setVelocity(
      Math.cos(angle) * spec.projectile.speed,
      Math.sin(angle) * spec.projectile.speed,
    )
    p.setData('damage', damage)
    this.projectiles.add(p)
  }

  private cullProjectiles(): void {
    const view = this.cameras.main.worldView
    const slack = 4 * UNIT
    for (const p of this.projectiles.getChildren() as ImageObj[]) {
      if (
        p.x < view.x - slack ||
        p.x > view.right + slack ||
        p.y < view.y - slack ||
        p.y > view.bottom + slack
      ) {
        p.destroy()
      }
    }
  }

  private onProjectileHit(projectile: ImageObj, enemy: ImageObj): void {
    if (!projectile.active || !enemy.active) return
    const damage = projectile.getData('damage') as number
    projectile.destroy()
    this.applyDamage(enemy, damage)
  }

  private applyDamage(enemy: ImageObj, damage: number): void {
    if (!enemy.active) return
    const hp = (enemy.getData('hp') as number) - damage
    this.floatDamage(enemy.x, enemy.y, damage)
    if (hp <= 0) {
      this.killEnemy(enemy)
    } else {
      enemy.setData('hp', hp)
      enemy.setAlpha(0.5)
      this.tweens.add({ targets: enemy, alpha: 1, duration: 120 })
    }
  }

  private killEnemy(enemy: ImageObj): void {
    this.kills++
    const spec = enemy.getData('spec') as EnemySpec
    this.spawnGem(enemy.x, enemy.y, spec.xp)
    enemy.setActive(false)
    ;(enemy.body as ArcadeBody).enable = false
    this.tweens.add({
      targets: enemy,
      scale: enemy.scale * 1.5,
      alpha: 0,
      duration: 130,
      onComplete: () => enemy.destroy(),
    })
  }

  private floatDamage(x: number, y: number, amount: number): void {
    const t = this.add
      .text(x, y - 14, String(amount), {
        fontFamily: UI_FONT,
        fontSize: '15px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        resolution: textRes(),
      })
      .setOrigin(0.5)
      .setDepth(50)
    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 350,
      onComplete: () => t.destroy(),
    })
  }

  // ── 刷怪 ────────────────────────────────────────────────────

  private spawn(delta: number): void {
    this.spawnCooldownMs -= delta
    if (this.spawnCooldownMs > 0) return
    const wave = waveAt(this.elapsedMs / 1000)
    this.spawnCooldownMs = this.stress ? STRESS.spawnIntervalMs : wave.spawnIntervalMs
    const cap = this.stress ? STRESS.maxAlive : SPAWN.maxAlive
    const batch = this.stress ? STRESS.spawnBatch : 1
    for (let i = 0; i < batch; i++) {
      if (this.enemies.countActive(true) + this.pendingSpawns >= cap) return
      this.spawnOne(wave.ghostShare, wave.hpMultiplier)
    }
  }

  private spawnOne(ghostShare: number, hpMultiplier: number): void {
    const spec = this.rng.chance(ghostShare) ? GHOST : ZOMBIE
    const hp = Math.round(spec.hp * hpMultiplier)
    const pos = randomMapPoint(
      this.rng,
      MAP.width,
      MAP.height,
      SPAWN.edgeInset,
      this.center,
      SPAWN.minPlayerDist,
    )

    // 预告标记闪烁后敌人才落地；预告期间无碰撞
    this.pendingSpawns++
    const mark = emojiImage(this, pos.x, pos.y, SPAWN.markEmoji, SPAWN.markSize)
      .setDepth(4)
      .setAlpha(0)
    this.tweens.add({
      targets: mark,
      alpha: 1,
      duration: SPAWN.telegraphMs / 6,
      yoyo: true,
      repeat: 2,
    })
    this.time.delayedCall(SPAWN.telegraphMs, () => {
      mark.destroy()
      this.pendingSpawns--
      if (!this.over) this.materializeEnemy(spec, pos.x, pos.y, hp)
    })
  }

  private materializeEnemy(spec: EnemySpec, x: number, y: number, hp: number): void {
    const enemy = emojiImage(this, x, y, spec.emoji, spec.size, true).setDepth(5)
    this.physics.add.existing(enemy)
    circleBody(enemy, spec.radius)
    enemy.setData('hp', hp)
    enemy.setData('spec', spec)
    this.enemies.add(enemy)
    const targetScale = enemy.scale
    enemy.setScale(targetScale * 0.3).setAlpha(0.3)
    this.tweens.add({ targets: enemy, scale: targetScale, alpha: 1, duration: 130 })
  }

  private steerEnemies(): void {
    const alive = this.aliveMembers()
    if (alive.length === 0) return
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      const spec = e.getData('spec') as EnemySpec
      // 以角色为单位索敌：追离自己最近的存活角色
      let best = alive[0]!
      let bestD = Infinity
      for (const m of alive) {
        const dx = m.image.x - e.x
        const dy = m.image.y - e.y
        const d = dx * dx + dy * dy
        if (d < bestD) {
          bestD = d
          best = m
        }
      }
      const dir = norm(best.image.x - e.x, best.image.y - e.y)
      ;(e.body as ArcadeBody).setVelocity(dir.x * spec.speed, dir.y * spec.speed)
    }
  }

  // ── 经验 ────────────────────────────────────────────────────

  private spawnGem(x: number, y: number, xp: number): void {
    const gem = emojiImage(
      this,
      Phaser.Math.Clamp(x, GEM.radius, MAP.width - GEM.radius),
      Phaser.Math.Clamp(y, GEM.radius, MAP.height - GEM.radius),
      GEM.emoji,
      GEM.size,
      true,
    ).setDepth(3)
    this.physics.add.existing(gem)
    circleBody(gem, GEM.radius)
    gem.setData('xp', xp)
    this.gems.add(gem)
  }

  private magnetGems(): void {
    const alive = this.aliveMembers()
    if (alive.length === 0) return
    const r2 = GEM.magnetRadius * GEM.magnetRadius
    for (const g of this.gems.getChildren() as ImageObj[]) {
      if (!g.active) continue
      // 吸附到离经验珠最近的存活角色
      let bx = 0
      let by = 0
      let bestD = Infinity
      for (const m of alive) {
        const dx = m.image.x - g.x
        const dy = m.image.y - g.y
        const d = dx * dx + dy * dy
        if (d < bestD) {
          bestD = d
          bx = dx
          by = dy
        }
      }
      const body = g.body as ArcadeBody
      if (bestD < r2) {
        const dir = norm(bx, by)
        body.setVelocity(dir.x * GEM.magnetSpeed, dir.y * GEM.magnetSpeed)
      } else {
        body.setVelocity(0, 0)
      }
    }
  }

  private collectGem(gem: ImageObj): void {
    if (!gem.active) return
    const xp = gem.getData('xp') as number
    gem.destroy()
    // 升级奖励机制已移除（待重构）：经验与等级仅作为数值累积
    this.xpState = gainXp(this.xpState, xp).state
  }

  // ── 结算 ────────────────────────────────────────────────────

  private gameOver(): void {
    this.over = true
    this.physics.pause()

    const seconds = Math.floor(this.elapsedMs / 1000)
    const result = submitScore(browserStorage(), seconds, this.kills)
    this.gameOverInfo = {
      seconds,
      kills: this.kills,
      level: this.xpState.level,
      newBest: result.newBest,
      bestSeconds: result.score.bestSeconds,
      bestKills: result.score.bestKills,
    }
    this.events.emit('game-over', this.gameOverInfo)

    reportDebug({
      scene: 'gameover',
      elapsed: seconds,
      hp: 0,
      alive: 0,
      kills: this.kills,
      level: this.xpState.level,
      enemies: this.enemies.countActive(true),
      pending: this.pendingSpawns,
      fps: Math.round(this.game.loop.actualFps),
      viewW: viewport.logicalWidth,
      viewH: viewport.logicalHeight,
      playerX: this.center.x,
      playerY: this.center.y,
      camX: this.cameras.main.worldView.centerX,
      camY: this.cameras.main.worldView.centerY,
    })

    // 防死亡瞬间误触重开
    this.time.delayedCall(500, () => {
      const restart = (): void => {
        this.scene.restart()
      }
      this.input.once('pointerdown', restart)
      this.input.keyboard?.once('keydown', restart)
    })
  }

  private drawFloor(): void {
    const g = this.add.graphics()
    const shadowOffset = 0.25 * UNIT
    g.fillStyle(this.palette.shadow, 1)
    g.fillRect(shadowOffset, shadowOffset, MAP.width, MAP.height)
    g.fillStyle(this.palette.map, 1)
    g.fillRect(0, 0, MAP.width, MAP.height)
    g.lineStyle(1, this.palette.grid, this.palette.gridAlpha)
    for (let x = UNIT; x < MAP.width; x += UNIT) g.lineBetween(x, 0, x, MAP.height)
    for (let y = UNIT; y < MAP.height; y += UNIT) g.lineBetween(0, y, MAP.width, y)
  }
}
