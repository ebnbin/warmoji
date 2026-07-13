import Phaser from 'phaser'
import { GEM, GHOST, HEAL_AMOUNT, KNIFE, PLAYER, SPAWN, ZOMBIE } from '../core/config'
import type { EnemySpec } from '../core/config'
import { formatTime } from '../core/format'
import { browserStorage, submitScore } from '../core/highscore'
import { Rng } from '../core/rng'
import { nearestIndex } from '../core/targeting'
import { applyUpgrade, pickUpgrade, UPGRADE_LABELS } from '../core/upgrades'
import type { PlayerStats } from '../core/upgrades'
import { norm } from '../core/vec'
import { waveAt } from '../core/waves'
import { gainXp, xpToNext } from '../core/xp'
import type { XpState } from '../core/xp'
import { reportDebug } from '../ui/debug'
import { emojiImage, emojiKey, iconLabel } from '../ui/emoji'
import { Joystick } from '../ui/Joystick'
import { UI_FONT } from '../ui/fonts'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

type ArcadeBody = Phaser.Physics.Arcade.Body
type ImageObj = Phaser.GameObjects.Image

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
  private joystick!: Joystick
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>

  private rng = new Rng(1)
  private stats!: PlayerStats
  private xpState!: XpState
  private hp = 0
  private kills = 0
  private elapsedMs = 0
  private spawnCooldownMs = 0
  private attackCooldownMs = 0
  private lastHitMs = -Infinity
  private over = false

  private floor!: Phaser.GameObjects.Graphics
  private hpBar!: Phaser.GameObjects.Graphics
  private xpBar!: Phaser.GameObjects.Graphics
  private timeText!: Phaser.GameObjects.Text
  private killsText!: Phaser.GameObjects.Text
  private killsIcon!: ImageObj
  private levelText!: Phaser.GameObjects.Text
  private overlay?: Phaser.GameObjects.Container
  private lastShownSecond = -1

  constructor() {
    super('arena')
  }

  private get viewW(): number {
    return viewport.logicalWidth
  }

  private get viewH(): number {
    return viewport.logicalHeight
  }

  create(): void {
    // scene.restart() 复用同一实例，所有局内状态必须在这里重置
    this.rng = new Rng(Date.now() >>> 0)
    this.stats = {
      knives: 1,
      attackCooldownMs: KNIFE.cooldownMs,
      moveSpeed: PLAYER.speed,
      maxHp: PLAYER.maxHp,
    }
    this.xpState = { level: 1, xp: 0 }
    this.hp = PLAYER.maxHp
    this.kills = 0
    this.elapsedMs = 0
    this.spawnCooldownMs = 300
    this.attackCooldownMs = 0
    this.lastHitMs = -Infinity
    this.over = false
    this.lastShownSecond = -1
    this.overlay = undefined

    applyCamera(this)
    this.physics.world.setBounds(0, 0, this.viewW, this.viewH)
    this.floor = this.add.graphics()
    this.drawFloor()

    this.player = emojiImage(this, this.viewW / 2, this.viewH / 2, PLAYER.emoji, PLAYER.size).setDepth(10)
    this.physics.add.existing(this.player)
    circleBody(this.player, PLAYER.radius)
    ;(this.player.body as ArcadeBody).setCollideWorldBounds(true)

    this.enemies = this.add.group()
    this.knives = this.add.group()
    this.gems = this.add.group()

    this.joystick = new Joystick(this)
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

    this.createHud()

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
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
    this.refreshTime()

    reportDebug({
      scene: 'arena',
      elapsed: this.elapsedMs / 1000,
      hp: this.hp,
      kills: this.kills,
      level: this.xpState.level,
      enemies: this.enemies.countActive(true),
      viewW: this.viewW,
      viewH: this.viewH,
    })
  }

  private onViewportChanged(): void {
    applyCamera(this)
    this.physics.world.setBounds(0, 0, this.viewW, this.viewH)
    this.drawFloor()
    this.layoutHud()
    this.player.setPosition(
      Phaser.Math.Clamp(this.player.x, PLAYER.radius, this.viewW - PLAYER.radius),
      Phaser.Math.Clamp(this.player.y, PLAYER.radius, this.viewH - PLAYER.radius),
    )
    this.overlay?.setPosition(this.viewW / 2, this.viewH / 2)
  }

  private movePlayer(): void {
    const kx =
      (held(this.cursors?.left) || held(this.wasd?.A) ? -1 : 0) +
      (held(this.cursors?.right) || held(this.wasd?.D) ? 1 : 0)
    const ky =
      (held(this.cursors?.up) || held(this.wasd?.W) ? -1 : 0) +
      (held(this.cursors?.down) || held(this.wasd?.S) ? 1 : 0)

    const dir = kx !== 0 || ky !== 0 ? norm(kx, ky) : this.joystick.vector
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
      this.player.x + Math.cos(angle) * 26,
      this.player.y + Math.sin(angle) * 26,
      KNIFE.emoji,
      KNIFE.size,
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
    for (const k of this.knives.getChildren() as ImageObj[]) {
      if (k.x < -60 || k.x > this.viewW + 60 || k.y < -60 || k.y > this.viewH + 60) {
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
    this.killsText.setText(String(this.kills))
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
    this.spawnCooldownMs = wave.spawnIntervalMs
    if (this.enemies.countActive(true) >= SPAWN.maxAlive) return

    const spec = this.rng.chance(wave.ghostShare) ? GHOST : ZOMBIE
    const { x, y } = this.randomEdgePoint()
    const enemy = emojiImage(this, x, y, spec.emoji, spec.size).setDepth(5)
    this.physics.add.existing(enemy)
    circleBody(enemy, spec.radius)
    enemy.setData('hp', Math.round(spec.hp * wave.hpMultiplier))
    enemy.setData('spec', spec)
    this.enemies.add(enemy)
  }

  private randomEdgePoint(): { x: number; y: number } {
    const m = SPAWN.edgeMargin
    const w = Math.round(this.viewW)
    const h = Math.round(this.viewH)
    switch (this.rng.int(0, 3)) {
      case 0:
        return { x: this.rng.int(0, w), y: -m }
      case 1:
        return { x: this.rng.int(0, w), y: h + m }
      case 2:
        return { x: -m, y: this.rng.int(0, h) }
      default:
        return { x: w + m, y: this.rng.int(0, h) }
    }
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
    const gem = emojiImage(this, x, y, GEM.emoji, GEM.size).setDepth(3)
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
    this.drawXpBar()
  }

  private onLevelUps(count: number): void {
    for (let i = 0; i < count; i++) {
      const level = this.xpState.level - count + i + 1
      const id = pickUpgrade(level, this.stats)
      this.stats = applyUpgrade(this.stats, id)
      if (id === 'heal') this.hp = Math.min(this.stats.maxHp, this.hp + HEAL_AMOUNT)
      this.showUpgradeToast(UPGRADE_LABELS[id], i)
    }
    this.levelText.setText(`Lv.${this.xpState.level}`)
    this.drawHpBar()
  }

  private showUpgradeToast(upgrade: { emoji: string; text: string }, index: number): void {
    const toast = iconLabel(this, this.viewW / 2, this.viewH * 0.36 + index * 36, upgrade.emoji, 26, upgrade.text, {
      fontFamily: UI_FONT,
      fontSize: '24px',
      color: '#ffe082',
      stroke: '#000000',
      strokeThickness: 4,
      resolution: textRes(),
    }).setDepth(120)
    this.tweens.add({
      targets: toast,
      y: toast.y - 34,
      alpha: 0,
      duration: 1100,
      delay: 150 + index * 150,
      onComplete: () => toast.destroy(),
    })
  }

  private onPlayerTouched(enemy: ImageObj): void {
    if (this.over || !enemy.active) return
    if (this.elapsedMs - this.lastHitMs < PLAYER.iframesMs) return
    this.lastHitMs = this.elapsedMs
    const spec = enemy.getData('spec') as EnemySpec
    this.hp = Math.max(0, this.hp - spec.damage)
    this.drawHpBar()
    this.cameras.main.shake(90, 0.004)
    this.player.setAlpha(0.4)
    this.tweens.add({ targets: this.player, alpha: 1, duration: PLAYER.iframesMs })
    if (this.hp <= 0) this.gameOver()
  }

  private gameOver(): void {
    this.over = true
    this.physics.pause()
    this.player.setTexture(emojiKey('😵'))

    const seconds = Math.floor(this.elapsedMs / 1000)
    const result = submitScore(browserStorage(), seconds, this.kills)
    const res = textRes()

    const dim = this.add.rectangle(0, 0, 6000, 6000, 0x000000, 0.72)
    const title = iconLabel(this, 0, -110, '💀', 50, '游戏结束', {
      fontFamily: UI_FONT,
      fontSize: '48px',
      color: '#ffffff',
      resolution: res,
    })
    const statsLine = this.add
      .text(0, -26, `存活 ${formatTime(seconds)} · 击杀 ${this.kills} · 等级 ${this.xpState.level}`, {
        fontFamily: UI_FONT,
        fontSize: '24px',
        color: '#dddddd',
        resolution: res,
      })
      .setOrigin(0.5)
    const bestLine = iconLabel(
      this,
      0,
      24,
      '🏆',
      22,
      result.newBest ? '新纪录！' : `最佳：存活 ${formatTime(result.score.bestSeconds)} · 击杀 ${result.score.bestKills}`,
      { fontFamily: UI_FONT, fontSize: '20px', color: '#d4b106', resolution: res },
    )
    const prompt = this.add
      .text(0, 106, '点击或按任意键重新开始', {
        fontFamily: UI_FONT,
        fontSize: '20px',
        color: '#aaaaaa',
        resolution: res,
      })
      .setOrigin(0.5)
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 })

    this.overlay = this.add
      .container(this.viewW / 2, this.viewH / 2, [dim, title, statsLine, bestLine, prompt])
      .setDepth(200)

    reportDebug({
      scene: 'gameover',
      elapsed: seconds,
      hp: 0,
      kills: this.kills,
      level: this.xpState.level,
      enemies: this.enemies.countActive(true),
      viewW: this.viewW,
      viewH: this.viewH,
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
    const g = this.floor
    g.clear()
    g.lineStyle(1, 0xffffff, 0.05)
    for (let x = 0; x <= this.viewW; x += 60) g.lineBetween(x, 0, x, this.viewH)
    for (let y = 0; y <= this.viewH; y += 60) g.lineBetween(0, y, this.viewW, y)
    g.lineStyle(2, 0xffffff, 0.15)
    g.strokeRect(1, 1, this.viewW - 2, this.viewH - 2)
  }

  private createHud(): void {
    const res = textRes()
    this.hpBar = this.add.graphics().setDepth(100)
    this.xpBar = this.add.graphics().setDepth(100)
    this.levelText = this.add
      .text(224, 10, 'Lv.1', { fontFamily: UI_FONT, fontSize: '16px', color: '#cccccc', resolution: res })
      .setDepth(100)
    this.timeText = this.add
      .text(0, 10, '0:00', { fontFamily: UI_FONT, fontSize: '22px', color: '#dddddd', resolution: res })
      .setOrigin(0.5, 0)
      .setDepth(100)
    this.killsIcon = emojiImage(this, 0, 22, '💀', 20).setDepth(100)
    this.killsText = this.add
      .text(0, 10, '0', { fontFamily: UI_FONT, fontSize: '20px', color: '#dddddd', resolution: res })
      .setOrigin(1, 0)
      .setDepth(100)
    this.layoutHud()
    this.drawHpBar()
    this.drawXpBar()
  }

  private layoutHud(): void {
    this.timeText.setX(this.viewW / 2)
    this.killsIcon.setPosition(this.viewW - 22, 22)
    this.killsText.setX(this.viewW - 38)
  }

  private drawHpBar(): void {
    const g = this.hpBar
    g.clear()
    g.fillStyle(0x000000, 0.5)
    g.fillRect(12, 12, 204, 16)
    g.fillStyle(0xef5350, 1)
    g.fillRect(14, 14, 200 * (this.hp / this.stats.maxHp), 12)
    g.lineStyle(1, 0xffffff, 0.4)
    g.strokeRect(12, 12, 204, 16)
  }

  private drawXpBar(): void {
    const g = this.xpBar
    g.clear()
    g.fillStyle(0x000000, 0.5)
    g.fillRect(12, 32, 204, 8)
    g.fillStyle(0x4dd0e1, 1)
    g.fillRect(13, 33, 202 * Math.min(1, this.xpState.xp / xpToNext(this.xpState.level)), 6)
  }

  private refreshTime(): void {
    const second = Math.floor(this.elapsedMs / 1000)
    if (second !== this.lastShownSecond) {
      this.lastShownSecond = second
      this.timeText.setText(formatTime(second))
    }
  }
}
