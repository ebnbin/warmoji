import Phaser from 'phaser'
import { BOSS, CAPTAINS, CHARACTERS, COIN, ELITE, FOLLOW, HIT_SHAKE, INFINITE, KNOCKBACK, MEMBER, ORBIT, RIVER, ROSTER_IDS, SPAWN, STRESS, SURGE, TEAM, UNIT, WANDER, WAVE } from '../core/config'
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
import {
  clampToRiver,
  driftProfile,
  flowVector,
  isHorizontal,
  pastDownstream,
  remapPoint,
  remapVector,
  riverRect,
} from '../core/river'
import type { RiverRect } from '../core/river'
import { DEFAULT_SETTINGS, loadSettings } from '../core/settings'
import type { Settings } from '../core/settings'
import { MAPS } from '../core/maps'
import type { MapSpec } from '../core/maps'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { norm } from '../core/vec'
import type { Point } from '../core/vec'
import { isFinalWave, waveAt, waveDurationMs } from '../core/waves'
import { isWithinActive } from '../core/world'
import { gainXp, waveBonusXp, xpToNext } from '../core/xp'
import { applyBackground } from '../ui/background'
import { DAMAGE_FONT, ensureDamageFont } from '../ui/damageFont'
import { reportDebug } from '../ui/debug'
import { isStress } from '../ui/dev'
import { emojiImage } from '../ui/emoji'
import { burstEmitter } from '../ui/fx'
import { playSfx } from '../ui/sfx'
import { UI_FONT } from '../ui/fonts'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'
import { createWeapon } from '../weapons/create'
import type { EnemyTarget, WeaponContext, WeaponOwner, WeaponRuntime } from '../weapons/types'
import type { HudSnapshot, WaveSummary } from './ArenaScene'
import type { UIScene } from './UIScene'

// 河流竞技场（kind='river' 的关卡）：与有界/无界平行的第三套独立实现，
// 机制契约一致（run 状态、武器上下文、UIScene 协议、调试上报），世界模型：
// · 单屏：相机静止，世界坐标 = 逻辑视口坐标；河道沿长轴居中、宽恒 10 格，
//   短边余量为两岸暗带（不可进入，只是视觉）
// · 水流：恒定漂移矢量（横屏右→左，竖屏上→下）逐帧加在所有实体上
//   （子弹除外）——顺流快/逆流慢/挂机漂向下游全部由此自然涌现
// · 钳制：只有队伍中心与 Boss 被钳在河道内；敌人/金币自由出界——
//   敌人沿用无限图休眠机制（32 格，屏内永不休眠）并会逆流游回，
//   金币漂出下游一段距离即清理（玩家钳在屏内永远追不回）
// · 旋转：横竖屏是同一条河，视口变化时按「流向进度 + 跨向偏移」重映射
//   全部实体（等价于逆时针 90° 旋转），水面视觉层整体重建
// · 流动感三层：双层水纹视差滚动 + 漂浮物顺流循环 + 两岸静态植被反衬

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

function circleBody(obj: ImageObj, radius: number): void {
  const body = obj.body as ArcadeBody
  const frame = obj.width
  const r = (radius / obj.displayWidth) * frame
  body.setCircle(r, frame / 2 - r, frame / 2 - r)
}

function held(key?: Phaser.Input.Keyboard.Key): boolean {
  return key?.isDown ?? false
}

/** 颜色明暗缩放（水面横向深浅渐变用） */
function shade(color: number, mul: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * mul))
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * mul))
  const b = Math.min(255, Math.round((color & 0xff) * mul))
  return (r << 16) | (g << 8) | b
}

export class RiverArenaScene extends Phaser.Scene {
  private lineup: readonly CharacterSpec[] = []
  private members: Member[] = []
  private memberGroup!: Phaser.GameObjects.Group
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
  private dormantCount = 0
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
  // 刷怪预告注册表：旋转时可原位重映射（闭包共享 pos 对象）
  private pendingMarks: { pos: Point; mark: ImageObj }[] = []

  constructor() {
    super('arenaRiver')
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
    this.dormantCount = 0
    this.boss = undefined
    this.waterObjs = []
    this.waveTiles = []
    this.drifts = []
    this.pendingMarks = []

    // 单屏世界：相机静止，世界坐标 = 逻辑视口坐标
    applyCamera(this)
    this.viewW = viewport.logicalWidth
    this.viewH = viewport.logicalHeight
    this.horizontal = isHorizontal(this.viewW, this.viewH)
    this.river = riverRect(this.viewW, this.viewH, RIVER.width)
    this.flow = flowVector(this.horizontal, RIVER.flow)
    this.buildRiverVisuals()

    this.center = { x: this.viewW / 2, y: this.viewH / 2 }
    this.centerObj = this.add.zone(this.center.x, this.center.y, 1, 1)

    this.memberGroup = this.add.group()
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
          sub: '大河没有退路，正面迎战！',
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

    this.physics.add.overlap(this.memberGroup, this.enemies, (m, e) =>
      this.onMemberTouched(m as unknown as ImageObj, e as unknown as ImageObj),
    )
    this.physics.add.overlap(this.memberGroup, this.enemyShots, (m, s) =>
      this.onMemberShot(m as unknown as ImageObj, s as unknown as ImageObj),
    )
    this.physics.add.overlap(this.memberGroup, this.coins, (_m, c) =>
      this.collectCoin(c as unknown as ImageObj),
    )

    this.layoutTeam(0)
    // UIScene 自探测当前竞技场（有界/无界/河流），launch 不传参
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

    if (!this.stress && this.elapsedMs >= waveDurationMs(this.run.wave)) {
      this.endWave()
      return
    }

    this.frameSlowZones.length = 0
    this.frameAttractors.length = 0
    this.updateDormancy()
    this.updateOrbit(delta)
    this.moveTeam(delta)
    this.updateMembers(delta)
    this.spawn(delta)
    this.steerEnemies(delta)
    this.updateEnemyShots()
    this.updatePoisonPools()
    this.updateBurnZones()
    this.magnetCoins()
    this.sweepProjectiles(delta)
    this.cullProjectiles()
    this.updateWater(delta)

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
      viewW: viewport.logicalWidth,
      viewH: viewport.logicalHeight,
      playerX: this.center.x,
      playerY: this.center.y,
      camX: cam.worldView.centerX,
      camY: cam.worldView.centerY,
      formation: this.activeFormation(),
      mapId: this.run.mapId,
      dormant: this.dormantCount,
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

  // ── 视口变化：同一条河的重映射 ──────────────────────────────

  /** 横竖屏切换/窗口缩放：按「流向进度 + 跨向偏移」重映射全部实体，
   * 速度与朝向矢量随坐标系旋转，水面视觉层整体重建 */
  private onViewportChanged(): void {
    const fromW = this.viewW
    const fromH = this.viewH
    const fromHorizontal = this.horizontal
    applyCamera(this)
    this.viewW = viewport.logicalWidth
    this.viewH = viewport.logicalHeight
    this.horizontal = isHorizontal(this.viewW, this.viewH)
    this.river = riverRect(this.viewW, this.viewH, RIVER.width)
    this.flow = flowVector(this.horizontal, RIVER.flow)

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
    // 刷怪预告：闭包共享的 pos 对象原位改写，落地点自动跟随
    for (const pm of this.pendingMarks) {
      const p = map(pm.pos)
      pm.pos.x = p.x
      pm.pos.y = p.y
      pm.mark.setPosition(p.x, p.y)
    }

    this.buildRiverVisuals()
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
    circleBody(image, guarded ? MEMBER.radius * TEAM.guardCenterHurtboxMul : MEMBER.radius)
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
    this.teamDir = dir
    const step = (this.stats.moveSpeed * delta) / 1000
    const driftStep = delta / 1000
    // 自主移动 + 水流漂移，然后钳入河道（挂机会被推到下游边并卡住）
    const clamped = clampToRiver(
      {
        x: this.center.x + dir.x * step + this.flow.x * driftStep,
        y: this.center.y + dir.y * step + this.flow.y * driftStep,
      },
      this.river,
      TEAM.ringRadius + MEMBER.radius,
    )
    this.center.x = clamped.x
    this.center.y = clamped.y
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
    for (const m of this.members) {
      const idx = this.postBySlot[m.slot] ?? m.slot
      const p = posts[idx] ?? { x: 0, y: 0 }
      const wanderOn = m.alive && !moving && !m.hasThreat
      m.wanderAmp += ((wanderOn ? 1 : 0) - m.wanderAmp) * Math.min(1, delta / WANDER.rampMs)
      const wander = m.wanderAmp * WANDER.radius
      const tx = this.center.x + p.x + Math.sin(tSec * WANDER.freqX + m.wanderSeed) * wander
      const ty = this.center.y + p.y + Math.sin(tSec * WANDER.freqY + m.wanderSeed * 2.3) * wander
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
      m.image.setPosition(m.followX + m.visualOffset.x, m.followY + m.visualOffset.y)
      const guarded = this.activeFormation() === 'guard' && idx === 0
      m.image.setDepth(guarded ? 8.5 : 10 + (m.followY - this.center.y) / UNIT)
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

  private onMemberTouched(memberImg: ImageObj, enemy: ImageObj): void {
    if (this.over || !enemy.active || enemy.getData('dormant')) return
    const m = memberImg.getData('member') as Member
    if (!m.alive || this.elapsedMs - m.lastHitMs < m.iframesMs) return
    m.lastHitMs = this.elapsedMs
    const spec = enemy.getData('spec') as EnemySpec
    const dmgMul = (enemy.getData('dmgMul') as number | undefined) ?? 1
    this.hurtMember(m, Math.round(spec.damage * dmgMul), 0xff7777, spec.name)
    if (m.thorns > 0 && enemy.active) {
      this.applyDamage(enemy, m.thorns, 0, undefined, undefined, m.slot)
    }
  }

  private onMemberShot(memberImg: ImageObj, shot: ImageObj): void {
    if (this.over || !shot.active) return
    const m = memberImg.getData('member') as Member
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
          for (const t of this.frameTargets) {
            if (t === target) continue
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

  private applyDamage(
    enemy: ImageObj,
    damage: number,
    knockback = 0,
    srcX?: number,
    srcY?: number,
    srcSlot = -1,
    crit = false,
  ): void {
    if (!enemy.active || enemy.getData('dormant')) return
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
        const dir = norm(enemy.x - srcX, enemy.y - srcY)
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
        const dir = norm(enemy.x - srcX, enemy.y - srcY)
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

  // ── 刷怪（河道内随机落点）───────────────────────────────────

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

  /** 河道内均匀随机（贴边留半格；与有界图的全图随机同思路） */
  private spawnPoint(): Point {
    const pad = 0.5 * UNIT
    return {
      x: this.river.x + pad + this.rng.next() * (this.river.w - pad * 2),
      y: this.river.y + pad + this.rng.next() * (this.river.h - pad * 2),
    }
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
    // Boss 落点：河道内取距队伍 ≥5 格的随机点（采样兜底取最后一次）
    let pos = this.spawnPoint()
    for (let i = 0; i < 24; i++) {
      pos = this.spawnPoint()
      const dx = pos.x - this.center.x
      const dy = pos.y - this.center.y
      if (dx * dx + dy * dy >= 5 * UNIT * (5 * UNIT)) break
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

  // ── 休眠：同无限图机制（32 格，屏内永不触发）─────────────────

  private updateDormancy(): void {
    const half = INFINITE.activeHalf
    let awake = 0
    let dormant = 0
    const targets: EnemyTarget[] = []
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      const within =
        !!e.getData('boss') || isWithinActive(e.x - this.center.x, e.y - this.center.y, half)
      const wasDormant = !!e.getData('dormant')
      if (within === wasDormant) {
        const body = e.body as ArcadeBody
        if (within) {
          e.setData('dormant', false)
          body.enable = true
        } else {
          e.setData('dormant', true)
          body.setVelocity(0, 0)
          body.enable = false
        }
      }
      if (within) {
        awake++
        targets.push({ x: e.x, y: e.y, radius: (e.getData('spec') as EnemySpec).radius, ref: e })
      } else {
        dormant++
      }
    }
    this.awakeCount = awake
    this.dormantCount = dormant
    this.frameTargets = targets
  }

  // ── 敌人 AI（同无界 AI + 每帧叠加水流漂移）──────────────────

  private slowFactorFor(e: ImageObj): number {
    let factor = 1
    for (const z of this.frameSlowZones) {
      const zx = e.x - z.x
      const zy = e.y - z.y
      if (zx * zx + zy * zy <= z.r2) factor *= z.factor
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
    for (const m of this.members) {
      if (!m.alive) continue
      const dx = m.image.x - x
      const dy = m.image.y - y
      const d = dx * dx + dy * dy
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
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active || e.getData('dormant')) continue
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
        this.applyFlowAndClampBoss(e, body)
        continue
      }

      switch (spec.behavior) {
        case 'chase': {
          const dir = norm(target.image.x - e.x, target.image.y - e.y)
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
          const tdx = target.image.x - e.x
          const tdy = target.image.y - e.y
          const dist2 = tdx * tdx + tdy * tdy
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
            const dir = norm(tdx, tdy)
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
          const tdx = target.image.x - e.x
          const tdy = target.image.y - e.y
          const dist2 = tdx * tdx + tdy * tdy
          if (dist2 <= spec.fleeRange * spec.fleeRange) {
            const away = norm(-tdx, -tdy)
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
              Math.atan2(tdy, tdx),
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
            const dx = c.x - e.x
            const dy = c.y - e.y
            const d = dx * dx + dy * dy
            if (d < bestD) {
              bestD = d
              coin = c
            }
          }
          if (coin) {
            const eatR = spec.radius + COIN.radius
            if (bestD <= eatR * eatR) {
              coin.destroy()
              e.setData('eaten', ((e.getData('eaten') as number) ?? 0) + 1)
            } else {
              const dir = norm(coin.x - e.x, coin.y - e.y)
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

      // 水流：普通敌人不钳边界（可漂出屏外，AI 会自己逆流游回）
      body.velocity.x += this.flow.x
      body.velocity.y += this.flow.y

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

  /** Boss 与玩家同款钳制：加水流后，把会把它推出河道的速度分量清零 */
  private applyFlowAndClampBoss(e: ImageObj, body: ArcadeBody): void {
    body.velocity.x += this.flow.x
    body.velocity.y += this.flow.y
    const pad = BOSS.radius
    const r = this.river
    if (e.x <= r.x + pad && body.velocity.x < 0) body.velocity.x = 0
    if (e.x >= r.x + r.w - pad && body.velocity.x > 0) body.velocity.x = 0
    if (e.y <= r.y + pad && body.velocity.y < 0) body.velocity.y = 0
    if (e.y >= r.y + r.h - pad && body.velocity.y > 0) body.velocity.y = 0
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
        const dir = norm(this.center.x - e.x, this.center.y - e.y)
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
    const dir = norm(this.center.x - e.x, this.center.y - e.y)
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
        const dx = m.image.x - pool.x
        const dy = m.image.y - pool.y
        if (dx * dx + dy * dy <= pool.r2) {
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
      for (const t of this.frameTargets) {
        const dx = t.x - z.x
        const dy = t.y - z.y
        if (dx * dx + dy * dy <= z.r2) {
          this.applyDamage(t.ref as ImageObj, z.tickDamage, 0, undefined, undefined, z.srcSlot)
        }
      }
    }
  }

  // ── 金币（顺水漂，漂出下游即清理）───────────────────────────

  private spawnCoins(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const jx = count > 1 ? (this.rng.next() - 0.5) * 0.6 * UNIT : 0
      const jy = count > 1 ? (this.rng.next() - 0.5) * 0.6 * UNIT : 0
      const coin = emojiImage(this, x + jx, y + jy, COIN.emoji, COIN.size, 'player').setDepth(3)
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
    for (const c of this.coins.getChildren() as ImageObj[]) {
      if (!c.active) continue
      // 漂出下游边界外一段距离：河水冲走（玩家钳在屏内，永远追不回）
      if (pastDownstream(c, this.viewW, this.viewH, RIVER.coinCullPad)) {
        c.destroy()
        continue
      }
      if (this.frameAttractors.length > 0) {
        let taken = false
        for (const a of this.frameAttractors) {
          const ax = a.x - c.x
          const ay = a.y - c.y
          if (ax * ax + ay * ay <= a.r2) {
            this.collectCoin(c)
            taken = true
            break
          }
        }
        if (taken) continue
      }
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
        body.setVelocity(dir.x * COIN.magnetSpeed + this.flow.x, dir.y * COIN.magnetSpeed + this.flow.y)
      } else {
        // 不在磁吸范围：纯随波逐流
        body.setVelocity(this.flow.x, this.flow.y)
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
    const bank = 0x233826
    const bankFar = 0x1b2c1f

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
      [0.1, RIVER.waveSlow],
      [0.16, RIVER.waveFast],
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
    const mapSpec: MapSpec = MAPS[this.run.mapId]
    const spec = mapSpec.decor
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
        const emoji = spec.emojis[Math.floor(decorRng.next() * spec.emojis.length)]!
        const sizeU = spec.sizeU[0] + decorRng.next() * (spec.sizeU[1] - spec.sizeU[0])
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
          .setAlpha(spec.alpha[0] + decorRng.next() * (spec.alpha[1] - spec.alpha[0]))
          .setRotation((decorRng.next() * 2 - 1) * 0.6)
          .setDepth(0.8)
        this.waterObjs.push(img)
      }
    }

    // 漂浮物（顺流循环）：初始均匀铺满，之后 updateWater 推进
    const driftPool = mapSpec.drift ?? ['🍃']
    for (let i = 0; i < RIVER.driftCount; i++) {
      const emoji = driftPool[Math.floor(Math.random() * driftPool.length)]!
      const img = emojiImage(this, 0, 0, emoji, (0.26 + Math.random() * 0.2) * UNIT, 'player')
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
        (RIVER.driftSpeedMul[0] + Math.random() * (RIVER.driftSpeedMul[1] - RIVER.driftSpeedMul[0]))
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
      d.uPx += RIVER.flow * d.speedMul * dt
      if (d.uPx > alongLen + margin) {
        // 漂出下游 → 回上游重新进场（换个横位/速度）
        d.uPx = -margin
        const halfCross = (this.horizontal ? this.river.h : this.river.w) / 2
        d.baseCross = (Math.random() * 2 - 1) * halfCross * 0.92
        d.speedMul =
          driftProfile(d.baseCross / halfCross) *
          (RIVER.driftSpeedMul[0] + Math.random() * (RIVER.driftSpeedMul[1] - RIVER.driftSpeedMul[0]))
      }
      d.image.rotation += d.spin * dt
      this.placeDrift(d)
    }
  }
}
