import Phaser from 'phaser'
import { toPx } from './px'
import { attachEnemy, enemyOf } from '../enemies/enemies'
import type { Enemy } from '../enemies/enemies'
import { armEnemy, buildEnemyCtx, healEnemies } from '../enemies/enemyAbilities'
import { attachMember, memberOf } from '../characters/members'
import type { Member } from '../characters/members'
import { projectileOf, spawnProjectile, sweepProjectiles, updateEnemyProjectiles } from '../projectiles/projectiles'
import { circleBody } from '../core/arcade'
import { collectCoin, magnetCoins, spawnChest, spawnCoins, spawnShards } from '../pickups/pickups'
import { spawnGroundEffect, updateGroundEffects } from '../groundEffects/groundEffects'
import type { GroundEffect } from '../groundEffects/groundEffects'
import { STEERERS } from '../enemies/steer'
import { runDeathEffects } from '../enemies/deathEffects'
import { CAPTAINS } from '../captains/registry'
import { CHARACTERS, MEMBER, ROSTER_IDS, TEAM, loadoutFor } from '../characters/registry'
import { memberMaxHp } from '../characters/stats'
import type { CharacterId, CharacterDef } from '../characters/registry'
import { SKILL } from '../captains/skill'
import { STRESS } from '../debug/dev'
import { LAB, labEnemySet } from '../run/lab'
import { BOSS_SPAWN_RELIEF, DEFAULT_CONTACT, ELITE, ENEMIES, SPAWN, SURGE } from '../enemies/registry'
import type { EnemyDef } from '../enemies/registry'
import { UNIT } from '../core/units'
import { WAVE } from '../run/waves'
import { KNOCKBACK } from '../abilities/registry'
import { FOLLOW, HIT_SHAKE, WANDER } from './config'
import { ORBIT } from '../characters/orbit'
import { enemyMixAt, pickEnemy } from '../enemies/registry'
import type { EnemyMixEntry } from '../enemies/registry'
import { formationPosts, ringPostAngle } from '../characters/formation'
import type { FormationId } from '../characters/formation'
import { angleDiff, orbitTendency, pickDriver, stepPhase, threatWeight } from '../characters/orbit'
import type { OrbitThreat } from '../characters/orbit'
import { browserStorage } from '../core/storage'
import { chestDropped } from '../pickups/chest'
import {
  upgradeTiers,
  aggregateCharacterEffects,
  aggregateTeamEffects,
  CRIT_MUL,
  resolveAbilityDef,
} from '../items/registry'
import type { TeamEffects } from '../items/registry'
import { currentFormation, getRun, guardOrder, isTeamFull, promoteStep, waveStartHp } from '../run/state'
import type { RunState } from '../run/state'
import { tickSkillCd } from '../captains/skill'
import { DEFAULT_SETTINGS, loadSettings } from '../run/settings'
import type { Settings } from '../run/settings'
import { MAPS, bossFor } from '../maps/registry'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { isWithinActive } from '../maps/world'
import { norm } from '../core/vec'
import type { Point } from '../core/vec'
import { ANIM_DEF } from '../emoji/studio'
import { isBossWave, isEliteWave, isFinalWave, waveAt, waveDurationMs } from '../run/waves'
import { gainXp, waveBonusXp, xpToNext } from '../run/xp'
import { Animator } from '../emoji/animator'
import { clipFramesLive } from '../emoji/animTextures'
import { applyBackground } from '../core/background'
import { DAMAGE_FONT, ensureDamageFont } from '../core/damageFont'
import { reportDebug } from '../debug/debug'
import { isStress } from '../debug/dev'
import { emojiImage, emojiKey } from '../emoji/textures'
import { burstEmitter } from '../core/fx'
import { acquirePooled, releasePooled } from '../core/pool'
import { playSfx } from '../audio/sfx'
import { UI_FONT } from '../core/fonts'
import { textRes, viewport, VIEWPORT_CHANGED } from '../core/apply'
import { createAbility } from '../abilities/create'
import { applyBlast, applyEffects, blastRing } from '../abilities/effects'
import type { Effect } from '../abilities/defs'
import type { TargetInfo, AbilityContext, AbilityOwner, AbilityRuntime, EffectCtx } from '../abilities/types'
import type { UIScene } from './UIScene'

// 竞技场基座：四张地图（有界/无界/河流/虚空）共享的战斗引擎——队伍与
// 能力装配、伤害与击杀结算、刷怪节奏、敌人行为状态机、地面区域、金币、
// 波次与结算、HUD/调试契约。
// ⚠️ 基座的任何改动同时作用于四张图——改前跑四图回归（e2e + 探针）。

interface TeamStats {
  damageMul: number
  cooldownMul: number
  moveSpeed: number
  maxHp: number
}

import type { ArcadeBody, ImageObj } from '../core/arcade'
export type { ArcadeBody, ImageObj } from '../core/arcade'

export interface HudSnapshot {
  xp: number
  xpNext: number
  level: number
  /** 当前可用能量豆（HUD 计数 + 满豆提示） */
  beans: number
  kills: number
  coins: number
  wave: number
  seconds: number
  remainMs: number
  over: boolean
  /** 终波 Boss 在场时的血量（null = 无 Boss） */
  bossHp: number | null
  bossMaxHp: number
}

/** 波末结算横幅的战果（本波增量） */
export interface WaveSummary {
  wave: number
  kills: number
  coins: number
  levels: number
}


function held(key?: Phaser.Input.Keyboard.Key): boolean {
  return key?.isDown ?? false
}

export abstract class BaseArenaScene extends Phaser.Scene {
  protected lineup: readonly CharacterDef[] = []
  members: Member[] = []
  protected memberGroup!: Phaser.GameObjects.Group
  center = { x: 0, y: 0 }
  protected centerObj!: Phaser.GameObjects.Zone
  enemies!: Phaser.GameObjects.Group
  projectiles!: Phaser.GameObjects.Group
  enemyProjectiles!: Phaser.GameObjects.Group
  coins!: Phaser.GameObjects.Group
  /** 地面效果（毒液/灼烧等，敌我同构），波末随场景销毁 */
  groundEffects: GroundEffect[] = []
  private enemyMix: EnemyMixEntry[] = []
  frameTargets: TargetInfo[] = []
  /** 敌方能力的索敌快照：存活队员（虚空图含镜像坐标），每帧重建 */
  frameMemberTargets: TargetInfo[] = []
  private frameSlowZones: { x: number; y: number; r2: number; factor: number }[] = []
  /** 仅本帧生效的金币吸取点（磁力回旋镖沿途登记） */
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
      a.abilitySlowMul = factor
      a.abilitySlowUntil = this.elapsedMs + durationMs
    },
    spawnGroundEffect: (x, y, def) => spawnGroundEffect(this, x, y, def, { faction: 'team', srcSlot: -1 }),
    attractCoins: (x, y, radius) => this.frameAttractors.push({ x, y, r2: radius * radius }),
    // 基座 ctx 无「本人」概念：无敌授予/本体动画由 memberCtx 按槽位覆写
    playOwnerClip: () => {},
    heal: (x, y, range, amount, all) => this.healAllies(x, y, range, amount, all),
    cutReviveTimer: (x, y, range, ms) => this.cutReviveTimer(x, y, range, ms),
    rallyTeam: (healRatio, invulnMs) => this.rallyTeam(healRatio, invulnMs),
    danceTargets: (durationMs) => this.danceTargets(durationMs),
    buffTeamDamage: (mul, durationMs) => this.buffTeamDamage(mul, durationMs),
    spawnCoins: (x, y, count) => this.spawnRewardCoins(x, y, count),
    waveScale: () => (this.sandbox ? 1 : waveAt((this.run.combatMs + this.elapsedMs) / 1000).hpMultiplier),
    isBossTarget: (ref) => enemyOf(ref as ImageObj).boss,
    morphTarget: (ref, spec) => this.applyHex(ref as ImageObj, spec),
    damageMul: () => this.stats.damageMul,
    cooldownMul: () => this.stats.cooldownMul,
    sfx: (id) => playSfx(id),
  }
  // 效果触发的场景级 team ctx：子弹/命中效果复用统一 applyEffects，归属靠 teamEffectSlot
  // 逐帧改写（子弹可能比发射者活得久，故场景级而非持有者级）
  private teamEffectSlot = -1
  private teamEffectExclude = new Set<TargetInfo['ref']>()
  private teamEffectCtx: EffectCtx = {
    scene: this,
    targets: () => this.frameTargets,
    damageTarget: (ref, damage, kb, sx, sy) =>
      this.applyDamage(ref as ImageObj, damage, kb ?? 0, sx, sy, this.teamEffectSlot),
    slowTarget: (enemy, factor, durationMs) => {
      const a = enemyOf(enemy as ImageObj)
      a.abilitySlowMul = factor
      a.abilitySlowUntil = this.elapsedMs + durationMs
    },
    spawnGroundEffect: (x, y, def) =>
      spawnGroundEffect(this, x, y, def, { faction: 'team', srcSlot: this.teamEffectSlot }),
    heal: (x, y, range, amount, all) => this.healAllies(x, y, range, amount, all),
    // 死者不变形（子弹主伤可能已致死）；Boss 免疫由 applyHex 拒绝
    morphTarget: (ref, spec) => {
      if ((ref as ImageObj).active) this.applyHex(ref as ImageObj, spec)
    },
  }
  // 接触触发的场景级 enemy ctx：敌人蹭队员的 onContact 效果复用统一 applyEffects。
  // 无敌帧节流在 onMemberTouched 掌管，故 damageTarget 裸施伤（区别于远程命中的敌方 ctx）
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
  teamFx: TeamEffects = aggregateTeamEffects([])
  private settings: Settings = DEFAULT_SETTINGS
  run!: RunState
  private damagePool: Phaser.GameObjects.BitmapText[] = []
  private damagePoolIdx = 0
  // 死亡碎块对象池：敌人死亡时本体裂成 4 个象限碎片（复用固定数量 Image，零分配）
  shardPool: ImageObj[] = []
  shardPoolIdx = 0
  // 爆发型粒子：敌人死亡（紫系）/ 金币拾取（金系）/ 队员倒下（烟尘）
  private deathBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  coinBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private puffBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  /** 本帧队伍移动方向（行走摇摆与朝向翻转用） */
  private teamDir = { x: 0, y: 0 }
  /** 槽位 → 队形岗位序号（N 保 1 时受保护中心占 0 号岗） */
  private postBySlot: number[] = []
  /** 终波 Boss 实体（在场时 HUD 显示血条；击杀即提前通关） */
  protected boss?: ImageObj
  /** 环形阵专用：全环共享相位（刚性同步转动，core/orbit.ts 逐帧演化） */
  private orbitPhase = 0
  /** 当前主力岗位（-1 = 无人驱动）；力量竞争逐帧裁定，随时换手 */
  private driverPost = -1
  elapsedMs = 0
  private spawnCooldownMs = 0
  private pendingSpawns = 0
  // 沙盒骨架（免死/无时限/无进度/无精英Boss波/满编环形）：压测与试炼场共享
  sandbox = false
  // 压测专属（洪水刷怪 + 10×攻速）——与试炼场区分开
  flood = false
  // 试炼场：只出勾选的敌人，维持小在场池，真实冷却
  lab = false
  over = false
  // 本波战果基线（结算横幅展示增量用）
  private waveBaseKills = 0
  private waveBaseCoins = 0
  private waveBaseLevel = 1
  /** 本帧活跃敌人数（buildFrameTargets 统计；无界图剔除休眠者） */
  protected awakeCount = 0
  /** 本帧休眠敌人数（仅带休眠机制的图非零） */
  protected dormantCount = 0
  /** 刷怪预告注册表：需要重映射实体的图（河流/虚空旋转）可原位改写 pos */
  protected pendingMarks: { pos: Point; mark: ImageObj }[] = []
  /** 玩家子弹寿命上限（null = 不按寿命回收；虚空图必须设——环面上永不出屏） */
  projectileTtlMs: number | null = null
  /** 增益能力的全队增伤到期时刻（不跨波；到期把 stats.damageMul 拨回 1） */
  skillBuffUntil = 0
  /** 群舞能力的舞会结束时刻：窗口内新落地的敌人也要跳 */
  danceEndsAt = 0
  /** 队长主动技能的效果载荷：标准能力行实例，castNow 单发（不走 update 自转） */
  private captainAbilities: AbilityRuntime[] = []
  private captainHandle: AbilityOwner = { x: 0, y: 0, setVisualOffset: () => {} }

  // ── 世界规则钩子：子类只实现自己那一列差异 ───────────────────

  /** 世界几何与视觉：物理边界/相机/地面/装饰（内部顺序由子类掌控） */
  protected abstract createWorld(): void
  /** 队伍出生点 */
  protected abstract spawnCenter(): Point
  /** 刷怪落点 */
  protected abstract spawnPoint(): Point
  /** 终波 Boss 落点 */
  protected abstract bossSpawnPoint(): Point
  /** 终波警示横幅副标题 */
  protected abstract finalWaveWarningSub(): string

  /** 世界私有字段的开局重置（scene.restart 复用实例） */
  protected resetWorldFields(): void {}
  /** 相机跟随挂接（跟随式相机的图在此 startFollow；固定相机图空实现） */
  protected attachCamera(_target: Phaser.GameObjects.Zone): void {
    void _target
  }
  /** 差向量 from→to：索敌/追击/磁吸的几何基元（虚空图换环面最短差） */
  worldDelta(from: Point, to: Point): Point {
    return { x: to.x - from.x, y: to.y - from.y }
  }
  /** 本帧攻击目标 + 活跃计数（无界/河流剔除休眠者；虚空附加镜像坐标） */
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
  /** 敌方能力的索敌目标：存活队员快照（虚空图附加镜像坐标） */
  protected buildMemberTargets(): TargetInfo[] {
    const targets: TargetInfo[] = []
    for (const m of this.members) {
      if (!m.alive) continue
      targets.push({ x: m.image.x, y: m.image.y, radius: m.hurtRadius, ref: m.image })
    }
    return targets
  }
  /** 刷怪上限的计数口径（有界图取实时活跃数；带休眠的图取本帧活跃数） */
  protected spawnCapCount(): number {
    return this.awakeCount
  }
  /** 队伍中心钳制/回绕 */
  protected constrainTeam(next: Point): Point {
    return next
  }
  /** 队伍逐帧漂移（河流水流） */
  protected teamDrift(_delta: number): Point {
    void _delta
    return { x: 0, y: 0 }
  }
  /** 队员弹簧目标（虚空图取环面最近镜像） */
  protected springTarget(m: Member, tx: number, ty: number): Point {
    void m
    return { x: tx, y: ty }
  }
  /** 队员跟随点后处理（虚空图回绕） */
  protected constrainFollow(_m: Member): void {
    void _m
  }
  /** 队员纵深参照（遮挡排序；虚空图用环面差） */
  protected memberDepthY(m: Member): number {
    return m.followY - this.center.y
  }
  /** 接触判定装配：默认物理 overlap；虚空图改手写环面判定（touchStep） */
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
  /** 逐帧接触判定（虚空图的手写环面圆-圆；overlap 图空实现） */
  protected touchStep(): void {}
  /** 敌人落地体配置（有界图 setCollideWorldBounds） */
  protected configureEnemyBody(_enemy: ImageObj): void {
    void _enemy
  }
  protected configureBossBody(_enemy: ImageObj): void {
    void _enemy
  }
  /** 敌人落点钳制/回绕（分裂溅出等边缘情况的兜底；河流按体径钳跨向） */
  protected constrainEnemyPos(p: Point, _radius: number): Point {
    void _radius
    return p
  }
  /** 金币落点钳制/回绕 */
  constrainCoinPos(p: Point): Point {
    return p
  }
  /** 死亡碎片飞散终点钳制（有界图不许飞出地图） */
  constrainShardTarget(p: Point): Point {
    return p
  }
  /** 游荡方向（有界图撞边折返版在子类） */
  wanderDir(a: Enemy): Point {
    if (this.elapsedMs >= a.turnAt) {
      const ang = this.rng.next() * Math.PI * 2
      a.dirX = Math.cos(ang)
      a.dirY = Math.sin(ang)
      a.turnAt = this.elapsedMs + 800 + this.rng.next() * 1200
    }
    return { x: a.dirX, y: a.dirY }
  }
  /** 逃跑方向修正（有界图贴边沿墙滑行） */
  fleeDir(_a: Enemy, away: Point): Point {
    return away
  }
  /** 普通敌人速度定稿后的世界后处理（河流：加水流 + 跨向钳岸） */
  protected postSteerEnemy(_e: ImageObj, _body: ArcadeBody, _def: EnemyDef): void {
    void _e
    void _body
    void _def
  }
  /** Boss 速度定稿后的世界后处理（河流：加水流 + 钳河道） */
  protected postSteerBoss(_e: ImageObj, _body: ArcadeBody): void {
    void _e
    void _body
  }
  /** 敌弹的额外回收条件（有界图出地图即灭；寿命回收在基座） */
  cullEnemyProjectile(_s: ImageObj): boolean {
    void _s
    return false
  }
  /** 金币的额外回收条件（河流：漂出下游） */
  cullCoin(_c: ImageObj): boolean {
    void _c
    return false
  }
  /** 金币不受磁吸时的基础速度（河流：随波逐流） */
  coinIdleVelocity(): Point {
    return { x: 0, y: 0 }
  }
  /** 终波开场的世界准备（无界图：缩圈初始化） */
  protected onFinalWaveSetup(): void {}
  /** 世界专属的逐帧步进（分块/缩圈/水面/回绕+门框），在管线末尾执行 */
  protected updateWorld(_delta: number): void {
    void _delta
  }
  /** create 收尾（launch UI 之前；无界图预建首批装饰分块） */
  protected postCreate(): void {}
  /** 调试上报的视口/世界尺寸（固定相机图上报世界尺寸供探针换算） */
  protected debugViewSize(): { w: number; h: number } {
    return { w: viewport.logicalWidth, h: viewport.logicalHeight }
  }
  /** 调试上报的世界附加字段（休眠数/缩圈半径） */
  protected debugExtras(): { dormant?: number; zoneRadius?: number } {
    return {}
  }
  /** 视口变化：跟随式相机只需重设缩放；固定相机图整体重映射（子类覆写） */
  protected onViewportChanged(): void {
    this.cameras.main.setZoom(viewport.renderScale)
  }

  /** 带休眠机制的图共用的分区实现（无界/河流）：按轴距离切换休眠态、
   * 统计活跃数、构建本帧攻击目标。休眠 = 关物理体 + 清速度 + 不参与
   * 索敌/碰撞/AI；状态全保留。Boss 永不休眠 */
  protected dormancyFrameTargets(activeHalf: number): void {
    let awake = 0
    let dormant = 0
    const targets: TargetInfo[] = []
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      const a = enemyOf(e)
      const within = a.boss || isWithinActive(e.x - this.center.x, e.y - this.center.y, activeHalf)
      if (within === a.dormant) {
        // 状态翻转（含首帧）：入睡关体清速度，唤醒开体（AI 下帧自然接管）
        const body = e.body as ArcadeBody
        if (within) {
          a.dormant = false
          body.enable = true
        } else {
          a.dormant = true
          body.setVelocity(0, 0)
          body.enable = false
        }
      }
      if (within) {
        awake++
        targets.push({ x: e.x, y: e.y, radius: a.def.radius, ref: e })
      } else {
        dormant++
      }
    }
    this.awakeCount = awake
    this.dormantCount = dormant
    this.frameTargets = targets
  }

  // ── 快照契约（UIScene 轮询）─────────────────────────────────

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
      spawnIntervalMs: Math.round(this.flood ? STRESS.spawnIntervalMs : wave.spawnIntervalMs),
      hpMultiplier: wave.hpMultiplier,
    }
  }

  hudSnapshot(): HudSnapshot {
    return {
      xp: this.run.xp.xp,
      xpNext: xpToNext(this.run.xp.level),
      level: this.run.xp.level,
      beans: this.run.beans,
      kills: this.run.kills,
      coins: this.run.coins,
      wave: this.run.wave,
      seconds: Math.floor(this.elapsedMs / 1000),
      remainMs: Math.max(0, waveDurationMs(this.run.wave) - this.elapsedMs),
      over: this.over,
      bossHp: this.boss?.active ? enemyOf(this.boss).hp : null,
      bossMaxHp: bossFor(this.run.mapId).hp,
    }
  }

  create(): void {
    // scene.restart() 复用同一实例，所有局内状态必须在这里重置
    this.rng = new Rng(Date.now() >>> 0)
    this.run = getRun()
    // 地图即关卡：色板固定按所选地图，不再逐局随机
    const mapDef = MAPS[this.run.mapId]
    this.palette = mapDef.palette
    applyBackground(this.palette)
    this.flood = isStress()
    // 试炼场是一张特殊地图：进图即沙盒（免死无时限 + 场内切敌人/角色/队长）
    this.lab = this.run.mapId === 'lab'
    this.sandbox = this.flood || this.lab
    this.settings = loadSettings(browserStorage())
    this.stats = {
      damageMul: 1,
      cooldownMul: this.flood ? STRESS.cooldownMul : 1,
      moveSpeed: CAPTAINS[this.run.captainId].moveSpeed * UNIT,
      maxHp: this.sandbox ? STRESS.maxHp : MEMBER.maxHp,
    }
    this.elapsedMs = 0
    this.spawnCooldownMs = 300
    this.pendingSpawns = 0
    this.over = false
    // 场景 restart 已销毁全部显示对象，这里只需重置引用
    this.groundEffects = []
    this.frameAttractors = []
    this.awakeCount = 0
    this.dormantCount = 0
    this.boss = undefined
    this.pendingMarks = []
    this.skillBuffUntil = 0
    this.danceEndsAt = 0
    this.resetWorldFields()

    // 世界：物理边界/相机/地面/装饰（各图自理内部顺序）
    this.createWorld()

    this.center = this.spawnCenter()
    this.centerObj = this.add.zone(this.center.x, this.center.y, 1, 1)

    this.memberGroup = this.add.group()
    // 压测固定 5 人满编便于跑分对比；正常局阵容来自 run（招募制，逐波扩编）
    const rosterIds = this.sandbox ? ROSTER_IDS.slice(0, 5) : this.run.roster
    this.lineup = rosterIds.map((id) => CHARACTERS[id])
    // 槽位 → 队形岗位：满员 N 保 1 按 guardOrder（0 号岗 = 受保护中心，
    // 互换中心不影响其他人的岗位）；未满员/压测为环形，槽位即岗位
    const order = this.sandbox || !isTeamFull(this.run) ? null : guardOrder(this.run)
    this.postBySlot = rosterIds.map((id, slot) => {
      if (!order) return slot
      const post = order.indexOf(id)
      return post >= 0 ? post : slot
    })
    this.orbitPhase = 0
    this.driverPost = -1
    // 队长道具：团队修正（移速/磁吸/掉落/全队伤害）
    this.teamFx = aggregateTeamEffects(this.run.captainItems)
    this.stats.moveSpeed = CAPTAINS[this.run.captainId].moveSpeed * UNIT * this.teamFx.moveSpeedMul
    this.waveBaseKills = this.run.kills
    this.waveBaseCoins = this.run.coins
    this.waveBaseLevel = this.run.xp.level
    this.members = rosterIds.map((id, slot) => this.createMember(id, slot))

    // 队长主动技能：效果载荷 = 标准能力行（数据在 CAPTAINS[id].skill.abilities），
    // 行为主体锚在队伍中心（center 对象本局稳定，位移是原地改写）；
    // 不进 update 循环——只经 castSkill 手动单发
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
    this.captainAbilities = this.sandbox
      ? []
      : CAPTAINS[this.run.captainId].skill.abilities.map((a) => createAbility(toPx(a), this.abilityCtx, 0))

    this.attachCamera(this.centerObj)

    this.enemies = this.add.group()
    this.projectiles = this.add.group()
    this.enemyProjectiles = this.add.group()
    this.coins = this.add.group()
    // 压测按后期混编出怪；正常局按当前波次配比
    this.enemyMix = enemyMixAt(MAPS[this.run.mapId].mix, this.sandbox ? 10 : this.run.wave)

    // 节点波：精英波敌潮与末波 Boss，开场警示横幅后兑现
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

    // 爆发型粒子发射器（复用，explode 触发；速度为 px/秒，UNIT=64）
    this.deathBurst = burstEmitter(this, [0x8e24aa, 0xab47bc, 0x6a1b9a, 0xf3e5f5], 230)
    this.coinBurst = burstEmitter(this, [0xffb300, 0xffd54f, 0xfff8e1], 150, 340)
    this.puffBurst = burstEmitter(this, [0x757575, 0x9e9e9e, 0xe0e0e0], 130, 520)

    // 伤害数字对象池：复用固定数量 BitmapText（见 ui/damageFont.ts）
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

    // 子弹命中走线段扫掠（sweepProjectiles），不用点重叠：低帧率下会穿模漏判
    this.setupTouchOverlaps()

    this.layoutTeam(0)
    this.postCreate()
    // UIScene 自探测当前竞技场（四图互斥运行），launch 不传参
    this.scene.launch('ui')

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      this.onShutdown()
      this.scene.stop('ui')
    })
  }

  /** 场景关闭时的世界清理（虚空图移除条带相机） */
  protected onShutdown(): void {}

  update(_time: number, delta: number): void {
    if (this.over) return
    this.elapsedMs += delta

    // 波次时间到 → 结算/商店（压测模式无尽，便于性能观测）
    if (!this.sandbox && this.elapsedMs >= waveDurationMs(this.run.wave)) {
      this.endWave()
      return
    }

    // 队长技能：冷却按战斗时钟推进（存 run 上，天然跨波）；增伤 buff 到期复原
    if (!this.sandbox) {
      this.run.skillCdMs = tickSkillCd(this.run.skillCdMs, delta)
      if (this.stats.damageMul !== 1 && this.elapsedMs >= this.skillBuffUntil) {
        this.stats.damageMul = 1
      }
    }

    this.frameSlowZones.length = 0
    this.frameAttractors.length = 0
    this.buildFrameTargets()
    this.frameMemberTargets = this.buildMemberTargets()
    this.updateOrbit(delta)
    this.moveTeam(delta)
    this.updateMembers(delta)
    this.touchStep()
    this.spawn(delta)
    this.steerEnemies(delta)
    updateEnemyProjectiles(this)
    updateGroundEffects(this)
    magnetCoins(this)
    sweepProjectiles(this, delta)
    this.cullProjectiles()
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
      skill: this.sandbox
        ? undefined
        : {
            remainMs: Math.round(this.run.skillCdMs),
            beans: this.run.beans,
            ready: this.run.skillCdMs <= 0 && this.run.beans > 0,
          },
      ...this.debugExtras(),
    })
  }

  // ── 队长主动技能 ────────────────────────────────────────────

  /** UIScene 轮询的技能状态（压测模式无技能 → null，不渲染按钮） */
  skillSnapshot(): {
    name: string
    remainMs: number
    cdMs: number
    beans: number
    ready: boolean
  } | null {
    if (this.sandbox) return null
    const s = CAPTAINS[this.run.captainId].skill
    return {
      name: s.name,
      remainMs: this.run.skillCdMs,
      cdMs: s.cdMs,
      beans: this.run.beans,
      ready: this.run.skillCdMs <= 0 && this.run.beans > 0,
    }
  }

  /** 经验统一入口：满豆冻结（不涨条不升级）；升级即得豆（钳上限） */
  private gainTeamXp(amount: number): void {
    if (this.run.beans >= SKILL.maxBeans) return
    const gained = gainXp(this.run.xp, amount)
    this.run.xp = gained.state
    if (gained.levelsGained > 0) {
      this.run.beans = Math.min(SKILL.maxBeans, this.run.beans + gained.levelsGained)
      playSfx('levelup')
    }
  }

  /** 释放主动技能（UIScene 按钮/E 键触发）。这里只是触发策略：就绪/弹药
   * 校验、扣豆、重置跨波 CD；效果本体是队长持有的标准能力行，逐个单发 */
  castSkill(): boolean {
    if (this.over || this.sandbox || this.run.skillCdMs > 0 || this.run.beans <= 0) return false
    const s = CAPTAINS[this.run.captainId].skill
    this.run.beans -= 1
    this.run.skillCdMs = s.cdMs
    playSfx('levelup')
    this.events.emit('skill-cast', s.name)
    for (const a of this.captainAbilities) a.castNow?.(this.captainHandle)
    return true
  }

  // ── 团队级能力口子（ctx 实现：集结/群舞/增益/掉币都是队伍侧概念） ──

  /** 全队集结：阵亡者满血复活、存活者按上限比例回复、全队短暂无敌。
   * 无敌走受击无敌帧通道（把「上次受击」推到未来），挡接触与敌弹；
   * 毒液池/毒雾走独立计时，不受无敌保护 */
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

  /** 全场敌人（含 Boss）定身跳舞；正在蓄力/冲刺的直接打断；舞会窗口内
   * 新落地的敌人也要跳（materializeEnemy 补标）。逐帧表现（速度清零 +
   * 摇摆 + 粉染色）在 steerEnemies 的舞蹈分支 */
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

  /** 限时全队增伤（经 stats.damageMul 流入所有能力伤害链，update 到期复原） */
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

  /** 战场掉落金币（拾取爆点视觉 + 音效；波末结算期不再入场） */
  private spawnRewardCoins(x: number, y: number, count: number): void {
    if (this.over) return
    this.coinBurst.explode(6, x, y)
    playSfx('coin')
    spawnCoins(this, x, y, count)
  }

  /** 波次结束：快照队伍状态进 run；打满最后一波直接进胜利结算 */
  protected endWave(): void {
    this.over = true
    this.physics.pause()
    playSfx('wave')
    const finished = isFinalWave(this.run.wave)
    // 波末保底经验：躲避流杀得少也有基本豆收入（队长倍率 × 四叶草团队倍率）
    const xpMul = CAPTAINS[this.run.captainId].xpGainMul * this.teamFx.xpGainMul
    this.gainTeamXp(Math.round(waveBonusXp(this.run.wave) * xpMul))
    // 团队道具的波末结算：大锅回复在血量快照前生效，债券分红计入本波金币小结
    if (this.teamFx.waveHealRatio > 0) {
      for (const m of this.members) {
        if (m.alive) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * this.teamFx.waveHealRatio)
      }
    }
    if (this.teamFx.waveCoins > 0) this.run.coins += this.teamFx.waveCoins
    this.run.combatMs += this.elapsedMs
    this.run.wave += 1
    this.run.memberHp = this.members.map((m) => (m.alive ? Math.round(m.hp) : 0))
    // 先冻结战场弹结算横幅（UIScene 渲染），停留片刻再走：
    // 给正在操作移动的手指留出松手时间，防止战斗输入误触下一页按钮
    this.events.emit('wave-complete', {
      wave: this.run.wave - 1,
      kills: this.run.kills - this.waveBaseKills,
      coins: this.run.coins - this.waveBaseCoins,
      levels: this.run.xp.level - this.waveBaseLevel,
    } satisfies WaveSummary)
    // 通关 → 胜利结算；否则有待结算点数才进整编页（首次满员顺带阵型页），
    // 没点数直进商店——阵型调整的常驻入口在商店
    this.time.delayedCall(WAVE.summaryMs, () => {
      if (finished) this.scene.start('result', { win: true })
      else this.scene.start(promoteStep(this.run) ? 'promote' : 'shop')
    })
  }

  // ── 队伍 ────────────────────────────────────────────────────

  /** 生效队形：满员自动 N 保 1（压测阵容不来自 run，固定环形） */
  protected activeFormation(): FormationId {
    return this.sandbox ? 'ring' : currentFormation(this.run)
  }

  /** 当前队形的全部岗位偏移（环形全员/N 保 1 外圈含主力驱动的共享相位） */
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
      // 重叠时靠下的角色遮挡靠上的，聚团更自然
    ).setDepth(10 + off.y / UNIT)
    this.physics.add.existing(image)
    // N 保 1 中心的被保护收益：受击判定圆减半，更难被敌人/敌弹摸到
    const guarded = this.activeFormation() === 'guard' && post === 0
    const hurtRadius = guarded ? MEMBER.radius * TEAM.guardCenterHurtboxMul : MEMBER.radius
    circleBody(image, hurtRadius)
    // 角色是纯随队走位的运动学对象：body 只跟随图片用于碰撞，
    // 不允许物理引擎把位移回写到图片（否则与手动定位叠加产生抖动）
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
    // 道具修正：个体属性 + 每角色独立的伤害/冷却倍率 ctx + 预算生效能力参数；
    // 专属升级来自已购的角色专属升级卡（压测阵容无道具 = 素体）
    const owned = this.sandbox ? [] : (this.run.memberItems[slot] ?? [])
    const fx = aggregateCharacterEffects(owned)
    const tiers = upgradeTiers(id, owned)
    const memberCtx: AbilityContext = {
      ...this.abilityCtx,
      damageMul: () => this.stats.damageMul * fx.damageMul * this.teamFx.teamDamageMul,
      // 黏滞减速：被黏黏怪蹭到的队员攻速惩罚（叠乘进冷却，到时自动失效）
      cooldownMul: () => {
        const mm = this.members[slot]
        const atk = mm && mm.atkSlowUntil > this.elapsedMs ? mm.atkSlowMul : 1
        return this.stats.cooldownMul * fx.cooldownMul * atk
      },
      // 伤害/子弹带上来源槽位：结算页按角色统计输出与击杀。
      // 暴击/击退倍率在这里收口：所有能力伤害路径统一生效，无需逐能力改造
      damageTarget: (e, d, kb, sx, sy) => {
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
      spawnProjectile: (x, y, angle, pDef, damage) =>
        spawnProjectile(this, x, y, angle, pDef, damage, slot),
      spawnGroundEffect: (x, y, def) =>
        spawnGroundEffect(this, x, y, def, { faction: 'team', srcSlot: slot }),
      // 刺客出手帧：把「上次受击时刻」推到未来，等效授予 ms 无敌
      grantOwnerInvuln: (ms) => {
        const mm = this.members[slot]
        if (mm) mm.lastHitMs = this.elapsedMs + ms - mm.iframesMs
      },
      // 本体动作动画：注册是幂等的（同一活数组引用），未烘焙时静默保持静态
      playOwnerClip: (clipId, durMs) => {
        const mm = this.members[slot]
        if (!mm) return
        mm.anim.register(clipId, clipFramesLive(this, mm.emoji, clipId, 'player'))
        mm.anim.play(clipId, { durMs })
      },
    }
    const maxHp = this.sandbox ? this.stats.maxHp : memberMaxHp(fx.hpAdd, CAPTAINS[this.run.captainId].hpMul)
    // 部件动画：idle 常驻翻帧（slot 错开相位），帧烘焙是惰性的，就绪前保持静态
    const anim = new Animator(image)
    anim.register('idle', clipFramesLive(this, emoji, 'idle', 'player'))
    anim.setIdle('idle', ANIM_DEF.durMs, slot * 173)
    const member: Member = {
      emoji,
      slot,
      image,
      // 错开初始冷却，避免全队同帧齐射。
      // 生效能力 = 原始配装 → 升级卡质变注入 → 空间参数按道具缩放
      abilities: loadoutFor(def, tiers).map((w, i) =>
        createAbility(toPx(resolveAbilityDef(w, fx)), memberCtx, 300 + slot * 120 + i * 230),
      ),
      handle,
      visualOffset,
      fx,
      ctx: memberCtx,
      maxHp,
      hurtRadius,
      iframesMs: MEMBER.iframesMs + fx.iframesAddMs,
      reviveMs: Math.max(1000, TEAM.reviveMs * CAPTAINS[this.run.captainId].reviveMul + fx.reviveAddMs),
      regenPerSec: fx.regenPerSec,
      thorns: fx.thorns,
      killHeal: fx.killHeal,
      // 血量跨波保留；上一波阵亡者低血量复活（压测模式不走 run 状态）
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

    const ui = this.scene.get('ui') as UIScene
    const dir = kx !== 0 || ky !== 0 ? norm(kx, ky) : ui.joystickVector
    this.teamDir = dir
    const step = (this.stats.moveSpeed * delta) / 1000
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

  /** 队伍活感·探测与轨道：逐员判定探测范围内有无敌人（游移门控）；
   * 可旋转的环（环形阵全员、多保一外圈）额外让环上岗位计算移动倾向，
   * 每帧力量最大者即刻掌舵（同力随机、随时换手），主力的倾向直接驱动共享相位——
   * 全环刚性同步转动，等距不穿模由构造保证；多保一中心固定，只保留游移 */
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
      // 不在可旋转环上的岗位（多保一中心/整个前后阵）不参与主力竞争
      const base = ringPostAngle(formation, idx, n)
      if (base !== null) rotatable = true
      const theta = (base ?? 0) + this.orbitPhase
      const threats: OrbitThreat[] = []
      // frameTargets 由各图的世界规则填充（虚空含镜像坐标，威胁角度自然指向传送门）
      for (const t of this.frameTargets) {
        const dx = t.x - m.image.x
        const dy = t.y - m.image.y
        const dSq = dx * dx + dy * dy
        if (dSq >= rangeSq) continue
        m.hasThreat = true
        // 只做游移门控时知道「有威胁」即可，无需收集全部敌情
        if (base === null || bias === 0) break
        threats.push({
          diff: angleDiff(theta, Math.atan2(t.y - this.center.y, t.x - this.center.x)),
          weight: threatWeight(Math.sqrt(dSq), range),
        })
      }
      if (base !== null && bias !== 0) wants[idx] = orbitTendency(bias, threats)
    }
    if (!rotatable) return
    // 主力竞争：力量 = 倾向绝对值（阵亡恒 0 出局），胜者直接驱动共享相位
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
      // 待机游移：静止且探测范围内无敌时淡入的小幅李萨如漂移
      const wanderOn = m.alive && !moving && !m.hasThreat
      m.wanderAmp += ((wanderOn ? 1 : 0) - m.wanderAmp) * Math.min(1, delta / WANDER.rampMs)
      const wander = m.wanderAmp * WANDER.radius
      const rawTx = this.center.x + p.x + Math.sin(tSec * WANDER.freqX + m.wanderSeed) * wander
      const rawTy = this.center.y + p.y + Math.sin(tSec * WANDER.freqY + m.wanderSeed * 2.3) * wander
      // 弹簧目标经世界钩子（虚空图取环面最近镜像，穿缝时各走最短路）
      const t = this.springTarget(m, rawTx, rawTy)
      const tx = t.x
      const ty = t.y
      // 跟随惯性：欠阻尼弹簧追岗位（起步慢半拍、急停小回弹），拖拽超限硬拉回
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
      // 队形会旋转、队员会滑动，遮挡关系按当前相对纵深逐帧更新；
      // N 保 1 中心垫底显示，被外圈四人盖住才有「窝在里面」的感觉
      const guarded = this.activeFormation() === 'guard' && idx === 0
      m.image.setDepth(guarded ? 8.5 : 10 + this.memberDepthY(m) / UNIT)
      ;(m.image.body as ArcadeBody).updateFromGameObject()
      m.hpBar.setPosition(m.image.x, m.image.y)
      m.deadText.setPosition(m.image.x, m.image.y)
    }
  }

  private updateMembers(delta: number): void {
    const moving = this.teamDir.x !== 0 || this.teamDir.y !== 0
    for (const m of this.members) {
      if (m.alive) {
        // 再生戒指：持续回复（hp 允许小数，展示与快照处各自取整）
        if (m.regenPerSec > 0 && m.hp < m.maxHp) {
          m.hp = Math.min(m.maxHp, m.hp + (m.regenPerSec * delta) / 1000)
        }
        // 黏滞减速：生效期间附着黏液色，到时清除（0 哨兵确保只清一次）
        if (m.atkSlowUntil > this.elapsedMs) {
          m.image.setTint(0x9ccc65)
        } else if (m.atkSlowUntil !== 0) {
          m.atkSlowUntil = 0
          m.image.clearTint()
        }
        this.animateMember(m, moving, delta)
        this.drawMemberHp(m)
        for (const w of m.abilities) w.update(delta, m.handle)
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

  /** 程序化小动画：全程呼吸（挤压拉伸：高度胀时宽度反向收，体积感守恒，
   * 比单轴缩放醒目得多）+ 朝移动方向翻转。逐帧写值，零 tween 开销 */
  private animateMember(m: Member, moving: boolean, delta: number): void {
    if (this.elapsedMs < m.animLockUntil) return
    const img = m.image
    // 部件翻帧与程序化缩放/翻转正交叠加（翻帧换纹理不动 scale）
    m.anim.update(this.elapsedMs)
    // 相位按各自频率累积（slot 初相错开），移动/静止切换不会跳变
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
    g.fillStyle(ratio > 0.5 ? 0x66bb6a : ratio > 0.25 ? 0xffb300 : 0xef5350, 1)
    g.fillRect(-w / 2 + 1, y + 1, (w - 2) * ratio, 4)
  }

  protected onMemberTouched(m: Member, enemy: ImageObj): void {
    if (this.over || !enemy.active) return
    const a = enemyOf(enemy)
    if (a.dormant) return
    // 亡语替身：无害尸壳，接触不造成伤害（荆棘也不触发）
    if (a.decoy) return
    // 变形中的敌人无害：接触不造成伤害（荆棘也不触发）
    if (a.morphUntil > this.elapsedMs) return
    if (!m.alive || this.elapsedMs - m.lastHitMs < m.iframesMs) return
    m.lastHitMs = this.elapsedMs
    // 接触效果走统一 Effect 执行器（无敌帧节流已在上方掌管；srcName/伤害基准注入 ctx）
    this.contactSrcName = a.def.name
    this.contactTargets[0] = m.image
    applyEffects(this.enemyContactCtx, a.def.onContact ?? DEFAULT_CONTACT, {
      center: { x: m.image.x, y: m.image.y },
      baseDamage: a.def.damage * a.dmgMul,
      targets: this.contactTargets,
    })
    // 荆棘背心：接触反伤（与受击同帧、同吃无敌帧节流；击杀归属穿刺者）
    if (m.thorns > 0 && enemy.active) {
      this.applyDamage(enemy, m.thorns, 0, undefined, undefined, m.slot)
    }
  }

  protected onMemberShot(m: Member, shot: ImageObj): void {
    if (this.over || !shot.active) return
    if (!m.alive) return
    const { damage, srcName } = projectileOf(shot)
    releasePooled(shot)
    // 子弹命中吃无敌帧：帧内先中弹则后续接触伤害被同一层保护挡下
    if (this.elapsedMs - m.lastHitMs < m.iframesMs) return
    m.lastHitMs = this.elapsedMs
    this.hurtMember(m, damage, 0xff7777, srcName)
  }

  // ── 治疗（军医） ────────────────────────────────────────────

  /** 治疗范围内队友：all=false 只治血量比例最低的一名；满血者不计，返回被治人数 */
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

  /** 电击起搏：给范围内复活倒计时最长的阵亡队友减 ms；无阵亡者返回 false */
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
    // 敌情明细：承伤按人累计 + 按敌人名归属
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

  // ── 攻击与伤害 ──────────────────────────────────────────────

  /** 子弹回收：默认飞出视野外一段距离即灭（虚空图覆写为寿命制） */
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
    // 脆弱诅咒：变形中的敌人受伤加深
    if (a.morphVuln !== 1 && a.morphUntil > this.elapsedMs) {
      damage = Math.round(damage * a.morphVuln)
    }
    const hpBefore = a.hp
    const hp = hpBefore - damage
    // 结算统计：按伤害来源槽位累计有效伤害与击杀（压测阵容槽位越界则跳过）
    const st = this.run.stats
    if (srcSlot >= 0 && srcSlot < st.damage.length) {
      st.damage[srcSlot] = (st.damage[srcSlot] ?? 0) + Math.min(damage, Math.max(0, hpBefore))
      if (hp <= 0) st.kills[srcSlot] = (st.kills[srcSlot] ?? 0) + 1
    }
    this.floatDamage(enemy.x, enemy.y, damage, crit)
    // Boss 体格击退免疫：不吃冲量也不被致死击飞
    if (a.kbImmune) knockback = 0
    if (hp <= 0) {
      // 致死一击：敌人失去自身动力，击退不再衰减——尸体被匀速击飞
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
      // 受击纯白闪光：时间戳驱动（steerEnemies 里恢复），高频命中不堆 timer/tween
      a.flashUntil = this.elapsedMs + 70
      enemy.setTintFill(0xffffff)
      // 击退冲量：从伤害源指向敌人，叠加进敌人临时速度（steerEnemies 合成并衰减）
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

  /** 子弹命中效果：走统一 Effect 执行器（阵营=team，归属=srcSlot；主目标不再入 blast 圈） */
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

  // 击杀 = 一串按序发生的钩子：计数/击杀者触发/掉落/Boss 通关/亡语/清体。
  // 各步拆成命名方法（原本是一坨），触发时机清晰、rng 取用顺序严格不可乱动。
  private killEnemy(enemy: ImageObj, flingVx = 0, flingVy = 0, srcSlot = -1): void {
    const a = enemyOf(enemy)
    this.run.kills++
    playSfx('kill')
    this.recordKillStats(a)
    this.runOnKill(srcSlot)
    this.grantKillRewards(a, enemy)
    if (a.boss) this.onBossDown(enemy)
    // 亡语（死者视角）：蘑菇留毒/泡泡分裂/幽灵治疗等，走组合式效果
    runDeathEffects(this, a)
    // 拆巢：名下护巢子敌暴走（须在 despawnKilled 释放本体前，否则 owner 反查失效）
    if (a.def.spawner) this.orphanBrood(a)
    this.despawnKilled(enemy, a, flingVx, flingVy)
  }

  /** 敌情明细：按敌人名计击杀，精英另计总数 */
  private recordKillStats(a: Enemy): void {
    const st = this.run.stats
    st.enemyKills[a.def.name] = (st.enemyKills[a.def.name] ?? 0) + 1
    if (a.elite) st.eliteKills += 1
  }

  /** 击杀触发（击杀者视角）：目前仅吸血獠牙回血；未来的击杀连锁/击杀爆炸等在此挂载 */
  private runOnKill(srcSlot: number): void {
    const killer = this.members[srcSlot]
    if (killer?.alive && killer.killHeal > 0) {
      killer.hp = Math.min(killer.maxHp, killer.hp + killer.killHeal)
    }
  }

  /** 击杀掉落：经验即得（队长×四叶草×精英倍率），金币落地待拾（偷币鼠吐回吃掉的+利息），
   * 极小概率掉宝箱（精英更高；压测/Boss 不掉）。rng 取用顺序固定，勿调整语句次序 */
  private grantKillRewards(a: Enemy, enemy: ImageObj): void {
    const def = a.def
    const elite = a.elite
    const xpMul =
      CAPTAINS[this.run.captainId].xpGainMul * this.teamFx.xpGainMul * (elite ? ELITE.xpMul : 1)
    this.gainTeamXp(Math.round(def.xp * xpMul))
    const eaten = a.eaten
    const baseCoins = def.coins * (elite ? ELITE.coinsMul : 1)
    const doubled = this.rng.next() < this.teamFx.doubleCoinChance ? baseCoins : 0
    spawnCoins(this, enemy.x, enemy.y, baseCoins + doubled + eaten + (eaten > 0 ? 1 : 0))
    if (!this.sandbox && !a.boss && chestDropped(elite, () => this.rng.next())) {
      spawnChest(this, enemy.x, enemy.y)
    }
  }

  /** 击败终波 Boss：稍候（碎块飞散可见）直接提前通关 */
  private onBossDown(enemy: ImageObj): void {
    this.boss = undefined
    this.deathBurst.explode(24, enemy.x, enemy.y)
    this.time.delayedCall(700, () => {
      if (!this.over) this.endWave()
    })
  }

  /** 清体：停用 + 拆械 + 死亡爆点 + 四象限碎片（继承致死击退速度不衰减）+ 销毁 */
  private despawnKilled(enemy: ImageObj, a: Enemy, flingVx: number, flingVy: number): void {
    if (a.abilities) for (const w of a.abilities) w.destroy()
    this.deathBurst.explode(6, enemy.x, enemy.y)
    spawnShards(this, enemy, flingVx, flingVy)
    releasePooled(enemy)
  }

  /** 成群生成子敌：(cx,cy) 周围按 scatter(px) 半径随机撒 count 只，血量吃当前波次
   * 成长曲线。分裂（死亡触发）与虫巢（周期触发）共用这一个生成动作 */
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
      // 护巢子敌记住自己的巢：绕巢锚点 + 计入本巢在场上限（拆巢时 orphanBrood 清空触发暴走）
      if (owner) child.owner = owner
    }
  }

  /** 本巢名下在场子敌数（owner 反查） */
  private broodCount(nest: Enemy): number {
    let n = 0
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (e.active && enemyOf(e).owner === nest) n++
    }
    return n
  }

  /** 虫巢周期生成：达全局在场上限让路（避免压垮引擎）；再按本巢上限只补到 maxAlive——
   * 满了就停生，子敌被清掉后续生，巢自身被拆才彻底停 */
  private spawnFromNest(a: Enemy, spawner: NonNullable<EnemyDef['spawner']>): void {
    if (this.over || this.enemies.countActive(true) >= SPAWN.maxAlive) return
    const room = spawner.maxAlive - this.broodCount(a)
    if (room <= 0) return
    this.spawnBrood(spawner.into, Math.min(spawner.count, room), a.image.x, a.image.y, 0.6 * UNIT, a)
  }

  /** 拆巢：名下所有护巢子敌失去锚点——按各自 orphan 倍率暴走（速度/攻击）并转为直扑玩家。
   * owner 清空即双属性档位切换：baseOrbit steerer 见 owner 空即走暴走分支 */
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

  /** 自爆怪引爆：以本体为心对圈内玩家群伤 + 震波表现，随后静默自毁（不结算击杀奖励）。
   * 蓄力完由 detonate steerer 触发——蓄力前被打死则走正常死亡、不引爆 */
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

  /** 静默移除：替身尸壳到时消失——不计击杀、不掉落、不跑死亡效果，只留一缕烟 */
  private despawnEnemy(enemy: ImageObj): void {
    const a = enemyOf(enemy)
    if (a.abilities) for (const w of a.abilities) w.destroy()
    this.puffBurst.explode(8, enemy.x, enemy.y)
    releasePooled(enemy)
  }

  /** 敌人纹理的四象限碎片：frame 每种纹理只注册一次；碎片来自共享对象池 */
  private floatDamage(x: number, y: number, amount: number, crit = false): void {
    if (!this.settings.damageNumbers) return
    // 池满时偷用最旧的一个（结束它未完成的动画）
    const t = this.damagePool[this.damagePoolIdx]!
    this.damagePoolIdx = (this.damagePoolIdx + 1) % this.damagePool.length
    this.tweens.killTweensOf(t)
    // 暴击金色放大；池对象复用，普通伤害要复位样式
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

  // ── 刷怪 ────────────────────────────────────────────────────

  private spawn(delta: number): void {
    this.spawnCooldownMs -= delta
    if (this.spawnCooldownMs > 0) return
    // 试炼场：只补勾选的敌人（免死/无时限由 sandbox 提供），与常规/压测刷怪分道
    if (this.lab) return this.spawnLab()
    // 难度按跨波累计战斗时长递增；刷怪供给随在场人数缩放（单人首发不会被满编压力淹没）；
    // Boss 波常规刷怪减压：焦点让给 Boss，避免「满速杂兵 + 精英 + Boss」三重压力叠满
    const wave = waveAt((this.run.combatMs + this.elapsedMs) / 1000)
    const teamFactor = SPAWN.teamFactorBase + SPAWN.teamFactorPerMember * this.members.length
    const relief = !this.flood && isBossWave(this.run.wave) ? BOSS_SPAWN_RELIEF : 1
    this.spawnCooldownMs = this.flood
      ? STRESS.spawnIntervalMs
      : (wave.spawnIntervalMs * relief) / teamFactor
    const cap = this.flood ? STRESS.maxAlive : SPAWN.maxAlive
    const batch = this.flood ? STRESS.spawnBatch : 1
    for (let i = 0; i < batch; i++) {
      if (this.spawnCapCount() + this.pendingSpawns >= cap) return
      this.spawnOne(wave.hpMultiplier)
    }
  }

  /** 试炼场补场：从勾选敌人里随机取一只，维持一个小在场池（死一只补一只）。
   * boss 用 Boss 待遇生成；larva 直接生成即无属主 → 走暴走档。免死/无时限由 sandbox 提供 */
  private spawnLab(): void {
    this.spawnCooldownMs = LAB.spawnIntervalMs
    const kinds = [...labEnemySet()].filter((k) => k in ENEMIES)
    if (kinds.length === 0) return
    if (this.spawnCapCount() + this.pendingSpawns >= LAB.targetAlive) return
    const raw = ENEMIES[kinds[Math.floor(this.rng.next() * kinds.length)]!]!
    const def = toPx(raw)
    this.spawnTelegraphed(def, def.hp, false, def.role === 'boss')
  }

  private spawnOne(hpMultiplier: number, forceElite = false): void {
    const def = toPx(pickEnemy(this.enemyMix, () => this.rng.next()))
    // 精英怪：到波数后按概率强化出场（血量刷怪时算入，移速/伤害走敌身标记）
    const elite =
      !this.sandbox &&
      (forceElite ||
        (this.run.wave >= ELITE.fromWave && this.rng.next() < ELITE.chance))
    const hp = Math.round(def.hp * hpMultiplier * (elite ? ELITE.hpMul : 1))
    this.spawnTelegraphed(def, hp, elite, false)
  }

  /** 预告标记闪烁 → 落地：常规刷怪与试炼场共用（boss 用更大更久的预告，走 Boss 落点）。
   * 预告期间无碰撞；pos 登记进注册表，固定相机图旋转重映射时原位改写、落点自动跟随 */
  private spawnTelegraphed(def: EnemyDef, hp: number, elite: boolean, boss: boolean): void {
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
      if (!this.over) this.materializeEnemy(def, pos.x, pos.y, hp, elite, boss)
    })
  }

  /** 终波 Boss：大型预告标记后落地；血量固定、击退免疫、金边高亮 */
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
      // Boss 与普通敌人同一条 materialize 管线（boss 标记：金边/深度/入场演出/HUD 血条）
      const def = toPx(bossFor(this.run.mapId))
      this.materializeEnemy(def, pos.x, pos.y, def.hp, false, true)
      playSfx('boom')
    })
  }

  /** 敌人潮：一段时间内密集落地一批敌人（含保底精英） */
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
  ): Enemy {
    // 落点经世界钩子兜底（有界钳制/河流钳跨向/虚空回绕；分裂溅出等边缘情况）
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
    // 行走摇摆的随机相位：同屏大量敌人不齐步摆；
    // 部件动画 idle 常驻，相位偏移复用摇摆随机相（不额外消耗 rng 流）
    const dirX = Math.cos(this.rng.next() * Math.PI * 2)
    const dirY = Math.sin(this.rng.next() * Math.PI * 2)
    const turnAt = this.elapsedMs + 600 + this.rng.next() * 900
    const fireAt = this.elapsedMs + 900 + this.rng.next() * 1500
    const ph = this.rng.next() * Math.PI * 2
    const anim = new Animator(enemy)
    anim.register('idle', clipFramesLive(this, def.emoji, 'idle', elite || boss ? 'elite' : 'enemy'))
    anim.setIdle('idle', ANIM_DEF.durMs, (ph / (Math.PI * 2)) * ANIM_DEF.durMs)
    // 定时型冲刺的首轮延迟
    const lm = def.locomotion
    const nextDashAt =
      lm.kind === 'dash' && lm.trigger.kind === 'timer'
        ? this.elapsedMs + (lm.trigger.firstDelayMs ?? lm.trigger.intervalMs)
        : 0
    const nextSpawnAt = def.spawner ? this.elapsedMs + (def.spawner.firstDelayMs ?? def.spawner.intervalMs) : 0
    const a = attachEnemy(enemy, def, hp, {
      elite,
      boss,
      kbImmune: def.kbImmune ?? false,
      state: lm.kind === 'dash' && lm.idle === 'chase' ? 'chase' : 'wander',
      spMul: elite ? ELITE.speedMul : 1,
      dmgMul: elite ? ELITE.damageMul : 1,
      // 行为状态：游荡方向/换向计时（elapsedMs 时基，暂停安全）
      dirX,
      dirY,
      turnAt,
      nextDashAt,
      nextSpawnAt,
      ph,
      anim,
      // 舞会窗口内落地：跟着跳（全场蹦迪对新敌同样生效）
      danceUntil: this.elapsedMs < this.danceEndsAt ? this.danceEndsAt : 0,
    })
    armEnemy(this, a, fireAt - this.elapsedMs)
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

  // ── 仙子魔尘：变形/缴械 ─────────────────────────────────────

  /** 把敌人变形成无害替身：变形期间失去一切伤害能力（接触/开火/突刺），
   * 形象顶替、行为退化为缓速游荡，到期恢复。Boss 免疫 */
  applyHex(
    enemy: ImageObj,
    hex: { durationMs: number; morphEmoji: string; vulnMul?: number },
  ): void {
    const a = enemyOf(enemy)
    if (a.boss) return
    a.morphUntil = this.elapsedMs + hex.durationMs
    a.morphVuln = hex.vulnMul ?? 1
    if (!a.morphed) {
      a.morphed = true
      const size = a.def.size * (a.elite ? ELITE.sizeMul : 1)
      const outline = a.elite ? ('elite' as const) : ('enemy' as const)
      enemy.setTexture(emojiKey(hex.morphEmoji, outline))
      enemy.setDisplaySize(size, size)
      // 动画播放器整套换成替身的 idle 帧（未烘焙则停留静态替身形象）
      a.anim?.register('idle', clipFramesLive(this, hex.morphEmoji, 'idle', outline))
      // 蓄力中被变形：中间状态一并打断
      if (a.state === 'windup') enemy.clearTint()
      a.state = 'wander'
      enemy.setRotation(0)
      this.puffBurst.explode(8, enemy.x, enemy.y)
    }
  }

  /** 变形到期：恢复原形与行为（开火计时后延，避免恢复瞬间齐射） */
  private restoreMorph(a: Enemy): void {
    const enemy = a.image
    a.morphUntil = 0
    a.morphVuln = 1
    a.morphed = false
    const size = a.def.size * (a.elite ? ELITE.sizeMul : 1)
    const outline = a.elite ? ('elite' as const) : ('enemy' as const)
    enemy.setTexture(emojiKey(a.def.emoji, outline))
    enemy.setDisplaySize(size, size)
    a.anim?.register('idle', clipFramesLive(this, a.def.emoji, 'idle', outline))
    // 出手后延，避免恢复瞬间齐射
    if (a.abilities) for (const w of a.abilities) w.postponeFire?.(700)
    this.puffBurst.explode(6, enemy.x, enemy.y)
  }

  /** 敌人速度倍率 = 减速区叠乘（寒气光环等，带冷色调提示）× 精英加速标记 */
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
    // 能力施加的限时减速/冻结（震慑余波、凛冬降临）：到时自动失效
    if (a.abilitySlowUntil !== 0 && this.elapsedMs < a.abilitySlowUntil) {
      factor *= a.abilitySlowMul
    }
    // 时之沙的全局减速与精英加速同为「体质」倍率，不参与光环减速的染色判定
    return factor * a.spMul * this.teamFx.enemySlowMul
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

  private steerEnemies(delta: number): void {
    const alive = this.aliveMembers()
    if (alive.length === 0) return
    const now = this.elapsedMs
    for (const e of this.enemies.getChildren() as ImageObj[]) {
      if (!e.active) continue
      const a = enemyOf(e)
      if (a.dormant) continue
      // 亡语替身：到时静默消失（不走死亡结算/掉落，只留一缕烟）
      if (a.despawnAt !== 0 && now >= a.despawnAt) {
        this.despawnEnemy(e)
        continue
      }
      const def = a.def
      const body = e.body as ArcadeBody
      // 部件动画翻帧（先于任何 continue 分支：跳舞/变形期间照常呼吸）
      a.anim?.update(now)
      // 受击白闪到时恢复：清 tint 并让减速色下一帧重新生效
      if (a.flashUntil !== 0 && now >= a.flashUntil) {
        a.flashUntil = 0
        e.clearTint()
        a.slowed = false
        if (a.state === 'windup') e.setTint(0xffb74d)
      }

      // 全场蹦迪：定身摇摆（行为状态机暂停），击退与世界后处理（水流/钳制）照常。
      // 粉染色每帧重设：受击白闪到期 clearTint 后下一帧自动恢复
      if (a.danceUntil !== 0) {
        if (now < a.danceUntil) {
          body.setVelocity(0, 0)
          e.setTint(0xff9ff3)
          e.setRotation(Math.sin(now / 80 + a.ph) * 0.3)
          this.decayKnockback(a, body, delta)
          if (a.boss) this.postSteerBoss(e, body)
          else this.postSteerEnemy(e, body, def)
          // 压制期只走冷却不开火（时间表语义：舞会结束冷却已尽者立即出手）
          if (a.abilities) for (const w of a.abilities) w.tickCooldown?.(delta)
          continue
        }
        a.danceUntil = 0
        e.clearTint()
        e.setRotation(0)
      }

      // 仙子魔尘：变形期间失去本职行为（不开火/不突刺/不偷币），
      // 顶着绵羊形象缓速游荡；到期恢复原形
      if (a.morphUntil !== 0) {
        if (now < a.morphUntil) {
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
      // 自爆怪等策略内自毁：本体已被释放，跳过后续帧内处理
      if (!e.active) continue

      // 持械敌人：能力实例逐帧驱动（跳舞/变形不到达此处；休眠已跳过）
      if (a.abilities) for (const w of a.abilities) w.update(delta, a.abilityOwner!)

      // 虫巢：周期生成子敌（非死亡触发的生成实体——生成动作的第 2 个触发点）
      if (def.spawner && now >= a.nextSpawnAt) {
        this.spawnFromNest(a, def.spawner)
        a.nextSpawnAt = now + def.spawner.intervalMs
      }

      // 击退：临时冲量叠加进行为速度并指数衰减（不打断行为状态机）
      this.decayKnockback(a, body, delta)

      // 世界后处理：河流在此叠加水流并钳跨向（Boss 走专属钩子）
      if (a.boss) this.postSteerBoss(e, body)
      else this.postSteerEnemy(e, body, def)

      // 行走动画：恒摇摆 + 按移动方向翻转（twemoji 默认朝左）。
      // 脚本化姿态（蓄力颤动/冲刺前倾）由各 locomotion 策略自管（见 steer.ts），
      // 主循环此处只管非脚本姿态的环境摇摆——不再耦合 dash 的内部状态名
      if (!a.posed) {
        e.setRotation(Math.sin(now / 95 + a.ph) * 0.1)
        const vx = body.velocity.x
        if (Math.abs(vx) > 8) e.setFlipX(vx > 0)
      }
    }
  }

  /** 击退冲量：叠加进当前速度并指数衰减（行为分支与蹦迪定身共用） */
  private decayKnockback(a: Enemy, body: ArcadeBody, delta: number): void {
    if (a.kvx === 0 && a.kvy === 0) return
    body.velocity.x += a.kvx
    body.velocity.y += a.kvy
    const decay = Math.exp(-delta / KNOCKBACK.tauMs)
    if ((a.kvx * a.kvx + a.kvy * a.kvy) * decay * decay < 100) {
      a.kvx = 0
      a.kvy = 0
    } else {
      a.kvx *= decay
      a.kvy *= decay
    }
  }

  // ── 敌方子弹与毒液池 ────────────────────────────────────────

  // ── 结算 ────────────────────────────────────────────────────

  private gameOver(): void {
    this.over = true
    this.physics.pause()
    playSfx('over')
    // 败局也计入本波已打的时长（结算页展示用时）
    this.run.combatMs += this.elapsedMs
    // 冻结战场停留片刻（消化死亡瞬间），再进失败结算页
    this.time.delayedCall(900, () => this.scene.start('result', { win: false }))
  }
}
