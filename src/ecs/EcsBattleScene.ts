import Phaser from 'phaser'
import { textRes, viewport } from '../core/apply'
import { UNIT } from '../core/units'
import { MEMBER } from '../characters/registry'
import { HIT_SHAKE } from '../battle/config'
import { TIMESTOP } from '../battle/timeStop'
import { DAMAGE_FONT, ensureDamageFont } from '../core/damageFont'
import { burstEmitter } from '../core/fx'
import { loadSettings } from '../run/settings'
import { browserStorage } from '../core/storage'
import { UI_FONT, FONT } from '../core/fonts'
import { norm } from '../core/vec'
import { Rng } from '../core/rng'
import { applyBackground } from '../core/background'
import { playSfx } from '../audio/sfx'
import { OUTLINED_EMOJIS } from '../boot/preload'
import { getRun, promoteStep } from '../run/state'
import type { RunState } from '../run/state'
import { bossFor, MAP, MAPS, rollDecor } from '../maps/registry'
import { fogAlphaAt, fogRadiusAt, hourAt, visionGridsAt } from '../maps/daynight'
import { onFloe } from '../maps/ice'
import { chunkDecor, chunkKey, chunksInRect, outsideZone } from '../maps/world'
import { ECS_SCENE_KEY } from './keys'
import { makeWorld } from './world'
import type { EcsWorld } from './world'
import { query, removeEntity } from 'bitecs'
import {
  Alive,
  Boss,
  Coin,
  Dormant,
  Enemy,
  EnemyProj,
  EState,
  Follow,
  Hp,
  MAtkSlow,
  MHp,
  Morph,
  Revive,
  Poison,
  Projectile,
  Slow,
  Transform,
} from './components'
import { applyDamage } from './combat'
import { applyMorph } from './morph'
import { EcsAtlas } from './render/atlas'
import { EcsSpriteBatch } from './render/spriteBatch'
import { spawnSprite } from './entities'
import { spawnTeam } from './team'
import { spawnEnemy, updateSpawners } from './enemy'
import { enemyNest, thiefEaten } from './store'
import { armCaptain, armTeam, updateMemberAbilities } from './ability/wire'
import { updateEnemyAbilities } from './ability/enemyWire'
import { runDeathEffects } from './ability/death'
import { clearGroundEffectsEcs, groundZoneCount, updateGroundEffectsEcs } from './groundEffects'
import { drainPendingCoins, magnetCoinsEcs, spawnCoinsEcs } from './pickups'
import { spawnBossEcs, spawnCarrierEcs, spawnStep } from './spawn'
import { attachCarrierAuraEcs, clearFieldEcs, fieldCounts, spawnFieldPickupEcs, updateFieldEcs } from './field'
import { FIELD_PICKUPS, rollWaveCarriers } from '../battlefield/registry'
import { initialLayout, stepSim, worldTimeScale } from './sim'
import { settleWave } from './wave'
import { isBossWave, waveAt, waveDurationMs, WAVE } from '../run/waves'
import { xpToNext } from '../run/xp'
import { CAPTAINS } from '../captains/registry'
import { aggregateTeamCards } from '../cards/registry'
import type { TeamEffects } from '../items/registry'
import { DENSITY_PARAMS, INVINCIBLE_HP, labDensity, labInvincible } from '../run/lab'
import type { AbilityOwner, AbilityRuntime } from '../abilities/types'
import { tickSkillCd } from '../captains/skill'
import type { HudHost } from '../battle/hudHost'
import type { HudSnapshot } from '../battle/BaseArenaScene'
import type { UIScene } from '../battle/UIScene'
import type { Meteor, PendingSpawn, Sim } from './sim'
import { emojiImage } from '../emoji/textures'
import { toPx } from '../battle/px'
import { BOSSES, ELITE, ENEMY_DEFS, SPAWN } from '../enemies/registry'

// ECS 实验战斗场景(宿主壳):Phaser 只做画布/相机/输入/音频宿主;战斗世界(实体+系统+
// 自绘渲染)全在 ECS。P2:有界森林图 + 队伍编队/orbit/游移/跟随弹簧 + 键盘/相机跟随。

// 夜雾:整块暗幕的颜色/深度/尺寸(与 ArenaScene 同值)
const FOG_COLOR = 0x0a0a1a
const FOG_DEPTH = 90
const FOG_SPAN = 9000
// 浮冰图:深水底色 + 落水蓝渐晕(与 IceArenaScene 同值)
const WATER_COLOR = 0x0b2a45
const WATER_VIGNETTE = 0x1e6fd0

function held(key?: Phaser.Input.Keyboard.Key): boolean {
  return key?.isDown ?? false
}

export class EcsBattleScene extends Phaser.Scene implements HudHost {
  private world!: EcsWorld
  private atlas?: EcsAtlas
  private sim?: Sim
  private ready = false
  /** HUD 宿主契约：UIScene 据此显示实验室控件、正计时 */
  testMode = false
  /** HUD 宿主契约：当前 run（HUD 读 mapId/金币/经验等） */
  run!: RunState
  /** 团队卡牌聚合乘区（技能 CD 等；与 spawnTeam 内同源，开局定） */
  private teamFx!: TeamEffects
  /** 队长主动技能载荷（不进 update 循环，只经 castSkill 单发）+ 锚在队伍中心的行为主体 */
  private captainAbilities: AbilityRuntime[] = []
  private captainHandle: AbilityOwner = { x: 0, y: 0, setVisualOffset: () => {} }
  /** 过场已排程(波末结算/全灭):置位后 update 早退,避免重复触发 */
  private ending = false
  /** 队员血条(逐帧跟位 + 按血量比例重绘;镜像 drawMemberHp) */
  private hpBars: Phaser.GameObjects.Graphics[] = []
  private shownHp: number[] = []
  /** 阵亡队员头顶的复活倒计时（秒；仅数字变化时重设文本，避免逐帧重排版） */
  private deadTexts: Phaser.GameObjects.Text[] = []
  private shownCountdown: number[] = []
  /** 受击震屏:设置开关 + 已消费的受击计数(据增量抖屏,镜像 hitShake) */
  private hitShakeOn = false
  private seenHitCount = 0
  /** 伤害飘字:开关 + BitmapText 对象池(镜像 floatDamage) */
  private damageNumbersOn = false
  private damagePool: Phaser.GameObjects.BitmapText[] = []
  private damageIdx = 0
  /** 刷怪预告标记(按 pendingSpawn 对帐:出现即挂脉冲⚠,落地即销毁) */
  private spawnMarks = new Map<PendingSpawn, Phaser.GameObjects.Image>()
  /** 粒子爆点发射器(死亡紫爆 / 拾币金爆 / 灰烟) */
  private deathBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private coinBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private puffBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  /** 昼夜图夜雾：整块暗色矩形 + 反相圆遮罩在其上「挖洞」露出队伍周围 */
  private fogRect?: Phaser.GameObjects.Rectangle
  private fogMaskShape?: Phaser.GameObjects.Graphics
  /** 时停冷雾遮罩：屏幕固定的大矩形，alpha 由时停态逐帧驱动（越静越浓） */
  private timeStopFx?: Phaser.GameObjects.Rectangle
  private timeStopFxAlpha = 0
  /** 浮冰图落水蓝渐晕：屏幕固定，队伍在水里时脉冲提示 */
  private waterVignette?: Phaser.GameObjects.Rectangle
  /** 无限图终波缩圈：圈线 + 圈外红渐晕（圈本体状态在 sim.zone，纯逻辑侧算） */
  private zoneGfx?: Phaser.GameObjects.Graphics
  private zoneVignette?: Phaser.GameObjects.Rectangle
  /** 深空图天体横扫的视觉：与 sim.meteor 对帐（新一次即建预警轨迹，起划即挂球体，结束即销毁） */
  private meteorFx?: { of: Meteor; tele: Phaser.GameObjects.Graphics; sphere?: Phaser.GameObjects.Image }
  /** 无限图装饰分块：块键 → 该块的装饰实体 eid；视野块集合变化才增删 */
  private decorChunks = new Map<string, number[]>()
  private decorRangeKey = ''
  private centerObj!: Phaser.GameObjects.Zone
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
  private mapW = 0
  private mapH = 0

  constructor() {
    super(ECS_SCENE_KEY)
  }

  /** 本图是否走无限世界地基(满屏底色 + 分块装饰 + 出生在原点):荒漠与深空共用 */
  private get infinite(): boolean {
    const kind = MAPS[this.run.mapId].kind
    return kind === 'infinite' || kind === 'space'
  }

  create(): void {
    this.ready = false
    this.world = makeWorld()
    ;(window as unknown as { __ecsWorld?: EcsWorld }).__ecsWorld = this.world

    const run = getRun()
    this.run = run
    this.testMode = run.testMode
    this.teamFx = aggregateTeamCards(run.teamCards)
    const mapDef = MAPS[run.mapId]
    applyBackground(mapDef.palette)
    // 浮冰图的「地图」即那块方形浮冰(其外皆水),故尺寸取 floeU
    this.mapW = (mapDef.ice?.floeU ?? mapDef.size?.w ?? MAP.width) * UNIT
    this.mapH = (mapDef.ice?.floeU ?? mapDef.size?.h ?? MAP.height) * UNIT
    const margin = MAP.cameraMargin * UNIT

    // 浮冰图:深水底色铺满屏(相机锁定;世界无边界,看到哪都是水)
    if (mapDef.ice) {
      this.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, WATER_COLOR)
        .setScrollFactor(0)
        .setDepth(-2)
    }

    // 地面:无限世界没有边、也就没有影子边缘——相机锁定的满屏底色即地面;
    // 有界图为纯色面 + 右下阴影(镜像 drawFloor),浮冰图另描冰缘读得出边界
    if (this.infinite) {
      this.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, mapDef.palette.map)
        .setScrollFactor(0)
        .setDepth(-1)
    } else {
      const g = this.add.graphics().setDepth(-1)
      const so = 0.25 * UNIT
      g.fillStyle(mapDef.palette.shadow, 1)
      g.fillRect(so, so, this.mapW, this.mapH)
      g.fillStyle(mapDef.palette.map, 1)
      g.fillRect(0, 0, this.mapW, this.mapH)
      if (mapDef.ice) {
        g.lineStyle(3, 0xdff3ff, 0.85)
        g.strokeRect(0, 0, this.mapW, this.mapH)
      }
    }
    if (mapDef.ice) {
      // 落水蓝渐晕(相机锁定):队伍在水里时提示
      this.waterVignette = this.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, WATER_VIGNETTE, 0)
        .setScrollFactor(0)
        .setDepth(90)
    }

    // 深空图:常驻黑洞禁锢圈(圆心即出生点原点),亮紫环 + 内侧渐隐提示,一次绘制
    const fieldR = (mapDef.space?.blackholeRadiusU ?? 0) * UNIT
    if (fieldR > 0) {
      const ring = this.add.graphics().setDepth(2)
      ring.lineStyle(5, 0x9c6bff, 0.7)
      ring.strokeCircle(0, 0, fieldR)
      ring.lineStyle(18, 0x6a3fbf, 0.13)
      ring.strokeCircle(0, 0, fieldR - 9)
    }

    const cam = this.cameras.main
    cam.setZoom(viewport.renderScale)
    // 浮冰/无限无边界:相机只管跟人(滑进水里、走到天边也跟着走);
    // 深空的圆是有界的,bounds 钳在其外接框内;有界图照旧外扩一圈
    if (fieldR > 0) {
      const half = fieldR + margin
      cam.setBounds(-half, -half, half * 2, half * 2)
    } else if (!mapDef.ice && !this.infinite) {
      cam.setBounds(-margin, -margin, this.mapW + margin * 2, this.mapH + margin * 2)
    }

    // 昼夜图夜雾（镜像 ArenaScene.createFog）：反相 Mask filter 在暗幕上挖出视野洞。
    // Phaser 4 的 GeometryMask 在 WebGL 无实现，故与旧路径一样走 filters.internal.addMask(shape, true)
    if (mapDef.dayNight) {
      this.fogRect = this.add.rectangle(0, 0, FOG_SPAN, FOG_SPAN, FOG_COLOR, 0).setDepth(FOG_DEPTH).setVisible(false)
      this.fogMaskShape = this.add.graphics().setVisible(false)
      this.fogRect.enableFilters()
      this.fogRect.filters?.internal.addMask(this.fogMaskShape, true)
    }

    // 时停冷雾遮罩（镜像 BaseArenaScene：屏幕固定大矩形，任意地图通用）
    this.timeStopFx = this.add
      .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 6000, 6000, TIMESTOP.chillColor, 0)
      .setScrollFactor(0)
      .setDepth(88)

    // 出生点:无限世界出生在原点(负坐标合法),有界图在图心
    const center = this.infinite ? { x: 0, y: 0 } : { x: this.mapW / 2, y: this.mapH / 2 }
    this.centerObj = this.add.zone(center.x, center.y, 1, 1)
    cam.startFollow(this.centerObj)

    this.cursors = this.input.keyboard?.createCursorKeys()
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D') as
      | Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
      | undefined

    const hint = this.add
      .text(viewport.logicalWidth / 2, 40, 'ECS 实验 · 构建图集…', {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: '#8fa1b5',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000)

    void this.boot(run, center, hint)

    // HUD：与旧竞技场同一套 UIScene（自探测当前战斗场景，launch 不传参）
    this.scene.launch('ui')
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop('ui')
    })

    this.input.keyboard?.on('keydown-ESC', () => {
      playSfx('click')
      this.scene.start('menu')
    })
  }

  private async boot(run: RunState, center: { x: number; y: number }, hint: Phaser.GameObjects.Text): Promise<void> {
    const atlas = await EcsAtlas.build(this, OUTLINED_EMOJIS)
    if (!this.scene.isActive()) return
    this.atlas = atlas
    clearGroundEffectsEcs() // 开局清上一局遗留的地面效果(模块级列表)
    clearFieldEcs()
    new EcsSpriteBatch(this, this.world, atlas)
    this.spawnDecor(run, atlas)
    this.testMode = run.testMode
    const settings = loadSettings(browserStorage())
    this.hitShakeOn = settings.hitShake
    this.damageNumbersOn = settings.damageNumbers
    ensureDamageFont(this)
    this.damagePool = Array.from({ length: 64 }, () =>
      this.add.bitmapText(0, 0, DAMAGE_FONT).setFontSize(24).setOrigin(0.5).setDepth(50).setVisible(false),
    )
    // 粒子爆点(镜像 deathBurst/coinBurst 的配色与速度)
    this.deathBurst = burstEmitter(this, [0x8e24aa, 0xab47bc, 0x6a1b9a, 0xf3e5f5], 230)
    this.coinBurst = burstEmitter(this, [0xffb300, 0xffdc5d, 0xfff8e1], 150, 340)
    this.puffBurst = burstEmitter(this, [0x757575, 0x9e9e9e, 0xe0e0e0], 130, 520)
    this.sim = spawnTeam(this.world, atlas, run, run.testMode, center, this.mapW, this.mapH)
    initialLayout(this.sim)
    this.sim.hooks.onStart(this.sim)
    armTeam(this.sim, this, atlas, run, run.testMode)
    const captain = armCaptain(this.sim, this, atlas, run)
    this.captainAbilities = captain.abilities
    this.captainHandle = captain.handle
    for (let i = 0; i < this.sim.members.length; i++) {
      this.hpBars.push(this.add.graphics().setDepth(11))
      this.shownHp.push(-1)
      this.deadTexts.push(
        this.add
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
      )
      this.shownCountdown.push(-1)
    }
    if (!run.testMode) this.scheduleCarriers()
    // 正常模式 Boss 波开场:先开世界终波机关(无限图缩圈以此刻队伍位置张开),再预告投放本图 Boss
    if (!run.testMode && isBossWave(run.wave)) {
      this.sim.hooks.onFinalWave(this.sim)
      if (this.sim.zone) {
        this.zoneGfx = this.add.graphics().setDepth(2)
        this.zoneVignette = this.add
          .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 6000, 6000, 0xd32f2f, 0)
          .setScrollFactor(0)
          .setDepth(90)
      }
      this.time.delayedCall(600, () => {
        if (this.sim && !this.sim.over) spawnBossEcs(this.sim, atlas)
      })
    }
    this.ready = true
    hint.destroy()

    // e2e 探针:按 kind 在队伍中心附近投放一只敌人(相对格偏移;elite=金边精英体质)
    window.__ecsSpawnEnemy = (kind: string, dxU = 3, dyU = 0, elite = false): void => {
      const sim = this.sim
      if (!sim || !this.atlas) return
      const boss = BOSSES.find((s) => s.kind === kind)
      const raw = ENEMY_DEFS.find((s) => s.kind === kind) ?? boss
      if (!raw) return
      const px = toPx(raw)
      const hp = Math.round(px.hp * (elite && !boss ? ELITE.hpMul : 1))
      spawnEnemy(sim, this.atlas, px, sim.center.x + dxU * UNIT, sim.center.y + dyU * UNIT, hp, elite && !boss, !!boss)
    }
    // e2e 探针:最近敌人的显示尺寸(px)——验证精英体型放大
    window.__ecsNearestEnemySize = (): number => {
      const best = this.nearestEnemyToCenter()
      return best >= 0 ? Transform.w[best]! : -1
    }
    // e2e 探针:对最近队伍中心的敌人施加伤害(+击退,源在队伍中心)
    window.__ecsHurtEnemy = (dmg = 20, kb = 0): void => {
      const sim = this.sim
      if (!sim) return
      let best = -1
      let bestD = Infinity
      for (const eid of query(this.world, [Enemy])) {
        const dx = Transform.x[eid]! - sim.center.x
        const dy = Transform.y[eid]! - sim.center.y
        const d = dx * dx + dy * dy
        if (d < bestD) {
          bestD = d
          best = eid
        }
      }
      if (best >= 0) applyDamage(sim, best, dmg, kb, sim.center.x, sim.center.y)
    }
    // e2e 探针:对最近队伍中心的敌人施加限时减速(验证 slow 状态)
    window.__ecsSlowEnemy = (factor = 0.3, durMs = 3000): void => {
      const sim = this.sim
      if (!sim) return
      let best = -1
      let bestD = Infinity
      for (const eid of query(this.world, [Enemy])) {
        const dx = Transform.x[eid]! - sim.center.x
        const dy = Transform.y[eid]! - sim.center.y
        const d = dx * dx + dy * dy
        if (d < bestD) {
          bestD = d
          best = eid
        }
      }
      if (best >= 0) {
        Slow.until[best] = sim.elapsedMs + durMs
        Slow.mul[best] = factor
      }
    }
    // e2e 探针:给最近敌人挂中毒 DoT + 读其血量
    window.__ecsPoisonEnemy = (dmg = 5, tickMs = 300, durMs = 3000): void => {
      const sim = this.sim
      if (!sim) return
      let best = -1
      let bestD = Infinity
      for (const eid of query(this.world, [Enemy])) {
        const dx = Transform.x[eid]! - sim.center.x
        const dy = Transform.y[eid]! - sim.center.y
        const d = dx * dx + dy * dy
        if (d < bestD) {
          bestD = d
          best = eid
        }
      }
      if (best >= 0) {
        Poison.until[best] = sim.elapsedMs + durMs
        Poison.nextTick[best] = sim.elapsedMs + tickMs
        Poison.dmg[best] = dmg
        Poison.tickMs[best] = tickMs
        Poison.slot[best] = -1
      }
    }
    window.__ecsNearestEnemyHp = (): number => {
      const sim = this.sim
      if (!sim) return -1
      let best = -1
      let bestD = Infinity
      for (const eid of query(this.world, [Enemy])) {
        const dx = Transform.x[eid]! - sim.center.x
        const dy = Transform.y[eid]! - sim.center.y
        const d = dx * dx + dy * dy
        if (d < bestD) {
          bestD = d
          best = eid
        }
      }
      return best >= 0 ? Hp.v[best]! : -1
    }
    window.__ecsNearestEnemyState = (): number => {
      const sim = this.sim
      if (!sim) return -1
      let best = -1
      let bestD = Infinity
      for (const eid of query(this.world, [Enemy])) {
        const dx = Transform.x[eid]! - sim.center.x
        const dy = Transform.y[eid]! - sim.center.y
        const d = dx * dx + dy * dy
        if (d < bestD) {
          bestD = d
          best = eid
        }
      }
      return best >= 0 ? EState.v[best]! : -1
    }
    // e2e 探针:变形最近敌人(魔尘)+ 读其是否变形中
    window.__ecsMorphEnemy = (durMs = 2500, vulnMul = 1): void => {
      const sim = this.sim
      if (!sim || !this.atlas) return
      const best = this.nearestEnemyToCenter()
      if (best >= 0) applyMorph(sim, this.atlas, best, { durationMs: durMs, morphEmoji: '1f411', vulnMul })
    }
    window.__ecsNearestEnemyMorphed = (): boolean => {
      const sim = this.sim
      if (!sim) return false
      const best = this.nearestEnemyToCenter()
      return best >= 0 && Morph.until[best] !== 0 && sim.elapsedMs < Morph.until[best]!
    }
    window.__ecsGroundZones = (): number => groundZoneCount()
    window.__ecsBossDown = (): boolean => this.sim?.bossDown ?? false
    // e2e 探针:在队伍中心相对格偏移处掉一枚战场拾取
    window.__ecsDropField = (id: string, dxU = 2, dyU = 0): void => {
      const sim = this.sim
      const def = FIELD_PICKUPS[id]
      if (!sim || !def) return
      spawnFieldPickupEcs(sim, this, sim.center.x + dxU * UNIT, sim.center.y + dyU * UNIT, toPx(def))
    }
    // e2e 探针:发动时停(不经队长技能,直接开窗口)+ 读当前世界时标
    window.__ecsTimeStop = (durMs = 6000): void => {
      if (this.sim) this.sim.timeStopMsLeft = durMs
    }
    window.__ecsWorldTimeScale = (): number => (this.sim ? worldTimeScale(this.sim) : 1)
    // e2e 探针:把世界的下一次周期事件提前到此刻(深空强开天体横扫 / 落水掉血立刻结算)
    window.__ecsForceWorldTick = (): void => {
      if (this.sim) this.sim.worldTickAt = this.sim.elapsedMs
    }
    // e2e 探针:走一帧队伍位移(直调世界钩子,不依赖游戏时钟)——校验冰面打滑手感
    window.__ecsStepTeam = (wantDx, wantDy, deltaMs = 16): { x: number; y: number } => {
      const sim = this.sim
      if (!sim) return { x: 0, y: 0 }
      const next = sim.hooks.constrainTeam(sim, { x: sim.center.x + wantDx, y: sim.center.y + wantDy }, deltaMs)
      sim.center.x = next.x
      sim.center.y = next.y
      return { x: next.x, y: next.y }
    }
    // e2e 探针:把队伍中心瞬移到格坐标(测落水掉血等按位置结算的世界规则)
    window.__ecsTeleport = (xU, yU): void => {
      const sim = this.sim
      if (!sim) return
      sim.center.x = xU * UNIT
      sim.center.y = yU * UNIT
      sim.teamVx = 0
      sim.teamVy = 0
      for (const m of sim.members) {
        Transform.x[m] = sim.center.x
        Transform.y[m] = sim.center.y
        Follow.x[m] = sim.center.x
        Follow.y[m] = sim.center.y
        Follow.vx[m] = 0
        Follow.vy[m] = 0
      }
    }
    // e2e 探针:全场蹦迪窗口是否生效中
    window.__ecsDancing = (): boolean => {
      const sim = this.sim
      return sim !== undefined && sim.elapsedMs < sim.danceEndsAt
    }
    // e2e 探针:队员 0 是否处于黏黏怪攻速惩罚中
    window.__ecsMemberAtkSlowed = (): boolean => {
      const sim = this.sim
      const m = sim?.members[0]
      return sim !== undefined && m !== undefined && MAtkSlow.until[m]! > sim.elapsedMs
    }
    // e2e/性能探针:一次性铺 count 只敌人(网格散布,验证上千 entity 单批绘制)
    window.__ecsStress = (count = 1000, kind = 'zombie'): void => {
      const sim = this.sim
      if (!sim || !this.atlas) return
      const raw = ENEMY_DEFS.find((s) => s.kind === kind)
      if (!raw) return
      const px = toPx(raw)
      const cols = Math.ceil(Math.sqrt(count))
      const gap = 0.5 * UNIT
      for (let i = 0; i < count; i++) {
        const gx = (i % cols) - cols / 2
        const gy = Math.floor(i / cols) - cols / 2
        spawnEnemy(sim, this.atlas, px, sim.center.x + gx * gap, sim.center.y + gy * gap, px.hp, false, false)
      }
    }
    // e2e 探针:结算本波(仅回写 run,不过场),返回结算后波次号
    window.__ecsSettleWave = (): number => {
      const sim = this.sim
      if (!sim) return -1
      settleWave(sim)
      return sim.run.wave
    }
    // e2e 探针:在队伍中心相对格偏移处落金币(测偷币鼠)
    window.__ecsSpawnCoinsAt = (dxU = 8, dyU = 0, count = 3): void => {
      const sim = this.sim
      if (!sim || !this.atlas) return
      spawnCoinsEcs(sim, this.atlas, sim.center.x + dxU * UNIT, sim.center.y + dyU * UNIT, count)
    }
    // e2e 探针:全场敌人已吞金币数的最大值(隔离偷币鼠,不受自然刷怪干扰)
    window.__ecsMaxEaten = (): number => {
      let max = 0
      for (const eid of query(this.world, [Enemy])) if (thiefEaten[eid]! > max) max = thiefEaten[eid]!
      return max
    }
    ;(window as unknown as { __ecs?: object }).__ecs = {
      ready: true,
      pages: atlas.pageCount,
    }
  }

  /** 最近队伍中心的敌人 eid(探针共用),无敌人返回 -1 */
  private nearestEnemyToCenter(): number {
    const sim = this.sim
    if (!sim) return -1
    let best = -1
    let bestD = Infinity
    for (const eid of query(this.world, [Enemy])) {
      const dx = Transform.x[eid]! - sim.center.x
      const dy = Transform.y[eid]! - sim.center.y
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = eid
      }
    }
    return best
  }

  /** 刷怪预告标记对帐(镜像 spawnTelegraphed 的⚠脉冲):新 pending 挂脉冲标记,落地即销毁 */
  private updateTelegraphs(): void {
    const sim = this.sim!
    const live = new Set<PendingSpawn>(sim.pendingSpawns)
    for (const [p, mark] of this.spawnMarks) {
      if (live.has(p)) continue
      this.tweens.killTweensOf(mark)
      mark.destroy()
      this.spawnMarks.delete(p)
    }
    for (const p of sim.pendingSpawns) {
      if (this.spawnMarks.has(p)) continue
      const mark = emojiImage(this, p.x, p.y, SPAWN.markEmoji, SPAWN.markSize * UNIT * (p.boss ? 2 : 1))
        .setDepth(4)
        .setAlpha(0)
      this.tweens.add({
        targets: mark,
        alpha: 1,
        duration: SPAWN.telegraphMs / (p.boss ? 4 : 6),
        yoyo: true,
        repeat: -1,
      })
      this.spawnMarks.set(p, mark)
    }
  }

  /** 排空本帧粒子爆点:按 kind 分发到死亡/拾币发射器(镜像 deathBurst/coinBurst.explode) */
  private drainBursts(): void {
    const q = this.sim!.pendingBursts
    if (q.length === 0) return
    for (const b of q) {
      const emitter = b.kind === 'coin' ? this.coinBurst : b.kind === 'puff' ? this.puffBurst : this.deathBurst
      emitter.explode(b.count, b.x, b.y)
    }
    q.length = 0
  }

  /** 排空本帧敌人受伤飘字(镜像 floatDamage:池化 BitmapText 上浮淡出);关则弃字 */
  private drainDamageNumbers(): void {
    const q = this.sim!.pendingDamageNumbers
    if (q.length === 0) return
    if (this.damageNumbersOn) for (const d of q) this.floatDamage(d.x, d.y, d.amount, d.crit)
    q.length = 0
  }

  private floatDamage(x: number, y: number, amount: number, crit: boolean): void {
    const t = this.damagePool[this.damageIdx]
    if (!t) return
    this.damageIdx = (this.damageIdx + 1) % this.damagePool.length
    this.tweens.killTweensOf(t)
    // 暴击金色放大;池对象复用,普通伤害要复位样式(镜像 floatDamage)
    t.setFontSize(crit ? 34 : 24).setTint(crit ? 0xffdc5d : 0xffffff)
    t.setText(String(amount)).setPosition(x, y - 14).setAlpha(1).setVisible(true)
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 350, onComplete: () => t.setVisible(false) })
  }

  /** 逐帧队员血条:跟位 + 比例变化才重绘(镜像 drawMemberHp);阵亡隐藏、复活自动恢复 */
  private updateHpBars(): void {
    const sim = this.sim!
    for (let i = 0; i < sim.members.length; i++) {
      const m = sim.members[i]!
      const g = this.hpBars[i]
      if (!g) continue
      const dead = this.deadTexts[i]
      if (!Alive.v[m]) {
        g.setVisible(false)
        this.shownHp[i] = -1
        // 阵亡:头顶显示复活倒计时(秒),仅整秒变化时重设文本
        if (dead) {
          dead.setVisible(true).setPosition(Transform.x[m]!, Transform.y[m]!)
          const remain = Math.ceil((Revive.at[m]! - sim.elapsedMs) / 1000)
          if (remain !== this.shownCountdown[i]) {
            this.shownCountdown[i] = remain
            dead.setText(String(Math.max(0, remain)))
          }
        }
        continue
      }
      dead?.setVisible(false)
      this.shownCountdown[i] = -1
      g.setVisible(true).setPosition(Transform.x[m]!, Transform.y[m]!)
      const ratio = Math.max(0, MHp.hp[m]! / MHp.max[m]!)
      if (Math.abs(ratio - this.shownHp[i]!) < 0.005) continue
      this.shownHp[i] = ratio
      const w = 0.8 * UNIT
      const y = MEMBER.size * UNIT * 0.62
      g.clear()
      g.fillStyle(0x000000, 0.45)
      g.fillRect(-w / 2, y, w, 6)
      g.fillStyle(ratio > 0.5 ? 0x66bb6a : ratio > 0.25 ? 0xffdc5d : 0xef5350, 1)
      g.fillRect(-w / 2 + 1, y + 1, (w - 2) * ratio, 4)
    }
  }

  // ── HUD 宿主契约(HudHost):UIScene 从这里取全部读数 ──────────

  /** 顶栏读数(镜像 BaseArenaScene.hudSnapshot) */
  hudSnapshot(): HudSnapshot {
    const sim = this.sim
    const elapsed = sim?.elapsedMs ?? 0
    const boss = sim ? query(this.world, [Enemy, Boss]).find((eid) => Boss.v[eid] === 1) : undefined
    return {
      xp: this.run.xp.xp,
      xpNext: xpToNext(this.run.xp.level),
      level: this.run.xp.level,
      kills: this.run.kills,
      coins: this.run.coins,
      wave: this.run.wave,
      seconds: Math.floor(elapsed / 1000),
      remainMs: Math.max(0, waveDurationMs(this.run.wave) - elapsed),
      over: sim?.over ?? false,
      bossHp: boss !== undefined ? Hp.v[boss]! : null,
      bossMaxHp: bossFor(this.run.mapId).hp,
      // 已激活的战场拾取效果(HUD 图标 + 剩余计时)
      battleFx: (sim?.battleMods ?? []).map((m) => ({
        emoji: m.emoji,
        polarity: m.polarity,
        remainMs: Math.max(0, m.until - elapsed),
        totalMs: m.totalMs,
      })),
    }
  }

  /** 主动技能读数(镜像 skillSnapshot;释放本体待 castSkill 落地) */
  skillSnapshot(): { name: string; remainMs: number; cdMs: number; ready: boolean } {
    const s = CAPTAINS[this.run.captainId].skill
    return {
      name: s.name,
      remainMs: this.run.skillCdMs,
      cdMs: s.cdMs * this.teamFx.skillCdMul,
      ready: this.run.skillCdMs <= 0,
    }
  }

  /** 性能面板读数(镜像 perfSnapshot;ECS 无物理体,bodies 恒 0) */
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
    const sim = this.sim
    const totalSec = (this.run.combatMs + (sim?.elapsedMs ?? 0)) / 1000
    const wave = waveAt(totalSec)
    return {
      enemies: query(this.world, [Enemy]).length,
      projectiles: query(this.world, [Projectile]).length + query(this.world, [EnemyProj]).length,
      coins: query(this.world, [Coin]).length,
      pending: sim?.pendingSpawns.length ?? 0,
      objects: this.children.list.length,
      bodies: 0,
      combatSec: Math.floor(totalSec),
      spawnIntervalMs: Math.round(this.testMode ? DENSITY_PARAMS[labDensity()].intervalMs : wave.spawnIntervalMs),
      hpMultiplier: wave.hpMultiplier,
    }
  }

  /** 释放主动技能(镜像 castSkill):纯 CD 门槛,就绪即放、重置跨波 CD;
   * 效果本体是队长持有的标准能力行,逐个单发 */
  castSkill(): boolean {
    const sim = this.sim
    if (!sim || sim.over || this.run.skillCdMs > 0) return false
    const s = CAPTAINS[this.run.captainId].skill
    this.run.skillCdMs = s.cdMs * this.teamFx.skillCdMul
    playSfx('levelup')
    this.events.emit('skill-cast', s.name)
    for (const a of this.captainAbilities) a.castNow?.(this.captainHandle)
    return true
  }

  /** 测试模式免死开关变更后重算队员血量上限(镜像 applyTestInvincible) */
  applyTestInvincible(): void {
    const sim = this.sim
    if (!sim) return
    const mh = labInvincible() ? INVINCIBLE_HP : MEMBER.maxHp
    for (const m of sim.members) {
      MHp.max[m] = mh
      MHp.hp[m] = labInvincible() ? mh : Math.min(MHp.hp[m]!, mh)
    }
  }

  /** 昼夜世界步进(镜像 ArenaScene.updateWorld 的 dayNight 分支):相机随时刻平滑缩放 +
   * 夜幕迷雾开合。出怪表/刷怪间隔的昼夜切换在纯逻辑侧(spawn.ts)按时钟自算 */
  private updateDayNight(sim: Sim): void {
    const dn = MAPS[this.run.mapId].dayNight
    if (!dn) return
    const hour = hourAt((this.run.combatMs + sim.elapsedMs) / 1000, dn)
    // 视野 V 格 → zoom = 标准 ×(visionMid/V)
    this.cameras.main.setZoom((viewport.renderScale * dn.visionMid) / visionGridsAt(hour, dn))
    const rect = this.fogRect
    const shape = this.fogMaskShape
    if (!rect || !shape) return
    const alpha = fogAlphaAt(hour, dn)
    if (alpha <= 0.001) {
      rect.setVisible(false)
      return
    }
    shape.clear()
    shape.fillStyle(0xffffff)
    shape.fillCircle(sim.center.x, sim.center.y, fogRadiusAt(hour, dn) * UNIT)
    rect.setPosition(sim.center.x, sim.center.y).setFillStyle(FOG_COLOR, alpha).setVisible(true)
  }

  /** 浮冰世界的视觉步进(镜像 IceArenaScene.updateWater 的渐晕部分):
   * 队伍中心落水即脉冲蓝渐晕。掉血结算在纯逻辑侧(worlds.ts 的 tick) */
  private updateWaterVignette(sim: Sim): void {
    const rect = this.waterVignette
    if (!rect) return
    const px = MAPS[this.run.mapId].ice!.floeU * UNIT
    const inWater = !onFloe(sim.center.x, sim.center.y, px)
    rect.setFillStyle(WATER_VIGNETTE, inWater ? 0.18 + 0.06 * Math.sin(sim.elapsedMs / 140) : 0)
  }

  /** 无限世界装饰分块滚动(镜像 InfiniteArenaScene.ensureChunks):视野覆盖的块集合变化时
   * 整组增删 ECS 静态实体。摆放由 chunkDecor 按 (种子, 块) 纯函数重建——回头看到的景不变 */
  private ensureChunks(atlas: EcsAtlas): void {
    const cfg = MAPS[this.run.mapId].infinite!
    const view = this.cameras.main.worldView
    const need = chunksInRect(
      view.x / UNIT,
      view.y / UNIT,
      view.right / UNIT,
      view.bottom / UNIT,
      cfg.chunkCells,
      cfg.chunkPad,
    )
    const first = need[0]!
    const last = need[need.length - 1]!
    const rangeKey = `${first.cx},${first.cy}:${last.cx},${last.cy}`
    if (rangeKey === this.decorRangeKey) return
    this.decorRangeKey = rangeKey
    const def = MAPS[this.run.mapId].decor
    const needKeys = new Set(need.map((c) => chunkKey(c.cx, c.cy)))
    for (const [key, eids] of this.decorChunks) {
      if (needKeys.has(key)) continue
      for (const eid of eids) removeEntity(this.world, eid)
      this.decorChunks.delete(key)
    }
    for (const c of need) {
      const key = chunkKey(c.cx, c.cy)
      if (this.decorChunks.has(key)) continue
      this.decorChunks.set(
        key,
        chunkDecor(def, this.run.decorSeed, c.cx, c.cy, cfg.chunkCells).map((d) =>
          spawnSprite(this.world, atlas, {
            id: d.emoji,
            outline: 'player',
            x: d.xU * UNIT,
            y: d.yU * UNIT,
            size: d.sizeU * UNIT,
            rot: d.rotation,
            alpha: d.alpha,
            z: 1,
          }),
        ),
      )
    }
  }

  /** 终波缩圈的视觉(镜像 InfiniteArenaScene.updateZone;圈半径与掉血在 worlds.ts 纯逻辑侧):
   * 亮边界环 + 内侧提示描边,有队员在圈外则满屏红渐晕脉冲 */
  private updateZone(sim: Sim): void {
    const zone = sim.zone
    const g = this.zoneGfx
    if (!zone || !g) return
    g.clear()
    g.lineStyle(5, 0xef5350, 0.85)
    g.strokeCircle(zone.x, zone.y, zone.r)
    g.lineStyle(14, 0xd32f2f, 0.16)
    g.strokeCircle(zone.x, zone.y, zone.r + 9)
    const anyOutside = sim.members.some(
      (m) => Alive.v[m] && outsideZone({ x: Transform.x[m]!, y: Transform.y[m]! }, zone, zone.r),
    )
    this.zoneVignette?.setFillStyle(0xd32f2f, anyOutside ? 0.16 + 0.08 * Math.sin(sim.elapsedMs / 130) : 0)
  }

  /** 天体横扫的视觉对帐(镜像 startMeteorWarn/launchMeteor/endMeteor;直线与伤害在纯逻辑侧):
   * 新一次横扫即画危险车道,预警期脉动,起划挂球体并让轨迹淡下去,结束即销毁 */
  private updateMeteorFx(sim: Sim): void {
    const m = sim.meteor
    const fx = this.meteorFx
    if (fx && fx.of !== m) {
      fx.sphere?.destroy()
      fx.tele.destroy()
      this.meteorFx = undefined
    }
    if (!m) return
    const cfg = MAPS[this.run.mapId].space!.meteor
    const rr = cfg.radiusU * UNIT
    let cur = this.meteorFx
    if (!cur) {
      // 危险车道:宽半透明带 + 亮芯线 + 入口标记(球体从此侧划入)
      const tele = this.add.graphics().setDepth(3)
      tele.lineStyle(rr * 2, 0xff5252, 0.16)
      tele.lineBetween(m.sx, m.sy, m.ex, m.ey)
      tele.lineStyle(3, 0xff8a80, 0.8)
      tele.lineBetween(m.sx, m.sy, m.ex, m.ey)
      tele.fillStyle(0xff5252, 0.35)
      tele.fillCircle(m.sx, m.sy, rr)
      cur = { of: m, tele }
      this.meteorFx = cur
    }
    if (!m.travelling) {
      // 预警脉动:轨迹一明一暗,提醒「这条线要来球」
      cur.tele.setAlpha(0.28 + 0.24 * Math.abs(Math.sin(sim.elapsedMs / 110)))
      return
    }
    if (!cur.sphere) {
      cur.sphere = emojiImage(this, m.sx, m.sy, '1fa90', rr * 2).setDepth(60)
      cur.tele.setAlpha(0.22) // 划行期间轨迹淡下去,只留车道感
    }
    cur.sphere.setPosition(m.sx + (m.ex - m.sx) * m.t, m.sy + (m.ey - m.sy) * m.t)
    cur.sphere.rotation = sim.elapsedMs / 1000 * 1.4
  }

  /** 本波携带者排期(镜像 scheduleCarriers):按预算铺开,均匀撒在本波中前段(留出波末空档)。
   * 第 1 波是纯净开场,不出战场拾取 */
  private scheduleCarriers(): void {
    const sim = this.sim
    if (!sim || this.run.wave < 2) return
    const carriers = rollWaveCarriers(this.run.mapId, this.run.wave, isBossWave(this.run.wave), () => sim.rng.next())
    if (carriers.length === 0) return
    const dur = waveDurationMs(this.run.wave)
    carriers.forEach((pickup, i) => {
      const at = dur * 0.12 + (dur * 0.7 * i) / carriers.length
      this.time.delayedCall(at, () => {
        if (this.sim && !this.sim.over) spawnCarrierEcs(this.sim, pickup)
      })
    })
  }

  /** 波末过场(镜像 endWave 尾段):停留结算横幅时长后按 run 状态进结算/抽卡/整编/商店 */
  private scheduleWaveEnd(finished: boolean): void {
    this.ending = true
    const run = this.sim!.run
    this.time.delayedCall(WAVE.summaryMs, () => {
      if (finished) this.scene.start('result', { win: true })
      else if (run.cardDraws > 0) this.scene.start('cards')
      else this.scene.start(promoteStep(run) ? 'promote' : 'shop')
    })
  }

  /** 地图装饰:按 run 种子随机散布的低透明度 emoji(镜像 ArenaScene.drawDecor),作 ECS 静态实体。
   * 无限世界改走分块滚动(见 ensureChunks):世界没有边,不能一次铺完 */
  private spawnDecor(run: RunState, atlas: EcsAtlas): void {
    if (this.infinite) return this.ensureChunks(atlas)
    const rng = new Rng(run.decorSeed)
    const cols = Math.round(this.mapW / UNIT)
    const rows = Math.round(this.mapH / UNIT)
    for (const d of rollDecor(MAPS[run.mapId].decor, () => rng.next(), cols, rows)) {
      spawnSprite(this.world, atlas, {
        id: d.emoji,
        outline: 'player',
        x: d.xU * UNIT,
        y: d.yU * UNIT,
        size: d.sizeU * UNIT,
        rot: d.rotation,
        alpha: d.alpha,
        z: 1,
      })
    }
  }

  update(_time: number, delta: number): void {
    const sim = this.sim
    if (!this.ready || !sim || this.ending) return
    // 波次时间到 → 结算 + 过场(测试模式无尽,便于性能观测)。用上一帧 elapsedMs 判定(晚 1 帧无碍)
    if (!this.testMode && sim.elapsedMs >= waveDurationMs(sim.run.wave)) {
      const finished = settleWave(sim)
      this.scheduleWaveEnd(finished)
      return
    }
    const kx =
      (held(this.cursors?.left) || held(this.wasd?.A) ? -1 : 0) +
      (held(this.cursors?.right) || held(this.wasd?.D) ? 1 : 0)
    const ky =
      (held(this.cursors?.up) || held(this.wasd?.W) ? -1 : 0) +
      (held(this.cursors?.down) || held(this.wasd?.S) ? 1 : 0)
    // 键盘优先,否则取 HUD 摇杆向量(镜像 BaseArenaScene 的输入合流);
    // moveInputRaw 键盘满推=1、摇杆取模长,供时停世界时标读
    // 队长技能冷却按真实时钟推进(时停不额外拖长 CD,玩家可预期)
    this.run.skillCdMs = tickSkillCd(this.run.skillCdMs, delta)

    const keyed = kx !== 0 || ky !== 0
    const stick = (this.scene.get('ui') as UIScene | undefined)?.joystickVector ?? { x: 0, y: 0 }
    sim.teamDir = keyed ? norm(kx, ky) : stick
    sim.moveInputRaw = keyed ? 1 : Math.min(1, Math.hypot(stick.x, stick.y))

    // 世界时长:时停窗口内随队伍移动量放缩(动则时行、静则近乎凝固),窗口外恒等于真实帧长。
    // 玩家走位/呼吸/技能 CD 用实时 delta,世界侧(敌人/弹体/刷怪/攻速)一律用 wdelta
    const wdelta = delta * worldTimeScale(sim)
    // 相机视口回填(纯逻辑侧的子弹回收按视野判定,镜像 cullProjectiles)
    const wv = this.cameras.main.worldView
    sim.view.x = wv.x
    sim.view.y = wv.y
    sim.view.right = wv.right
    sim.view.bottom = wv.bottom
    stepSim(sim, delta, wdelta)
    // 队员能力驱动(世界时长:时停期队伍的枪也一并凝住)
    updateMemberAbilities(sim, wdelta)
    // 敌人能力驱动(持械射击/治疗/落石;lazy-arm + 死亡清理)
    if (this.atlas) updateEnemyAbilities(sim, this, this.atlas, wdelta)
    // 亡语重放(分裂/诱饵/治疗/冷枪:本帧内所有死亡的敌人在死亡点触发)
    if (this.atlas) runDeathEffects(sim, this, this.atlas)
    // 地面效果(灼烧/毒液区):team 脉冲烧敌 / enemy 节流烧队员 + 到期淡出
    updateGroundEffectsEcs(sim, this)
    // 金币:死亡掉落落地 + 磁吸入账
    if (this.atlas) drainPendingCoins(sim, this.atlas)
    magnetCoinsEcs(sim, delta)
    // 战场拾取:携带者死亡处落地 + 新携带者挂光环 + 走位拾取/到期淡出
    for (const d of sim.pendingFieldDrops) spawnFieldPickupEcs(sim, this, d.x, d.y, d.def)
    sim.pendingFieldDrops.length = 0
    for (const a of sim.pendingAuras) attachCarrierAuraEcs(this, a.eid, a.def)
    sim.pendingAuras.length = 0
    updateFieldEcs(sim, this)
    // 虫巢周期生成子敌(护巢子敌绕巢;拆巢暴走)
    if (this.atlas) updateSpawners(sim, this.atlas)
    // 刷怪节奏
    if (this.atlas) spawnStep(sim, this.atlas, wdelta)
    this.updateTelegraphs()
    // 终波 Boss 被击败 → 通关结算(镜像 onBossDown → endWave)
    if (!this.testMode && sim.bossDown) {
      const finished = settleWave(sim)
      this.scheduleWaveEnd(finished)
      return
    }
    // 全队阵亡 → 失败结算(测试模式不结算,便于反复观测)
    if (!this.testMode && sim.over) {
      this.ending = true
      this.time.delayedCall(900, () => this.scene.start('result', { win: false }))
      return
    }
    this.centerObj.setPosition(sim.center.x, sim.center.y)
    this.updateDayNight(sim)
    this.updateWaterVignette(sim)
    this.updateZone(sim)
    this.updateMeteorFx(sim)
    // 无限世界:相机走到哪,装饰分块跟到哪(块集合不变则整段免算)
    if (this.infinite && this.atlas) this.ensureChunks(this.atlas)
    // 冷雾浓度跟随时停态（越静越浓），淡入淡出走实时 delta
    const chillTarget = sim.timeStopMsLeft > 0 ? (1 - sim.chrono) * TIMESTOP.chillMaxAlpha : 0
    this.timeStopFxAlpha += (chillTarget - this.timeStopFxAlpha) * Math.min(1, delta / TIMESTOP.fadeMs)
    this.timeStopFx?.setFillStyle(TIMESTOP.chillColor, this.timeStopFxAlpha)
    this.drainDamageNumbers()
    this.drainBursts()
    // 受击震屏:本帧有队员挨打则轻抖画面(镜像 hurtMember 的 cameras.shake)
    if (sim.memberHitCount > this.seenHitCount) {
      this.seenHitCount = sim.memberHitCount
      if (this.hitShakeOn) this.cameras.main.shake(HIT_SHAKE.durationMs, HIT_SHAKE.intensity)
    }
    this.updateHpBars()
    ;(window as unknown as { __ecs?: object }).__ecs = {
      ready: true,
      pages: this.atlas?.pageCount ?? 0,
      centerX: sim.center.x,
      centerY: sim.center.y,
      members: sim.members.length,
      mapW: this.mapW,
      mapH: this.mapH,
      dirX: sim.teamDir.x,
      dirY: sim.teamDir.y,
      moveSpeed: sim.moveSpeed,
      elapsed: sim.elapsedMs,
      memberPos: sim.members.map((eid) => ({ x: Transform.x[eid]!, y: Transform.y[eid]! })),
      enemies: query(this.world, [Enemy]).length,
      // 护巢子敌数(enemyNest>=0):虫巢生成的子敌带巢引用,自然刷怪的敌人恒 -1,借此隔离测量
      broods: Array.from(query(this.world, [Enemy]), (eid) => enemyNest[eid]!).filter((n) => n >= 0).length,
      enemyPos: Array.from(query(this.world, [Enemy]), (eid) => ({ x: Transform.x[eid]!, y: Transform.y[eid]! })),
      kills: sim.run.kills,
      stats: { damage: [...sim.run.stats.damage], kills: [...sim.run.stats.kills], damageTaken: [...sim.run.stats.damageTaken] },
      wave: sim.run.wave,
      coins: sim.run.coins,
      xpLevel: sim.run.xp.level,
      liveCoins: query(this.world, [Coin]).length,
      projectiles: query(this.world, [Projectile]).length,
      eprojectiles: query(this.world, [EnemyProj]).length,
      field: {
        pickups: fieldCounts().pickups,
        carriers: fieldCounts().carriers,
        active: sim.battleMods.map((m) => ({ id: m.id, remainMs: Math.max(0, m.until - sim.elapsedMs) })),
      },
      over: sim.over,
      alive: sim.members.filter((eid) => Alive.v[eid]).length,
      memberHp: sim.members.map((eid) => MHp.hp[eid]!),
      // 浮冰:队伍中心是否落水(非浮冰图恒 false)
      inWater: this.waterVignette !== undefined && !onFloe(sim.center.x, sim.center.y, this.mapW),
      // 无限世界:休眠敌人数 + 相机位置(验证无边界跟随)+ 终波缩圈半径
      dormant: Array.from(query(this.world, [Enemy]), (eid) => Dormant.v[eid]!).filter((v) => v === 1).length,
      camX: this.cameras.main.scrollX + this.cameras.main.width / 2,
      camY: this.cameras.main.scrollY + this.cameras.main.height / 2,
      zoneR: sim.zone?.r ?? 0,
      // 深空:天体横扫态(null=不在途)
      meteor: sim.meteor ? { travelling: sim.meteor.travelling, t: sim.meteor.t } : null,
    }
  }
}
