import Phaser from 'phaser'
import { CAPTAINS, CHARACTERS, COIN, GHOST, HIT_SHAKE, MAP, MEMBER, ROSTER_IDS, SPAWN, STRESS, TEAM, UNIT, WAVE, ZOMBIE } from '../core/config'
import type { CharacterSpec, EnemySpec } from '../core/config'
import { sweepFirstHitIndex } from '../core/weapons'
import type { ProjectileSpec, WeaponSpec } from '../core/weapons'
import { slotOffset } from '../core/formation'
import { browserStorage, submitScore } from '../core/highscore'
import {
  aggregateCharacterEffects,
  aggregateTeamEffects,
  resolveWeaponSpec,
} from '../core/items'
import type { TeamEffects } from '../core/items'
import { levelDamageMul, memberMaxHp } from '../core/levels'
import { getRun, waveStartHp } from '../core/run'
import type { RunState } from '../core/run'
import { DEFAULT_SETTINGS, loadSettings } from '../core/settings'
import type { Settings } from '../core/settings'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { randomMapPoint } from '../core/spawn'
import { norm } from '../core/vec'
import { waveAt } from '../core/waves'
import { gainXp, waveBonusXp, xpToNext } from '../core/xp'
import { applyBackground } from '../ui/background'
import { DAMAGE_FONT, ensureDamageFont } from '../ui/damageFont'
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
  coins: number
  wave: number
  seconds: number
  remainMs: number
  over: boolean
}

export interface GameOverInfo {
  wave: number
  kills: number
  level: number
  newBest: boolean
  bestWave: number
  bestKills: number
}

/** 波末结算横幅的战果（本波增量） */
export interface WaveSummary {
  wave: number
  kills: number
  coins: number
  levels: number
}

interface Member {
  emoji: string
  slot: number
  image: ImageObj
  weapons: WeaponRuntime[]
  handle: WeaponOwner
  visualOffset: { x: number; y: number }
  // 道具修正后的个体生效值
  maxHp: number
  iframesMs: number
  reviveMs: number
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
  private lineup: readonly CharacterSpec[] = []
  private members: Member[] = []
  private memberGroup!: Phaser.GameObjects.Group
  private center = { x: 0, y: 0 }
  private centerObj!: Phaser.GameObjects.Zone
  private enemies!: Phaser.GameObjects.Group
  private projectiles!: Phaser.GameObjects.Group
  private coins!: Phaser.GameObjects.Group
  private frameTargets: EnemyTarget[] = []
  private frameSlowZones: { x: number; y: number; r2: number; factor: number }[] = []
  private weaponCtx: WeaponContext = {
    scene: this,
    enemyTargets: () => this.frameTargets,
    damageEnemy: (e, d) => this.applyDamage(e as ImageObj, d),
    spawnProjectile: (x, y, angle, spec, damage) => this.spawnProjectile(x, y, angle, spec, damage),
    teamCenter: () => this.center,
    applySlow: (x, y, radius, factor) =>
      this.frameSlowZones.push({ x, y, r2: radius * radius, factor }),
    damageMul: () => this.stats.damageMul,
    cooldownMul: () => this.stats.cooldownMul,
  }
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>

  private rng = new Rng(1)
  private palette!: Palette
  private stats!: TeamStats
  private teamFx: TeamEffects = aggregateTeamEffects([])
  private settings: Settings = DEFAULT_SETTINGS
  private run!: RunState
  private damagePool: Phaser.GameObjects.BitmapText[] = []
  private damagePoolIdx = 0
  private elapsedMs = 0
  private spawnCooldownMs = 0
  private pendingSpawns = 0
  private stress = false
  private over = false
  // 本波战果基线（结算横幅展示增量用）
  private waveBaseKills = 0
  private waveBaseCoins = 0
  private waveBaseLevel = 1
  gameOverInfo?: GameOverInfo

  constructor() {
    super('arena')
  }

  perfSnapshot(): {
    enemies: number
    projectiles: number
    coins: number
    pending: number
    objects: number
    bodies: number
    combatSec: number
    spawnIntervalMs: number
    ghostShare: number
    hpMultiplier: number
  } {
    const totalSec = (this.run.combatMs + this.elapsedMs) / 1000
    const wave = waveAt(totalSec)
    return {
      enemies: this.enemies.countActive(true),
      projectiles: this.projectiles.getLength(),
      coins: this.coins.getLength(),
      pending: this.pendingSpawns,
      objects: this.children.list.length,
      bodies: this.physics.world.bodies.size,
      combatSec: Math.floor(totalSec),
      spawnIntervalMs: Math.round(this.stress ? STRESS.spawnIntervalMs : wave.spawnIntervalMs),
      ghostShare: wave.ghostShare,
      hpMultiplier: wave.hpMultiplier,
    }
  }

  hudSnapshot(): HudSnapshot {
    return {
      xp: this.run.xp.xp,
      xpNext: xpToNext(this.run.xp.level),
      level: this.run.xp.level,
      kills: this.run.kills,
      coins: this.run.coins,
      wave: this.run.wave,
      seconds: Math.floor(this.elapsedMs / 1000),
      remainMs: Math.max(0, WAVE.durationMs - this.elapsedMs),
      over: this.over,
    }
  }

  create(): void {
    // scene.restart() 复用同一实例，所有局内状态必须在这里重置
    this.rng = new Rng(Date.now() >>> 0)
    this.palette = randomPalette(this.rng)
    applyBackground(this.palette)
    this.stress = isStress()
    this.settings = loadSettings(browserStorage())
    this.stats = {
      damageMul: 1,
      cooldownMul: this.stress ? STRESS.cooldownMul : 1,
      moveSpeed: TEAM.moveSpeed,
      maxHp: this.stress ? STRESS.maxHp : MEMBER.maxHp,
    }
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
    this.run = getRun()
    // 压测固定 5 人满编便于跑分对比；正常局阵容来自 run（招募制，逐波扩编）
    const rosterIds = this.stress ? ROSTER_IDS.slice(0, 5) : this.run.roster
    this.lineup = rosterIds.map((id) => CHARACTERS[id])
    // 队长道具：团队修正（移速/磁吸/掉落/全队伤害）
    this.teamFx = aggregateTeamEffects(this.run.captainItems)
    this.stats.moveSpeed = TEAM.moveSpeed * this.teamFx.moveSpeedMul
    this.waveBaseKills = this.run.kills
    this.waveBaseCoins = this.run.coins
    this.waveBaseLevel = this.run.xp.level
    this.members = this.lineup.map((spec, slot) => this.createMember(spec.emoji, spec.weapons, slot))

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
    this.coins = this.add.group()

    // 伤害数字对象池：复用固定数量 BitmapText（见 ui/damageFont.ts）
    ensureDamageFont(this)
    this.damagePool = Array.from({ length: 64 }, () =>
      this.add.bitmapText(0, 0, DAMAGE_FONT).setFontSize(18).setOrigin(0.5).setDepth(50).setVisible(false),
    )
    this.damagePoolIdx = 0

    this.cursors = this.input.keyboard?.createCursorKeys()
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D') as
      | Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
      | undefined

    // 子弹命中走线段扫掠（sweepProjectiles），不用点重叠：低帧率下会穿模漏判
    this.physics.add.overlap(this.memberGroup, this.enemies, (m, e) =>
      this.onMemberTouched(m as unknown as ImageObj, e as unknown as ImageObj),
    )
    this.physics.add.overlap(this.memberGroup, this.coins, (_m, c) =>
      this.collectCoin(c as unknown as ImageObj),
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

    // 波次时间到 → 商店（压测模式无尽，便于性能观测）
    if (!this.stress && this.elapsedMs >= WAVE.durationMs) {
      this.endWave()
      return
    }

    this.moveTeam(delta)
    this.frameSlowZones.length = 0
    this.frameTargets = (this.enemies.getChildren() as ImageObj[])
      .filter((e) => e.active)
      .map((e) => ({ x: e.x, y: e.y, radius: (e.getData('spec') as EnemySpec).radius, ref: e }))
    this.updateMembers(delta)
    this.spawn(delta)
    this.steerEnemies()
    this.magnetCoins()
    this.sweepProjectiles()
    this.cullProjectiles()

    const cam = this.cameras.main
    reportDebug({
      scene: 'arena',
      elapsed: this.elapsedMs / 1000,
      hp: this.members.reduce((sum, m) => sum + m.hp, 0),
      alive: this.members.filter((m) => m.alive).length,
      kills: this.run.kills,
      level: this.run.xp.level,
      wave: this.run.wave,
      coins: this.run.coins,
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

  /** 波次结束：快照队伍状态进 run，未拾取的金币随场景一并消失 */
  private endWave(): void {
    this.over = true
    this.physics.pause()
    // 波末保底经验：躲避流杀得少也有基本收益（队长倍率同样生效）
    const xpMul = CAPTAINS[this.run.captainId].xpGainMul
    this.run.xp = gainXp(this.run.xp, Math.round(waveBonusXp(this.run.wave) * xpMul)).state
    this.run.combatMs += this.elapsedMs
    this.run.wave += 1
    this.run.memberHp = this.members.map((m) => (m.alive ? Math.round(m.hp) : 0))
    // 先冻结战场弹结算横幅（UIScene 渲染），停留片刻再进商店：
    // 给正在操作移动的手指留出松手时间，防止战斗输入误触商店按钮
    this.events.emit('wave-complete', {
      wave: this.run.wave - 1,
      kills: this.run.kills - this.waveBaseKills,
      coins: this.run.coins - this.waveBaseCoins,
      levels: this.run.xp.level - this.waveBaseLevel,
    } satisfies WaveSummary)
    this.time.delayedCall(WAVE.summaryMs, () => this.scene.start('shop'))
  }

  private onViewportChanged(): void {
    this.cameras.main.setZoom(viewport.renderScale)
  }

  // ── 队伍 ────────────────────────────────────────────────────

  private createMember(emoji: string, weaponSpecs: readonly WeaponSpec[], slot: number): Member {
    const off = slotOffset(slot, this.lineup.length, TEAM.ringRadius)
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
    // 等级 × 道具修正：个体属性 + 每角色独立的伤害/冷却倍率 ctx + 预算生效武器参数
    const level = this.stress ? 1 : (this.run.memberLevels[slot] ?? 1)
    const lvlDmg = levelDamageMul(level)
    const fx = aggregateCharacterEffects(this.run.memberItems[slot] ?? [])
    const memberCtx: WeaponContext = {
      ...this.weaponCtx,
      damageMul: () => this.stats.damageMul * fx.damageMul * lvlDmg * this.teamFx.teamDamageMul,
      cooldownMul: () => this.stats.cooldownMul * fx.cooldownMul,
    }
    const maxHp = this.stress ? this.stats.maxHp : memberMaxHp(level, fx.hpAdd)
    const member: Member = {
      emoji,
      slot,
      image,
      // 错开初始冷却，避免全队同帧齐射
      weapons: weaponSpecs.map((w, i) =>
        createWeapon(resolveWeaponSpec(w, fx), memberCtx, 300 + slot * 120 + i * 230),
      ),
      handle,
      visualOffset,
      maxHp,
      iframesMs: MEMBER.iframesMs + fx.iframesAddMs,
      reviveMs: Math.max(1000, TEAM.reviveMs + fx.reviveAddMs),
      // 血量跨波保留；上一波阵亡者低血量复活（压测模式不走 run 状态）
      hp: this.stress
        ? this.stats.maxHp
        : waveStartHp(this.run.memberHp[slot] ?? MEMBER.maxHp, maxHp),
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
      const off = slotOffset(m.slot, this.lineup.length, TEAM.ringRadius)
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
    const ratio = Math.max(0, m.hp / m.maxHp)
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
    if (this.elapsedMs - m.lastHitMs < m.iframesMs) return
    m.lastHitMs = this.elapsedMs
    const spec = enemy.getData('spec') as EnemySpec
    m.hp = Math.max(0, m.hp - spec.damage)
    if (this.settings.hitShake) this.cameras.main.shake(HIT_SHAKE.durationMs, HIT_SHAKE.intensity)
    m.image.setTint(0xff7777)
    this.time.delayedCall(120, () => {
      if (m.alive) m.image.clearTint()
    })
    if (m.hp <= 0) this.killMember(m)
  }

  private killMember(m: Member): void {
    m.alive = false
    m.hp = 0
    m.reviveAt = this.elapsedMs + m.reviveMs
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
    m.hp = m.maxHp
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
    p.setData('radius', spec.projectile.radius)
    p.setData('px', x)
    p.setData('py', y)
    this.projectiles.add(p)
  }

  /** 逐帧对每颗子弹做上一帧位置 → 当前位置的线段扫掠命中 */
  private sweepProjectiles(): void {
    for (const p of this.projectiles.getChildren() as ImageObj[]) {
      if (!p.active) continue
      const prev = { x: p.getData('px') as number, y: p.getData('py') as number }
      const hit = sweepFirstHitIndex(prev, { x: p.x, y: p.y }, p.getData('radius') as number, this.frameTargets)
      if (hit >= 0) {
        const damage = p.getData('damage') as number
        p.destroy()
        this.applyDamage(this.frameTargets[hit]!.ref as ImageObj, damage)
        continue
      }
      p.setData('px', p.x)
      p.setData('py', p.y)
    }
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
    this.run.kills++
    const spec = enemy.getData('spec') as EnemySpec
    // 经验击杀即得（队长可提供倍率）；金币落地等待拾取
    const xpMul = CAPTAINS[this.run.captainId].xpGainMul
    this.run.xp = gainXp(this.run.xp, Math.round(spec.xp * xpMul)).state
    const doubled = this.rng.next() < this.teamFx.doubleCoinChance ? spec.coins : 0
    this.spawnCoins(enemy.x, enemy.y, spec.coins + doubled)
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
    if (!this.settings.damageNumbers) return
    // 池满时偷用最旧的一个（结束它未完成的动画）
    const t = this.damagePool[this.damagePoolIdx]!
    this.damagePoolIdx = (this.damagePoolIdx + 1) % this.damagePool.length
    this.tweens.killTweensOf(t)
    t.setText(String(amount)).setPosition(x, y - 14).setAlpha(1).setVisible(true)
    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 350,
      onComplete: () => t.setVisible(false),
    })
  }

  // ── 刷怪 ────────────────────────────────────────────────────

  private spawn(delta: number): void {
    this.spawnCooldownMs -= delta
    if (this.spawnCooldownMs > 0) return
    // 难度按跨波累计战斗时长递增；刷怪供给随在场人数缩放（单人首发不会被满编压力淹没）
    const wave = waveAt((this.run.combatMs + this.elapsedMs) / 1000)
    const teamFactor = SPAWN.teamFactorBase + SPAWN.teamFactorPerMember * this.members.length
    this.spawnCooldownMs = this.stress ? STRESS.spawnIntervalMs : wave.spawnIntervalMs / teamFactor
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
      // 减速区域叠乘移速（寒气光环等），并给减速中的敌人上冷色调
      let speed = spec.speed
      let slowed = false
      for (const z of this.frameSlowZones) {
        const zx = e.x - z.x
        const zy = e.y - z.y
        if (zx * zx + zy * zy <= z.r2) {
          speed *= z.factor
          slowed = true
        }
      }
      if (slowed !== (e.getData('slowed') as boolean | undefined)) {
        e.setData('slowed', slowed)
        if (slowed) e.setTint(0xa5d8ff)
        else e.clearTint()
      }
      const dir = norm(best.image.x - e.x, best.image.y - e.y)
      ;(e.body as ArcadeBody).setVelocity(dir.x * speed, dir.y * speed)
    }
  }

  // ── 金币 ────────────────────────────────────────────────────

  private spawnCoins(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      // 多枚时散开一点，便于看清数量
      const jx = count > 1 ? (this.rng.next() - 0.5) * 0.6 * UNIT : 0
      const jy = count > 1 ? (this.rng.next() - 0.5) * 0.6 * UNIT : 0
      const coin = emojiImage(
        this,
        Phaser.Math.Clamp(x + jx, COIN.radius, MAP.width - COIN.radius),
        Phaser.Math.Clamp(y + jy, COIN.radius, MAP.height - COIN.radius),
        COIN.emoji,
        COIN.size,
        true,
      ).setDepth(3)
      this.physics.add.existing(coin)
      circleBody(coin, COIN.radius)
      this.coins.add(coin)
    }
  }

  private magnetCoins(): void {
    // 金币拾取是团队能力：以队伍中心为基点磁吸并入账（成员碰到也能捡，见 overlap）
    const magnetRadius = COIN.magnetRadius * this.teamFx.magnetMul
    const r2 = magnetRadius * magnetRadius
    const collect2 = COIN.collectRadius * COIN.collectRadius
    for (const c of this.coins.getChildren() as ImageObj[]) {
      if (!c.active) continue
      const dx = this.center.x - c.x
      const dy = this.center.y - c.y
      const d = dx * dx + dy * dy
      if (d <= collect2) {
        this.collectCoin(c)
        continue
      }
      const body = c.body as ArcadeBody
      if (d < r2) {
        const dir = norm(dx, dy)
        body.setVelocity(dir.x * COIN.magnetSpeed, dir.y * COIN.magnetSpeed)
      } else {
        body.setVelocity(0, 0)
      }
    }
  }

  private collectCoin(coin: ImageObj): void {
    if (!coin.active) return
    coin.destroy()
    this.run.coins += 1
  }

  // ── 结算 ────────────────────────────────────────────────────

  private gameOver(): void {
    this.over = true
    this.physics.pause()

    const result = submitScore(browserStorage(), this.run.wave, this.run.kills)
    this.gameOverInfo = {
      wave: this.run.wave,
      kills: this.run.kills,
      level: this.run.xp.level,
      newBest: result.newBest,
      bestWave: result.score.bestWave,
      bestKills: result.score.bestKills,
    }
    this.events.emit('game-over', this.gameOverInfo)

    reportDebug({
      scene: 'gameover',
      elapsed: this.elapsedMs / 1000,
      hp: 0,
      alive: 0,
      kills: this.run.kills,
      level: this.run.xp.level,
      wave: this.run.wave,
      coins: this.run.coins,
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

    // 返回入口在 UIScene 的结算浮层（按钮/空格），弃局回组队页
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
