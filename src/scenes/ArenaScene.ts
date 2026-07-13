import Phaser from 'phaser'
import { ARENA, GEM, GHOST, HEAL_AMOUNT, KNIFE, PLAYER, SPAWN, ZOMBIE } from '../core/config'
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
import { Joystick } from '../ui/Joystick'
import { EMOJI_FONT, UI_FONT } from '../ui/fonts'

type ArcadeBody = Phaser.Physics.Arcade.Body
type TextObj = Phaser.GameObjects.Text

// Text 的物理体默认贴左上角，这里换算偏移让圆形碰撞体居中。
function circleBody(obj: TextObj, radius: number): void {
  const body = obj.body as ArcadeBody
  body.setCircle(radius, obj.displayWidth / 2 - radius, obj.displayHeight / 2 - radius)
}

function held(key?: Phaser.Input.Keyboard.Key): boolean {
  return key?.isDown ?? false
}

export class ArenaScene extends Phaser.Scene {
  private player!: TextObj
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

  private hpBar!: Phaser.GameObjects.Graphics
  private xpBar!: Phaser.GameObjects.Graphics
  private timeText!: TextObj
  private killsText!: TextObj
  private levelText!: TextObj
  private lastShownSecond = -1

  constructor() {
    super('arena')
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

    this.physics.world.setBounds(0, 0, ARENA.width, ARENA.height)
    this.drawFloor()

    this.player = this.add
      .text(ARENA.width / 2, ARENA.height / 2, PLAYER.emoji, {
        fontFamily: EMOJI_FONT,
        fontSize: `${PLAYER.fontSize}px`,
      })
      .setOrigin(0.5)
      .setDepth(10)
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
      this.onKnifeHit(a as unknown as TextObj, b as unknown as TextObj),
    )
    this.physics.add.overlap(this.player, this.enemies, (_p, e) =>
      this.onPlayerTouched(e as unknown as TextObj),
    )
    this.physics.add.overlap(this.player, this.gems, (_p, g) =>
      this.collectGem(g as unknown as TextObj),
    )

    this.createHud()
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
    })
  }

  // ── 输入与移动 ──────────────────────────────────────────────

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

  // ── 攻击 ────────────────────────────────────────────────────

  private autoAttack(delta: number): void {
    this.attackCooldownMs -= delta
    if (this.attackCooldownMs > 0) return
    const targets = (this.enemies.getChildren() as TextObj[]).filter((e) => e.active)
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
    const knife = this.add
      .text(this.player.x + Math.cos(angle) * 26, this.player.y + Math.sin(angle) * 26, KNIFE.emoji, {
        fontFamily: EMOJI_FONT,
        fontSize: `${KNIFE.fontSize}px`,
      })
      .setOrigin(0.5)
      .setDepth(8)
      .setRotation(angle + Math.PI / 4)
    this.physics.add.existing(knife)
    circleBody(knife, KNIFE.radius)
    ;(knife.body as ArcadeBody).setVelocity(Math.cos(angle) * KNIFE.speed, Math.sin(angle) * KNIFE.speed)
    this.knives.add(knife)
  }

  private cullKnives(): void {
    for (const k of this.knives.getChildren() as TextObj[]) {
      if (k.x < -60 || k.x > ARENA.width + 60 || k.y < -60 || k.y > ARENA.height + 60) {
        k.destroy()
      }
    }
  }

  private onKnifeHit(knife: TextObj, enemy: TextObj): void {
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

  private killEnemy(enemy: TextObj): void {
    this.kills++
    this.killsText.setText(`💀 ${this.kills}`)
    const spec = enemy.getData('spec') as EnemySpec
    this.spawnGem(enemy.x, enemy.y, spec.xp)
    enemy.setActive(false)
    ;(enemy.body as ArcadeBody).enable = false
    this.tweens.add({
      targets: enemy,
      scale: 1.5,
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
    this.spawnCooldownMs = wave.spawnIntervalMs
    if (this.enemies.countActive(true) >= SPAWN.maxAlive) return

    const spec = this.rng.chance(wave.ghostShare) ? GHOST : ZOMBIE
    const { x, y } = this.randomEdgePoint()
    const enemy = this.add
      .text(x, y, spec.emoji, { fontFamily: EMOJI_FONT, fontSize: `${spec.fontSize}px` })
      .setOrigin(0.5)
      .setDepth(5)
    this.physics.add.existing(enemy)
    circleBody(enemy, spec.radius)
    enemy.setData('hp', Math.round(spec.hp * wave.hpMultiplier))
    enemy.setData('spec', spec)
    this.enemies.add(enemy)
  }

  private randomEdgePoint(): { x: number; y: number } {
    const m = SPAWN.edgeMargin
    switch (this.rng.int(0, 3)) {
      case 0:
        return { x: this.rng.int(0, ARENA.width), y: -m }
      case 1:
        return { x: this.rng.int(0, ARENA.width), y: ARENA.height + m }
      case 2:
        return { x: -m, y: this.rng.int(0, ARENA.height) }
      default:
        return { x: ARENA.width + m, y: this.rng.int(0, ARENA.height) }
    }
  }

  private steerEnemies(): void {
    for (const e of this.enemies.getChildren() as TextObj[]) {
      if (!e.active) continue
      const spec = e.getData('spec') as EnemySpec
      const dir = norm(this.player.x - e.x, this.player.y - e.y)
      ;(e.body as ArcadeBody).setVelocity(dir.x * spec.speed, dir.y * spec.speed)
    }
  }

  // ── 经验与升级 ──────────────────────────────────────────────

  private spawnGem(x: number, y: number, xp: number): void {
    const gem = this.add
      .text(x, y, GEM.emoji, { fontFamily: EMOJI_FONT, fontSize: `${GEM.fontSize}px` })
      .setOrigin(0.5)
      .setDepth(3)
    this.physics.add.existing(gem)
    circleBody(gem, GEM.radius)
    gem.setData('xp', xp)
    this.gems.add(gem)
  }

  private magnetGems(): void {
    const r2 = GEM.magnetRadius * GEM.magnetRadius
    for (const g of this.gems.getChildren() as TextObj[]) {
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

  private collectGem(gem: TextObj): void {
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

  private showUpgradeToast(label: string, index: number): void {
    const t = this.add
      .text(ARENA.width / 2, ARENA.height * 0.36 + index * 36, `⬆️ ${label}`, {
        fontFamily: EMOJI_FONT,
        fontSize: '28px',
        color: '#ffe082',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(120)
    this.tweens.add({
      targets: t,
      y: t.y - 34,
      alpha: 0,
      duration: 1100,
      delay: 150 + index * 150,
      onComplete: () => t.destroy(),
    })
  }

  // ── 受击与结算 ──────────────────────────────────────────────

  private onPlayerTouched(enemy: TextObj): void {
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
    this.player.setText('😵')

    const seconds = Math.floor(this.elapsedMs / 1000)
    const result = submitScore(browserStorage(), seconds, this.kills)
    const cx = ARENA.width / 2

    this.add.rectangle(cx, ARENA.height / 2, ARENA.width, ARENA.height, 0x000000, 0.72).setDepth(200)
    this.add
      .text(cx, 168, '💀 游戏结束', { fontFamily: EMOJI_FONT, fontSize: '52px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(201)
    this.add
      .text(cx, 252, `存活 ${formatTime(seconds)} · 击杀 ${this.kills} · 等级 ${this.xpState.level}`, {
        fontFamily: UI_FONT,
        fontSize: '24px',
        color: '#dddddd',
      })
      .setOrigin(0.5)
      .setDepth(201)
    this.add
      .text(
        cx,
        300,
        result.newBest
          ? '🏆 新纪录！'
          : `🏆 最佳：存活 ${formatTime(result.score.bestSeconds)} · 击杀 ${result.score.bestKills}`,
        { fontFamily: EMOJI_FONT, fontSize: '20px', color: '#d4b106' },
      )
      .setOrigin(0.5)
      .setDepth(201)
    const prompt = this.add
      .text(cx, 384, '点击或按任意键重新开始', { fontFamily: UI_FONT, fontSize: '20px', color: '#aaaaaa' })
      .setOrigin(0.5)
      .setDepth(201)
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 })

    reportDebug({
      scene: 'gameover',
      elapsed: seconds,
      hp: 0,
      kills: this.kills,
      level: this.xpState.level,
      enemies: this.enemies.countActive(true),
    })

    // 稍作延迟再接受输入，避免死亡瞬间的点击误触重开
    this.time.delayedCall(500, () => {
      const restart = (): void => {
        this.scene.restart()
      }
      this.input.once('pointerdown', restart)
      this.input.keyboard?.once('keydown', restart)
    })
  }

  // ── 场景装饰与 HUD ──────────────────────────────────────────

  private drawFloor(): void {
    const g = this.add.graphics()
    g.lineStyle(1, 0xffffff, 0.05)
    for (let x = 0; x <= ARENA.width; x += 60) g.lineBetween(x, 0, x, ARENA.height)
    for (let y = 0; y <= ARENA.height; y += 60) g.lineBetween(0, y, ARENA.width, y)
    g.lineStyle(2, 0xffffff, 0.15)
    g.strokeRect(1, 1, ARENA.width - 2, ARENA.height - 2)
  }

  private createHud(): void {
    this.hpBar = this.add.graphics().setDepth(100)
    this.xpBar = this.add.graphics().setDepth(100)
    this.levelText = this.add
      .text(224, 10, 'Lv.1', { fontFamily: UI_FONT, fontSize: '16px', color: '#cccccc' })
      .setDepth(100)
    this.timeText = this.add
      .text(ARENA.width / 2, 10, '0:00', { fontFamily: UI_FONT, fontSize: '22px', color: '#dddddd' })
      .setOrigin(0.5, 0)
      .setDepth(100)
    this.killsText = this.add
      .text(ARENA.width - 12, 10, '💀 0', { fontFamily: EMOJI_FONT, fontSize: '20px', color: '#dddddd' })
      .setOrigin(1, 0)
      .setDepth(100)
    this.drawHpBar()
    this.drawXpBar()
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
