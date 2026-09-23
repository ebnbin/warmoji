import Phaser from 'phaser'
import { toPx } from '../data/px'
import { mainCameraOnly } from '../util/camera'
import { attachEnemy, enemyOf } from './enemy/enemies'
import type { Enemy } from './enemy/enemies'
import { armEnemy, buildEnemyCtx, healEnemies } from './enemy/abilities'
import { attachMember, memberOf } from './member'
import type { Member } from './member'
import { projectileOf, spawnProjectile, sweepProjectiles, updateEnemyProjectiles } from './projectiles'
import { circleBody } from './body'
import { capCoins, collectCoin, magnetCoins, spawnCoins, spawnShards } from './pickups'
import { spawnGroundEffect, updateGroundEffects } from './groundEffects'
import type { GroundEffect } from './groundEffects'
import {
  attachCarrierAura,
  detachCarrierAura,
  refoldBattleFx,
  spawnFieldPickup,
  updateFieldPickups,
} from './field'
import type { FieldPickupEntity } from './field'
import { BATTLE_FX_IDENTITY } from '../data/battlefield'
import type { BattleEffects, BattleMod, FieldPickupDef } from '../types/battlefield'
import { STEERERS } from './enemy/steer'
import { runDeathEffects } from './enemy/deathEffects'
import { CAPTAINS } from '../data/captains'
import { CHARACTERS, MEMBER, TEAM, loadoutFor } from '../data/characters'
import { memberMaxHp } from '../data/stats'
import type { CharacterId, CharacterDef } from '../types/characters'
import { aggregateTeamCards } from '../data/cards'
import {
  spawnParams,
  INVINCIBLE_HP,
  sandboxDifficulty,
  sandboxEnemySet,
  sandboxFireRate,
  sandboxInvincible,
  sandboxLevel,
} from '../run/sandbox'
import { AI, BOSS_SPAWN_RELIEF, DEFAULT_CONTACT, ELITE, ENEMIES, SPAWN, SURGE } from '../data/enemies'
import type { EnemyDef } from '../types/enemies'
import { UNIT } from '../util/units'
import { WAVE } from '../data/waves'
import { KNOCKBACK } from '../data/abilities'
import { FOLLOW, HIT_SHAKE, WANDER } from '../data/feel'
import { ORBIT } from '../data/feel'

import type { EnemyMixEntry } from '../types/enemies'
import { formationPosts, ringPostAngle } from '../data/formation'
import type { FormationId } from '../types/formation'
import { angleDiff, orbitTendency, pickDriver, stepPhase, threatWeight } from '../arcade/orbit'
import type { OrbitThreat } from '../arcade/orbit'
import { browserStorage } from '../util/storage'
import {
  aggregateCharacterEffects,
  characterXp,
  foldTeamEffects,
  CRIT_MUL,
  resolveAbilityDef,
} from '../data/items'
import { characterLevel, tiersForLevel } from '../data/charLevel'
import { levelStatsFor } from '../data/levels'
import type { TeamEffects } from '../types/items'
import { currentFormation, getRun, guardOrder, hasCenter, promoteStep, waveStartHp } from '../run/state'
import type { RunState } from '../run/state'
import { tickSkillCd } from '../run/state'
import { DEFAULT_SETTINGS, loadSettings } from '../save/settings'
import type { Settings } from '../save/settings'
import { MAPS, bossFor, mapEnemyRoster } from '../data/maps'
import type { Palette } from '../util/palette'
import { Rng } from '../util/rng'
import { isWithinActive } from '../arcade/maps/world'
import { norm } from '../util/vec'
import type { Point } from '../util/vec'
import { ANIM_DEF } from '../emoji/anim'
import { isBossWave, isEliteWave, isFinalWave, waveAt, waveDurationMs, coinDropChance } from '../data/waves'
import { gainXp, waveBonusXp, xpToNext } from '../run/xp'
import { Animator } from './anim/animator'
import { clipFramesLive } from './anim/animTextures'
import { applyBackground } from '../util/background'
import { DAMAGE_FONT, ensureDamageFont } from './damageFont'
import { reportDebug } from '../debug'
import { emojiImage, emojiKey } from '../emoji/textures'
import { burstEmitter, setOverlayFill } from '../util/fx'
import { acquirePooled, releasePooled } from './pool'
import { playSfx } from '../audio/sfx'
import { UI_FONT } from '../util/fonts'
import { TIMESTOP } from '../data/timeStop'
import { timeScaleFor } from '../arcade/abilities/TimeStopAbility'
import { textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { createAbility } from './abilities/create'
import { applyBlast, applyEffects } from './abilities/effects'
import { blastRing } from './cues'
import type { AbilityDef, Effect } from '../types/abilityDefs'
import type { TargetInfo, AbilityContext, AbilityOwner, AbilityRuntime, EffectCtx } from './abilities/types'

// 四张地图共享的战斗引擎：任何改动同时作用于四张图

interface TeamStats {
  damageMul: number
  cooldownMul: number
  moveSpeed: number
  maxHp: number
}

import type { ArcadeBody, ImageObj } from './body'
import { hudMoveVector, setActiveHudHost } from '../run/hudHost'
import type { HudSnapshot, WaveSummary } from '../run/hudHost'
import { rollWaveCarriers } from '../arcade/field'
import { enemyMixAt, pickEnemy } from '../arcade/enemy/ai'
export type { ArcadeBody, ImageObj } from './body'

function held(key?: Phaser.Input.Keyboard.Key): boolean {
  return key?.isDown ?? false
}

/** 变羊恢复后的再变冷却（ms） */
const MORPH_RECAST_CD = 5000
/** 连续休眠满此时长（世界时钟）即回收；中途醒来则下次入眠重新计时 */
const DORMANT_TTL_MS = 30000

export abstract class ArcadeBattleScene extends Phaser.Scene {
  protected lineup: readonly CharacterDef[] = []
  members: Member[] = []
  protected memberGroup!: Phaser.GameObjects.Group
  center = { x: 0, y: 0 }
  protected centerObj!: Phaser.GameObjects.Zone
  enemies!: Phaser.GameObjects.Group
  projectiles!: Phaser.GameObjects.Group
  enemyProjectiles!: Phaser.GameObjects.Group
  coins!: Phaser.GameObjects.Group
  groundEffects: GroundEffect[] = []
  protected enemyMix: EnemyMixEntry[] = []
  frameTargets: TargetInfo[] = []
  /** 每帧重建，虚空图含镜像坐标 */
  frameMemberTargets: TargetInfo[] = []
  private frameSlowZones: { x: number; y: number; r2: number; factor: number }[] = []
  /** 仅本帧生效 */
  frameAttractors: { x: number; y: number; r2: number }[] = []
  private abilityCtx: AbilityContext = {
    scene: this,
    ownerOutline: 'player',
    targets: () => this.frameTargets,
    damageTarget: (e, d, kb, sx, sy) => this.applyDamage(e as ImageObj, d, kb, sx, sy),
    spawnProjectile: (x, y, angle, def, damage) => spawnProjectile(this, x, y, angle, def, damage),
    anchor: () => this.center,
    targetHp: (ref) => enemyOf(ref as ImageObj).hp,
    targetMaxHp: (ref) => enemyOf(ref as ImageObj).maxHp,
    applySlow: (x, y, radius, factor) =>
      this.frameSlowZones.push({ x, y, r2: radius * radius, factor }),
    slowTarget: (enemy, factor, durationMs) => {
      const a = enemyOf(enemy as ImageObj)
      a.abilitySlow = { mul: factor, until: this.elapsedMs + durationMs }
    },
    poisonTarget: (enemy, dmg, tickMs, durationMs) =>
      this.poisonEnemy(enemy as ImageObj, dmg, tickMs, durationMs, -1),
    isPoisoned: (ref) => (enemyOf(ref as ImageObj).poison?.until ?? 0) > this.elapsedMs,
    spawnGroundEffect: (x, y, def) => spawnGroundEffect(this, x, y, def, { faction: 'team', srcSlot: -1 }),
    attractCoins: (x, y, radius) => this.frameAttractors.push({ x, y, r2: radius * radius }),
    // 由 memberCtx 按槽位覆写
    playOwnerClip: () => {},
    heal: (x, y, range, amount, all) => this.healAllies(x, y, range, amount, all),
    cutReviveTimer: (x, y, range, ms) => this.cutReviveTimer(x, y, range, ms),
    rallyTeam: (healRatio, invulnMs) => this.rallyTeam(healRatio, invulnMs),
    danceTargets: (durationMs) => this.danceTargets(durationMs),
    timeStop: (durationMs) => this.startTimeStop(durationMs),
    buffTeamDamage: (mul, durationMs) => this.buffTeamDamage(mul, durationMs),
    spawnCoins: (x, y, count) => this.spawnRewardCoins(x, y, count),
    waveScale: () => (this.sandbox ? 1 : waveAt((this.run.combatMs + this.elapsedMs) / 1000).hpMultiplier),
    isBossTarget: (ref) => enemyOf(ref as ImageObj).boss,
    morphTarget: (ref, spec) => this.applyHex(ref as ImageObj, spec),
    damageMul: () => this.stats.damageMul,
    cooldownMul: () => this.stats.cooldownMul * this.sandboxFireFactor(),
    sfx: (id) => playSfx(id),
  }
  // 归属靠 teamEffectSlot 逐帧改写
  private teamEffectSlot = -1
  private teamEffectExclude = new Set<TargetInfo['ref']>()
  private teamEffectCtx: EffectCtx = {
    scene: this,
    targets: () => this.frameTargets,
    damageTarget: (ref, damage, kb, sx, sy) =>
      this.applyDamage(ref as ImageObj, damage, kb ?? 0, sx, sy, this.teamEffectSlot),
    slowTarget: (enemy, factor, durationMs) => {
      const a = enemyOf(enemy as ImageObj)
      a.abilitySlow = { mul: factor, until: this.elapsedMs + durationMs }
    },
    poisonTarget: (enemy, dmg, tickMs, durationMs) =>
      this.poisonEnemy(enemy as ImageObj, dmg, tickMs, durationMs, this.teamEffectSlot),
    spawnGroundEffect: (x, y, def) =>
      spawnGroundEffect(this, x, y, def, { faction: 'team', srcSlot: this.teamEffectSlot }),
    heal: (x, y, range, amount, all) => this.healAllies(x, y, range, amount, all),
    // 死者不变形
    morphTarget: (ref, spec) => {
      if ((ref as ImageObj).active) this.applyHex(ref as ImageObj, spec)
    },
  }
  // 无敌帧节流在 onMemberTouched 掌管，此处裸施伤
  private contactSrcName = ''
  private contactTargets: TargetInfo['ref'][] = []
  private enemyContactCtx: EffectCtx = {
    scene: this,
    targets: () => this.frameMemberTargets,
    damageTarget: (ref, damage) => {
      const m = memberOf(ref as ImageObj)
      if (m.alive) this.hurtMember(m, damage, 0xff7777, this.contactSrcName)
    },
    slowTarget: () => {},
    spawnGroundEffect: (x, y, def) =>
      spawnGroundEffect(this, x, y, def, { faction: 'enemy', srcName: this.contactSrcName }),
    heal: (x, y, range, amount, all, exclude) =>
      healEnemies(this, x, y, range, amount, all, exclude ? enemyOf(exclude as ImageObj) : undefined),
    attackSlowMember: (ref, mul, durationMs) => {
      const m = memberOf(ref as ImageObj)
      m.atkSlowUntil = this.elapsedMs + durationMs
      m.atkSlowMul = mul
    },
  }
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>

  rng = new Rng(1)
  protected palette!: Palette
  stats!: TeamStats
  teamFx: TeamEffects = foldTeamEffects([])
  fieldPickups: FieldPickupEntity[] = []
  battleMods: BattleMod[] = []
  /** 逐帧按 battleMods 重折 */
  battleFx: BattleEffects = { ...BATTLE_FX_IDENTITY }
  carrierCount = 0
  private settings: Settings = DEFAULT_SETTINGS
  run!: RunState
  private damagePool: Phaser.GameObjects.BitmapText[] = []
  private damagePoolIdx = 0
  shardPool: ImageObj[] = []
  shardPoolIdx = 0
  private deathBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  coinBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private puffBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private teamDir = { x: 0, y: 0 }
  /** 槽位 → 岗位 */
  private postBySlot: number[] = []
  protected boss?: ImageObj
  /** 全环共享相位 */
  private orbitPhase = 0
  /** -1 = 无人驱动 */
  private driverPost = -1
  elapsedMs = 0
  private spawnCooldownMs = 0
  private pendingSpawns = 0
  /** 世界时长；按 wdelta 扣 */
  timeStopMsLeft = 0
  /** 0..1 */
  protected moveInputRaw = 0
  /** 低通后的移动量 */
  private chrono = 0
  /** 用于结束当帧恢复弹体满速 */
  private timeStopWasActive = false
  private timeStopFx?: Phaser.GameObjects.Rectangle
  private timeStopFxAlpha = 0
  sandbox = false
  over = false
  // 本波战果基线，结算取增量
  private waveBaseKills = 0
  private waveBaseCoins = 0
  private waveBaseLevel = 1
  /** 不含休眠者 */
  protected awakeCount = 0
  protected dormantCount = 0
  /** 重映射时原位改写 pos */
  protected pendingMarks: { pos: Point; mark: ImageObj }[] = []
  /** null = 不按寿命回收；虚空图必须设 */
  projectileTtlMs: number | null = null
  /** 到期把 stats.damageMul 拨回 1 */
  skillBuffUntil = 0
  /** 窗口内新落地的敌人也要跳 */
  danceEndsAt = 0
  /** 不走 update，只经 castSkill 单发 */
  private captainAbilities: AbilityRuntime[] = []
  private captainHandle: AbilityOwner = { x: 0, y: 0, setVisualOffset: () => {} }

  // ── 世界规则钩子 ──

  protected abstract createWorld(): void
  protected abstract spawnCenter(): Point
  protected abstract spawnPoint(): Point
  protected abstract bossSpawnPoint(): Point
  protected finalWaveWarningSub(): string {
    return (
      MAPS[this.run.mapId].finalWaveSub ??
      `击败它，或撑过 ${Math.round(waveDurationMs(this.run.wave) / 1000)} 秒！`
    )
  }

  /** scene.restart 复用实例，须在此重置 */
  protected resetWorldFields(): void {}
  protected attachCamera(_target: Phaser.GameObjects.Zone): void {
    void _target
  }
  protected buildEnemyMix(): EnemyMixEntry[] {
    return enemyMixAt(MAPS[this.run.mapId].mix, this.sandbox ? 10 : this.run.wave)
  }
  /** 默认 1 */
  protected spawnIntervalScale(): number {
    return 1
  }
  /** 虚空图换环面最短差 */
  worldDelta(from: Point, to: Point): Point {
    return { x: to.x - from.x, y: to.y - from.y }
  }
  protected buildFrameTargets(): void {
    let awake = 0
    const targets: TargetInfo[] = []
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      awake++
      targets.push({ x: e.x, y: e.y, radius: enemyOf(e).def.radius, ref: e })
    }
    this.awakeCount = awake
    this.dormantCount = 0
    this.frameTargets = targets
  }
  protected buildMemberTargets(): TargetInfo[] {
    const targets: TargetInfo[] = []
    for (const m of this.members) {
      if (!m.alive) continue
      targets.push({ x: m.image.x, y: m.image.y, radius: m.hurtRadius, ref: m.image })
    }
    return targets
  }
  protected spawnCapCount(): number {
    return this.awakeCount
  }
  protected constrainTeam(next: Point): Point {
    return next
  }
  protected teamDrift(_delta: number): Point {
    void _delta
    return { x: 0, y: 0 }
  }
  protected springTarget(m: Member, tx: number, ty: number): Point {
    void m
    return { x: tx, y: ty }
  }
  protected constrainFollow(_m: Member): void {
    void _m
  }
  protected memberDepthY(m: Member): number {
    return m.followY - this.center.y
  }
  /** 虚空图改手写环面判定 */
  protected setupTouchOverlaps(): void {
    this.physics.add.overlap(this.memberGroup, this.enemies, (m, e) => {
      this.onMemberTouched(memberOf(m as unknown as ImageObj), e as unknown as ImageObj)
    })
    this.physics.add.overlap(this.memberGroup, this.enemyProjectiles, (m, s) => {
      this.onMemberShot(memberOf(m as unknown as ImageObj), s as unknown as ImageObj)
    })
    this.physics.add.overlap(this.memberGroup, this.coins, (_m, c) =>
      collectCoin(this, c as unknown as ImageObj),
    )
  }
  protected touchStep(): void {}
  protected configureEnemyBody(_enemy: ImageObj): void {
    void _enemy
  }
  protected configureBossBody(_enemy: ImageObj): void {
    void _enemy
  }
  protected constrainEnemyPos(p: Point, _radius: number): Point {
    void _radius
    return p
  }
  constrainCoinPos(p: Point): Point {
    return p
  }
  constrainShardTarget(p: Point): Point {
    return p
  }
  wanderDir(a: Enemy): Point {
    if (this.elapsedMs >= a.turnAt) {
      const ang = this.rng.next() * Math.PI * 2
      a.dirX = Math.cos(ang)
      a.dirY = Math.sin(ang)
      a.turnAt = this.elapsedMs + AI.wander.turnMinMs + this.rng.next() * AI.wander.turnJitterMs
    }
    return { x: a.dirX, y: a.dirY }
  }
  fleeDir(_a: Enemy, away: Point): Point {
    return away
  }
  chaseDir(a: Enemy, to: Point): Point {
    const d = this.worldDelta(a.image, to)
    return norm(d.x, d.y)
  }
  /** 无墙 → null */
  wallHit(_a: Point, _b: Point): Point | null {
    void _a
    void _b
    return null
  }
  smashWallAt(_x: number, _y: number): void {
    void _x
    void _y
  }
  protected wallAwareCtx(_def: AbilityDef, base: AbilityContext, _slot: number): AbilityContext {
    void _def
    void _slot
    return base
  }
  protected postSteerEnemy(_e: ImageObj, _body: ArcadeBody, _def: EnemyDef): void {
    void _e
    void _body
    void _def
  }
  protected postSteerBoss(_e: ImageObj, _body: ArcadeBody): void {
    void _e
    void _body
  }
  /** 默认 1 */
  protected knockbackTauMul(): number {
    return 1
  }
  /** 寿命回收在基座 */
  cullEnemyProjectile(_s: ImageObj): boolean {
    void _s
    return false
  }
  cullCoin(_c: ImageObj): boolean {
    void _c
    return false
  }
  coinIdleVelocity(): Point {
    return { x: 0, y: 0 }
  }
  protected onFinalWaveSetup(): void {}
  /** 时停窗口内随队伍移动量放缩，窗口外恒 1；作用于整个世界，唯玩家走位与呼吸恒实时 */
  worldTimeScale(): number {
    return this.timeStopMsLeft > 0 ? timeScaleFor(this.chrono) : 1
  }

  /** durationMs 为世界时长 */
  startTimeStop(durationMs: number): void {
    this.timeStopMsLeft = durationMs
  }

  private updateTimeStopFx(delta: number, active: boolean): void {
    const target = active ? (1 - this.chrono) * TIMESTOP.chillMaxAlpha : 0
    const rate = Math.min(1, delta / TIMESTOP.fadeMs)
    this.timeStopFxAlpha += (target - this.timeStopFxAlpha) * rate
    if (this.timeStopFx) setOverlayFill(this.timeStopFx, TIMESTOP.chillColor, this.timeStopFxAlpha)
  }
  /** 在管线末尾执行 */
  protected updateWorld(_delta: number): void {
    void _delta
  }
  /** launch UI 之前 */
  protected postCreate(): void {}
  protected debugViewSize(): { w: number; h: number } {
    return { w: viewport.logicalWidth, h: viewport.logicalHeight }
  }
  protected debugExtras(): { dormant?: number; zoneRadius?: number } {
    return {}
  }
  protected onViewportChanged(): void {
    this.cameras.main.setZoom(viewport.renderScale)
  }

  /** 休眠 = 关物理体 + 清速度 + 不参与索敌/碰撞/AI，状态全保留；Boss 永不休眠。连续休眠满 DORMANT_TTL_MS 即回收 */
  protected dormancyFrameTargets(activeHalf: number): void {
    let awake = 0
    let dormant = 0
    const targets: TargetInfo[] = []
    const expired: ImageObj[] = []
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      const a = enemyOf(e)
      const within = a.boss || isWithinActive(e.x - this.center.x, e.y - this.center.y, activeHalf)
      if (within === a.dormant) {
        const body = e.body as ArcadeBody
        if (within) {
          a.dormant = false
          body.enable = true
        } else {
          a.dormant = true
          a.dormantSince = this.elapsedMs
          body.setVelocity(0, 0)
          body.enable = false
        }
      } else if (!within && this.elapsedMs - a.dormantSince >= DORMANT_TTL_MS) {
        expired.push(e)
        continue
      }
      if (within) {
        awake++
        targets.push({ x: e.x, y: e.y, radius: a.def.radius, ref: e })
      } else {
        dormant++
      }
    }
    // 遍历完再回收：回收会改动正在遍历的组
    for (const e of expired) this.despawnEnemy(e, false)
    this.awakeCount = awake
    this.dormantCount = dormant
    this.frameTargets = targets
  }

  // ── HudHost ──

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
      projectiles: this.projectiles.countActive(true),
      coins: this.coins.countActive(true),
      pending: this.pendingSpawns,
      objects: this.children.list.length,
      bodies: this.physics.world.bodies.size,
      combatSec: Math.floor(totalSec),
      spawnIntervalMs: Math.round(this.sandbox ? spawnParams().intervalMs : wave.spawnIntervalMs),
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
      bossHp: this.boss?.active ? enemyOf(this.boss).hp : null,
      bossMaxHp: bossFor(this.run.mapId).hp,
      battleFx: this.battleMods.map((m) => ({
        emoji: m.emoji,
        polarity: m.polarity,
        remainMs: Math.max(0, Math.round(m.until - this.elapsedMs)),
        totalMs: m.totalMs,
      })),
    }
  }

  create(): void {
    // scene.restart() 复用同一实例，所有局内状态必须在这里重置
    this.rng = new Rng(Date.now() >>> 0)
    this.run = getRun()
    const mapDef = MAPS[this.run.mapId]
    this.palette = mapDef.palette
    applyBackground(this.palette)
    this.sandbox = this.run.sandbox
    this.settings = loadSettings(browserStorage())
    this.stats = {
      damageMul: 1,
      cooldownMul: 1,
      moveSpeed: CAPTAINS[this.run.captainId].moveSpeed * UNIT,
      maxHp: this.sandbox && sandboxInvincible() ? INVINCIBLE_HP : MEMBER.maxHp,
    }
    this.elapsedMs = 0
    this.spawnCooldownMs = 300
    this.pendingSpawns = 0
    this.over = false
    // 显示对象已随 restart 销毁，只重置引用
    this.groundEffects = []
    this.frameAttractors = []
    this.awakeCount = 0
    this.dormantCount = 0
    this.boss = undefined
    this.pendingMarks = []
    this.skillBuffUntil = 0
    this.danceEndsAt = 0
    this.timeStopMsLeft = 0
    this.moveInputRaw = 0
    this.chrono = 0
    this.timeStopWasActive = false
    this.timeStopFx = undefined
    this.timeStopFxAlpha = 0
    this.fieldPickups = []
    this.battleMods = []
    this.battleFx = { ...BATTLE_FX_IDENTITY }
    this.carrierCount = 0
    this.resetWorldFields()

    this.createWorld()

    this.timeStopFx = mainCameraOnly(
      this.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 6000, 6000, TIMESTOP.chillColor, 0)
        .setScrollFactor(0)
        .setDepth(88),
    )

    this.center = this.spawnCenter()
    this.centerObj = this.add.zone(this.center.x, this.center.y, 1, 1)

    this.memberGroup = this.add.group()
    const rosterIds = this.run.roster
    this.lineup = rosterIds.map((id) => CHARACTERS[id])
    // 护卫序下 slot ≠ post；环形时槽位即岗位
    const order = this.sandbox || !hasCenter(this.run) ? null : guardOrder(this.run)
    this.postBySlot = rosterIds.map((id, slot) => {
      if (!order) return slot
      const post = order.indexOf(id)
      return post >= 0 ? post : slot
    })
    this.orbitPhase = 0
    this.driverPost = -1
    this.teamFx = aggregateTeamCards(this.run.teamCards)
    this.stats.moveSpeed = CAPTAINS[this.run.captainId].moveSpeed * UNIT * this.teamFx.moveSpeedMul
    this.waveBaseKills = this.run.kills
    this.waveBaseCoins = this.run.coins
    this.waveBaseLevel = this.run.xp.level
    this.members = rosterIds.map((id, slot) => this.createMember(id, slot))

    // center 对象本局稳定，位移原地改写
    const center = this.center
    this.captainHandle = {
      get x() {
        return center.x
      },
      get y() {
        return center.y
      },
      setVisualOffset: () => {},
    }
    this.captainAbilities = CAPTAINS[this.run.captainId].skill.abilities.map((a) =>
      createAbility(toPx(a), this.abilityCtx, 0),
    )

    this.attachCamera(this.centerObj)

    this.enemies = this.add.group()
    this.projectiles = this.add.group()
    this.enemyProjectiles = this.add.group()
    this.coins = this.add.group()
    this.enemyMix = this.buildEnemyMix()
    if (!this.sandbox) this.scheduleCarriers()

    if (!this.sandbox && isEliteWave(this.run.wave)) {
      this.time.delayedCall(600, () => {
        if (this.over) return
        this.events.emit('wave-warning', {
          title: '精英来袭',
          sub: '敌人潮涌来，小心金边强敌！',
        })
        this.spawnSurge()
      })
    }
    if (!this.sandbox && isBossWave(this.run.wave)) {
      this.onFinalWaveSetup()
      this.time.delayedCall(600, () => {
        if (this.over) return
        this.events.emit('wave-warning', {
          title: `${bossFor(this.run.mapId).name}出现`,
          sub: this.finalWaveWarningSub(),
        })
        this.spawnBoss()
      })
    }

    this.deathBurst = burstEmitter(this, [0x8e24aa, 0xab47bc, 0x6a1b9a, 0xf3e5f5], 230)
    this.coinBurst = burstEmitter(this, [0xffb300, 0xffdc5d, 0xfff8e1], 150, 340)
    this.puffBurst = burstEmitter(this, [0x757575, 0x9e9e9e, 0xe0e0e0], 130, 520)

    ensureDamageFont(this)
    this.damagePool = Array.from({ length: 64 }, () => this.newDamageText())
    this.damagePoolIdx = 0
    this.shardPool = Array.from({ length: 64 }, () => this.newShard())
    this.shardPoolIdx = 0

    this.cursors = this.input.keyboard?.createCursorKeys()
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D') as
      | Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
      | undefined

    // 子弹命中走线段扫掠，不用点重叠
    this.setupTouchOverlaps()

    this.layoutTeam(0)
    this.postCreate()
    setActiveHudHost(this) // 须先登记再拉起 HUD
    this.scene.launch('ui')

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      this.onShutdown()
      this.scene.stop('ui')
    })
  }

  protected onShutdown(): void {}

  update(_time: number, delta: number): void {
    if (this.over) return
    // 世界侧一切用 wdelta，唯玩家走位/呼吸/技能 CD 用实时 delta
    const tsActive = this.timeStopMsLeft > 0
    const scale = this.worldTimeScale()
    const wdelta = delta * scale
    if (tsActive) this.timeStopMsLeft = Math.max(0, this.timeStopMsLeft - wdelta)
    this.elapsedMs += wdelta

    if (!this.sandbox && this.elapsedMs >= waveDurationMs(this.run.wave)) {
      this.endWave()
      return
    }

    // 技能冷却按真实时钟推进，不随时停拖长
    this.run.skillCdMs = tickSkillCd(this.run.skillCdMs, delta)
    if (this.stats.damageMul !== 1 && this.elapsedMs >= this.skillBuffUntil) {
      this.stats.damageMul = 1
    }
    // 须先于移动/攻击/敌速消费
    refoldBattleFx(this)

    this.frameSlowZones.length = 0
    this.frameAttractors.length = 0
    this.buildFrameTargets()
    this.frameMemberTargets = this.buildMemberTargets()
    this.updateOrbit(delta)
    this.moveTeam(delta)
    // moveInputRaw 由 moveTeam 写，供下一帧读
    this.chrono += (this.moveInputRaw - this.chrono) * Math.min(1, delta / TIMESTOP.easeMs)
    this.updateMembers(delta, wdelta)
    this.touchStep()
    this.spawn(wdelta)
    this.steerEnemies(wdelta)
    updateEnemyProjectiles(this)
    updateGroundEffects(this)
    magnetCoins(this)
    capCoins(this)
    updateFieldPickups(this)
    sweepProjectiles(this, wdelta)
    this.cullProjectiles()
    if (tsActive || this.timeStopWasActive) this.applyProjectileTimeScale(scale)
    this.timeStopWasActive = tsActive
    this.updateTimeStopFx(delta, tsActive)
    this.updateWorld(delta)

    const cam = this.cameras.main
    const view = this.debugViewSize()
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
      viewW: view.w,
      viewH: view.h,
      playerX: this.center.x,
      playerY: this.center.y,
      camX: cam.worldView.centerX,
      camY: cam.worldView.centerY,
      formation: this.activeFormation(),
      mapId: this.run.mapId,
      skill: {
        remainMs: Math.round(this.run.skillCdMs),
        ready: this.run.skillCdMs <= 0,
      },
      field: {
        pickups: this.fieldPickups.map((p) => ({
          id: p.def.id,
          polarity: p.def.polarity,
          x: p.x,
          y: p.y,
        })),
        active: this.battleMods.map((m) => ({
          id: m.id,
          polarity: m.polarity,
          remainMs: Math.max(0, Math.round(m.until - this.elapsedMs)),
        })),
        carriers: this.carrierCount,
      },
      ...this.debugExtras(),
    })
  }

  // ── 队长主动技能 ──

  skillSnapshot(): {
    name: string
    remainMs: number
    cdMs: number
    ready: boolean
  } {
    const s = CAPTAINS[this.run.captainId].skill
    return {
      name: s.name,
      remainMs: this.run.skillCdMs,
      cdMs: s.cdMs * this.teamFx.skillCdMul,
      ready: this.run.skillCdMs <= 0,
    }
  }

  private gainTeamXp(amount: number): void {
    const gained = gainXp(this.run.xp, amount)
    this.run.xp = gained.state
    if (gained.levelsGained > 0) {
      this.run.cardDraws += gained.levelsGained
      playSfx('levelup')
    }
  }


  castSkill(): boolean {
    if (this.over || this.run.skillCdMs > 0) return false
    const s = CAPTAINS[this.run.captainId].skill
    this.run.skillCdMs = s.cdMs * this.teamFx.skillCdMul
    playSfx('levelup')
    this.events.emit('skill-cast', s.name)
    for (const a of this.captainAbilities) a.castNow?.(this.captainHandle)
    return true
  }

  // ── 团队级能力 ──

  /** 无敌走受击无敌帧通道；毒液池/毒雾走独立计时，不受无敌保护 */
  private rallyTeam(healRatio: number, invulnMs: number): void {
    for (const m of this.members) {
      if (!m.alive) this.reviveMember(m)
      else m.hp = Math.min(m.maxHp, m.hp + m.maxHp * healRatio)
      m.lastHitMs = this.elapsedMs + invulnMs - m.iframesMs
      m.image.setTint(0xffe082)
      this.time.delayedCall(320, () => {
        if (m.alive) m.image.clearTint()
      })
    }
  }

  /** 窗口内新落地的敌人也要跳 */
  private danceTargets(durationMs: number): void {
    this.danceEndsAt = this.elapsedMs + durationMs
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      const a = enemyOf(e)
      a.danceUntil = this.danceEndsAt
      if (a.state === 'windup' || a.state === 'dash') {
        a.state = a.boss ? 'chase' : 'wander'
        e.clearTint()
      }
    }
  }

  private buffTeamDamage(mul: number, durationMs: number): void {
    this.stats.damageMul = mul
    this.skillBuffUntil = this.elapsedMs + durationMs
    for (const m of this.members) {
      if (!m.alive) continue
      m.image.setTint(0x80d8ff)
      this.time.delayedCall(350, () => {
        if (m.alive) m.image.clearTint()
      })
    }
  }

  /** 波末结算期不再入场 */
  private spawnRewardCoins(x: number, y: number, count: number): void {
    if (this.over) return
    this.coinBurst.explode(6, x, y)
    playSfx('coin')
    spawnCoins(this, x, y, count)
  }

  protected endWave(): void {
    this.over = true
    this.physics.pause()
    playSfx('wave')
    const finished = isFinalWave(this.run.wave)
    const xpMul = CAPTAINS[this.run.captainId].xpGainMul * this.teamFx.xpGainMul
    this.gainTeamXp(Math.round(waveBonusXp(this.run.wave) * xpMul))
    // 须在血量快照前
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
      else if (this.run.cardDraws > 0) this.scene.start('cards')
      else this.scene.start(promoteStep(this.run) ? 'promote' : 'shop')
    })
  }

  // ── 队伍 ──

  /** 试炼场固定环形 */
  protected activeFormation(): FormationId {
    return this.sandbox ? 'ring' : currentFormation(this.run)
  }

  private currentPosts(): Point[] {
    return formationPosts(this.activeFormation(), this.lineup.length, this.orbitPhase)
  }

  private createMember(id: CharacterId, slot: number): Member {
    const def = CHARACTERS[id]
    const emoji = def.emoji
    const post = this.postBySlot[slot] ?? slot
    const off = this.currentPosts()[post] ?? { x: 0, y: 0 }
    const image = emojiImage(
      this,
      this.center.x + off.x,
      this.center.y + off.y,
      emoji,
      MEMBER.size * UNIT,
      'player',
    ).setDepth(10 + off.y / UNIT)
    this.physics.add.existing(image)
    const guarded = this.activeFormation() === 'guard' && post === 0
    const hurtRadius = MEMBER.radius * UNIT * (guarded ? TEAM.guardCenterHurtboxMul : 1)
    circleBody(image, hurtRadius)
    // body 只用于碰撞，不得让物理回写位移
    ;(image.body as ArcadeBody).moves = false
    const visualOffset = { x: 0, y: 0 }
    const handle: AbilityOwner = {
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
    const owned = this.sandbox ? [] : (this.run.memberItems[slot] ?? [])
    // 等级须与能力侧同源
    const level = this.sandbox ? sandboxLevel() + 1 : characterLevel(characterXp(owned))
    const fx = aggregateCharacterEffects(owned, levelStatsFor(id, level))
    const tiers = tiersForLevel(level)
    const memberCtx: AbilityContext = {
      ...this.abilityCtx,
      damageMul: () =>
        this.stats.damageMul * fx.damageMul * this.teamFx.teamDamageMul * this.battleFx.teamDamageMul,
      cooldownMul: () => {
        const mm = this.members[slot]
        const atk = mm && mm.atkSlowUntil > this.elapsedMs ? mm.atkSlowMul : 1
        return (
          this.stats.cooldownMul *
          fx.cooldownMul *
          this.teamFx.teamCooldownMul *
          this.battleFx.teamCooldownMul *
          atk *
          this.sandboxFireFactor()
        )
      },
      // 暴击/击退倍率在此收口
      damageTarget: (e, d, kb, sx, sy) => {
        const critChance = Math.min(0.5, fx.critChance + this.teamFx.critAdd + this.battleFx.critAdd)
        const crit = critChance > 0 && this.rng.next() < critChance
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
      spawnProjectile: (x, y, angle, pDef, damage) =>
        spawnProjectile(this, x, y, angle, pDef, damage, slot),
      poisonTarget: (enemy, dmg, tickMs, durationMs) =>
        this.poisonEnemy(enemy as ImageObj, dmg, tickMs, durationMs, slot),
      spawnGroundEffect: (x, y, def) =>
        spawnGroundEffect(this, x, y, def, { faction: 'team', srcSlot: slot }),
      grantOwnerInvuln: (ms) => {
        const mm = this.members[slot]
        if (mm) mm.lastHitMs = this.elapsedMs + ms - mm.iframesMs
      },
      // 注册幂等；未烘焙时保持静态
      playOwnerClip: (clipId, durMs) => {
        const mm = this.members[slot]
        if (!mm) return
        mm.anim.register(clipId, clipFramesLive(this, mm.emoji, clipId, 'player'))
        mm.anim.play(clipId, { durMs })
      },
    }
    const maxHp = this.sandbox
      ? this.stats.maxHp
      : Math.round(memberMaxHp(fx.hpAdd, CAPTAINS[this.run.captainId].hpMul) * this.teamFx.teamHpMul)
    const anim = new Animator(image)
    anim.register('idle', clipFramesLive(this, emoji, 'idle', 'player'))
    anim.setIdle('idle', ANIM_DEF.durMs, slot * 173)
    const member: Member = {
      emoji,
      slot,
      image,
      // 错开初始冷却
      abilities: loadoutFor(def, tiers).map((w, i) => {
        const px = toPx(resolveAbilityDef(w, fx))
        return createAbility(px, this.wallAwareCtx(px, memberCtx, slot), 300 + slot * 120 + i * 230)
      }),
      handle,
      visualOffset,
      fx,
      ctx: memberCtx,
      maxHp,
      hurtRadius,
      iframesMs: MEMBER.iframesMs + fx.iframesAddMs,
      reviveMs: Math.max(
        1000,
        TEAM.reviveMs * CAPTAINS[this.run.captainId].reviveMul * this.teamFx.reviveMul + fx.reviveAddMs,
      ),
      regenPerSec: fx.regenPerSec,
      thorns: fx.thorns,
      killHeal: fx.killHeal,
      hp: this.sandbox
        ? this.stats.maxHp
        : waveStartHp(this.run.memberHp[slot] ?? MEMBER.maxHp, maxHp),
      alive: true,
      reviveAt: 0,
      lastHitMs: -Infinity,
      lastGroundHitMs: -Infinity,
      atkSlowUntil: 0,
      atkSlowMul: 1,
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
      anim,
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
    attachMember(image, member)
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

    const stick = hudMoveVector()
    const dir = kx !== 0 || ky !== 0 ? norm(kx, ky) : stick
    this.teamDir = dir
    this.moveInputRaw = kx !== 0 || ky !== 0 ? 1 : Math.min(1, Math.hypot(stick.x, stick.y))
    const step = (this.stats.moveSpeed * this.battleFx.moveSpeedMul * delta) / 1000
    const drift = this.teamDrift(delta)
    const next = this.constrainTeam({
      x: this.center.x + dir.x * step + drift.x,
      y: this.center.y + dir.y * step + drift.y,
    })
    this.center.x = next.x
    this.center.y = next.y
    this.centerObj.setPosition(this.center.x, this.center.y)
    this.layoutTeam(delta)
  }

  /** 每帧力量最大者掌舵，主力倾向驱动共享相位 */
  private updateOrbit(delta: number): void {
    if (this.members.length === 0) return
    const formation = this.activeFormation()
    const n = this.lineup.length
    const range = ORBIT.detectRange * UNIT
    const rangeSq = range * range
    const wants = new Array<number>(this.members.length).fill(0)
    let rotatable = false
    for (const m of this.members) {
      m.hasThreat = false
      if (!m.alive) continue
      const bias = this.lineup[m.slot]?.orbit ?? 0
      const idx = this.postBySlot[m.slot] ?? m.slot
      // null 岗位不参与主力竞争
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
      const rawTx = this.center.x + p.x + Math.sin(tSec * WANDER.freqX + m.wanderSeed) * wander
      const rawTy = this.center.y + p.y + Math.sin(tSec * WANDER.freqY + m.wanderSeed * 2.3) * wander
      const t = this.springTarget(m, rawTx, rawTy)
      const tx = t.x
      const ty = t.y
      // 拖拽超限硬拉回
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
      this.constrainFollow(m)
      m.image.setPosition(m.followX + m.visualOffset.x, m.followY + m.visualOffset.y)
      // N 保 1 中心垫底显示
      const guarded = this.activeFormation() === 'guard' && idx === 0
      m.image.setDepth(guarded ? 8.5 : 10 + this.memberDepthY(m) / UNIT)
      ;(m.image.body as ArcadeBody).updateFromGameObject()
      m.hpBar.setPosition(m.image.x, m.image.y)
      m.deadText.setPosition(m.image.x, m.image.y)
    }
  }

  // delta 真实帧长；wdelta 世界时长
  private updateMembers(delta: number, wdelta: number): void {
    const moving = this.teamDir.x !== 0 || this.teamDir.y !== 0
    for (const m of this.members) {
      if (m.alive) {
        // hp 允许小数，展示处取整
        if (m.regenPerSec > 0 && m.hp < m.maxHp) {
          m.hp = Math.min(m.maxHp, m.hp + (m.regenPerSec * wdelta) / 1000)
        }
        // 0 哨兵确保只清一次
        if (m.atkSlowUntil > this.elapsedMs) {
          m.image.setTint(0x9ccc65)
        } else if (m.atkSlowUntil !== 0) {
          m.atkSlowUntil = 0
          m.image.clearTint()
        }
        this.animateMember(m, moving, delta)
        this.drawMemberHp(m)
        for (const w of m.abilities) w.update(wdelta, m.handle)
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
    m.anim.update(this.elapsedMs)
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
    const y = MEMBER.size * UNIT * 0.62
    const g = m.hpBar
    g.clear()
    g.fillStyle(0x000000, 0.45)
    g.fillRect(-w / 2, y, w, 6)
    g.fillStyle(ratio > 0.5 ? 0x66bb6a : ratio > 0.25 ? 0xffdc5d : 0xef5350, 1)
    g.fillRect(-w / 2 + 1, y + 1, (w - 2) * ratio, 4)
  }

  protected onMemberTouched(m: Member, enemy: ImageObj): void {
    if (this.over || !enemy.active) return
    const a = enemyOf(enemy)
    if (a.dormant) return
    // 替身无害
    if (a.decoy) return
    // 变形期无害
    if ((a.morph?.until ?? 0) > this.elapsedMs) return
    if (!m.alive || this.elapsedMs - m.lastHitMs < m.iframesMs) return
    m.lastHitMs = this.elapsedMs
    this.contactSrcName = a.def.name
    this.contactTargets[0] = m.image
    applyEffects(this.enemyContactCtx, a.def.onContact ?? DEFAULT_CONTACT, {
      center: { x: m.image.x, y: m.image.y },
      baseDamage: a.def.damage * a.dmgMul,
      targets: this.contactTargets,
    })
    if (m.thorns > 0 && enemy.active) {
      this.applyDamage(enemy, m.thorns, 0, undefined, undefined, m.slot)
    }
  }

  protected onMemberShot(m: Member, shot: ImageObj): void {
    if (this.over || !shot.active) return
    if (!m.alive) return
    const { damage, srcName } = projectileOf(shot)
    releasePooled(shot)
    if (this.elapsedMs - m.lastHitMs < m.iframesMs) return
    m.lastHitMs = this.elapsedMs
    this.hurtMember(m, damage, 0xff7777, srcName)
  }

  // ── 治疗 ──

  /** all=false 只治血量比例最低的一名，满血者不计；返回被治人数 */
  private healAllies(x: number, y: number, range: number, amount: number, all: boolean): number {
    const r2 = range * range
    const hurt = this.members.filter((m) => {
      if (!m.alive || m.hp >= m.maxHp) return false
      const dx = m.image.x - x
      const dy = m.image.y - y
      return dx * dx + dy * dy <= r2
    })
    if (hurt.length === 0) return 0
    const targets = all
      ? hurt
      : [hurt.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))]
    for (const m of targets) {
      m.hp = Math.min(m.maxHp, m.hp + amount)
      m.shownHpRatio = -1
    }
    return targets.length
  }

  /** 无阵亡者返回 false */
  private cutReviveTimer(x: number, y: number, range: number, ms: number): boolean {
    const r2 = range * range
    let best: Member | undefined
    for (const m of this.members) {
      if (m.alive) continue
      const dx = m.image.x - x
      const dy = m.image.y - y
      if (dx * dx + dy * dy > r2) continue
      if (!best || m.reviveAt > best.reviveAt) best = m
    }
    if (!best) return false
    best.reviveAt -= ms
    return true
  }

  hurtMember(m: Member, damage: number, tint: number, srcName?: string): void {
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
    for (const w of m.abilities) w.setVisible(false)
    if (this.members.every((x) => !x.alive)) this.gameOver()
  }

  reviveMember(m: Member): void {
    playSfx('revive')
    m.alive = true
    m.hp = m.maxHp
    m.shownHpRatio = -1
    m.lastHitMs = this.elapsedMs
    ;(m.image.body as ArcadeBody).enable = true
    m.image.setAlpha(1).clearTint()
    m.hpBar.setVisible(true)
    m.deadText.setVisible(false)
    for (const w of m.abilities) w.setVisible(true)
    m.animLockUntil = this.elapsedMs + 220
    m.image.setScale(m.baseScale * 0.3)
    this.tweens.add({ targets: m.image, scale: m.baseScale, duration: 200, ease: 'Back.easeOut' })
  }

  private aliveMembers(): Member[] {
    return this.members.filter((m) => m.alive)
  }

  // ── 攻击与伤害 ──

  protected cullProjectiles(): void {
    const view = this.cameras.main.worldView
    const slack = 4 * UNIT
    for (const p of this.projectiles.getChildren() as ImageObj[]) {
      if (!p.active) continue
      if (
        p.x < view.x - slack ||
        p.x > view.right + slack ||
        p.y < view.y - slack ||
        p.y > view.bottom + slack
      ) {
        releasePooled(p)
      }
    }
  }

  applyDamage(
    enemy: ImageObj,
    damage: number,
    knockback = 0,
    srcX?: number,
    srcY?: number,
    srcSlot = -1,
    crit = false,
  ): void {
    if (!enemy.active) return
    const a = enemyOf(enemy)
    if (a.dormant) return
    if ((a.morph?.vuln ?? 1) !== 1 && (a.morph?.until ?? 0) > this.elapsedMs) {
      damage = Math.round(damage * a.morph!.vuln)
    }
    const hpBefore = a.hp
    const hp = hpBefore - damage
    const st = this.run.stats
    if (srcSlot >= 0 && srcSlot < st.damage.length) {
      st.damage[srcSlot] = (st.damage[srcSlot] ?? 0) + Math.min(damage, Math.max(0, hpBefore))
      if (hp <= 0) st.kills[srcSlot] = (st.kills[srcSlot] ?? 0) + 1
    }
    this.floatDamage(enemy.x, enemy.y, damage, crit)
    // 变形期击退免疫失效
    if (a.kbImmune && a.morph === undefined) knockback = 0
    if (hp <= 0) {
      // 致死一击的击退不衰减
      if (knockback > 0 && srcX !== undefined && srcY !== undefined) {
        const d = this.worldDelta({ x: srcX, y: srcY }, enemy)
        const dir = norm(d.x, d.y)
        this.killEnemy(enemy, dir.x * knockback, dir.y * knockback, srcSlot)
      } else {
        this.killEnemy(enemy, 0, 0, srcSlot)
      }
    } else {
      a.hp = hp
      playSfx('hit')
      a.flashUntil = this.elapsedMs + 70
      // Phaser 4 已废弃 setTintFill；clearTint 会一并复位 tintMode
      enemy.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL)
      if (knockback > 0 && srcX !== undefined && srcY !== undefined) {
        const d = this.worldDelta({ x: srcX, y: srcY }, enemy)
        const dir = norm(d.x, d.y)
        let kvx = a.kvx + dir.x * knockback
        let kvy = a.kvy + dir.y * knockback
        const len = Math.hypot(kvx, kvy)
        if (len > KNOCKBACK.maxSpeed) {
          kvx = (kvx / len) * KNOCKBACK.maxSpeed
          kvy = (kvy / len) * KNOCKBACK.maxSpeed
        }
        a.kvx = kvx
        a.kvy = kvy
      }
    }
  }

  /** 主目标不入 blast 圈 */
  runProjectileHit(onHit: readonly Effect[] | undefined, target: TargetInfo, baseDamage: number, srcSlot: number): void {
    if (!onHit) return
    this.teamEffectSlot = srcSlot
    this.teamEffectExclude.clear()
    this.teamEffectExclude.add(target.ref)
    applyEffects(this.teamEffectCtx, onHit, {
      center: { x: target.x, y: target.y },
      baseDamage,
      targets: [target.ref],
      exclude: this.teamEffectExclude,
    })
  }

  // rng 取用顺序不可乱动
  private killEnemy(enemy: ImageObj, flingVx = 0, flingVy = 0, srcSlot = -1): void {
    const a = enemyOf(enemy)
    this.run.kills++
    playSfx('kill')
    this.recordKillStats(a)
    this.runOnKill(srcSlot)
    this.grantKillRewards(a, enemy)
    if (a.carries) spawnFieldPickup(this, enemy.x, enemy.y, a.carries)
    if (a.boss) this.onBossDown(enemy)
    // 变形中死亡不触发亡语与拆巢
    if (a.morph === undefined) {
      runDeathEffects(this, a)
      // 须在 despawnKilled 之前，否则 owner 反查失效
      if (a.def.spawner) this.orphanBrood(a)
    }
    this.despawnKilled(enemy, a, flingVx, flingVy)
  }

  private recordKillStats(a: Enemy): void {
    const st = this.run.stats
    st.enemyKills[a.def.name] = (st.enemyKills[a.def.name] ?? 0) + 1
    if (a.elite) st.eliteKills += 1
  }

  private runOnKill(srcSlot: number): void {
    const killer = this.members[srcSlot]
    if (killer?.alive && killer.killHeal > 0) {
      killer.hp = Math.min(killer.maxHp, killer.hp + killer.killHeal)
    }
  }

  /** rng 每杀固定取两次，勿调整取用次序 */
  private grantKillRewards(a: Enemy, enemy: ImageObj): void {
    const def = a.def
    const elite = a.elite
    const xpMul =
      CAPTAINS[this.run.captainId].xpGainMul * this.teamFx.xpGainMul * (elite ? ELITE.xpMul : 1)
    this.gainTeamXp(Math.round(def.xp * xpMul))
    const eaten = a.thief?.eaten ?? 0
    const dropRoll = this.rng.next()
    const doubleRoll = this.rng.next()
    const dropped = dropRoll < coinDropChance((this.run.combatMs + this.elapsedMs) / 1000)
    const baseCoins = dropped ? Math.round(def.coins * (elite ? ELITE.coinsMul : 1)) : 0
    const doubled = baseCoins > 0 && doubleRoll < this.teamFx.doubleCoinChance ? baseCoins : 0
    spawnCoins(this, enemy.x, enemy.y, baseCoins + doubled + eaten + (eaten > 0 ? 1 : 0))
  }

  private onBossDown(enemy: ImageObj): void {
    this.boss = undefined
    this.deathBurst.explode(24, enemy.x, enemy.y)
    this.time.delayedCall(700, () => {
      if (!this.over) this.endWave()
    })
  }

  private despawnKilled(enemy: ImageObj, a: Enemy, flingVx: number, flingVy: number): void {
    detachCarrierAura(this, a)
    if (a.abilities) for (const w of a.abilities) w.destroy()
    this.deathBurst.explode(6, enemy.x, enemy.y)
    spawnShards(this, enemy, flingVx, flingVy)
    releasePooled(enemy)
  }

  spawnBrood(into: EnemyDef, count: number, cx: number, cy: number, scatter: number, owner?: Enemy): void {
    const hpMul = waveAt((this.run.combatMs + this.elapsedMs) / 1000).hpMultiplier
    for (let i = 0; i < count; i++) {
      const ang = this.rng.next() * Math.PI * 2
      const child = this.materializeEnemy(
        into,
        cx + Math.cos(ang) * scatter,
        cy + Math.sin(ang) * scatter,
        Math.round(into.hp * hpMul),
      )
      if (owner) child.owner = owner
    }
  }

  private broodCount(nest: Enemy): number {
    let n = 0
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (e.active && enemyOf(e).owner === nest) n++
    }
    return n
  }

  private spawnFromNest(a: Enemy, spawner: NonNullable<EnemyDef['spawner']>): void {
    if (this.over || this.enemies.countActive(true) >= SPAWN.maxAlive) return
    const room = spawner.maxAlive - this.broodCount(a)
    if (room <= 0) return
    this.spawnBrood(spawner.into, Math.min(spawner.count, room), a.image.x, a.image.y, 0.6 * UNIT, a)
  }

  private orphanBrood(nest: Enemy): void {
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      const c = enemyOf(e)
      if (c.owner !== nest) continue
      c.owner = undefined
      const lm = c.def.locomotion
      if (lm.kind === 'baseOrbit') {
        c.spMul *= lm.orphanSpeedMul
        c.dmgMul *= lm.orphanDamageMul
      }
    }
  }

  /** 蓄力前被打死则不引爆 */
  detonate(a: Enemy): void {
    const lm = a.def.locomotion
    if (lm.kind !== 'detonate') return
    const e = a.image
    const ctx = buildEnemyCtx(this, a)
    applyBlast(ctx, { x: e.x, y: e.y }, Math.round(lm.blastDamage * a.dmgMul), lm.blastRadius, lm.knockback)
    blastRing(this, e.x, e.y, lm.blastRadius, {
      color: 0xff5252,
      fillAlpha: 0.35,
      lineWidth: 3,
      lineAlpha: 0.9,
      durMs: 300,
    })
    playSfx('boom')
    this.despawnEnemy(e)
  }

  /** 不计击杀、不掉落、不跑死亡效果 */
  private despawnEnemy(enemy: ImageObj, puff = true): void {
    const a = enemyOf(enemy)
    if (a.def.spawner) this.orphanBrood(a)
    detachCarrierAura(this, a)
    if (a.abilities) for (const w of a.abilities) w.destroy()
    if (puff) this.puffBurst.explode(8, enemy.x, enemy.y)
    releasePooled(enemy)
  }

  private newDamageText(): Phaser.GameObjects.BitmapText {
    return this.add.bitmapText(0, 0, DAMAGE_FONT).setFontSize(24).setOrigin(0.5).setDepth(50).setVisible(false)
  }

  newShard(): ImageObj {
    return this.add.image(0, 0, '__DEFAULT').setDepth(6).setVisible(false) as ImageObj
  }

  private floatDamage(x: number, y: number, amount: number, crit = false): void {
    if (!this.settings.damageNumbers) return
    // 轮到的还在播就插一个新的，不抢占
    if (this.damagePool[this.damagePoolIdx]!.visible) this.damagePool.splice(this.damagePoolIdx, 0, this.newDamageText())
    const t = this.damagePool[this.damagePoolIdx]!
    this.damagePoolIdx = (this.damagePoolIdx + 1) % this.damagePool.length
    this.tweens.killTweensOf(t)
    // 池对象复用，须复位样式
    t.setFontSize(crit ? 34 : 24).setTint(crit ? 0xffdc5d : 0xffffff)
    t.setText(String(amount)).setPosition(x, y - 14).setAlpha(1).setVisible(true)
    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 350,
      onComplete: () => t.setVisible(false),
    })
  }

  // ── 刷怪 ──

  private spawn(delta: number): void {
    this.spawnCooldownMs -= delta
    if (this.spawnCooldownMs > 0) return
    if (this.sandbox) return this.spawnSandbox()
    const wave = waveAt((this.run.combatMs + this.elapsedMs) / 1000)
    const teamFactor = SPAWN.teamFactorBase + SPAWN.teamFactorPerMember * this.members.length
    const relief = isBossWave(this.run.wave) ? BOSS_SPAWN_RELIEF : 1
    this.spawnCooldownMs = (wave.spawnIntervalMs * relief * this.spawnIntervalScale()) / teamFactor
    if (this.spawnCapCount() + this.pendingSpawns >= SPAWN.maxAlive) return
    this.spawnOne(wave.hpMultiplier)
  }

  /** 只补勾选的敌人，且只生成本图会出现的 */
  private spawnSandbox(): void {
    const d = spawnParams()
    this.spawnCooldownMs = d.intervalMs
    const roster = new Set<string>(mapEnemyRoster(this.run.mapId).map((e) => e.kind))
    const kinds = [...sandboxEnemySet()].filter((k) => k in ENEMIES && roster.has(k))
    if (kinds.length === 0) return
    const hpMul = sandboxDifficulty()
    for (let i = 0; i < d.batch; i++) {
      if (this.spawnCapCount() + this.pendingSpawns >= d.cap) return
      const raw = ENEMIES[kinds[Math.floor(this.rng.next() * kinds.length)]!]!
      const def = toPx(raw)
      this.spawnTelegraphed(def, Math.round(def.hp * hpMul), false, def.role === 'boss')
    }
  }

  private sandboxFireFactor(): number {
    return this.sandbox ? 1 / sandboxFireRate() : 1
  }

  applySandboxInvincible(): void {
    const mh = sandboxInvincible() ? INVINCIBLE_HP : MEMBER.maxHp
    this.stats.maxHp = mh
    for (const m of this.members) {
      m.maxHp = mh
      m.hp = sandboxInvincible() ? mh : Math.min(m.hp, mh)
    }
  }

  private spawnOne(hpMultiplier: number, forceElite = false): void {
    const def = toPx(pickEnemy(this.enemyMix, () => this.rng.next()))
    const elite =
      !this.sandbox &&
      (forceElite ||
        (this.run.wave >= ELITE.fromWave && this.rng.next() < ELITE.chance))
    const hp = Math.round(def.hp * hpMultiplier * (elite ? ELITE.hpMul : 1))
    this.spawnTelegraphed(def, hp, elite, false)
  }

  /** 预告期间无碰撞；pos 登记进注册表供重映射改写 */
  private spawnTelegraphed(
    def: EnemyDef,
    hp: number,
    elite: boolean,
    boss: boolean,
    carries?: FieldPickupDef,
  ): void {
    const pos = boss ? this.bossSpawnPoint() : this.spawnPoint()
    this.pendingSpawns++
    const mark = emojiImage(this, pos.x, pos.y, SPAWN.markEmoji, SPAWN.markSize * UNIT * (boss ? 2 : 1))
      .setDepth(4)
      .setAlpha(0)
    const entry = { pos, mark }
    this.pendingMarks.push(entry)
    this.tweens.add({
      targets: mark,
      alpha: 1,
      duration: SPAWN.telegraphMs / (boss ? 4 : 6),
      yoyo: true,
      repeat: boss ? 3 : 2,
    })
    this.time.delayedCall(SPAWN.telegraphMs, () => {
      mark.destroy()
      this.pendingSpawns--
      this.pendingMarks = this.pendingMarks.filter((x) => x !== entry)
      if (!this.over) this.materializeEnemy(def, pos.x, pos.y, hp, elite, boss, 1, carries)
    })
  }

  private spawnBoss(): void {
    const pos = this.bossSpawnPoint()
    this.pendingSpawns++
    const mark = emojiImage(this, pos.x, pos.y, SPAWN.markEmoji, SPAWN.markSize * UNIT * 2).setDepth(4).setAlpha(0)
    const entry = { pos, mark }
    this.pendingMarks.push(entry)
    this.tweens.add({ targets: mark, alpha: 1, duration: SPAWN.telegraphMs / 4, yoyo: true, repeat: 3 })
    this.time.delayedCall(SPAWN.telegraphMs * 1.6, () => {
      mark.destroy()
      this.pendingSpawns--
      this.pendingMarks = this.pendingMarks.filter((x) => x !== entry)
      if (this.over) return
      const def = toPx(bossFor(this.run.mapId))
      this.materializeEnemy(def, pos.x, pos.y, def.hp, false, true)
      playSfx('boom')
    })
  }

  /** 均匀撒在本波中前段；第 1 波不出 */
  private scheduleCarriers(): void {
    if (this.run.wave < 2) return
    const isBoss = isBossWave(this.run.wave)
    const carriers = rollWaveCarriers(this.run.mapId, this.run.wave, isBoss, () => this.rng.next())
    if (carriers.length === 0) return
    const dur = waveDurationMs(this.run.wave)
    carriers.forEach((pickup, i) => {
      const at = dur * 0.12 + (dur * 0.7 * i) / carriers.length
      this.time.delayedCall(at, () => {
        if (!this.over) this.spawnCarrier(pickup)
      })
    })
  }

  /** 场上过挤则跳过 */
  private spawnCarrier(pickup: FieldPickupDef): void {
    if (this.spawnCapCount() + this.pendingSpawns >= SPAWN.maxAlive) return
    const def = toPx(pickEnemy(this.enemyMix, () => this.rng.next()))
    const hp = Math.round(def.hp * waveAt((this.run.combatMs + this.elapsedMs) / 1000).hpMultiplier)
    this.spawnTelegraphed(def, hp, false, false, pickup)
  }

  private spawnSurge(): void {
    const hpMul = waveAt((this.run.combatMs + this.elapsedMs) / 1000).hpMultiplier
    for (let i = 0; i < SURGE.count; i++) {
      this.time.delayedCall((i * SURGE.spreadMs) / SURGE.count, () => {
        if (!this.over) this.spawnOne(hpMul, i < SURGE.elites)
      })
    }
  }

  materializeEnemy(
    def: EnemyDef,
    x: number,
    y: number,
    hp: number,
    elite = false,
    boss = false,
    alpha = 1,
    carries?: FieldPickupDef,
  ): Enemy {
    const pos = this.constrainEnemyPos({ x, y }, def.radius)
    const outline = elite || boss ? 'elite' : 'enemy'
    const enemy = acquirePooled(
      this,
      this.enemies,
      pos.x,
      pos.y,
      emojiKey(def.emoji, outline),
      def.size * (elite ? ELITE.sizeMul : 1),
      def.radius,
    )
    enemy.setDepth(boss ? 7 : 5)
    if (boss) this.configureBossBody(enemy)
    else this.configureEnemyBody(enemy)
    const dirX = Math.cos(this.rng.next() * Math.PI * 2)
    const dirY = Math.sin(this.rng.next() * Math.PI * 2)
    const turnAt = this.elapsedMs + AI.wander.spawnTurnMinMs + this.rng.next() * AI.wander.spawnTurnJitterMs
    const fireAt = this.elapsedMs + 900 + this.rng.next() * 1500
    const ph = this.rng.next() * Math.PI * 2
    const anim = new Animator(enemy)
    anim.register('idle', clipFramesLive(this, def.emoji, 'idle', elite || boss ? 'elite' : 'enemy'))
    anim.setIdle('idle', ANIM_DEF.durMs, (ph / (Math.PI * 2)) * ANIM_DEF.durMs)
    const lm = def.locomotion
    const charge =
      lm.kind === 'dash' || lm.kind === 'detonate'
        ? {
            windupUntil: 0,
            dashUntil: 0,
            coolUntil: 0,
            nextDashAt:
              lm.kind === 'dash' && lm.trigger.kind === 'timer'
                ? this.elapsedMs + (lm.trigger.firstDelayMs ?? lm.trigger.intervalMs)
                : 0,
          }
        : undefined
    const nextSpawnAt = def.spawner ? this.elapsedMs + (def.spawner.firstDelayMs ?? def.spawner.intervalMs) : 0
    const a = attachEnemy(enemy, def, hp, {
      elite,
      boss,
      kbImmune: def.kbImmune ?? false,
      state: lm.kind === 'dash' && lm.idle === 'chase' ? 'chase' : 'wander',
      spMul: elite ? ELITE.speedMul : 1,
      dmgMul: elite ? ELITE.damageMul : 1,
      dirX,
      dirY,
      turnAt,
      charge,
      nextSpawnAt,
      ph,
      anim,
      danceUntil: this.elapsedMs < this.danceEndsAt ? this.danceEndsAt : 0,
      carries,
    })
    armEnemy(this, a, fireAt - this.elapsedMs)
    if (carries) a.aura = attachCarrierAura(this, enemy, carries.polarity)
    if (boss) this.boss = enemy
    const targetScale = enemy.scale
    enemy.setScale(targetScale * (boss ? 0.2 : 0.3)).setAlpha(boss ? 0.2 : 0.3)
    this.tweens.add({
      targets: enemy,
      scale: targetScale,
      alpha,
      duration: boss ? 320 : 130,
      ease: boss ? 'Back.easeOut' : 'Linear',
    })
    return a
  }

  // ── 魔尘变形 ──

  /** Boss 免疫 */
  applyHex(
    enemy: ImageObj,
    hex: { durationMs: number; morphEmoji: string; vulnMul?: number },
  ): void {
    const a = enemyOf(enemy)
    if (a.boss || this.elapsedMs < a.morphCdUntil) return
    const wasMorphed = a.morph !== undefined
    const until = this.elapsedMs + hex.durationMs
    a.morphCdUntil = until + MORPH_RECAST_CD
    a.morph = { until, vuln: hex.vulnMul ?? 1 }
    if (!wasMorphed) {
      const size = a.def.size * (a.elite ? ELITE.sizeMul : 1)
      const outline = a.elite ? ('elite' as const) : ('enemy' as const)
      enemy.setTexture(emojiKey(hex.morphEmoji, outline))
      enemy.setDisplaySize(size, size)
      a.anim?.register('idle', clipFramesLive(this, hex.morphEmoji, 'idle', outline))
      if (a.state === 'windup') enemy.clearTint()
      a.state = 'wander'
      enemy.setRotation(0)
      this.puffBurst.explode(8, enemy.x, enemy.y)
    }
  }

  /** 开火计时后延，避免恢复瞬间齐射 */
  private restoreMorph(a: Enemy): void {
    const enemy = a.image
    a.morph = undefined
    const size = a.def.size * (a.elite ? ELITE.sizeMul : 1)
    const outline = a.elite ? ('elite' as const) : ('enemy' as const)
    enemy.setTexture(emojiKey(a.def.emoji, outline))
    enemy.setDisplaySize(size, size)
    a.anim?.register('idle', clipFramesLive(this, a.def.emoji, 'idle', outline))
    if (a.abilities) for (const w of a.abilities) w.postponeFire?.(700)
    this.puffBurst.explode(6, enemy.x, enemy.y)
  }

  private slowFactorFor(a: Enemy): number {
    const e = a.image
    let factor = 1
    for (const z of this.frameSlowZones) {
      const d = this.worldDelta(z, e)
      if (d.x * d.x + d.y * d.y <= z.r2) factor *= z.factor
    }
    const slowed = factor < 1
    if (slowed !== a.slowed) {
      a.slowed = slowed
      if (slowed) e.setTint(0xa5d8ff)
      else e.clearTint()
    }
    const aslow = a.abilitySlow
    if (aslow !== undefined && this.elapsedMs < aslow.until) {
      factor *= aslow.mul
    }
    // 时停的世界时标在此并入敌速；不参与冷色染色判定
    return (
      factor * a.spMul * this.teamFx.enemySlowMul * this.battleFx.enemySlowMul * this.worldTimeScale()
    )
  }

  /** 不叠加 */
  private poisonEnemy(enemy: ImageObj, dmg: number, tickMs: number, durationMs: number, slot: number): void {
    if (!enemy.active) return
    const a = enemyOf(enemy)
    if (a.dormant) return
    a.poison = {
      dmg,
      tickMs,
      until: this.elapsedMs + durationMs,
      nextTick: this.elapsedMs + tickMs,
      slot,
    }
  }

  /** 弹道由物理按实时积分，须逐帧改写速度 */
  private applyProjectileTimeScale(scale: number): void {
    for (const group of [this.projectiles, this.enemyProjectiles]) {
      for (const p of group.getChildren() as ImageObj[]) {
        if (!p.active) continue
        const b = projectileOf(p)
        ;(p.body as ArcadeBody).setVelocity(b.bvx * scale, b.bvy * scale)
      }
    }
  }

  private nearestAlive(x: number, y: number): Member | undefined {
    let best: Member | undefined
    let bestD = Infinity
    const p = { x, y }
    for (const m of this.members) {
      if (!m.alive) continue
      const d = this.worldDelta(p, m.image)
      const dist = d.x * d.x + d.y * d.y
      if (dist < bestD) {
        bestD = dist
        best = m
      }
    }
    return best
  }

  // delta 是世界时长
  private steerEnemies(delta: number): void {
    const alive = this.aliveMembers()
    if (alive.length === 0) return
    const now = this.elapsedMs
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      const a = enemyOf(e)
      if (a.aura) a.aura.setPosition(e.x, e.y)
      if (a.dormant) continue
      if (a.despawnAt !== 0 && now >= a.despawnAt) {
        this.despawnEnemy(e)
        continue
      }
      const def = a.def
      const body = e.body as ArcadeBody
      // 须先于任何 continue
      a.anim?.update(now)
      if (a.flashUntil !== 0 && now >= a.flashUntil) {
        a.flashUntil = 0
        e.clearTint()
        a.slowed = false
        if (a.state === 'windup') e.setTint(0xffb74d)
      }

      // 跳伤可能致死，本体已释放即跳出
      const poison = a.poison
      if (poison) {
        if (now >= poison.until) {
          a.poison = undefined
          if (a.flashUntil === 0 && !a.slowed) e.clearTint()
        } else {
          if (now >= poison.nextTick) {
            poison.nextTick += poison.tickMs
            this.applyDamage(e, poison.dmg, 0, undefined, undefined, poison.slot)
            if (!e.active) continue
          }
          if (a.flashUntil === 0) e.setTint(0x7bff5a)
        }
      }

      // 粉染色每帧重设
      if (a.danceUntil !== 0) {
        if (now < a.danceUntil) {
          body.setVelocity(0, 0)
          e.setTint(0xff9ff3)
          e.setRotation(Math.sin(now / 80 + a.ph) * 0.3)
          this.decayKnockback(a, body, delta)
          if (a.boss) this.postSteerBoss(e, body)
          else this.postSteerEnemy(e, body, def)
          // 压制期只走冷却不开火
          if (a.abilities) for (const w of a.abilities) w.tickCooldown?.(delta)
          continue
        }
        a.danceUntil = 0
        e.clearTint()
        e.setRotation(0)
      }

      const morph = a.morph
      if (morph) {
        if (now < morph.until) {
          const slowM = this.slowFactorFor(a)
          const dir = this.wanderDir(a)
          body.setVelocity(dir.x * def.speed * 0.5 * slowM, dir.y * def.speed * 0.5 * slowM)
          this.decayKnockback(a, body, delta)
          this.postSteerEnemy(e, body, def)
          if (a.abilities) for (const w of a.abilities) w.tickCooldown?.(delta)
          continue
        }
        this.restoreMorph(a)
      }

      const slow = this.slowFactorFor(a)
      const target = this.nearestAlive(e.x, e.y)!

      STEERERS[def.locomotion.kind]({ scene: this, a, body, slow, now, target })
      // 策略内可能自毁
      if (!e.active) continue

      if (a.abilities) for (const w of a.abilities) w.update(delta, a.abilityOwner!)

      if (def.spawner && now >= a.nextSpawnAt) {
        this.spawnFromNest(a, def.spawner)
        a.nextSpawnAt = now + def.spawner.intervalMs
      }

      this.decayKnockback(a, body, delta)

      if (a.boss) this.postSteerBoss(e, body)
      else this.postSteerEnemy(e, body, def)

      // 脚本化姿态由各 locomotion 策略自管
      if (!a.posed) {
        e.setRotation(Math.sin(now / 95 + a.ph) * 0.1)
        const vx = body.velocity.x
        if (Math.abs(vx) > 8) e.setFlipX(vx > 0)
      }
    }
  }

  private decayKnockback(a: Enemy, body: ArcadeBody, delta: number): void {
    if (a.kvx === 0 && a.kvy === 0) return
    body.velocity.x += a.kvx
    body.velocity.y += a.kvy
    const decay = Math.exp(-delta / (KNOCKBACK.tauMs * this.knockbackTauMul()))
    if ((a.kvx * a.kvx + a.kvy * a.kvy) * decay * decay < 100) {
      a.kvx = 0
      a.kvy = 0
    } else {
      a.kvx *= decay
      a.kvy *= decay
    }
  }

  // ── 结算 ──

  private gameOver(): void {
    this.over = true
    this.physics.pause()
    playSfx('over')
    // 败局也计入
    this.run.combatMs += this.elapsedMs
    this.time.delayedCall(900, () => this.scene.start('result', { win: false }))
  }
}
