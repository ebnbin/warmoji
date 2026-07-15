import Phaser from 'phaser'
import { BOSS, CAPTAINS, CHARACTERS, COIN, ELITE, FOLLOW, HIT_SHAKE, KNOCKBACK, MAP, MEMBER, ORBIT, ROSTER_IDS, SPAWN, STRESS, SURGE, TEAM, UNIT, WANDER, WAVE } from '../core/config'
import type { CharacterSpec, ChaseEnemySpec, EnemyBulletSpec, EnemySpec } from '../core/config'
import { enemyMixAt, fleeSteer, pickEnemy } from '../core/enemies'
import type { EnemyMixEntry } from '../core/enemies'
import { sweepFirstHitIndex } from '../core/weapons'
import type { ProjectileSpec, WeaponSpec } from '../core/weapons'
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
import { levelDamageMul, memberMaxHp } from '../core/levels'
import { currentFormation, getRun, guardOrder, isTeamFull, promoteStep, waveStartHp } from '../core/run'
import type { RunState } from '../core/run'
import { DEFAULT_SETTINGS, loadSettings } from '../core/settings'
import type { Settings } from '../core/settings'
import { MAPS, rollDecor } from '../core/maps'
import type { MapSpec } from '../core/maps'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { randomMapPoint } from '../core/spawn'
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
  // 稀有道具的触发式属性：每秒回复 / 接触反伤 / 击杀回血
  regenPerSec: number
  thorns: number
  killHeal: number
  hp: number
  alive: boolean
  reviveAt: number
  lastHitMs: number
  /** 毒液池独立于接触伤害的跳伤计时 */
  lastPoisonMs: number
  hpBar: Phaser.GameObjects.Graphics
  shownHpRatio: number
  deadText: Phaser.GameObjects.Text
  shownCountdown: number
  /** 呼吸动画的基准缩放（setDisplaySize 得到的比例） */
  baseScale: number
  /** 呼吸相位累积（移动/静止频率不同，用累积保证切换平滑） */
  breathPhase: number
  /** 复活弹出等 tween 期间暂停程序化动画，避免逐帧写缩放打架 */
  animLockUntil: number
  // 跟随惯性：欠阻尼弹簧位置/速度 + 每人略异的刚度（步调不齐才像一群人）
  followX: number
  followY: number
  followVx: number
  followVy: number
  followK: number
  /** 待机游移：相位种子 + 幅度（静止且探测范围内无敌时淡入） */
  wanderSeed: number
  wanderAmp: number
  /** 本帧探测范围内是否有敌人（orbit 倾向输入 + 游移门控） */
  hasThreat: boolean
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
  private enemyShots!: Phaser.GameObjects.Group
  private coins!: Phaser.GameObjects.Group
  /** 毒液池（蘑菇死亡遗留），波末随场景销毁 */
  private poisonPools: { x: number; y: number; r2: number; until: number; tickMs: number; damage: number; srcName: string; gfx: Phaser.GameObjects.Graphics }[] = []
  private enemyMix: EnemyMixEntry[] = []
  private frameTargets: EnemyTarget[] = []
  private frameSlowZones: { x: number; y: number; r2: number; factor: number }[] = []
  private weaponCtx: WeaponContext = {
    scene: this,
    enemyTargets: () => this.frameTargets,
    damageEnemy: (e, d, kb, sx, sy) => this.applyDamage(e as ImageObj, d, kb, sx, sy),
    spawnProjectile: (x, y, angle, spec, damage) => this.spawnProjectile(x, y, angle, spec, damage),
    teamCenter: () => this.center,
    applySlow: (x, y, radius, factor) =>
      this.frameSlowZones.push({ x, y, r2: radius * radius, factor }),
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
  // 死亡碎块对象池：敌人死亡时本体裂成 4 个象限碎片（复用固定数量 Image，零分配）
  private shardPool: ImageObj[] = []
  private shardPoolIdx = 0
  // 爆发型粒子：敌人死亡（紫系）/ 金币拾取（金系）/ 队员倒下（烟尘）
  private deathBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private coinBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private puffBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  /** 本帧队伍移动方向（行走摇摆与朝向翻转用） */
  private teamDir = { x: 0, y: 0 }
  /** 槽位 → 队形岗位序号（N 保 1 时受保护中心占 0 号岗） */
  private postBySlot: number[] = []
  /** 终波 Boss 实体（在场时 HUD 显示血条；击杀即提前通关） */
  private boss?: ImageObj
  /** 环形阵专用：全环共享相位（刚性同步转动，core/orbit.ts 逐帧演化） */
  private orbitPhase = 0
  /** 当前主力岗位（-1 = 无人驱动）；力量竞争逐帧裁定，随时换手 */
  private driverPost = -1
  private elapsedMs = 0
  private spawnCooldownMs = 0
  private pendingSpawns = 0
  private stress = false
  private over = false
  // 本波战果基线（结算横幅展示增量用）
  private waveBaseKills = 0
  private waveBaseCoins = 0
  private waveBaseLevel = 1

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
    // scene.restart() 复用同一实例，所有局内状态必须在这里重置
    this.rng = new Rng(Date.now() >>> 0)
    this.run = getRun()
    // 地图即关卡：色板固定按所选地图，不再逐局随机
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

    this.physics.world.setBounds(0, 0, MAP.width, MAP.height)
    this.drawFloor()
    this.drawDecor(mapSpec)

    this.center = { x: MAP.width / 2, y: MAP.height / 2 }
    this.centerObj = this.add.zone(this.center.x, this.center.y, 1, 1)

    this.memberGroup = this.add.group()
    // 压测固定 5 人满编便于跑分对比；正常局阵容来自 run（招募制，逐波扩编）
    const rosterIds = this.stress ? ROSTER_IDS.slice(0, 5) : this.run.roster
    this.lineup = rosterIds.map((id) => CHARACTERS[id])
    // 槽位 → 队形岗位：满员 N 保 1 按 guardOrder（0 号岗 = 受保护中心，
    // 互换中心不影响其他人的岗位）；未满员/压测为环形，槽位即岗位
    const order = this.stress || !isTeamFull(this.run) ? null : guardOrder(this.run)
    this.postBySlot = rosterIds.map((id, slot) => {
      if (!order) return slot
      const post = order.indexOf(id)
      return post >= 0 ? post : slot
    })
    this.orbitPhase = 0
    this.driverPost = -1
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
    this.enemyShots = this.add.group()
    this.coins = this.add.group()
    // 压测按后期混编出怪；正常局按当前波次配比
    this.enemyMix = enemyMixAt(this.stress ? 10 : this.run.wave)
    this.boss = undefined

    // 节点波：敌人潮（精英登场波）与终波 Boss，开场警示横幅后兑现
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
          sub: `击败它，或撑过 ${Math.round(waveDurationMs(this.run.wave) / 1000)} 秒！`,
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

    // 波次时间到 → 结算/商店（压测模式无尽，便于性能观测）
    if (!this.stress && this.elapsedMs >= waveDurationMs(this.run.wave)) {
      this.endWave()
      return
    }

    this.frameSlowZones.length = 0
    this.frameTargets = (this.enemies.getChildren() as ImageObj[])
      .filter((e) => e.active)
      .map((e) => ({ x: e.x, y: e.y, radius: (e.getData('spec') as EnemySpec).radius, ref: e }))
    this.updateOrbit(delta)
    this.moveTeam(delta)
    this.updateMembers(delta)
    this.spawn(delta)
    this.steerEnemies(delta)
    this.updateEnemyShots()
    this.updatePoisonPools()
    this.magnetCoins()
    this.sweepProjectiles(delta)
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
      formation: this.activeFormation(),
      mapId: this.run.mapId,
    })
  }

  /** 波次结束：快照队伍状态进 run；打满最后一波直接进胜利结算 */
  private endWave(): void {
    this.over = true
    this.physics.pause()
    playSfx('wave')
    const finished = isFinalWave(this.run.wave)
    // 波末保底经验：躲避流杀得少也有基本收益（队长倍率 × 四叶草团队倍率）
    const xpMul = CAPTAINS[this.run.captainId].xpGainMul * this.teamFx.xpGainMul
    this.run.xp = gainXp(this.run.xp, Math.round(waveBonusXp(this.run.wave) * xpMul)).state
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

  private onViewportChanged(): void {
    this.cameras.main.setZoom(viewport.renderScale)
  }

  // ── 队伍 ────────────────────────────────────────────────────

  /** 生效队形：满员自动 N 保 1（压测阵容不来自 run，固定环形） */
  private activeFormation(): FormationId {
    return this.stress ? 'ring' : currentFormation(this.run)
  }

  /** 当前队形的全部岗位偏移（环形全员/N 保 1 外圈含主力驱动的共享相位） */
  private currentPosts(): Point[] {
    return formationPosts(this.activeFormation(), this.lineup.length, this.orbitPhase)
  }

  private createMember(emoji: string, weaponSpecs: readonly WeaponSpec[], slot: number): Member {
    const post = this.postBySlot[slot] ?? slot
    const off = this.currentPosts()[post] ?? { x: 0, y: 0 }
    const image = emojiImage(
      this,
      this.center.x + off.x,
      this.center.y + off.y,
      emoji,
      MEMBER.size,
      'player',
      // 重叠时靠下的角色遮挡靠上的，聚团更自然
    ).setDepth(10 + off.y / UNIT)
    this.physics.add.existing(image)
    // N 保 1 中心的被保护收益：受击判定圆减半，更难被敌人/敌弹摸到
    const guarded = this.activeFormation() === 'guard' && post === 0
    circleBody(image, guarded ? MEMBER.radius * TEAM.guardCenterHurtboxMul : MEMBER.radius)
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
      // 伤害/子弹带上来源槽位：结算页按角色统计输出与击杀。
      // 暴击/击退倍率在这里收口：所有武器伤害路径统一生效，无需逐武器改造
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
      spawnProjectile: (x, y, angle, spec, damage) =>
        this.spawnProjectile(x, y, angle, spec, damage, slot),
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
      regenPerSec: fx.regenPerSec,
      thorns: fx.thorns,
      killHeal: fx.killHeal,
      // 血量跨波保留；上一波阵亡者低血量复活（压测模式不走 run 状态）
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
    const clampMin = TEAM.ringRadius + MEMBER.radius
    this.center.x = Phaser.Math.Clamp(this.center.x + dir.x * step, clampMin, MAP.width - clampMin)
    this.center.y = Phaser.Math.Clamp(this.center.y + dir.y * step, clampMin, MAP.height - clampMin)
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
    const range = ORBIT.detectRange
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
      const ox = p.x
      const oy = p.y
      // 待机游移：静止且探测范围内无敌时淡入的小幅李萨如漂移
      const wanderOn = m.alive && !moving && !m.hasThreat
      m.wanderAmp += ((wanderOn ? 1 : 0) - m.wanderAmp) * Math.min(1, delta / WANDER.rampMs)
      const wander = m.wanderAmp * WANDER.radius
      const tx = this.center.x + ox + Math.sin(tSec * WANDER.freqX + m.wanderSeed) * wander
      const ty = this.center.y + oy + Math.sin(tSec * WANDER.freqY + m.wanderSeed * 2.3) * wander
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
      m.image.setPosition(m.followX + m.visualOffset.x, m.followY + m.visualOffset.y)
      // 队形会旋转、队员会滑动，遮挡关系按当前相对纵深逐帧更新；
      // N 保 1 中心垫底显示，被外圈四人盖住才有「窝在里面」的感觉
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
        // 再生戒指：持续回复（hp 允许小数，展示与快照处各自取整）
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

  /** 程序化小动画：全程呼吸（挤压拉伸：高度胀时宽度反向收，体积感守恒，
   * 比单轴缩放醒目得多）+ 朝移动方向翻转。逐帧写值，零 tween 开销 */
  private animateMember(m: Member, moving: boolean, delta: number): void {
    if (this.elapsedMs < m.animLockUntil) return
    const img = m.image
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
    if (!m.alive || this.elapsedMs - m.lastHitMs < m.iframesMs) return
    m.lastHitMs = this.elapsedMs
    const spec = enemy.getData('spec') as EnemySpec
    const dmgMul = (enemy.getData('dmgMul') as number | undefined) ?? 1
    this.hurtMember(m, Math.round(spec.damage * dmgMul), 0xff7777, spec.name)
    // 荆棘背心：接触反伤（与受击同帧、同吃无敌帧节流；击杀归属穿刺者）
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
    // 子弹命中吃无敌帧：帧内先中弹则后续接触伤害被同一层保护挡下
    if (this.elapsedMs - m.lastHitMs < m.iframesMs) return
    m.lastHitMs = this.elapsedMs
    this.hurtMember(m, damage, 0xff7777, srcName)
  }

  private hurtMember(m: Member, damage: number, tint: number, srcName?: string): void {
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
    // 对称投掷物（无指向修正角）飞行中自旋；有指向的（飞刀类）保持箭头朝向
    p.setData('spin', spec.projectile.rotationOffsetRad === 0 ? 9 : 0)
    this.projectiles.add(p)
  }

  /** 逐帧对每颗子弹做上一帧位置 → 当前位置的线段扫掠命中 */
  private sweepProjectiles(delta: number): void {
    for (const p of this.projectiles.getChildren() as ImageObj[]) {
      if (!p.active) continue
      const prev = { x: p.getData('px') as number, y: p.getData('py') as number }
      const hit = sweepFirstHitIndex(prev, { x: p.x, y: p.y }, p.getData('radius') as number, this.frameTargets)
      if (hit >= 0) {
        const damage = p.getData('damage') as number
        const kb = p.getData('kb') as number
        const srcSlot = (p.getData('srcSlot') as number) ?? -1
        p.destroy()
        // 击退源取上一帧位置：方向即子弹飞行方向
        this.applyDamage(this.frameTargets[hit]!.ref as ImageObj, damage, kb, prev.x, prev.y, srcSlot)
        continue
      }
      const spin = p.getData('spin') as number
      if (spin > 0) p.rotation += (spin * delta) / 1000
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
    // 结算统计：按伤害来源槽位累计有效伤害与击杀（压测阵容槽位越界则跳过）
    const st = this.run.stats
    if (srcSlot >= 0 && srcSlot < st.damage.length) {
      st.damage[srcSlot] = (st.damage[srcSlot] ?? 0) + Math.min(damage, Math.max(0, hpBefore))
      if (hp <= 0) st.kills[srcSlot] = (st.kills[srcSlot] ?? 0) + 1
    }
    this.floatDamage(enemy.x, enemy.y, damage, crit)
    // Boss 体格击退免疫：不吃冲量也不被致死击飞
    if (enemy.getData('kbImmune')) knockback = 0
    if (hp <= 0) {
      // 致死一击：敌人失去自身动力，击退不再衰减——尸体被匀速击飞
      if (knockback > 0 && srcX !== undefined && srcY !== undefined) {
        const dir = norm(enemy.x - srcX, enemy.y - srcY)
        this.killEnemy(enemy, dir.x * knockback, dir.y * knockback, srcSlot)
      } else {
        this.killEnemy(enemy, 0, 0, srcSlot)
      }
    } else {
      enemy.setData('hp', hp)
      playSfx('hit')
      // 受击纯白闪光：时间戳驱动（steerEnemies 里恢复），高频命中不堆 timer/tween
      enemy.setData('flashUntil', this.elapsedMs + 70)
      enemy.setTintFill(0xffffff)
      // 击退冲量：从伤害源指向敌人，叠加进敌人临时速度（steerEnemies 合成并衰减）
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
    // 敌情明细：按敌人名计击杀，精英另计总数
    const st = this.run.stats
    st.enemyKills[spec.name] = (st.enemyKills[spec.name] ?? 0) + 1
    if (elite) st.eliteKills += 1
    // 吸血獠牙：击杀者回血
    const killer = this.members[srcSlot]
    if (killer?.alive && killer.killHeal > 0) {
      killer.hp = Math.min(killer.maxHp, killer.hp + killer.killHeal)
    }
    // 经验击杀即得（队长倍率 × 四叶草团队倍率，精英有额外倍率）；金币落地等待拾取
    const xpMul =
      CAPTAINS[this.run.captainId].xpGainMul * this.teamFx.xpGainMul * (elite ? ELITE.xpMul : 1)
    const gained = gainXp(this.run.xp, Math.round(spec.xp * xpMul))
    this.run.xp = gained.state
    if (gained.levelsGained > 0) playSfx('levelup')
    // 偷金币鼠：吐回吃掉的金币 + 1 枚利息
    const eaten = (enemy.getData('eaten') as number) || 0
    const baseCoins = spec.coins * (elite ? ELITE.coinsMul : 1)
    const doubled = this.rng.next() < this.teamFx.doubleCoinChance ? baseCoins : 0
    this.spawnCoins(enemy.x, enemy.y, baseCoins + doubled + eaten + (eaten > 0 ? 1 : 0))
    // 击败终波 Boss：稍候（碎块飞散可见）直接提前通关
    if (isBoss) {
      this.boss = undefined
      this.deathBurst.explode(24, enemy.x, enemy.y)
      this.time.delayedCall(700, () => {
        if (!this.over) this.endWave()
      })
    }
    // 特殊死亡：蘑菇留毒液池；泡泡分裂出迷你体
    if (spec.behavior === 'chase' && spec.poison) {
      this.spawnPoisonPool(enemy.x, enemy.y, spec.poison, spec.name)
    }
    if (spec.behavior === 'chase' && spec.split && !this.over) {
      const hpMul = waveAt((this.run.combatMs + this.elapsedMs) / 1000).hpMultiplier
      for (let i = 0; i < spec.split.count; i++) {
        const a = this.rng.next() * Math.PI * 2
        this.materializeEnemy(
          spec.split.into,
          Phaser.Math.Clamp(enemy.x + Math.cos(a) * 0.5 * UNIT, 0, MAP.width),
          Phaser.Math.Clamp(enemy.y + Math.sin(a) * 0.5 * UNIT, 0, MAP.height),
          Math.round(spec.split.into.hp * hpMul),
        )
      }
    }
    enemy.setActive(false)
    ;(enemy.body as ArcadeBody).enable = false
    this.deathBurst.explode(6, enemy.x, enemy.y)
    this.tweens.killTweensOf(enemy)
    // 本体裂成 4 个象限碎片：继承致死击退速度（不衰减）+ 象限散开 + 自旋 + 淡出
    this.spawnShards(enemy, flingVx, flingVy)
    enemy.destroy()
  }

  /** 敌人纹理的四象限碎片：frame 每种纹理只注册一次；碎片来自共享对象池 */
  private spawnShards(enemy: ImageObj, flingVx: number, flingVy: number): void {
    const tex = enemy.texture
    if (!tex.has('shard0')) {
      const sw = tex.source[0]!.width
      const sh = tex.source[0]!.height
      tex.add('shard0', 0, 0, 0, sw / 2, sh / 2)
      tex.add('shard1', 0, sw / 2, 0, sw / 2, sh / 2)
      tex.add('shard2', 0, 0, sh / 2, sw / 2, sh / 2)
      tex.add('shard3', 0, sw / 2, sh / 2, sw / 2, sh / 2)
      // Texture.add 会把 firstFrame 改指向新 frame，导致此后按 key 默认创建的
      // 同类敌人渲染成左上角碎片——必须拨回基础帧
      tex.firstFrame = '__BASE'
    }
    const dw = enemy.displayWidth / 2
    const dh = enemy.displayHeight / 2
    const t = KNOCKBACK.deathSlideMs / 1000
    for (let i = 0; i < 4; i++) {
      const shard = this.shardPool[this.shardPoolIdx]!
      this.shardPoolIdx = (this.shardPoolIdx + 1) % this.shardPool.length
      this.tweens.killTweensOf(shard)
      // 翻转的敌人纹理左半显示在右侧：碎片同步镜像保证碎裂瞬间与本体无缝
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
      // 散开幅度收紧 + 飞行中缩小到 ~1/5：碎裂足迹整体控制在原尺寸 ~1.5 倍内
      const scatter = 45 + this.rng.next() * 65
      const vx = flingVx + dir.x * scatter
      const vy = flingVy + dir.y * scatter
      this.tweens.add({
        targets: shard,
        x: Phaser.Math.Clamp(shard.x + vx * t, 0, MAP.width),
        y: Phaser.Math.Clamp(shard.y + vy * t, 0, MAP.height),
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
    // 难度按跨波累计战斗时长递增；刷怪供给随在场人数缩放（单人首发不会被满编压力淹没）；
    // 终波常规刷怪减压：焦点让给 Boss，避免「满速杂兵 + 精英 + Boss」三重压力叠满
    const wave = waveAt((this.run.combatMs + this.elapsedMs) / 1000)
    const teamFactor = SPAWN.teamFactorBase + SPAWN.teamFactorPerMember * this.members.length
    const relief = !this.stress && isFinalWave(this.run.wave) ? BOSS.spawnRelief : 1
    this.spawnCooldownMs = this.stress
      ? STRESS.spawnIntervalMs
      : (wave.spawnIntervalMs * relief) / teamFactor
    const cap = this.stress ? STRESS.maxAlive : SPAWN.maxAlive
    const batch = this.stress ? STRESS.spawnBatch : 1
    for (let i = 0; i < batch; i++) {
      if (this.enemies.countActive(true) + this.pendingSpawns >= cap) return
      this.spawnOne(wave.hpMultiplier)
    }
  }

  private spawnOne(hpMultiplier: number, forceElite = false): void {
    const spec = pickEnemy(this.enemyMix, () => this.rng.next())
    // 精英怪：到波数后按概率强化出场（血量刷怪时算入，移速/伤害走敌身标记）
    const elite =
      !this.stress &&
      (forceElite ||
        (this.run.wave >= ELITE.fromWave && this.rng.next() < ELITE.chance))
    const hp = Math.round(spec.hp * hpMultiplier * (elite ? ELITE.hpMul : 1))
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
      if (!this.over) this.materializeEnemy(spec, pos.x, pos.y, hp, elite)
    })
  }

  /** 终波 Boss：大型预告标记后落地；血量固定、击退免疫、金边高亮 */
  private spawnBoss(): void {
    const pos = randomMapPoint(
      this.rng,
      MAP.width,
      MAP.height,
      2 * UNIT,
      this.center,
      SPAWN.minPlayerDist * 1.6,
    )
    this.pendingSpawns++
    const mark = emojiImage(this, pos.x, pos.y, SPAWN.markEmoji, SPAWN.markSize * 2).setDepth(4).setAlpha(0)
    this.tweens.add({ targets: mark, alpha: 1, duration: SPAWN.telegraphMs / 4, yoyo: true, repeat: 3 })
    this.time.delayedCall(SPAWN.telegraphMs * 1.6, () => {
      mark.destroy()
      this.pendingSpawns--
      if (this.over) return
      const enemy = emojiImage(this, pos.x, pos.y, BOSS.emoji, BOSS.size, 'elite').setDepth(7)
      this.physics.add.existing(enemy)
      circleBody(enemy, BOSS.radius)
      ;(enemy.body as ArcadeBody).setCollideWorldBounds(true)
      // Boss 的运行时规格只消费公共字段（伤害/掉落/名字等），行为走专属状态机
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

  /** Boss 状态机：缓速逼近；周期环形弹幕；周期蓄力 → 朝队伍中心突刺 */
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

  /** 敌人潮：一段时间内密集落地一批敌人（含保底精英） */
  private spawnSurge(): void {
    const hpMul = waveAt((this.run.combatMs + this.elapsedMs) / 1000).hpMultiplier
    for (let i = 0; i < SURGE.count; i++) {
      this.time.delayedCall((i * SURGE.spreadMs) / SURGE.count, () => {
        if (!this.over) this.spawnOne(hpMul, i < SURGE.elites)
      })
    }
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
    // 兜底：任何行为都不允许把敌人推出地图
    ;(enemy.body as ArcadeBody).setCollideWorldBounds(true)
    enemy.setData('hp', hp)
    enemy.setData('spec', spec)
    // 行为状态：游荡方向/换向与开火计时（elapsedMs 时基，暂停安全）
    enemy.setData('state', 'wander')
    enemy.setData('dirX', Math.cos(this.rng.next() * Math.PI * 2))
    enemy.setData('dirY', Math.sin(this.rng.next() * Math.PI * 2))
    enemy.setData('turnAt', this.elapsedMs + 600 + this.rng.next() * 900)
    enemy.setData('fireAt', this.elapsedMs + 900 + this.rng.next() * 1500)
    enemy.setData('eaten', 0)
    // 行走摇摆的随机相位：同屏大量敌人不齐步摆
    enemy.setData('ph', this.rng.next() * Math.PI * 2)
    this.enemies.add(enemy)
    const targetScale = enemy.scale
    enemy.setScale(targetScale * 0.3).setAlpha(0.3)
    this.tweens.add({ targets: enemy, scale: targetScale, alpha: 1, duration: 130 })
  }

  /** 敌人速度倍率 = 减速区叠乘（寒气光环等，带冷色调提示）× 精英加速标记 */
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
    // 时之沙的全局减速与精英加速同为「体质」倍率，不参与光环减速的染色判定
    return factor * ((e.getData('spMul') as number | undefined) ?? 1) * this.teamFx.enemySlowMul
  }

  /** 游荡：周期性随机换向，撞图边时折返 */
  private wanderDir(e: ImageObj): { x: number; y: number } {
    if (this.elapsedMs >= (e.getData('turnAt') as number)) {
      const a = this.rng.next() * Math.PI * 2
      e.setData('dirX', Math.cos(a))
      e.setData('dirY', Math.sin(a))
      e.setData('turnAt', this.elapsedMs + 800 + this.rng.next() * 1200)
    }
    let dx = e.getData('dirX') as number
    let dy = e.getData('dirY') as number
    const margin = 0.6 * UNIT
    if ((e.x < margin && dx < 0) || (e.x > MAP.width - margin && dx > 0)) dx = -dx
    if ((e.y < margin && dy < 0) || (e.y > MAP.height - margin && dy > 0)) dy = -dy
    e.setData('dirX', dx)
    e.setData('dirY', dy)
    return { x: dx, y: dy }
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
      if (!e.active) continue
      const spec = e.getData('spec') as EnemySpec
      const body = e.body as ArcadeBody
      // 受击白闪到时恢复：清 tint 并让减速色下一帧重新生效
      const flashUntil = e.getData('flashUntil') as number | undefined
      if (flashUntil !== undefined && now >= flashUntil) {
        e.setData('flashUntil', undefined)
        e.clearTint()
        e.setData('slowed', undefined)
        if (e.getData('state') === 'windup') e.setTint(0xffb74d)
      }
      const slow = this.slowFactorFor(e)
      const target = this.nearestAlive(e.x, e.y)!

      // 终波 Boss：专属状态机（缓速逼近 + 环形弹幕 + 蓄力突刺）
      if (e.getData('boss')) {
        this.steerBoss(e, body, slow, now)
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
            // 蓄力颤动提示
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
            // 进入探测圈：锁定当前方向蓄力（横向位移可躲）
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
            // 逃离方向贴边时沿墙滑行，不顶出地图
            const away = norm(-tdx, -tdy)
            const dir = fleeSteer(e.x, e.y, away.x, away.y, MAP.width, MAP.height, 1.5 * UNIT)
            body.setVelocity(dir.x * spec.speed * slow, dir.y * spec.speed * slow)
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
          // 直奔最近的金币；没金币就慢速游荡
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

      // 击退：临时冲量叠加进行为速度并指数衰减（不打断行为状态机）
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

      // 行走动画：恒摇摆 + 按移动方向翻转（twemoji 默认朝左）；
      // 蓄力有自己的颤动，冲刺改为朝冲刺方向前倾
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

  // ── 敌方子弹与毒液池 ────────────────────────────────────────

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
      if (
        this.elapsedMs >= (s.getData('dieAt') as number) ||
        s.x < -UNIT ||
        s.x > MAP.width + UNIT ||
        s.y < -UNIT ||
        s.y > MAP.height + UNIT
      ) {
        s.destroy()
      }
    }
  }

  private spawnPoisonPool(
    x: number,
    y: number,
    poison: NonNullable<ChaseEnemySpec['poison']>,
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
    for (const m of this.members) {
      if (!m.alive || now - m.lastPoisonMs < 0) continue
      for (const p of this.poisonPools) {
        const dx = m.image.x - p.x
        const dy = m.image.y - p.y
        if (dx * dx + dy * dy > p.r2) continue
        if (now - m.lastPoisonMs >= p.tickMs) {
          m.lastPoisonMs = now
          this.hurtMember(m, p.damage, 0xa5d86a, p.srcName)
        }
        break
      }
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
        'player',
      ).setDepth(3)
      this.physics.add.existing(coin)
      circleBody(coin, COIN.radius)
      this.coins.add(coin)
      // 掉落弹出
      const base = coin.scaleX
      coin.setScale(base * 0.3)
      this.tweens.add({ targets: coin, scale: base, duration: 160, ease: 'Back.easeOut' })
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
    // 败局也计入本波已打的时长（结算页展示用时）
    this.run.combatMs += this.elapsedMs
    // 冻结战场停留片刻（消化死亡瞬间），再进失败结算页
    this.time.delayedCall(900, () => this.scene.start('result', { win: false }))
  }

  /** 地面 = 纯色面 + 右下阴影；地表纹理交给 emoji 装饰层（不再画网格线） */
  private drawFloor(): void {
    const g = this.add.graphics()
    const shadowOffset = 0.25 * UNIT
    g.fillStyle(this.palette.shadow, 1)
    g.fillRect(shadowOffset, shadowOffset, MAP.width, MAP.height)
    g.fillStyle(this.palette.map, 1)
    g.fillRect(0, 0, MAP.width, MAP.height)
  }

  /** 地图装饰：按 run 内种子随机散布的低透明度 emoji（一局一景，同局各波不变）。
   * 静态贴地（depth 1）：在地面/网格之上、毒液池（2）与所有战斗实体之下 */
  private drawDecor(spec: MapSpec): void {
    const rng = new Rng(this.run.decorSeed)
    const cols = Math.round(MAP.width / UNIT)
    const rows = Math.round(MAP.height / UNIT)
    for (const d of rollDecor(spec.decor, () => rng.next(), cols, rows)) {
      emojiImage(this, d.xU * UNIT, d.yU * UNIT, d.emoji, d.sizeU * UNIT)
        .setAlpha(d.alpha)
        .setRotation(d.rotation)
        .setDepth(1)
    }
  }
}
