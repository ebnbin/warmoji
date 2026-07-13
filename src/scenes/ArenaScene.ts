import Phaser from 'phaser'
import { GEM, GHOST, HEAL_AMOUNT, KNIFE, MAP, PLAYER, SPAWN, STRESS, UNIT, ZOMBIE } from '../core/config'
import type { EnemySpec } from '../core/config'
import { browserStorage, submitScore } from '../core/highscore'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { randomMapPoint } from '../core/spawn'
import { nearestIndex } from '../core/targeting'
import { applyUpgrade, pickUpgrade, UPGRADE_LABELS } from '../core/upgrades'
import type { PlayerStats } from '../core/upgrades'
import { norm } from '../core/vec'
import { waveAt } from '../core/waves'
import { gainXp, xpToNext } from '../core/xp'
import type { XpState } from '../core/xp'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { isStress } from '../ui/dev'
import { emojiImage, emojiKey } from '../ui/emoji'
import { UI_FONT } from '../ui/fonts'
import { textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'
import type { UIScene } from './UIScene'

type ArcadeBody = Phaser.Physics.Arcade.Body
type ImageObj = Phaser.GameObjects.Image

export interface HudSnapshot {
  hp: number
  maxHp: number
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
  private player!: ImageObj
  private enemies!: Phaser.GameObjects.Group
  private knives!: Phaser.GameObjects.Group
  private gems!: Phaser.GameObjects.Group
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>

  private rng = new Rng(1)
  private palette!: Palette
  private stats!: PlayerStats
  private xpState!: XpState
  private hp = 0
  private kills = 0
  private elapsedMs = 0
  private spawnCooldownMs = 0
  private attackCooldownMs = 0
  private lastHitMs = -Infinity
  private pendingSpawns = 0
  private stress = false
  private over = false
  gameOverInfo?: GameOverInfo

  constructor() {
    super('arena')
  }

  perfSnapshot(): { enemies: number; knives: number; gems: number; pending: number; objects: number } {
    return {
      enemies: this.enemies.countActive(true),
      knives: this.knives.getLength(),
      gems: this.gems.getLength(),
      pending: this.pendingSpawns,
      objects: this.children.list.length,
    }
  }

  hudSnapshot(): HudSnapshot {
    return {
      hp: this.hp,
      maxHp: this.stats.maxHp,
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
      knives: this.stress ? STRESS.knives : 1,
      attackCooldownMs: this.stress ? STRESS.attackCooldownMs : KNIFE.cooldownMs,
      moveSpeed: PLAYER.speed,
      maxHp: this.stress ? STRESS.maxHp : PLAYER.maxHp,
    }
    this.xpState = { level: 1, xp: 0 }
    this.hp = this.stats.maxHp
    this.kills = 0
    this.elapsedMs = 0
    this.spawnCooldownMs = 300
    this.attackCooldownMs = 0
    this.lastHitMs = -Infinity
    this.pendingSpawns = 0
    this.over = false
    this.gameOverInfo = undefined

    this.physics.world.setBounds(0, 0, MAP.width, MAP.height)
    this.drawFloor()

    this.player = emojiImage(this, MAP.width / 2, MAP.height / 2, PLAYER.emoji, PLAYER.size, true).setDepth(10)
    this.physics.add.existing(this.player)
    circleBody(this.player, PLAYER.radius)
    ;(this.player.body as ArcadeBody).setCollideWorldBounds(true)

    const cam = this.cameras.main
    cam.setZoom(viewport.renderScale)
    cam.setBounds(
      -MAP.cameraMargin,
      -MAP.cameraMargin,
      MAP.width + MAP.cameraMargin * 2,
      MAP.height + MAP.cameraMargin * 2,
    )
    cam.startFollow(this.player)

    this.enemies = this.add.group()
    this.knives = this.add.group()
    this.gems = this.add.group()

    this.cursors = this.input.keyboard?.createCursorKeys()
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D') as
      | Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
      | undefined

    this.physics.add.overlap(this.knives, this.enemies, (a, b) =>
      this.onKnifeHit(a as unknown as ImageObj, b as unknown as ImageObj),
    )
    this.physics.add.overlap(this.player, this.enemies, (_p, e) =>
      this.onPlayerTouched(e as unknown as ImageObj),
    )
    this.physics.add.overlap(this.player, this.gems, (_p, g) =>
      this.collectGem(g as unknown as ImageObj),
    )

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

    this.movePlayer()
    this.autoAttack(delta)
    this.spawn(delta)
    this.steerEnemies()
    this.magnetGems()
    this.cullKnives()

    const cam = this.cameras.main
    reportDebug({
      scene: 'arena',
      elapsed: this.elapsedMs / 1000,
      hp: this.hp,
      kills: this.kills,
      level: this.xpState.level,
      enemies: this.enemies.countActive(true),
      pending: this.pendingSpawns,
      fps: Math.round(this.game.loop.actualFps),
      viewW: viewport.logicalWidth,
      viewH: viewport.logicalHeight,
      playerX: this.player.x,
      playerY: this.player.y,
      camX: cam.worldView.centerX,
      camY: cam.worldView.centerY,
    })
  }

  private onViewportChanged(): void {
    this.cameras.main.setZoom(viewport.renderScale)
  }

  private movePlayer(): void {
    const kx =
      (held(this.cursors?.left) || held(this.wasd?.A) ? -1 : 0) +
      (held(this.cursors?.right) || held(this.wasd?.D) ? 1 : 0)
    const ky =
      (held(this.cursors?.up) || held(this.wasd?.W) ? -1 : 0) +
      (held(this.cursors?.down) || held(this.wasd?.S) ? 1 : 0)

    const ui = this.scene.get('ui') as UIScene
    const dir = kx !== 0 || ky !== 0 ? norm(kx, ky) : ui.joystickVector
    ;(this.player.body as ArcadeBody).setVelocity(
      dir.x * this.stats.moveSpeed,
      dir.y * this.stats.moveSpeed,
    )
  }

  private autoAttack(delta: number): void {
    this.attackCooldownMs -= delta
    if (this.attackCooldownMs > 0) return
    const targets = (this.enemies.getChildren() as ImageObj[]).filter((e) => e.active)
    if (targets.length === 0) return
    this.attackCooldownMs = this.stats.attackCooldownMs

    const idx = nearestIndex({ x: this.player.x, y: this.player.y }, targets)
    if (idx < 0) return
    const target = targets[idx]!
    const base = Math.atan2(target.y - this.player.y, target.x - this.player.x)
    for (let i = 0; i < this.stats.knives; i++) {
      this.throwKnife(base + (i - (this.stats.knives - 1) / 2) * KNIFE.volleySpreadRad)
    }
  }

  private throwKnife(angle: number): void {
    const knife = emojiImage(
      this,
      this.player.x + Math.cos(angle) * KNIFE.size,
      this.player.y + Math.sin(angle) * KNIFE.size,
      KNIFE.emoji,
      KNIFE.size,
      true,
    )
      // twemoji 1f52a 原始刀刃朝向 +45°（右下）
      .setDepth(8)
      .setRotation(angle - Math.PI / 4)
    this.physics.add.existing(knife)
    circleBody(knife, KNIFE.radius)
    ;(knife.body as ArcadeBody).setVelocity(Math.cos(angle) * KNIFE.speed, Math.sin(angle) * KNIFE.speed)
    this.knives.add(knife)
  }

  private cullKnives(): void {
    const view = this.cameras.main.worldView
    const slack = 4 * UNIT
    for (const k of this.knives.getChildren() as ImageObj[]) {
      if (
        k.x < view.x - slack ||
        k.x > view.right + slack ||
        k.y < view.y - slack ||
        k.y > view.bottom + slack
      ) {
        k.destroy()
      }
    }
  }

  private onKnifeHit(knife: ImageObj, enemy: ImageObj): void {
    if (!knife.active || !enemy.active) return
    knife.destroy()
    const hp = (enemy.getData('hp') as number) - KNIFE.damage
    this.floatDamage(enemy.x, enemy.y, KNIFE.damage)
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
      { x: this.player.x, y: this.player.y },
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
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      const spec = e.getData('spec') as EnemySpec
      const dir = norm(this.player.x - e.x, this.player.y - e.y)
      ;(e.body as ArcadeBody).setVelocity(dir.x * spec.speed, dir.y * spec.speed)
    }
  }

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
    const r2 = GEM.magnetRadius * GEM.magnetRadius
    for (const g of this.gems.getChildren() as ImageObj[]) {
      if (!g.active) continue
      const dx = this.player.x - g.x
      const dy = this.player.y - g.y
      const body = g.body as ArcadeBody
      if (dx * dx + dy * dy < r2) {
        const dir = norm(dx, dy)
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
    const result = gainXp(this.xpState, xp)
    this.xpState = result.state
    if (result.levelsGained > 0) this.onLevelUps(result.levelsGained)
  }

  private onLevelUps(count: number): void {
    for (let i = 0; i < count; i++) {
      const level = this.xpState.level - count + i + 1
      const id = pickUpgrade(level, this.stats)
      this.stats = applyUpgrade(this.stats, id)
      if (id === 'heal') this.hp = Math.min(this.stats.maxHp, this.hp + HEAL_AMOUNT)
      this.events.emit('upgrade-toast', { ...UPGRADE_LABELS[id], index: i })
    }
    // 压测模式下升级不允许把攻速拉回常规下限
    if (this.stress) {
      this.stats.attackCooldownMs = Math.min(this.stats.attackCooldownMs, STRESS.attackCooldownMs)
    }
  }

  private onPlayerTouched(enemy: ImageObj): void {
    if (this.over || !enemy.active) return
    if (this.elapsedMs - this.lastHitMs < PLAYER.iframesMs) return
    this.lastHitMs = this.elapsedMs
    const spec = enemy.getData('spec') as EnemySpec
    this.hp = Math.max(0, this.hp - spec.damage)
    this.cameras.main.shake(90, 0.004)
    this.player.setAlpha(0.4)
    this.tweens.add({ targets: this.player, alpha: 1, duration: PLAYER.iframesMs })
    if (this.hp <= 0) this.gameOver()
  }

  private gameOver(): void {
    this.over = true
    this.physics.pause()
    this.player.setTexture(emojiKey(PLAYER.deadEmoji, true))

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
      kills: this.kills,
      level: this.xpState.level,
      enemies: this.enemies.countActive(true),
      pending: this.pendingSpawns,
      fps: Math.round(this.game.loop.actualFps),
      viewW: viewport.logicalWidth,
      viewH: viewport.logicalHeight,
      playerX: this.player.x,
      playerY: this.player.y,
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
