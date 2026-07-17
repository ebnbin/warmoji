import Phaser from 'phaser'
import { BOSS, CAPTAINS, CHARACTERS, COIN, ELITE, FOLLOW, HIT_SHAKE, KNOCKBACK, MEMBER, ORBIT, ROSTER_IDS, SPAWN, STRESS, SURGE, TEAM, UNIT, VOID, WANDER, WAVE } from '../core/config'
import type { CharacterId, CharacterSpec, EnemyBulletSpec, EnemySpec } from '../core/config'
import { applyAbilities } from '../core/abilities'
import { enemyMixAt, pickEnemy } from '../core/enemies'
import type { EnemyMixEntry } from '../core/enemies'
import type { ProjectileSpec } from '../core/weapons'
import { formationPosts, ringPostAngle } from '../core/formation'
import type { FormationId } from '../core/formation'
import { angleDiff, orbitTendency, pickDriver, stepPhase, threatWeight } from '../core/orbit'
import type { OrbitThreat } from '../core/orbit'
import { browserStorage } from '../core/highscore'
import {
  aggregateCharacterEffects,
  aggregateTeamEffects,
  CRIT_MUL,
  resolveWeaponSpec,
} from '../core/items'
import type { TeamEffects } from '../core/items'
import { levelEffects, memberMaxHp } from '../core/levels'
import { currentFormation, getRun, guardOrder, isTeamFull, promoteStep, waveStartHp } from '../core/run'
import type { RunState } from '../core/run'
// 横竖屏尺寸恰好互换时，这对通用矩形重映射即纯 90° 旋转（河流图同款机制）
import { remapPoint, remapVector } from '../core/river'
import { fitAspectRect, ghostImages, torusDelta, torusDist2, wrapCoord } from '../core/void'
import { DEFAULT_SETTINGS, loadSettings } from '../core/settings'
import type { Settings } from '../core/settings'
import { MAPS } from '../core/maps'
import type { MapSpec } from '../core/maps'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { norm } from '../core/vec'
import type { Point } from '../core/vec'
import { isFinalWave, waveAt, waveDurationMs } from '../core/waves'
import { gainXp, waveBonusXp, xpToNext } from '../core/xp'
import { applyBackground } from '../ui/background'
import { DAMAGE_FONT, ensureDamageFont } from '../ui/damageFont'
import { reportDebug } from '../ui/debug'
import { isStress } from '../ui/dev'
import { emojiImage } from '../ui/emoji'
import { burstEmitter } from '../ui/fx'
import { playSfx } from '../ui/sfx'
import { UI_FONT } from '../ui/fonts'
import { textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'
import { createWeapon } from '../weapons/create'
import type { EnemyTarget, WeaponContext, WeaponOwner, WeaponRuntime } from '../weapons/types'
import type { HudSnapshot, WaveSummary } from './ArenaScene'
import type { UIScene } from './UIScene'

// 虚空竞技场（kind='void' 的关卡）：第四套独立实现，机制契约与其他
// 竞技场一致（run 状态、武器上下文、UIScene 协议、调试上报），世界模型：
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

interface TeamStats {
  damageMul: number
  cooldownMul: number
  moveSpeed: number
  maxHp: number
}

type ArcadeBody = Phaser.Physics.Arcade.Body
type ImageObj = Phaser.GameObjects.Image

interface Member {
  emoji: string
  slot: number
  image: ImageObj
  weapons: WeaponRuntime[]
  handle: WeaponOwner
  visualOffset: { x: number; y: number }
  maxHp: number
  /** 手写接触判定用的受击半径（守护中心缩小） */
  hurtRadius: number
  iframesMs: number
  reviveMs: number
  regenPerSec: number
  thorns: number
  killHeal: number
  hp: number
  alive: boolean
  reviveAt: number
  lastHitMs: number
  lastPoisonMs: number
  hpBar: Phaser.GameObjects.Graphics
  shownHpRatio: number
  deadText: Phaser.GameObjects.Text
  shownCountdown: number
  baseScale: number
  breathPhase: number
  animLockUntil: number
  followX: number
  followY: number
  followVx: number
  followVy: number
  followK: number
  wanderSeed: number
  wanderAmp: number
  hasThreat: boolean
}

function circleBody(obj: ImageObj, radius: number): void {
  const body = obj.body as ArcadeBody
  const frame = obj.width
  const r = (radius / obj.displayWidth) * frame
  body.setCircle(r, frame / 2 - r, frame / 2 - r)
}

function held(key?: Phaser.Input.Keyboard.Key): boolean {
  return key?.isDown ?? false
}

export class VoidArenaScene extends Phaser.Scene {
  private lineup: readonly CharacterSpec[] = []
  private members: Member[] = []
  private center = { x: 0, y: 0 }
  private centerObj!: Phaser.GameObjects.Zone
  private enemies!: Phaser.GameObjects.Group
  private projectiles!: Phaser.GameObjects.Group
  private enemyShots!: Phaser.GameObjects.Group
  private coins!: Phaser.GameObjects.Group
  private poisonPools: { x: number; y: number; r2: number; until: number; tickMs: number; damage: number; srcName: string; gfx: Phaser.GameObjects.Graphics }[] = []
  private enemyMix: EnemyMixEntry[] = []
  private frameTargets: EnemyTarget[] = []
  private frameSlowZones: { x: number; y: number; r2: number; factor: number }[] = []
  private frameAttractors: { x: number; y: number; r2: number }[] = []
  private burnZones: {
    x: number
    y: number
    r2: number
    until: number
    tickDamage: number
    nextTickAt: number
    srcSlot: number
    gfx: Phaser.GameObjects.Graphics
  }[] = []
  private weaponCtx: WeaponContext = {
    scene: this,
    enemyTargets: () => this.frameTargets,
    damageEnemy: (e, d, kb, sx, sy) => this.applyDamage(e as ImageObj, d, kb, sx, sy),
    spawnProjectile: (x, y, angle, spec, damage) => this.spawnProjectile(x, y, angle, spec, damage),
    teamCenter: () => this.center,
    applySlow: (x, y, radius, factor) =>
      this.frameSlowZones.push({ x, y, r2: radius * radius, factor }),
    slowEnemy: (enemy, factor, durationMs) => {
      enemy.setData('abilitySlowMul', factor)
      enemy.setData('abilitySlowUntil', this.elapsedMs + durationMs)
    },
    spawnBurnZone: (x, y, radius, dps, durationMs) => this.spawnBurnZone(x, y, radius, dps, durationMs),
    attractCoins: (x, y, radius) => this.frameAttractors.push({ x, y, r2: radius * radius }),
    damageMul: () => this.stats.damageMul,
    cooldownMul: () => this.stats.cooldownMul,
    sfx: (id) => playSfx(id),
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
  private shardPool: ImageObj[] = []
  private shardPoolIdx = 0
  private deathBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private coinBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private puffBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private teamDir = { x: 0, y: 0 }
  private postBySlot: number[] = []
  private boss?: ImageObj
  private orbitPhase = 0
  private driverPost = -1
  private elapsedMs = 0
  private spawnCooldownMs = 0
  private pendingSpawns = 0
  private stress = false
  private over = false
  private waveBaseKills = 0
  private waveBaseCoins = 0
  private waveBaseLevel = 1
  private awakeCount = 0
  // 环面竞技场：固定尺寸（横竖屏互换），相机视口居中裁剪
  private arenaW = 0
  private arenaH = 0
  private stripCams: Phaser.Cameras.Scene2D.Camera[] = []
  // 静态视觉层（地板/星空/门框）：条带相机忽略，视口变化时整体重建
  private staticVisuals: Phaser.GameObjects.GameObject[] = []
  private frameTiles: { tile: Phaser.GameObjects.TileSprite; dx: number; dy: number }[] = []
  private frameGlow?: Phaser.GameObjects.Graphics
  private pendingMarks: { pos: Point; mark: ImageObj }[] = []

  constructor() {
    super('arenaVoid')
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
    hpMultiplier: number
  } {
    const totalSec = (this.run.combatMs + this.elapsedMs) / 1000
    const wave = waveAt(totalSec)
    return {
      enemies: this.awakeCount,
      projectiles: this.projectiles.getLength(),
      coins: this.coins.getLength(),
      pending: this.pendingSpawns,
      objects: this.children.list.length,
      bodies: this.physics.world.bodies.size,
      combatSec: Math.floor(totalSec),
      spawnIntervalMs: Math.round(this.stress ? STRESS.spawnIntervalMs : wave.spawnIntervalMs),
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
      remainMs: Math.max(0, waveDurationMs(this.run.wave) - this.elapsedMs),
      over: this.over,
      bossHp: this.boss?.active ? (this.boss.getData('hp') as number) : null,
      bossMaxHp: BOSS.hp,
    }
  }

  create(): void {
    this.rng = new Rng(Date.now() >>> 0)
    this.run = getRun()
    const mapSpec = MAPS[this.run.mapId]
    this.palette = mapSpec.palette
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
    this.poisonPools = []
    this.burnZones = []
    this.frameAttractors = []
    this.awakeCount = 0
    this.boss = undefined
    this.staticVisuals = []
    this.frameTiles = []
    this.stripCams = []
    this.pendingMarks = []

    this.setupCameras()
    this.buildVoidVisuals()

    this.center = { x: this.arenaW / 2, y: this.arenaH / 2 }
    this.centerObj = this.add.zone(this.center.x, this.center.y, 1, 1)

    const rosterIds = this.stress ? ROSTER_IDS.slice(0, 5) : this.run.roster
    this.lineup = rosterIds.map((id) => CHARACTERS[id])
    const order = this.stress || !isTeamFull(this.run) ? null : guardOrder(this.run)
    this.postBySlot = rosterIds.map((id, slot) => {
      if (!order) return slot
      const post = order.indexOf(id)
      return post >= 0 ? post : slot
    })
    this.orbitPhase = 0
    this.driverPost = -1
    this.teamFx = aggregateTeamEffects(this.run.captainItems)
    this.stats.moveSpeed = TEAM.moveSpeed * this.teamFx.moveSpeedMul
    this.waveBaseKills = this.run.kills
    this.waveBaseCoins = this.run.coins
    this.waveBaseLevel = this.run.xp.level
    this.members = rosterIds.map((id, slot) => this.createMember(id, slot))

    this.enemies = this.add.group()
    this.projectiles = this.add.group()
    this.enemyShots = this.add.group()
    this.coins = this.add.group()
    this.enemyMix = enemyMixAt(this.stress ? 10 : this.run.wave)

    if (!this.stress && this.run.wave === SURGE.wave) {
      this.time.delayedCall(600, () => {
        if (this.over) return
        this.events.emit('wave-warning', {
          title: '⚠️ 精英来袭',
          sub: '敌人潮涌来，小心金边强敌！',
        })
        this.spawnSurge()
      })
    }
    if (!this.stress && this.run.wave >= WAVE.totalWaves) {
      this.time.delayedCall(600, () => {
        if (this.over) return
        this.events.emit('wave-warning', {
          title: `☠️ ${BOSS.name}出现`,
          sub: '环形战场无处可退，正面迎战！',
        })
        this.spawnBoss()
      })
    }

    this.deathBurst = burstEmitter(this, [0x8e24aa, 0xab47bc, 0x6a1b9a, 0xf3e5f5], 230)
    this.coinBurst = burstEmitter(this, [0xffb300, 0xffd54f, 0xfff8e1], 150, 340)
    this.puffBurst = burstEmitter(this, [0x757575, 0x9e9e9e, 0xe0e0e0], 130, 520)

    ensureDamageFont(this)
    this.damagePool = Array.from({ length: 64 }, () =>
      this.add.bitmapText(0, 0, DAMAGE_FONT).setFontSize(24).setOrigin(0.5).setDepth(50).setVisible(false),
    )
    this.damagePoolIdx = 0
    this.shardPool = Array.from({ length: 64 }, () =>
      this.add.image(0, 0, '__DEFAULT').setDepth(6).setVisible(false),
    )
    this.shardPoolIdx = 0

    this.cursors = this.input.keyboard?.createCursorKeys()
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D') as
      | Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
      | undefined

    // 无物理 overlap：接触判定改为手写环面圆-圆（touchChecks），缝上精确

    this.layoutTeam(0)
    // UIScene 自探测当前竞技场，launch 不传参
    this.scene.launch('ui')

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      for (const c of this.stripCams) this.cameras.remove(c)
      this.stripCams = []
      this.scene.stop('ui')
    })
  }

  update(_time: number, delta: number): void {
    if (this.over) return
    this.elapsedMs += delta

    if (!this.stress && this.elapsedMs >= waveDurationMs(this.run.wave)) {
      this.endWave()
      return
    }

    this.frameSlowZones.length = 0
    this.frameAttractors.length = 0
    this.buildTargets()
    this.updateOrbit(delta)
    this.moveTeam(delta)
    this.updateMembers(delta)
    this.touchChecks()
    this.spawn(delta)
    this.steerEnemies(delta)
    this.updateEnemyShots()
    this.updatePoisonPools()
    this.updateBurnZones()
    this.magnetCoins()
    this.sweepProjectiles(delta)
    this.cullProjectiles()
    this.wrapEntities()
    this.updatePortals(delta)

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
      enemies: this.awakeCount,
      pending: this.pendingSpawns,
      fps: Math.round(this.game.loop.actualFps),
      // 虚空图上报竞技场世界尺寸，供探针换算位置
      viewW: this.arenaW,
      viewH: this.arenaH,
      playerX: this.center.x,
      playerY: this.center.y,
      camX: cam.worldView.centerX,
      camY: cam.worldView.centerY,
      formation: this.activeFormation(),
      mapId: this.run.mapId,
    })
  }

  private endWave(): void {
    this.over = true
    this.physics.pause()
    playSfx('wave')
    const finished = isFinalWave(this.run.wave)
    const xpMul = CAPTAINS[this.run.captainId].xpGainMul * this.teamFx.xpGainMul
    this.run.xp = gainXp(this.run.xp, Math.round(waveBonusXp(this.run.wave) * xpMul)).state
    if (this.teamFx.waveHealRatio > 0) {
      for (const m of this.members) {
        if (m.alive) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * this.teamFx.waveHealRatio)
      }
    }
    if (this.teamFx.waveCoins > 0) this.run.coins += this.teamFx.waveCoins
    this.run.combatMs += this.elapsedMs
    this.run.wave += 1
    this.run.memberHp = this.members.map((m) => (m.alive ? Math.round(m.hp) : 0))
    this.events.emit('wave-complete', {
      wave: this.run.wave - 1,
      kills: this.run.kills - this.waveBaseKills,
      coins: this.run.coins - this.waveBaseCoins,
      levels: this.run.xp.level - this.waveBaseLevel,
    } satisfies WaveSummary)
    this.time.delayedCall(WAVE.summaryMs, () => {
      if (finished) this.scene.start('result', { win: true })
      else this.scene.start(promoteStep(this.run) ? 'promote' : 'shop')
    })
  }

  // ── 相机：视口裁剪 + 条带分身 ───────────────────────────────

  /** 主相机视口 = 屏幕内最大居中 16:9（多余留空白）；四缝 + 四角挂
   * 条带相机取景对侧溢出——跨缝实体两侧同时可见（渲染层的幽灵分身） */
  private setupCameras(): void {
    const landscape = viewport.logicalWidth >= viewport.logicalHeight
    this.arenaW = landscape ? VOID.arenaLong : VOID.arenaShort
    this.arenaH = landscape ? VOID.arenaShort : VOID.arenaLong
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
    const s = VOID.strip
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
        p.setData('px', p.x)
        p.setData('py', p.y)
      }
    }
    for (const c of this.coins.getChildren() as ImageObj[]) {
      if (c.active) this.wrapBody(c)
    }
  }

  // ── 队伍 ────────────────────────────────────────────────────

  private activeFormation(): FormationId {
    return this.stress ? 'ring' : currentFormation(this.run)
  }

  private currentPosts(): Point[] {
    return formationPosts(this.activeFormation(), this.lineup.length, this.orbitPhase)
  }

  private createMember(id: CharacterId, slot: number): Member {
    const spec = CHARACTERS[id]
    const emoji = spec.emoji
    const post = this.postBySlot[slot] ?? slot
    const off = this.currentPosts()[post] ?? { x: 0, y: 0 }
    const image = emojiImage(
      this,
      this.center.x + off.x,
      this.center.y + off.y,
      emoji,
      MEMBER.size,
      'player',
    ).setDepth(10 + off.y / UNIT)
    this.physics.add.existing(image)
    const guarded = this.activeFormation() === 'guard' && post === 0
    const hurtRadius = guarded ? MEMBER.radius * TEAM.guardCenterHurtboxMul : MEMBER.radius
    circleBody(image, hurtRadius)
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
    const level = this.stress ? 1 : (this.run.memberLevels[slot] ?? 1)
    const lvlFx = levelEffects(id, level)
    const fx = aggregateCharacterEffects(this.run.memberItems[slot] ?? [])
    const memberCtx: WeaponContext = {
      ...this.weaponCtx,
      damageMul: () =>
        this.stats.damageMul * fx.damageMul * lvlFx.damageMul * this.teamFx.teamDamageMul,
      cooldownMul: () => this.stats.cooldownMul * fx.cooldownMul * lvlFx.cooldownMul,
      damageEnemy: (e, d, kb, sx, sy) => {
        const crit = fx.critChance > 0 && this.rng.next() < fx.critChance
        this.applyDamage(
          e as ImageObj,
          crit ? Math.round(d * CRIT_MUL) : d,
          (kb ?? 0) * fx.knockbackMul,
          sx,
          sy,
          slot,
          crit,
        )
      },
      spawnProjectile: (x, y, angle, pSpec, damage) =>
        this.spawnProjectile(x, y, angle, pSpec, damage, slot),
      spawnBurnZone: (x, y, radius, dps, durationMs) =>
        this.spawnBurnZone(x, y, radius, dps, durationMs, slot),
    }
    const maxHp = this.stress ? this.stats.maxHp : memberMaxHp(id, level, fx.hpAdd)
    const member: Member = {
      emoji,
      slot,
      image,
      weapons: applyAbilities(id, level, spec.weapons).map((w, i) =>
        createWeapon(
          resolveWeaponSpec(w, { ...fx, rangeMul: fx.rangeMul * lvlFx.rangeMul }),
          memberCtx,
          300 + slot * 120 + i * 230,
        ),
      ),
      handle,
      visualOffset,
      maxHp,
      hurtRadius,
      iframesMs: MEMBER.iframesMs + fx.iframesAddMs,
      reviveMs: Math.max(1000, TEAM.reviveMs + fx.reviveAddMs),
      regenPerSec: fx.regenPerSec,
      thorns: fx.thorns,
      killHeal: fx.killHeal,
      hp: this.stress
        ? this.stats.maxHp
        : waveStartHp(this.run.memberHp[slot] ?? MEMBER.maxHp, maxHp),
      alive: true,
      reviveAt: 0,
      lastHitMs: -Infinity,
      lastPoisonMs: -Infinity,
      hpBar: this.add.graphics().setDepth(11),
      shownHpRatio: -1,
      deadText: this.add
        .text(0, 0, '', {
          fontFamily: UI_FONT,
          fontSize: '26px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 5,
          resolution: textRes(),
        })
        .setOrigin(0.5)
        .setDepth(12)
        .setVisible(false),
      shownCountdown: -1,
      baseScale: image.scaleX,
      breathPhase: slot * 1.3,
      animLockUntil: 0,
      followX: image.x,
      followY: image.y,
      followVx: 0,
      followVy: 0,
      followK: FOLLOW.kBase * (1 + FOLLOW.kJitter * Math.sin(slot * 12.9898)),
      wanderSeed: slot * 2.399,
      wanderAmp: 0,
      hasThreat: false,
    }
    image.setData('member', member)
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
    this.teamDir = dir
    const step = (this.stats.moveSpeed * delta) / 1000
    // 环面：不钳制，穿缝回绕
    this.center.x = wrapCoord(this.center.x + dir.x * step, this.arenaW)
    this.center.y = wrapCoord(this.center.y + dir.y * step, this.arenaH)
    this.centerObj.setPosition(this.center.x, this.center.y)
    this.layoutTeam(delta)
  }

  private updateOrbit(delta: number): void {
    if (this.members.length === 0) return
    const formation = this.activeFormation()
    const n = this.lineup.length
    const range = ORBIT.detectRange
    const rangeSq = range * range
    const wants = new Array<number>(this.members.length).fill(0)
    let rotatable = false
    for (const m of this.members) {
      m.hasThreat = false
      if (!m.alive) continue
      const bias = this.lineup[m.slot]?.orbit ?? 0
      const idx = this.postBySlot[m.slot] ?? m.slot
      const base = ringPostAngle(formation, idx, n)
      if (base !== null) rotatable = true
      const theta = (base ?? 0) + this.orbitPhase
      const threats: OrbitThreat[] = []
      // frameTargets 含镜像坐标：贴缝的威胁角度自然指向传送门
      for (const t of this.frameTargets) {
        const dx = t.x - m.image.x
        const dy = t.y - m.image.y
        const dSq = dx * dx + dy * dy
        if (dSq >= rangeSq) continue
        m.hasThreat = true
        if (base === null || bias === 0) break
        threats.push({
          diff: angleDiff(theta, Math.atan2(t.y - this.center.y, t.x - this.center.x)),
          weight: threatWeight(Math.sqrt(dSq), range),
        })
      }
      if (base !== null && bias !== 0) wants[idx] = orbitTendency(bias, threats)
    }
    if (!rotatable) return
    this.driverPost = pickDriver(
      wants.map((w) => Math.abs(w)),
      Math.random,
    )
    this.orbitPhase = stepPhase(
      this.orbitPhase,
      this.driverPost >= 0 ? (wants[this.driverPost] ?? 0) : 0,
      delta,
    )
  }

  private layoutTeam(delta: number): void {
    const posts = this.currentPosts()
    const moving = this.teamDir.x !== 0 || this.teamDir.y !== 0
    const dt = Math.min(delta, 50) / 1000
    const tSec = this.elapsedMs / 1000
    const W = this.arenaW
    const H = this.arenaH
    for (const m of this.members) {
      const idx = this.postBySlot[m.slot] ?? m.slot
      const p = posts[idx] ?? { x: 0, y: 0 }
      const wanderOn = m.alive && !moving && !m.hasThreat
      m.wanderAmp += ((wanderOn ? 1 : 0) - m.wanderAmp) * Math.min(1, delta / WANDER.rampMs)
      const wander = m.wanderAmp * WANDER.radius
      const rawTx = this.center.x + p.x + Math.sin(tSec * WANDER.freqX + m.wanderSeed) * wander
      const rawTy = this.center.y + p.y + Math.sin(tSec * WANDER.freqY + m.wanderSeed * 2.3) * wander
      // 环面弹簧：目标取离当前跟随点最近的镜像——中心穿缝时队员各自
      // 走最短路穿门，阵型全程连贯（配条带相机即两侧同时可见）
      const dT = torusDelta({ x: m.followX, y: m.followY }, { x: rawTx, y: rawTy }, W, H)
      const tx = m.followX + dT.x
      const ty = m.followY + dT.y
      if (dt > 0) {
        const k = m.followK
        const c = 2 * Math.sqrt(k) * FOLLOW.zeta
        m.followVx += (k * (tx - m.followX) - c * m.followVx) * dt
        m.followVy += (k * (ty - m.followY) - c * m.followVy) * dt
        m.followX += m.followVx * dt
        m.followY += m.followVy * dt
      }
      const lagX = tx - m.followX
      const lagY = ty - m.followY
      const lag = Math.hypot(lagX, lagY)
      if (lag > FOLLOW.maxLag) {
        const pull = 1 - FOLLOW.maxLag / lag
        m.followX += lagX * pull
        m.followY += lagY * pull
      }
      // 跟随点回绕，弹簧状态保持在竞技场内
      m.followX = wrapCoord(m.followX, W)
      m.followY = wrapCoord(m.followY, H)
      m.image.setPosition(m.followX + m.visualOffset.x, m.followY + m.visualOffset.y)
      const guarded = this.activeFormation() === 'guard' && idx === 0
      const dc = torusDelta(this.center, { x: m.followX, y: m.followY }, W, H)
      m.image.setDepth(guarded ? 8.5 : 10 + dc.y / UNIT)
      ;(m.image.body as ArcadeBody).updateFromGameObject()
      m.hpBar.setPosition(m.image.x, m.image.y)
      m.deadText.setPosition(m.image.x, m.image.y)
    }
  }

  private updateMembers(delta: number): void {
    const moving = this.teamDir.x !== 0 || this.teamDir.y !== 0
    for (const m of this.members) {
      if (m.alive) {
        if (m.regenPerSec > 0 && m.hp < m.maxHp) {
          m.hp = Math.min(m.maxHp, m.hp + (m.regenPerSec * delta) / 1000)
        }
        this.animateMember(m, moving, delta)
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

  private animateMember(m: Member, moving: boolean, delta: number): void {
    if (this.elapsedMs < m.animLockUntil) return
    const img = m.image
    m.breathPhase += delta / (moving ? 85 : 140)
    const s = Math.sin(m.breathPhase) * (moving ? 0.13 : 0.09)
    img.setScale(m.baseScale * (1 - s * 0.6), m.baseScale * (1 + s))
    if (img.rotation !== 0) img.setRotation(0)
    if (Math.abs(this.teamDir.x) > 0.2) img.setFlipX(this.teamDir.x > 0)
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
        const spec = e.getData('spec') as EnemySpec
        const rr = m.hurtRadius + spec.radius
        if (torusDist2(mp, e, W, H) <= rr * rr) this.onMemberTouched(m, e)
      }
      for (const s of this.enemyShots.getChildren() as ImageObj[]) {
        if (!s.active) continue
        const rr = m.hurtRadius + ((s.getData('radius') as number) ?? 0.2 * UNIT)
        if (torusDist2(mp, s, W, H) <= rr * rr) this.onMemberShot(m, s)
      }
    }
  }

  private onMemberTouched(m: Member, enemy: ImageObj): void {
    if (this.over || !enemy.active) return
    if (!m.alive || this.elapsedMs - m.lastHitMs < m.iframesMs) return
    m.lastHitMs = this.elapsedMs
    const spec = enemy.getData('spec') as EnemySpec
    const dmgMul = (enemy.getData('dmgMul') as number | undefined) ?? 1
    this.hurtMember(m, Math.round(spec.damage * dmgMul), 0xff7777, spec.name)
    if (m.thorns > 0 && enemy.active) {
      this.applyDamage(enemy, m.thorns, 0, undefined, undefined, m.slot)
    }
  }

  private onMemberShot(m: Member, shot: ImageObj): void {
    if (this.over || !shot.active) return
    if (!m.alive) return
    const damage = shot.getData('damage') as number
    const srcName = shot.getData('srcName') as string | undefined
    shot.destroy()
    if (this.elapsedMs - m.lastHitMs < m.iframesMs) return
    m.lastHitMs = this.elapsedMs
    this.hurtMember(m, damage, 0xff7777, srcName)
  }

  private hurtMember(m: Member, damage: number, tint: number, srcName?: string): void {
    const st = this.run.stats
    if (m.slot < st.damageTaken.length) {
      st.damageTaken[m.slot] = (st.damageTaken[m.slot] ?? 0) + damage
    }
    if (srcName) st.enemyDamage[srcName] = (st.enemyDamage[srcName] ?? 0) + damage
    m.hp = Math.max(0, m.hp - damage)
    playSfx('hurt')
    if (this.settings.hitShake) this.cameras.main.shake(HIT_SHAKE.durationMs, HIT_SHAKE.intensity)
    m.image.setTint(tint)
    this.time.delayedCall(120, () => {
      if (m.alive) m.image.clearTint()
    })
    if (m.hp <= 0) this.killMember(m)
  }

  private killMember(m: Member): void {
    m.alive = false
    m.hp = 0
    const deaths = this.run.stats.deaths
    if (m.slot < deaths.length) deaths[m.slot] = (deaths[m.slot] ?? 0) + 1
    m.reviveAt = this.elapsedMs + m.reviveMs
    m.shownCountdown = -1
    ;(m.image.body as ArcadeBody).enable = false
    m.image.setAlpha(0.35).setTint(0x888888).setRotation(0).setScale(m.baseScale)
    this.puffBurst.explode(10, m.image.x, m.image.y)
    m.hpBar.setVisible(false)
    m.deadText.setVisible(true)
    m.visualOffset.x = 0
    m.visualOffset.y = 0
    for (const w of m.weapons) w.setVisible(false)
    if (this.members.every((x) => !x.alive)) this.gameOver()
  }

  private reviveMember(m: Member): void {
    playSfx('revive')
    m.alive = true
    m.hp = m.maxHp
    m.shownHpRatio = -1
    m.lastHitMs = this.elapsedMs
    ;(m.image.body as ArcadeBody).enable = true
    m.image.setAlpha(1).clearTint()
    m.hpBar.setVisible(true)
    m.deadText.setVisible(false)
    for (const w of m.weapons) w.setVisible(true)
    m.animLockUntil = this.elapsedMs + 220
    m.image.setScale(m.baseScale * 0.3)
    this.tweens.add({ targets: m.image, scale: m.baseScale, duration: 200, ease: 'Back.easeOut' })
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
    srcSlot = -1,
  ): void {
    const p = emojiImage(this, x, y, spec.projectile.emoji, spec.projectile.size, 'player')
      .setDepth(8)
      .setRotation(angle + spec.projectile.rotationOffsetRad)
    this.physics.add.existing(p)
    circleBody(p, spec.projectile.radius)
    ;(p.body as ArcadeBody).setVelocity(
      Math.cos(angle) * spec.projectile.speed,
      Math.sin(angle) * spec.projectile.speed,
    )
    playSfx('shoot')
    p.setData('srcSlot', srcSlot)
    p.setData('damage', damage)
    p.setData('radius', spec.projectile.radius)
    p.setData('kb', spec.knockback)
    p.setData('px', x)
    p.setData('py', y)
    // 环面上子弹永远不出屏：按寿命回收
    p.setData('dieAt', this.elapsedMs + VOID.projectileLifeMs)
    if (spec.pierce) p.setData('pierce', spec.pierce)
    if (spec.splash) p.setData('splash', spec.splash)
    p.setData('spin', spec.projectile.rotationOffsetRad === 0 ? 9 : 0)
    this.projectiles.add(p)
  }

  private sweepProjectiles(delta: number): void {
    for (const p of this.projectiles.getChildren() as ImageObj[]) {
      if (!p.active) continue
      const prev = { x: p.getData('px') as number, y: p.getData('py') as number }
      const hitRefs = p.getData('hitRefs') as Set<ImageObj> | undefined
      const targets = hitRefs ? this.frameTargets.filter((t) => !hitRefs.has(t.ref as ImageObj)) : this.frameTargets
      const radius = p.getData('radius') as number
      const idx = this.firstSweepHit(prev, { x: p.x, y: p.y }, radius, targets)
      if (idx >= 0) {
        const target = targets[idx]!
        const damage = p.getData('damage') as number
        const kb = p.getData('kb') as number
        const srcSlot = p.getData('srcSlot') as number
        const splash = p.getData('splash') as { radius: number; ratio: number } | undefined
        if (splash) {
          const splashDamage = Math.max(1, Math.round(damage * splash.ratio))
          const r2 = splash.radius * splash.radius
          // 镜像间距 ≥ 短边（13.5 格）≫ 溅射半径：同一真身不会被镜像重复命中
          for (const t of this.frameTargets) {
            if (t === target || t.ref === target.ref) continue
            const dx = t.x - target.x
            const dy = t.y - target.y
            if (dx * dx + dy * dy <= r2) {
              this.applyDamage(t.ref as ImageObj, splashDamage, 0, undefined, undefined, srcSlot)
            }
          }
          this.splashEffect(target.x, target.y, splash.radius)
        }
        const pierceLeft = (p.getData('pierce') as number | undefined) ?? 0
        if (pierceLeft > 0) {
          p.setData('pierce', pierceLeft - 1)
          const set = hitRefs ?? new Set<ImageObj>()
          set.add(target.ref as ImageObj)
          p.setData('hitRefs', set)
        } else {
          p.destroy()
        }
        this.applyDamage(target.ref as ImageObj, damage, kb, prev.x, prev.y, srcSlot)
        if (!p.active) continue
      }
      const spin = p.getData('spin') as number
      if (spin > 0) p.rotation += (spin * delta) / 1000
      p.setData('px', p.x)
      p.setData('py', p.y)
    }
  }

  private firstSweepHit(
    from: Point,
    to: Point,
    radius: number,
    targets: readonly EnemyTarget[],
  ): number {
    let best = -1
    let bestT = Infinity
    const dx = to.x - from.x
    const dy = to.y - from.y
    const lenSq = dx * dx + dy * dy
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!
      const r = radius + t.radius
      const fx = t.x - from.x
      const fy = t.y - from.y
      let s = 0
      if (lenSq > 0) s = Math.max(0, Math.min(1, (fx * dx + fy * dy) / lenSq))
      const cx = fx - dx * s
      const cy = fy - dy * s
      if (cx * cx + cy * cy <= r * r && s < bestT) {
        bestT = s
        best = i
      }
    }
    return best
  }

  private splashEffect(x: number, y: number, radius: number): void {
    const ring = this.add
      .circle(x, y, radius, 0xef5350, 0.25)
      .setStrokeStyle(3, 0xef5350, 0.8)
      .setDepth(7)
      .setScale(0.3)
    this.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: 220,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    })
  }

  /** 环面上没有「飞出屏幕」：只按寿命回收 */
  private cullProjectiles(): void {
    for (const p of this.projectiles.getChildren() as ImageObj[]) {
      if (p.active && this.elapsedMs >= (p.getData('dieAt') as number)) p.destroy()
    }
  }

  private applyDamage(
    enemy: ImageObj,
    damage: number,
    knockback = 0,
    srcX?: number,
    srcY?: number,
    srcSlot = -1,
    crit = false,
  ): void {
    if (!enemy.active) return
    const hpBefore = enemy.getData('hp') as number
    const hp = hpBefore - damage
    const st = this.run.stats
    if (srcSlot >= 0 && srcSlot < st.damage.length) {
      st.damage[srcSlot] = (st.damage[srcSlot] ?? 0) + Math.min(damage, Math.max(0, hpBefore))
      if (hp <= 0) st.kills[srcSlot] = (st.kills[srcSlot] ?? 0) + 1
    }
    this.floatDamage(enemy.x, enemy.y, damage, crit)
    if (enemy.getData('kbImmune')) knockback = 0
    if (hp <= 0) {
      if (knockback > 0 && srcX !== undefined && srcY !== undefined) {
        // 击退方向用环面差：从缝对面打来的子弹把敌人往缝里揍
        const d = torusDelta({ x: srcX, y: srcY }, enemy, this.arenaW, this.arenaH)
        const dir = norm(d.x, d.y)
        this.killEnemy(enemy, dir.x * knockback, dir.y * knockback, srcSlot)
      } else {
        this.killEnemy(enemy, 0, 0, srcSlot)
      }
    } else {
      enemy.setData('hp', hp)
      playSfx('hit')
      enemy.setData('flashUntil', this.elapsedMs + 70)
      enemy.setTintFill(0xffffff)
      if (knockback > 0 && srcX !== undefined && srcY !== undefined) {
        const d = torusDelta({ x: srcX, y: srcY }, enemy, this.arenaW, this.arenaH)
        const dir = norm(d.x, d.y)
        let kvx = ((enemy.getData('kvx') as number) ?? 0) + dir.x * knockback
        let kvy = ((enemy.getData('kvy') as number) ?? 0) + dir.y * knockback
        const len = Math.hypot(kvx, kvy)
        if (len > KNOCKBACK.maxSpeed) {
          kvx = (kvx / len) * KNOCKBACK.maxSpeed
          kvy = (kvy / len) * KNOCKBACK.maxSpeed
        }
        enemy.setData('kvx', kvx)
        enemy.setData('kvy', kvy)
      }
    }
  }

  private killEnemy(enemy: ImageObj, flingVx = 0, flingVy = 0, srcSlot = -1): void {
    this.run.kills++
    playSfx('kill')
    const spec = enemy.getData('spec') as EnemySpec
    const elite = !!enemy.getData('elite')
    const isBoss = !!enemy.getData('boss')
    const st = this.run.stats
    st.enemyKills[spec.name] = (st.enemyKills[spec.name] ?? 0) + 1
    if (elite) st.eliteKills += 1
    const killer = this.members[srcSlot]
    if (killer?.alive && killer.killHeal > 0) {
      killer.hp = Math.min(killer.maxHp, killer.hp + killer.killHeal)
    }
    const xpMul =
      CAPTAINS[this.run.captainId].xpGainMul * this.teamFx.xpGainMul * (elite ? ELITE.xpMul : 1)
    const gained = gainXp(this.run.xp, Math.round(spec.xp * xpMul))
    this.run.xp = gained.state
    if (gained.levelsGained > 0) playSfx('levelup')
    const eaten = (enemy.getData('eaten') as number) || 0
    const baseCoins = spec.coins * (elite ? ELITE.coinsMul : 1)
    const doubled = this.rng.next() < this.teamFx.doubleCoinChance ? baseCoins : 0
    this.spawnCoins(enemy.x, enemy.y, baseCoins + doubled + eaten + (eaten > 0 ? 1 : 0))
    if (isBoss) {
      this.boss = undefined
      this.deathBurst.explode(24, enemy.x, enemy.y)
      this.time.delayedCall(700, () => {
        if (!this.over) this.endWave()
      })
    }
    if (spec.behavior === 'chase' && spec.poison) {
      this.spawnPoisonPool(enemy.x, enemy.y, spec.poison, spec.name)
    }
    if (spec.behavior === 'chase' && spec.split && !this.over) {
      const hpMul = waveAt((this.run.combatMs + this.elapsedMs) / 1000).hpMultiplier
      for (let i = 0; i < spec.split.count; i++) {
        const a = this.rng.next() * Math.PI * 2
        this.materializeEnemy(
          spec.split.into,
          enemy.x + Math.cos(a) * 0.5 * UNIT,
          enemy.y + Math.sin(a) * 0.5 * UNIT,
          Math.round(spec.split.into.hp * hpMul),
        )
      }
    }
    enemy.setActive(false)
    ;(enemy.body as ArcadeBody).enable = false
    this.deathBurst.explode(6, enemy.x, enemy.y)
    this.tweens.killTweensOf(enemy)
    this.spawnShards(enemy, flingVx, flingVy)
    enemy.destroy()
  }

  private spawnShards(enemy: ImageObj, flingVx: number, flingVy: number): void {
    const tex = enemy.texture
    if (!tex.has('shard0')) {
      const sw = tex.source[0]!.width
      const sh = tex.source[0]!.height
      tex.add('shard0', 0, 0, 0, sw / 2, sh / 2)
      tex.add('shard1', 0, sw / 2, 0, sw / 2, sh / 2)
      tex.add('shard2', 0, 0, sh / 2, sw / 2, sh / 2)
      tex.add('shard3', 0, sw / 2, sh / 2, sw / 2, sh / 2)
      tex.firstFrame = '__BASE'
    }
    const dw = enemy.displayWidth / 2
    const dh = enemy.displayHeight / 2
    const t = KNOCKBACK.deathSlideMs / 1000
    for (let i = 0; i < 4; i++) {
      const shard = this.shardPool[this.shardPoolIdx]!
      this.shardPoolIdx = (this.shardPoolIdx + 1) % this.shardPool.length
      this.tweens.killTweensOf(shard)
      const col = i % 2 === 0 ? -1 : 1
      const ox = (enemy.flipX ? -col : col) * (dw / 2)
      const oy = (i < 2 ? -1 : 1) * (dh / 2)
      shard
        .setTexture(tex.key, `shard${i}`)
        .setDisplaySize(dw, dh)
        .setFlipX(enemy.flipX)
        .setPosition(enemy.x + ox, enemy.y + oy)
        .setRotation(0)
        .setAlpha(1)
        .setVisible(true)
      const dir = norm(ox, oy)
      const scatter = 45 + this.rng.next() * 65
      const vx = flingVx + dir.x * scatter
      const vy = flingVy + dir.y * scatter
      this.tweens.add({
        targets: shard,
        x: shard.x + vx * t,
        y: shard.y + vy * t,
        scale: shard.scaleX * 0.2,
        rotation: (this.rng.next() - 0.5) * 6,
        alpha: 0,
        duration: KNOCKBACK.deathSlideMs,
        onComplete: () => shard.setVisible(false),
      })
    }
  }

  private floatDamage(x: number, y: number, amount: number, crit = false): void {
    if (!this.settings.damageNumbers) return
    const t = this.damagePool[this.damagePoolIdx]!
    this.damagePoolIdx = (this.damagePoolIdx + 1) % this.damagePool.length
    this.tweens.killTweensOf(t)
    t.setFontSize(crit ? 34 : 24).setTint(crit ? 0xffd54f : 0xffffff)
    t.setText(String(amount)).setPosition(x, y - 14).setAlpha(1).setVisible(true)
    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 350,
      onComplete: () => t.setVisible(false),
    })
  }

  // ── 刷怪（全场随机；环面上无所谓贴边）───────────────────────

  private spawn(delta: number): void {
    this.spawnCooldownMs -= delta
    if (this.spawnCooldownMs > 0) return
    const wave = waveAt((this.run.combatMs + this.elapsedMs) / 1000)
    const teamFactor = SPAWN.teamFactorBase + SPAWN.teamFactorPerMember * this.members.length
    const relief = !this.stress && isFinalWave(this.run.wave) ? BOSS.spawnRelief : 1
    this.spawnCooldownMs = this.stress
      ? STRESS.spawnIntervalMs
      : (wave.spawnIntervalMs * relief) / teamFactor
    const cap = this.stress ? STRESS.maxAlive : SPAWN.maxAlive
    const batch = this.stress ? STRESS.spawnBatch : 1
    for (let i = 0; i < batch; i++) {
      if (this.awakeCount + this.pendingSpawns >= cap) return
      this.spawnOne(wave.hpMultiplier)
    }
  }

  private spawnPoint(): Point {
    return { x: this.rng.next() * this.arenaW, y: this.rng.next() * this.arenaH }
  }

  private spawnOne(hpMultiplier: number, forceElite = false): void {
    const spec = pickEnemy(this.enemyMix, () => this.rng.next())
    const elite =
      !this.stress &&
      (forceElite ||
        (this.run.wave >= ELITE.fromWave && this.rng.next() < ELITE.chance))
    const hp = Math.round(spec.hp * hpMultiplier * (elite ? ELITE.hpMul : 1))
    const pos = this.spawnPoint()

    this.pendingSpawns++
    const mark = emojiImage(this, pos.x, pos.y, SPAWN.markEmoji, SPAWN.markSize)
      .setDepth(4)
      .setAlpha(0)
    const entry = { pos, mark }
    this.pendingMarks.push(entry)
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
      this.pendingMarks = this.pendingMarks.filter((x) => x !== entry)
      if (!this.over) this.materializeEnemy(spec, pos.x, pos.y, hp, elite)
    })
  }

  private spawnSurge(): void {
    const hpMul = waveAt((this.run.combatMs + this.elapsedMs) / 1000).hpMultiplier
    for (let i = 0; i < SURGE.count; i++) {
      this.time.delayedCall((i * SURGE.spreadMs) / SURGE.count, () => {
        if (!this.over) this.spawnOne(hpMul, i < SURGE.elites)
      })
    }
  }

  private spawnBoss(): void {
    // Boss 落点：距队伍环面距离 ≥5 格的随机点（采样兜底）
    let pos = this.spawnPoint()
    for (let i = 0; i < 24; i++) {
      pos = this.spawnPoint()
      if (torusDist2(pos, this.center, this.arenaW, this.arenaH) >= 5 * UNIT * (5 * UNIT)) break
    }
    this.pendingSpawns++
    const mark = emojiImage(this, pos.x, pos.y, SPAWN.markEmoji, SPAWN.markSize * 2).setDepth(4).setAlpha(0)
    const entry = { pos, mark }
    this.pendingMarks.push(entry)
    this.tweens.add({ targets: mark, alpha: 1, duration: SPAWN.telegraphMs / 4, yoyo: true, repeat: 3 })
    this.time.delayedCall(SPAWN.telegraphMs * 1.6, () => {
      mark.destroy()
      this.pendingSpawns--
      this.pendingMarks = this.pendingMarks.filter((x) => x !== entry)
      if (this.over) return
      const enemy = emojiImage(this, pos.x, pos.y, BOSS.emoji, BOSS.size, 'elite').setDepth(7)
      this.physics.add.existing(enemy)
      circleBody(enemy, BOSS.radius)
      const bossSpec = {
        behavior: 'boss',
        emoji: BOSS.emoji,
        name: BOSS.name,
        size: BOSS.size,
        radius: BOSS.radius,
        hp: BOSS.hp,
        speed: BOSS.speed,
        damage: BOSS.damage,
        xp: BOSS.xp,
        coins: BOSS.coins,
      } as unknown as EnemySpec
      enemy.setData('hp', BOSS.hp)
      enemy.setData('spec', bossSpec)
      enemy.setData('boss', true)
      enemy.setData('kbImmune', true)
      enemy.setData('eaten', 0)
      enemy.setData('ph', 0)
      enemy.setData('state', 'chase')
      enemy.setData('nextRingAt', this.elapsedMs + 1800)
      enemy.setData('nextDashAt', this.elapsedMs + 3600)
      this.enemies.add(enemy)
      this.boss = enemy
      playSfx('boom')
      const targetScale = enemy.scale
      enemy.setScale(targetScale * 0.2).setAlpha(0.2)
      this.tweens.add({ targets: enemy, scale: targetScale, alpha: 1, duration: 320, ease: 'Back.easeOut' })
    })
  }

  private materializeEnemy(spec: EnemySpec, x: number, y: number, hp: number, elite = false): void {
    // 落点回绕（分裂怪贴缝溅出等情况直接绕到对侧）
    x = wrapCoord(x, this.arenaW)
    y = wrapCoord(y, this.arenaH)
    const enemy = emojiImage(
      this,
      x,
      y,
      spec.emoji,
      spec.size * (elite ? ELITE.sizeMul : 1),
      elite ? 'elite' : 'enemy',
    ).setDepth(5)
    if (elite) {
      enemy.setData('elite', true)
      enemy.setData('spMul', ELITE.speedMul)
      enemy.setData('dmgMul', ELITE.damageMul)
    }
    this.physics.add.existing(enemy)
    circleBody(enemy, spec.radius)
    enemy.setData('hp', hp)
    enemy.setData('spec', spec)
    enemy.setData('state', 'wander')
    enemy.setData('dirX', Math.cos(this.rng.next() * Math.PI * 2))
    enemy.setData('dirY', Math.sin(this.rng.next() * Math.PI * 2))
    enemy.setData('turnAt', this.elapsedMs + 600 + this.rng.next() * 900)
    enemy.setData('fireAt', this.elapsedMs + 900 + this.rng.next() * 1500)
    enemy.setData('eaten', 0)
    enemy.setData('ph', this.rng.next() * Math.PI * 2)
    this.enemies.add(enemy)
    const targetScale = enemy.scale
    enemy.setScale(targetScale * 0.3).setAlpha(0.3)
    this.tweens.add({ targets: enemy, scale: targetScale, alpha: 1, duration: 130 })
  }

  // ── 索敌目标：真身 + 三镜像（武器隔门瞄准的关键）─────────────

  private buildTargets(): void {
    const targets: EnemyTarget[] = []
    let count = 0
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      count++
      const radius = (e.getData('spec') as EnemySpec).radius
      targets.push({ x: e.x, y: e.y, radius, ref: e })
      for (const g of ghostImages(e, this.arenaW, this.arenaH)) {
        targets.push({ x: g.x, y: g.y, radius, ref: e })
      }
    }
    this.awakeCount = count
    this.frameTargets = targets
  }

  // ── 敌人 AI（全部几何走环面最短差）──────────────────────────

  private slowFactorFor(e: ImageObj): number {
    let factor = 1
    for (const z of this.frameSlowZones) {
      if (torusDist2(e, z, this.arenaW, this.arenaH) <= z.r2) factor *= z.factor
    }
    const slowed = factor < 1
    if (slowed !== (e.getData('slowed') as boolean | undefined)) {
      e.setData('slowed', slowed)
      if (slowed) e.setTint(0xa5d8ff)
      else e.clearTint()
    }
    const abilityUntil = e.getData('abilitySlowUntil') as number | undefined
    if (abilityUntil !== undefined && this.elapsedMs < abilityUntil) {
      factor *= (e.getData('abilitySlowMul') as number) ?? 1
    }
    return factor * ((e.getData('spMul') as number | undefined) ?? 1) * this.teamFx.enemySlowMul
  }

  private wanderDir(e: ImageObj): { x: number; y: number } {
    if (this.elapsedMs >= (e.getData('turnAt') as number)) {
      const a = this.rng.next() * Math.PI * 2
      e.setData('dirX', Math.cos(a))
      e.setData('dirY', Math.sin(a))
      e.setData('turnAt', this.elapsedMs + 800 + this.rng.next() * 1200)
    }
    return { x: e.getData('dirX') as number, y: e.getData('dirY') as number }
  }

  private nearestAlive(x: number, y: number): Member | undefined {
    let best: Member | undefined
    let bestD = Infinity
    const p = { x, y }
    for (const m of this.members) {
      if (!m.alive) continue
      const d = torusDist2(p, m.image, this.arenaW, this.arenaH)
      if (d < bestD) {
        bestD = d
        best = m
      }
    }
    return best
  }

  private steerEnemies(delta: number): void {
    const alive = this.aliveMembers()
    if (alive.length === 0) return
    const now = this.elapsedMs
    const W = this.arenaW
    const H = this.arenaH
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      const spec = e.getData('spec') as EnemySpec
      const body = e.body as ArcadeBody
      const flashUntil = e.getData('flashUntil') as number | undefined
      if (flashUntil !== undefined && now >= flashUntil) {
        e.setData('flashUntil', undefined)
        e.clearTint()
        e.setData('slowed', undefined)
        if (e.getData('state') === 'windup') e.setTint(0xffb74d)
      }
      const slow = this.slowFactorFor(e)
      const target = this.nearestAlive(e.x, e.y)!

      if (e.getData('boss')) {
        this.steerBoss(e, body, slow, now)
        continue
      }

      switch (spec.behavior) {
        case 'chase': {
          const d = torusDelta(e, target.image, W, H)
          const dir = norm(d.x, d.y)
          body.setVelocity(dir.x * spec.speed * slow, dir.y * spec.speed * slow)
          break
        }
        case 'wanderFire': {
          const dir = this.wanderDir(e)
          body.setVelocity(dir.x * spec.speed * slow, dir.y * spec.speed * slow)
          if (now >= (e.getData('fireAt') as number)) {
            e.setData('fireAt', now + spec.fireIntervalMs)
            this.spawnEnemyShot(
              e.x,
              e.y,
              Math.atan2(dir.y, dir.x),
              spec.bullet,
              spec.name,
              (e.getData('dmgMul') as number | undefined) ?? 1,
            )
          }
          break
        }
        case 'dash': {
          const state = e.getData('state') as string
          const d = torusDelta(e, target.image, W, H)
          const dist2 = d.x * d.x + d.y * d.y
          if (state === 'windup') {
            body.setVelocity(0, 0)
            e.setRotation(Math.sin(now / 28) * 0.14)
            if (now >= (e.getData('windupUntil') as number)) {
              e.setData('state', 'dash')
              e.setData('dashUntil', now + (spec.dashDist / spec.dashSpeed) * 1000)
              e.setRotation(0)
              e.clearTint()
            }
          } else if (state === 'dash') {
            const dx = e.getData('dirX') as number
            const dy = e.getData('dirY') as number
            body.setVelocity(dx * spec.dashSpeed * slow, dy * spec.dashSpeed * slow)
            if (now >= (e.getData('dashUntil') as number)) {
              e.setData('state', 'cool')
              e.setData('coolUntil', now + spec.cooldownMs)
            }
          } else if (
            state !== 'cool' &&
            dist2 <= spec.detectRange * spec.detectRange
          ) {
            const dir = norm(d.x, d.y)
            e.setData('state', 'windup')
            e.setData('windupUntil', now + spec.windupMs)
            e.setData('dirX', dir.x)
            e.setData('dirY', dir.y)
            e.setTint(0xffb74d)
          } else {
            if (state === 'cool' && now >= (e.getData('coolUntil') as number)) {
              e.setData('state', 'wander')
            }
            const dir = this.wanderDir(e)
            body.setVelocity(dir.x * spec.speed * slow, dir.y * spec.speed * slow)
          }
          break
        }
        case 'fleeFire': {
          const d = torusDelta(e, target.image, W, H)
          const dist2 = d.x * d.x + d.y * d.y
          if (dist2 <= spec.fleeRange * spec.fleeRange) {
            // 逃离环面最近的你——可能一头扎进传送门
            const away = norm(-d.x, -d.y)
            body.setVelocity(away.x * spec.speed * slow, away.y * spec.speed * slow)
          } else {
            const dir = this.wanderDir(e)
            body.setVelocity(dir.x * spec.speed * 0.4 * slow, dir.y * spec.speed * 0.4 * slow)
          }
          if (now >= (e.getData('fireAt') as number)) {
            e.setData('fireAt', now + spec.fireIntervalMs)
            this.spawnEnemyShot(
              e.x,
              e.y,
              Math.atan2(d.y, d.x),
              spec.bullet,
              spec.name,
              (e.getData('dmgMul') as number | undefined) ?? 1,
            )
          }
          break
        }
        case 'coinThief': {
          let coin: ImageObj | undefined
          let bestD = Infinity
          for (const c of this.coins.getChildren() as ImageObj[]) {
            if (!c.active) continue
            const d2 = torusDist2(e, c, W, H)
            if (d2 < bestD) {
              bestD = d2
              coin = c
            }
          }
          if (coin) {
            const eatR = spec.radius + COIN.radius
            if (bestD <= eatR * eatR) {
              coin.destroy()
              e.setData('eaten', ((e.getData('eaten') as number) ?? 0) + 1)
            } else {
              const d = torusDelta(e, coin, W, H)
              const dir = norm(d.x, d.y)
              body.setVelocity(dir.x * spec.speed * slow, dir.y * spec.speed * slow)
            }
          } else {
            const dir = this.wanderDir(e)
            body.setVelocity(dir.x * spec.speed * 0.3 * slow, dir.y * spec.speed * 0.3 * slow)
          }
          break
        }
      }

      const kvx = e.getData('kvx') as number | undefined
      if (kvx !== undefined) {
        const kvy = e.getData('kvy') as number
        body.velocity.x += kvx
        body.velocity.y += kvy
        const decay = Math.exp(-delta / KNOCKBACK.tauMs)
        if ((kvx * kvx + kvy * kvy) * decay * decay < 100) {
          e.setData('kvx', undefined)
          e.setData('kvy', undefined)
        } else {
          e.setData('kvx', kvx * decay)
          e.setData('kvy', kvy * decay)
        }
      }

      const state = e.getData('state') as string
      if (state === 'dash') {
        e.setRotation((e.getData('dirX') as number) * 0.3)
        e.setFlipX((e.getData('dirX') as number) > 0)
      } else if (state !== 'windup') {
        e.setRotation(Math.sin(now / 95 + (e.getData('ph') as number)) * 0.1)
        const vx = body.velocity.x
        if (Math.abs(vx) > 8) e.setFlipX(vx > 0)
      }
    }
  }

  private steerBoss(e: ImageObj, body: ArcadeBody, slow: number, now: number): void {
    const state = e.getData('state') as string
    if (now >= (e.getData('nextRingAt') as number)) {
      e.setData('nextRingAt', now + BOSS.ring.intervalMs)
      const rot = this.rng.next() * Math.PI * 2
      for (let i = 0; i < BOSS.ring.count; i++) {
        this.spawnEnemyShot(e.x, e.y, rot + (i * 2 * Math.PI) / BOSS.ring.count, BOSS.ring.bullet, BOSS.name)
      }
      playSfx('boom')
    }
    if (state === 'windup') {
      body.setVelocity(0, 0)
      e.setRotation(Math.sin(now / 26) * 0.12)
      if (now >= (e.getData('windupUntil') as number)) {
        const d = torusDelta(e, this.center, this.arenaW, this.arenaH)
        const dir = norm(d.x, d.y)
        e.setData('state', 'dash')
        e.setData('dashUntil', now + BOSS.dash.durationMs)
        e.setData('dirX', dir.x)
        e.setData('dirY', dir.y)
        e.setRotation(0)
        e.clearTint()
        playSfx('whoosh')
      }
      return
    }
    if (state === 'dash') {
      const dx = e.getData('dirX') as number
      const dy = e.getData('dirY') as number
      body.setVelocity(dx * BOSS.dash.speed * slow, dy * BOSS.dash.speed * slow)
      if (now >= (e.getData('dashUntil') as number)) {
        e.setData('state', 'chase')
        e.setData('nextDashAt', now + BOSS.dash.intervalMs)
      }
      return
    }
    if (now >= (e.getData('nextDashAt') as number)) {
      e.setData('state', 'windup')
      e.setData('windupUntil', now + BOSS.dash.windupMs)
      e.setTint(0xffb74d)
      return
    }
    const d = torusDelta(e, this.center, this.arenaW, this.arenaH)
    const dir = norm(d.x, d.y)
    body.setVelocity(dir.x * BOSS.speed * slow, dir.y * BOSS.speed * slow)
  }

  // ── 敌方子弹与地面区域 ──────────────────────────────────────

  private spawnEnemyShot(
    x: number,
    y: number,
    angle: number,
    bullet: EnemyBulletSpec,
    srcName: string,
    dmgMul = 1,
  ): void {
    const shot = emojiImage(this, x, y, bullet.emoji, bullet.size, 'enemyShot').setDepth(6)
    this.physics.add.existing(shot)
    circleBody(shot, bullet.radius)
    ;(shot.body as ArcadeBody).setVelocity(Math.cos(angle) * bullet.speed, Math.sin(angle) * bullet.speed)
    shot.setData('damage', Math.round(bullet.damage * dmgMul))
    shot.setData('srcName', srcName)
    shot.setData('radius', bullet.radius)
    shot.setData('dieAt', this.elapsedMs + bullet.lifeMs)
    this.enemyShots.add(shot)
  }

  private updateEnemyShots(): void {
    for (const s of this.enemyShots.getChildren() as ImageObj[]) {
      if (!s.active) continue
      if (this.elapsedMs >= (s.getData('dieAt') as number)) s.destroy()
    }
  }

  private spawnPoisonPool(
    x: number,
    y: number,
    poison: { radius: number; durationMs: number; tickMs: number; damage: number },
    srcName: string,
  ): void {
    const gfx = this.add.graphics().setDepth(2)
    gfx.fillStyle(0x7cb342, 0.22)
    gfx.fillCircle(0, 0, poison.radius)
    gfx.lineStyle(2, 0x7cb342, 0.5)
    gfx.strokeCircle(0, 0, poison.radius)
    gfx.setPosition(x, y)
    gfx.setScale(0.3)
    this.tweens.add({ targets: gfx, scale: 1, duration: 220, ease: 'Back.easeOut' })
    this.poisonPools.push({
      x,
      y,
      r2: poison.radius * poison.radius,
      until: this.elapsedMs + poison.durationMs,
      tickMs: poison.tickMs,
      damage: poison.damage,
      srcName,
      gfx,
    })
  }

  private updatePoisonPools(): void {
    if (this.poisonPools.length === 0) return
    const now = this.elapsedMs
    this.poisonPools = this.poisonPools.filter((p) => {
      if (now >= p.until) {
        this.tweens.add({ targets: p.gfx, alpha: 0, duration: 250, onComplete: () => p.gfx.destroy() })
        return false
      }
      return true
    })
    for (const pool of this.poisonPools) {
      for (const m of this.members) {
        if (!m.alive || now - m.lastPoisonMs < pool.tickMs) continue
        if (torusDist2(m.image, pool, this.arenaW, this.arenaH) <= pool.r2) {
          m.lastPoisonMs = now
          this.hurtMember(m, pool.damage, 0xa5d6a7, pool.srcName)
        }
      }
    }
  }

  private spawnBurnZone(
    x: number,
    y: number,
    radius: number,
    dps: number,
    durationMs: number,
    srcSlot = -1,
  ): void {
    const gfx = this.add.graphics().setDepth(2)
    gfx.fillStyle(0xff7043, 0.2)
    gfx.fillCircle(0, 0, radius)
    gfx.lineStyle(2, 0xff7043, 0.55)
    gfx.strokeCircle(0, 0, radius)
    gfx.setPosition(x, y)
    gfx.setScale(0.3)
    this.tweens.add({ targets: gfx, scale: 1, duration: 200, ease: 'Back.easeOut' })
    const tickMs = 400
    this.burnZones.push({
      x,
      y,
      r2: radius * radius,
      until: this.elapsedMs + durationMs,
      tickDamage: Math.max(1, Math.round((dps * tickMs) / 1000)),
      nextTickAt: this.elapsedMs + tickMs,
      srcSlot,
      gfx,
    })
  }

  private updateBurnZones(): void {
    if (this.burnZones.length === 0) return
    const now = this.elapsedMs
    this.burnZones = this.burnZones.filter((z) => {
      if (now >= z.until) {
        this.tweens.add({ targets: z.gfx, alpha: 0, duration: 250, onComplete: () => z.gfx.destroy() })
        return false
      }
      return true
    })
    for (const z of this.burnZones) {
      if (now < z.nextTickAt) continue
      z.nextTickAt = now + 400
      // frameTargets 含镜像：镜像间距 ≥ 短边 ≫ 燃烧半径，同一真身不会重复命中
      for (const t of this.frameTargets) {
        const dx = t.x - z.x
        const dy = t.y - z.y
        if (dx * dx + dy * dy <= z.r2) {
          this.applyDamage(t.ref as ImageObj, z.tickDamage, 0, undefined, undefined, z.srcSlot)
        }
      }
    }
  }

  // ── 金币（磁吸走环面最短路，可穿门飞向玩家）──────────────────

  private spawnCoins(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const jx = count > 1 ? (this.rng.next() - 0.5) * 0.6 * UNIT : 0
      const jy = count > 1 ? (this.rng.next() - 0.5) * 0.6 * UNIT : 0
      const coin = emojiImage(
        this,
        wrapCoord(x + jx, this.arenaW),
        wrapCoord(y + jy, this.arenaH),
        COIN.emoji,
        COIN.size,
        'player',
      ).setDepth(3)
      this.physics.add.existing(coin)
      circleBody(coin, COIN.radius)
      this.coins.add(coin)
      const base = coin.scaleX
      coin.setScale(base * 0.3)
      this.tweens.add({ targets: coin, scale: base, duration: 160, ease: 'Back.easeOut' })
    }
  }

  private magnetCoins(): void {
    const magnetRadius = COIN.magnetRadius * this.teamFx.magnetMul
    const r2 = magnetRadius * magnetRadius
    const collect2 = COIN.collectRadius * COIN.collectRadius
    const W = this.arenaW
    const H = this.arenaH
    for (const c of this.coins.getChildren() as ImageObj[]) {
      if (!c.active) continue
      if (this.frameAttractors.length > 0) {
        let taken = false
        for (const a of this.frameAttractors) {
          if (torusDist2(c, a, W, H) <= a.r2) {
            this.collectCoin(c)
            taken = true
            break
          }
        }
        if (taken) continue
      }
      const d = torusDelta(c, this.center, W, H)
      const dist2 = d.x * d.x + d.y * d.y
      if (dist2 <= collect2) {
        this.collectCoin(c)
        continue
      }
      const body = c.body as ArcadeBody
      if (dist2 < r2) {
        const dir = norm(d.x, d.y)
        body.setVelocity(dir.x * COIN.magnetSpeed, dir.y * COIN.magnetSpeed)
      } else {
        body.setVelocity(0, 0)
      }
    }
  }

  private collectCoin(coin: ImageObj): void {
    if (!coin.active) return
    this.coinBurst.explode(4, coin.x, coin.y)
    playSfx('coin')
    coin.destroy()
    this.run.coins += 1
  }

  // ── 结算 ────────────────────────────────────────────────────

  private gameOver(): void {
    this.over = true
    this.physics.pause()
    playSfx('over')
    this.run.combatMs += this.elapsedMs
    this.time.delayedCall(900, () => this.scene.start('result', { win: false }))
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
    const f = VOID.frame
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
    const th = Math.round(VOID.frame)
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

  private onViewportChanged(): void {
    const fromW = this.arenaW
    const fromH = this.arenaH
    const fromHorizontal = fromW >= fromH
    this.setupCameras()
    const toHorizontal = this.arenaW >= this.arenaH

    const map = (p: Point): Point => remapPoint(p, fromW, fromH, this.arenaW, this.arenaH)
    const rot = (v: Point): Point =>
      remapVector(v, fromHorizontal, toHorizontal)

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
      const dx = e.getData('dirX') as number | undefined
      if (dx !== undefined) {
        const d = rot({ x: dx, y: e.getData('dirY') as number })
        e.setData('dirX', d.x)
        e.setData('dirY', d.y)
      }
      const kvx = e.getData('kvx') as number | undefined
      if (kvx !== undefined) {
        const kv = rot({ x: kvx, y: e.getData('kvy') as number })
        e.setData('kvx', kv.x)
        e.setData('kvy', kv.y)
      }
    }
    for (const s of this.enemyShots.getChildren() as ImageObj[]) {
      if (s.active) remapBody(s)
    }
    for (const p of this.projectiles.getChildren() as ImageObj[]) {
      if (!p.active) continue
      remapBody(p)
      p.setData('px', p.x)
      p.setData('py', p.y)
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
