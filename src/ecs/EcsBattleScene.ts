import Phaser from 'phaser'
import { textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { UNIT } from '../util/units'
import { MEMBER } from '../data/characters'
import { HIT_SHAKE } from '../data/feel'
import { TIMESTOP } from '../data/timeStop'
import { burstEmitter } from '../util/fx'
import { CueLayer, drawCues } from './render/cues'
import { RingLayer } from './render/rings'
import { DamageTextLayer } from './render/damageText'
import { loadSettings } from '../save/settings'
import { browserStorage } from '../util/storage'
import { UI_FONT, FONT } from '../util/fonts'
import { norm } from '../util/vec'
import { Rng } from '../util/rng'
import { applyBackground } from '../util/background'
import { playSfx } from '../audio/sfx'
import { OUTLINED_EMOJIS } from '../manifest'
import { getRun, promoteStep } from '../run/state'
import type { RunState } from '../run/state'
import { bossFor, MAP, MAPS, rollDecor } from '../data/maps'
import type { MapDef, RiverConfig, TorusConfig, WallsConfig } from '../types/maps'
import { fitAspectRect } from '../war/maps/void'
import { driftProfile, riverRect } from '../war/maps/river'
import type { RiverRect } from '../war/maps/river'
import { fogAlphaAt, fogRadiusAt, hourAt, visionGridsAt } from '../war/maps/daynight'
import { onFloe } from '../war/maps/ice'
import { chunkDecor, chunkKey, chunksInRect, outsideZone } from '../war/maps/world'
import { WallGrid, generateRuins, reachableCells } from '../war/maps/ruins'
import { ECS_SCENE_KEY } from './keys'
import { makeWorld } from './world'
import type { EcsWorld } from './world'
import { query, removeEntity } from 'bitecs'
import { Alive, Boss, Dormant, Enemy, EnemyProj, Hp, MHp, MoveSpeed, Nest, PICKUP_SET, Pickup, Projectile, Revive, Sprite, Transform, Zone } from './components'
import { EcsAtlas } from './render/atlas'
import { EcsSpriteBatch, SPRITE_BANDS } from './render/spriteBatch'
import { spawnDecor } from './entities/decor'
import { updateAnims } from './systems/updateAnims'
import { remapSim } from './systems/shared/remap'
import { makeSim } from './sim'
import { updateSpawners } from './systems/updateSpawners'
import { clearEcsStore } from './store'
import { armCaptain, armTeam } from './entities/ability'
import { armEnemies } from './systems/armEnemies'
import { refreshEnemyTargets } from './systems/refreshEnemyTargets'
import { refreshMemberTargets } from './systems/refreshMemberTargets'
import { requestCast } from './entities/ability'
import { Minion } from './components'
import { stepAbilities } from './pipeline/abilities'
import { replayDeath } from './systems/shared/death'
import { runDeathEffects } from './systems/runDeathEffects'
import { updateZones } from './systems/updateZones'
import { COIN, pickupCounts } from './entities/pickup'
import { updatePickups } from './systems/updatePickups'
import { spawnBossEcs, spawnCarrierEcs, spawnSurgeEcs } from './entities/enemy'
import { spawnStep } from './systems/spawnStep'

import { initialLayout, stepFrozenVisuals, stepSim, worldTimeScale } from './sim'
import { settleWave } from './systems/shared/wave'
import { isBossWave, isEliteWave, waveAt, waveDurationMs, WAVE } from '../data/waves'
import { xpToNext } from '../war/xp'
import { CAPTAINS } from '../data/captains'
import { aggregateTeamCards } from '../data/cards'
import type { TeamEffects } from '../types/items'
import { INVINCIBLE_HP, densityParams, labInvincible } from '../run/lab'
import { tickSkillCd } from '../war/skill'
import { hudMoveVector, setActiveHudHost } from '../run/hudHost'
import type { HudHost } from '../run/hudHost'
import type { HudSnapshot } from '../run/hudHost'
import type { Burst, Meteor, PendingSpawn, Sim } from './sim'
import { emojiImage } from '../emoji/textures'
import { SPAWN } from '../data/enemies'
import { rollWaveCarriers } from '../war/battleFx'

// ECS 实验战斗场景(宿主壳):Phaser 只做画布/相机/输入/音频宿主;战斗世界(实体+系统+
// 自绘渲染)全在 ECS。P2:有界森林图 + 队伍编队/orbit/游移/跟随弹簧 + 键盘/相机跟随。

// 夜雾:整块暗幕的颜色/深度/尺寸(与 BoundedScene 同值)
const FOG_COLOR = 0x0a0a1a
const FOG_DEPTH = 90
const FOG_SPAN = 9000
// 浮冰图:深水底色 + 落水蓝渐晕(与 IceScene 同值)
const WATER_COLOR = 0x0b2a45
const WATER_VIGNETTE = 0x1e6fd0
// 奔流图:两岸大地/树干棕(与浅蓝河水强对比,与 RiverScene 同值)
const BANK_COLOR = 0x54402a
const BANK_FAR_COLOR = 0x40301f

/** 一片顺流漂浮物(纯视觉):沿流向进度 + 跨向基准偏移 + 摇摆/自旋 */
interface Drift {
  image: Phaser.GameObjects.Image
  uPx: number
  baseCross: number
  speedMul: number
  swayPhase: number
  swayAmp: number
  spin: number
}

/** 颜色明暗缩放(河水跨向渐变用) */
function shade(color: number, mul: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * mul))
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * mul))
  const b = Math.min(255, Math.round((color & 0xff) * mul))
  return (r << 16) | (g << 8) | b
}

function held(key?: Phaser.Input.Keyboard.Key): boolean {
  return key?.isDown ?? false
}

/** 在场金币数(探针):拾取物里 kind = COIN 的那些 */
function liveCoins(world: EcsWorld): number {
  let n = 0
  for (const eid of query(world, PICKUP_SET as unknown as object[])) {
    if (Pickup.kind[eid] === COIN) n++
  }
  return n
}

/** 哪些世界形态走「满屏底色 + 分块装饰 + 出生在原点」的无限地基。**全映射**：
 * MapDef 新增一种 kind 而不在此登记 = 编译不过。从前是 `kind === 'infinite' || kind === 'space'`，
 * 新增一种形态默认落在 false，是漏掉还是有意分不出来 */
const CHUNKED_BACKDROP: Record<MapDef['kind'], boolean> = {
  bounded: false,
  daynight: false,
  ruins: false,
  ice: false,
  void: false,
  river: false, // 奔流虽是无限世界，但底色是滚动河面，不走分块装饰
  infinite: true,
  space: true,
}

export class EcsBattleScene extends Phaser.Scene implements HudHost {
  private world!: EcsWorld
  private atlas?: EcsAtlas
  /** 一次性特效层（池化自绘，不挂 tween；见 render/cues.ts） */
  private cues?: CueLayer
  /** 实体光圈层（待拾脉冲 / 携带者光环；见 render/rings.ts） */
  private rings?: RingLayer
  private sim?: Sim
  private ready = false
  /** HUD 宿主契约：UIScene 据此显示实验室控件、正计时 */
  testMode = false
  /** HUD 宿主契约：当前 run（HUD 读 mapId/金币/经验等） */
  run!: RunState
  /** 团队卡牌聚合乘区（技能 CD 等；与 spawnTeam 内同源，开局定） */
  private teamFx!: TeamEffects
  /** 队伍锚点实体：队长技能载荷挂在它名下（不进自动扫描，只等 castSkill 的施放请求） */
  /** 过场已排程(波末结算/全灭):置位后 update 早退,避免重复触发 */
  private ending = false
  /** 本波开场基线（波末小结取增量：本波击杀/金币/升级数） */
  private waveBaseKills = 0
  private waveBaseCoins = 0
  private waveBaseLevel = 1
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
  /** 伤害飘字层（纯数据 + 单个批绘对象，不挂 tween；见 render/damageText.ts） */
  private damageText?: DamageTextLayer
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
  /** 工厂图（环面）：跨缝分身的条带相机 + 传送门光带/脉动边线 */
  private stripCams: Phaser.Cameras.Scene2D.Camera[] = []
  private frameTiles: { tile: Phaser.GameObjects.TileSprite; dx: number; dy: number }[] = []
  private frameGlow?: Phaser.GameObjects.Graphics
  /** 单屏图（奔流/工厂）的静态视觉层：视口变化时整体重建 */
  private worldVisuals: Phaser.GameObjects.GameObject[] = []
  /** 奔流图水面动效：双层水纹贴图 + 顺流漂浮物（纯视觉，不进 ECS 批绘） */
  private waveTiles: { tile: Phaser.GameObjects.TileSprite; speed: number }[] = []
  private drifts: Drift[] = []
  /** 残垣图断壁：格索引 → 该格的石块/顶沿视觉（碾墙时单格销毁） */
  private wallTiles = new Map<number, Phaser.GameObjects.Rectangle[]>()
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

  /** 本图是否走无限世界地基(满屏底色 + 分块装饰 + 出生在原点) */
  private get infinite(): boolean {
    return CHUNKED_BACKDROP[MAPS[this.run.mapId].kind]
  }

  /** 开局重置全部可变实例字段（镜像 resetWorldFields 的用意）。
   * Phaser 跨局复用同一个 Scene 实例：不重置的话，上一波的 ending=true 会让 update 永久早退
   *（下一波整局静止），各视觉列表也会跨局累积到已销毁的对象上 */
  private resetSceneFields(): void {
    this.atlas = undefined
    this.cues = undefined
    this.rings = undefined
    this.sim = undefined
    this.ready = false
    this.ending = false
    this.waveBaseKills = 0
    this.waveBaseCoins = 0
    this.waveBaseLevel = 1
    this.hpBars = []
    this.shownHp = []
    this.deadTexts = []
    this.shownCountdown = []
    this.seenHitCount = 0
    this.damageText = undefined
    this.spawnMarks = new Map()
    this.fogRect = undefined
    this.fogMaskShape = undefined
    this.timeStopFx = undefined
    this.timeStopFxAlpha = 0
    this.waterVignette = undefined
    this.zoneGfx = undefined
    this.zoneVignette = undefined
    this.meteorFx = undefined
    this.stripCams = []
    this.frameTiles = []
    this.frameGlow = undefined
    this.worldVisuals = []
    this.waveTiles = []
    this.drifts = []
    this.wallTiles = new Map()
    this.decorChunks = new Map()
    this.decorRangeKey = ''
  }

  create(): void {
    this.resetSceneFields()
    this.world = makeWorld()
    ;(window as unknown as { __ecsWorld?: EcsWorld }).__ecsWorld = this.world

    const run = getRun()
    this.run = run
    this.testMode = run.testMode
    this.teamFx = aggregateTeamCards(run.teamCards)
    const mapDef = MAPS[run.mapId]
    applyBackground(mapDef.palette)
    // 浮冰图的「地图」即那块方形浮冰(其外皆水),故尺寸取 floeU;
    // 奔流是单屏世界:世界 = 逻辑视口 × viewScale
    const rc = mapDef.river
    const tc = mapDef.torus
    const landscape = viewport.logicalWidth >= viewport.logicalHeight
    this.mapW = tc
      ? (landscape ? tc.arenaLong : tc.arenaShort) * UNIT
      : rc
        ? viewport.logicalWidth * rc.viewScale
        : (mapDef.ice?.floeU ?? mapDef.size?.w ?? MAP.width) * UNIT
    this.mapH = tc
      ? (landscape ? tc.arenaShort : tc.arenaLong) * UNIT
      : rc
        ? viewport.logicalHeight * rc.viewScale
        : (mapDef.ice?.floeU ?? mapDef.size?.h ?? MAP.height) * UNIT
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
    if (tc) {
      this.buildVoidVisuals(mapDef, tc)
    } else if (rc) {
      this.buildRiverVisuals(mapDef, rc)
    } else if (this.infinite) {
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
    cam.setZoom(rc ? viewport.renderScale / rc.viewScale : viewport.renderScale)
    // 工厂：主相机视口 = 屏幕内最大居中的竞技场定比矩形（多余留空白）+ 四缝四角条带分身相机
    if (tc) this.setupTorusCameras(tc)
    // 浮冰/无限无边界:相机只管跟人(滑进水里、走到天边也跟着走);
    // 深空的圆是有界的,bounds 钳在其外接框内;有界图照旧外扩一圈
    if (fieldR > 0) {
      const half = fieldR + margin
      cam.setBounds(-half, -half, half * 2, half * 2)
    } else if (!mapDef.ice && !this.infinite) {
      cam.setBounds(-margin, -margin, this.mapW + margin * 2, this.mapH + margin * 2)
    }

    // 昼夜图夜雾（镜像 BoundedScene.createFog）：反相 Mask filter 在暗幕上挖出视野洞。
    // Phaser 4 的 GeometryMask 在 WebGL 无实现，故与旧路径一样走 filters.internal.addMask(shape, true)
    if (mapDef.dayNight) {
      this.fogRect = this.add.rectangle(0, 0, FOG_SPAN, FOG_SPAN, FOG_COLOR, 0).setDepth(FOG_DEPTH).setVisible(false)
      this.fogMaskShape = this.add.graphics().setVisible(false)
      this.fogRect.enableFilters()
      this.fogRect.filters?.internal.addMask(this.fogMaskShape, true)
    }

    // 时停冷雾遮罩（镜像 ArcadeBattleScene：屏幕固定大矩形，任意地图通用）
    this.timeStopFx = this.add
      .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 6000, 6000, TIMESTOP.chillColor, 0)
      .setScrollFactor(0)
      .setDepth(88)

    // 出生点:无限世界出生在原点(负坐标合法),有界/单屏图在图心
    const center = this.infinite ? { x: 0, y: 0 } : { x: this.mapW / 2, y: this.mapH / 2 }
    this.centerObj = this.add.zone(center.x, center.y, 1, 1)
    // 奔流是固定相机的单屏世界:居中锁死,不跟随
    if (rc || tc) cam.centerOn(this.mapW / 2, this.mapH / 2)
    else cam.startFollow(this.centerObj)

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
    setActiveHudHost(this) // 先登记再拉起 HUD：UIScene 据此找宿主，不必按场景键反查
    this.scene.launch('ui')
    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      this.scene.stop('ui')
      // 探针落幕:__warmoji 在 ECS 战斗期间是陈旧的(本场景不写它),e2e 只能靠这个标记
      // 判断「战斗已收场」——否则会读到上一个菜单场景留下的旧值
      const probe = (window as unknown as { __ecs?: { ready: boolean } }).__ecs
      if (probe) probe.ready = false
      this.atlas?.dispose() // 停掉在途的惰性烘焙:纹理管理器即将归下一局所有
      this.cues?.destroy()
      this.rings?.destroy()
      this.damageText?.destroy()
      for (const c of this.stripCams) this.cameras.remove(c)
      this.stripCams = []
    })

    // 注:ESC = 暂停,绑定在共用的 UIScene 上(与旧竞技场同一处);此处不再另接一份,
    // 否则同一次按键会既暂停又退出。
  }

  private async boot(run: RunState, center: { x: number; y: number }, hint: Phaser.GameObjects.Text): Promise<void> {
    const atlas = await EcsAtlas.build(this, OUTLINED_EMOJIS)
    if (!this.scene.isActive()) return
    this.atlas = atlas
    // 开局清上一局遗留的模块级状态(eid 从 0 重新分配,旧局引用不能留给新实体)
    clearEcsStore()
    for (const b of SPRITE_BANDS) new EcsSpriteBatch(this, this.world, atlas, b.depth, b.zMin, b.zMax)
    this.cues = new CueLayer(this)
    this.rings = new RingLayer(this, this.world)
    this.spawnDecor(run, atlas)
    this.testMode = run.testMode
    const settings = loadSettings(browserStorage())
    this.hitShakeOn = settings.hitShake
    this.damageNumbersOn = settings.damageNumbers
    this.damageText = new DamageTextLayer(this)
    // 粒子爆点(镜像 deathBurst/coinBurst 的配色与速度)
    this.deathBurst = burstEmitter(this, [0x8e24aa, 0xab47bc, 0x6a1b9a, 0xf3e5f5], 230)
    this.coinBurst = burstEmitter(this, [0xffb300, 0xffdc5d, 0xfff8e1], 150, 340)
    this.puffBurst = burstEmitter(this, [0x757575, 0x9e9e9e, 0xe0e0e0], 130, 520)
    this.sim = makeSim(this.world, atlas, run, run.testMode, center, this.mapW, this.mapH)
    initialLayout(this.sim)
    const walls = MAPS[run.mapId].walls
    if (walls) this.createWalls(this.sim, walls)
    this.sim.hooks.onStart(this.sim)
    // 亡语同步重放:killEnemy 内当场跑(同帧先死者的治疗要救得到同伴)
    const simRef = this.sim
    simRef.onDeathFx = (d) => replayDeath(simRef, d)
    armTeam(this.sim, run, run.testMode)
    armCaptain(this.sim, run)
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
    this.waveBaseKills = run.kills
    this.waveBaseCoins = run.coins
    this.waveBaseLevel = run.xp.level
    // 精英波:开场警示横幅后放敌潮(镜像 setup 的 isEliteWave 分支)
    if (!run.testMode && isEliteWave(run.wave)) {
      this.time.delayedCall(600, () => {
        const sim = this.sim
        if (!sim || sim.over) return
        this.events.emit('wave-warning', { title: '精英来袭', sub: '敌人潮涌来，小心金边强敌！' })
        spawnSurgeEcs(sim)
      })
    }
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
        if (!this.sim || this.sim.over) return
        this.events.emit('wave-warning', {
          title: `${bossFor(run.mapId).name}出现`,
          sub:
            MAPS[run.mapId].finalWaveSub ??
            `击败它，或撑过 ${Math.round(waveDurationMs(run.wave) / 1000)} 秒！`,
        })
        spawnBossEcs(this.sim)
      })
    }
    this.ready = true
    hint.destroy()
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
        repeat: p.boss ? 3 : 2,
      })
      this.spawnMarks.set(p, mark)
    }
  }

  /** 排空本帧到手的战场拾取:广播到 HUD 弹「到手」横幅 */
  private drainCollects(): void {
    const sim = this.sim
    if (!sim || sim.pendingCollects.length === 0) return
    for (const def of sim.pendingCollects) {
      this.events.emit('field-collected', {
        emoji: def.emoji,
        name: def.name,
        desc: def.desc,
        polarity: def.polarity,
      })
    }
    sim.pendingCollects.length = 0
  }

  /** 排空本帧粒子爆点:按 kind 分发到死亡/拾币发射器(镜像 deathBurst/coinBurst.explode) */
  private drainBursts(): void {
    const q = this.sim!.pendingBursts
    if (q.length === 0) return
    // 全映射：Burst 新增一种 kind 而不在此登记 = 编译不过（从前的三元链末尾会把
    // 任何没认出来的 kind 都当成死亡紫爆）
    const byKind: Record<Burst['kind'], Phaser.GameObjects.Particles.ParticleEmitter> = {
      death: this.deathBurst,
      coin: this.coinBurst,
      puff: this.puffBurst,
    }
    for (const b of q) byKind[b.kind]!.explode(b.count, b.x, b.y)
    q.length = 0
  }

  /** 排空本帧冲击波圈(自爆群伤示警:红圈从 0.3 张到满,300ms) */
  private drainRings(): void {
    const q = this.sim!.pendingRings
    if (q.length === 0) return
    for (const r of q) {
      this.cues!.ring(r.x, r.y, r.radius, { color: 0xff5252, fillAlpha: 0.35, lineWidth: 3, lineAlpha: 0.9, durMs: 300 })
    }
    q.length = 0
  }

  /** 排空本帧一次性战斗特效:能力系统只入队,绘制在此落地 */
  private drainCues(): void {
    const q = this.sim!.pendingCues
    if (q.length > 0 && this.cues) drawCues(this.cues, q)
  }

  /** 排空本帧敌人受伤飘字(镜像 floatDamage:池化 BitmapText 上浮淡出);关则弃字 */
  private drainDamageNumbers(): void {
    const q = this.sim!.pendingDamageNumbers
    if (q.length === 0) return
    if (this.damageNumbersOn) for (const d of q) this.damageText?.push(d.x, d.y, d.amount, d.crit)
    q.length = 0
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

  /** 顶栏读数(镜像 ArcadeBattleScene.hudSnapshot) */
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
      enemies: query(this.world, [Enemy]).filter((eid) => !Dormant.v[eid]).length,
      projectiles: query(this.world, [Projectile]).length,
      coins: liveCoins(this.world),
      pending: sim?.pendingSpawns.length ?? 0,
      objects: this.children.list.length,
      bodies: 0,
      combatSec: Math.floor(totalSec),
      spawnIntervalMs: Math.round(this.testMode ? densityParams().intervalMs : wave.spawnIntervalMs),
      hpMultiplier: wave.hpMultiplier,
    }
  }

  /** 释放主动技能(镜像 castSkill):纯 CD 门槛,就绪即放、重置跨波 CD;
   * 效果本体是队长持有的标准能力行,逐个单发 */
  castSkill(): boolean {
    const sim = this.sim
    // ending 一并挡住:波末结算横幅期间世界已冻结,此时放技能只会白白重置跨波 CD(镜像旧 over 门槛)
    if (!sim || sim.over || this.ending || this.run.skillCdMs > 0) return false
    const s = CAPTAINS[this.run.captainId].skill
    this.run.skillCdMs = s.cdMs * this.teamFx.skillCdMul
    playSfx('levelup')
    this.events.emit('skill-cast', s.name)
    requestCast(sim, sim.captain)
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

  /** 昼夜世界步进(镜像 BoundedScene.updateWorld 的 dayNight 分支):相机随时刻平滑缩放 +
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

  /** 浮冰世界的视觉步进(镜像 IceScene.updateWater 的渐晕部分):
   * 队伍中心落水即脉冲蓝渐晕。掉血结算在纯逻辑侧(worlds.ts 的 tick) */
  private updateWaterVignette(sim: Sim): void {
    const rect = this.waterVignette
    if (!rect) return
    const px = MAPS[this.run.mapId].ice!.floeU * UNIT
    const inWater = !onFloe(sim.center.x, sim.center.y, px)
    rect.setFillStyle(WATER_VIGNETTE, inWater ? 0.18 + 0.06 * Math.sin(sim.elapsedMs / 140) : 0)
  }

  /** 视口变化（旋转 / 拉窗口）：跟随式相机只需重设缩放；
   * 单屏图（奔流/工厂）的世界尺寸是从视口推出来的，须整体重映射——
   * 「长轴进度 + 跨轴偏移」的通用几何在 war/remap，与旧图共用一份 */
  private onViewportChanged(): void {
    const sim = this.sim
    const mapDef = MAPS[this.run.mapId]
    const rc = mapDef.river
    const tc = mapDef.torus
    const cam = this.cameras.main
    if (!rc && !tc) {
      cam.setZoom(viewport.renderScale)
      return
    }
    const fromW = this.mapW
    const fromH = this.mapH
    const landscape = viewport.logicalWidth >= viewport.logicalHeight
    this.mapW = tc ? (landscape ? tc.arenaLong : tc.arenaShort) * UNIT : viewport.logicalWidth * rc!.viewScale
    this.mapH = tc ? (landscape ? tc.arenaShort : tc.arenaLong) * UNIT : viewport.logicalHeight * rc!.viewScale
    if (tc) {
      for (const c of this.stripCams) this.cameras.remove(c)
      this.stripCams = []
      this.setupTorusCameras(tc)
    } else {
      cam.setZoom(viewport.renderScale / rc!.viewScale)
    }
    cam.centerOn(this.mapW / 2, this.mapH / 2)
    if (sim) {
      sim.mapW = this.mapW
      sim.mapH = this.mapH
      remapSim(sim, fromW, fromH, this.mapW, this.mapH)
      this.centerObj.setPosition(sim.center.x, sim.center.y)
    }
    // 视觉层整体重建（战斗实体不在此列：它们是 ECS 实体，坐标已随 remapSim 挪好）
    for (const o of this.worldVisuals) o.destroy()
    this.worldVisuals = []
    this.waveTiles = []
    this.drifts = []
    this.frameTiles = []
    this.frameGlow = undefined
    if (tc) this.buildVoidVisuals(mapDef, tc)
    else this.buildRiverVisuals(mapDef, rc!)
  }

  /** 环面相机（镜像 VoidScene.setupCameras）：主相机裁出屏内最大居中的竞技场定比矩形，
   * 四缝 + 四角各挂一台条带相机取景对侧溢出——跨缝实体两侧同时可见（渲染层的幽灵分身）。
   * ECS 侧全场实体是同一个批绘对象，条带相机各自按自己的滚动再画一遍，天然成立 */
  private setupTorusCameras(cfg: TorusConfig): void {
    const cw = Math.round(viewport.cssWidth * viewport.dpr)
    const ch = Math.round(viewport.cssHeight * viewport.dpr)
    const rect = fitAspectRect(cw, ch, this.mapW, this.mapH)
    const zoom = rect.w / this.mapW
    const cam = this.cameras.main
    cam.setViewport(Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h))
    cam.setZoom(zoom)
    const s = cfg.strip * UNIT
    const sPx = Math.max(2, Math.round(s * zoom))
    const x0 = Math.round(rect.x)
    const y0 = Math.round(rect.y)
    const w = Math.round(rect.w)
    const h = Math.round(rect.h)
    const W = this.mapW
    const H = this.mapH
    const mk = (vx: number, vy: number, vw: number, vh: number, cx: number, cy: number): void => {
      const c = this.cameras.add(vx, vy, vw, vh)
      c.setZoom(zoom)
      c.centerOn(cx, cy)
      this.stripCams.push(c)
    }
    // 屏幕左缘显示「越过右缝的溢出」（世界 x∈[W, W+s)），其余同理；四角为对角溢出
    mk(x0, y0, sPx, h, W + s / 2, H / 2)
    mk(x0 + w - sPx, y0, sPx, h, -s / 2, H / 2)
    mk(x0, y0, w, sPx, W / 2, H + s / 2)
    mk(x0, y0 + h - sPx, w, sPx, W / 2, -s / 2)
    mk(x0, y0, sPx, sPx, W + s / 2, H + s / 2)
    mk(x0 + w - sPx, y0, sPx, sPx, -s / 2, H + s / 2)
    mk(x0, y0 + h - sPx, sPx, sPx, W + s / 2, -s / 2)
    mk(x0 + w - sPx, y0 + h - sPx, sPx, sPx, -s / 2, -s / 2)
  }

  /** 工厂视觉（镜像 buildVoidVisuals）：钢板地面 + 散落零件 + 传送闸口流光门框。
   * 静态视觉只画一份——条带相机全部忽略，否则门框/地板会在缝上重影 */
  private buildVoidVisuals(mapDef: MapDef, cfg: TorusConfig): void {
    const W = this.mapW
    const H = this.mapH
    const statics = this.worldVisuals

    // 钢板厂房地面（中心朝亮的顶灯软渐变，避免硬边椭圆的「盘子感」）
    const gFloor = this.add.graphics().setDepth(0)
    gFloor.fillStyle(mapDef.palette.map, 1)
    gFloor.fillRect(0, 0, W, H)
    const inner = Phaser.Display.Color.IntegerToColor(mapDef.palette.map).brighten(7).color
    for (const [k, a] of [
      [0.95, 0.1],
      [0.75, 0.1],
      [0.55, 0.12],
    ] as const) {
      gFloor.fillStyle(inner, a)
      gFloor.fillEllipse(W / 2, H / 2, W * k, H * k)
    }
    statics.push(gFloor)

    // 散落零件点缀（种子固定：同局重建不变）
    const def = mapDef.decor
    const rng = new Rng(this.run.decorSeed)
    const cells = (W / UNIT) * (H / UNIT)
    const density = def.density[0] + rng.next() * (def.density[1] - def.density[0])
    for (let i = 0; i < Math.round(cells * density); i++) {
      const emoji = def.emojis[Math.floor(rng.next() * def.emojis.length)]!
      const sizeU = def.sizeU[0] + rng.next() * (def.sizeU[1] - def.sizeU[0])
      statics.push(
        emojiImage(this, rng.next() * W, rng.next() * H, emoji, sizeU * UNIT, 'player')
          .setAlpha(def.alpha[0] + rng.next() * (def.alpha[1] - def.alpha[0]))
          .setRotation((rng.next() * 2 - 1) * Math.PI)
          .setDepth(0.5),
      )
    }

    // 传送门门框：琥珀色警示光带顺时针流动（上→右→下→左）+ 脉动描边
    this.ensureDashTexture(cfg)
    const f = cfg.frame * UNIT
    const mkTile = (x: number, y: number, w: number, h: number, dx: number, dy: number, vertical: boolean): void => {
      const tile = this.add
        .tileSprite(x, y, w, h, vertical ? 'void-dash-v' : 'void-dash-h')
        .setOrigin(0)
        .setDepth(3.5)
        .setAlpha(0.42)
        .setTint(0xffb300)
      this.frameTiles.push({ tile, dx, dy })
      statics.push(tile)
    }
    mkTile(0, 0, W, f, 1, 0, false)
    mkTile(W - f, 0, f, H, 0, 1, true)
    mkTile(0, H - f, W, f, -1, 0, false)
    mkTile(0, 0, f, H, 0, -1, true)

    this.frameGlow = this.add.graphics().setDepth(3.6)
    statics.push(this.frameGlow)
    // 静态视觉只画一份:条带相机全部忽略,否则门框/地板会在缝上重影
    for (const c of this.stripCams) c.ignore(statics)
  }

  /** 门框虚线贴图（横/竖两个变体，一次生成） */
  private ensureDashTexture(cfg: TorusConfig): void {
    const size = 64
    const th = Math.round(cfg.frame * UNIT)
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

  /** 门框逐帧动效（镜像 updatePortals）：光带顺时针流动 + 边线脉动 */
  private updatePortals(sim: Sim, delta: number): void {
    if (this.frameTiles.length === 0) return
    const flow = (56 * delta) / 1000
    for (const t of this.frameTiles) {
      t.tile.tilePositionX += t.dx * flow
      t.tile.tilePositionY += t.dy * flow
    }
    const g = this.frameGlow
    if (!g) return
    const pulse = 0.4 + 0.22 * Math.sin(sim.elapsedMs / 420)
    g.clear()
    g.lineStyle(3, 0xff8f00, pulse)
    g.strokeRect(1.5, 1.5, this.mapW - 3, this.mapH - 3)
    g.lineStyle(1.5, 0xffe082, Math.min(1, pulse + 0.25))
    g.strokeRect(4, 4, this.mapW - 8, this.mapH - 8)
  }

  /** 奔流水面视觉层(镜像 RiverScene.buildRiverVisuals):两岸暗带 + 河水跨向渐变 +
   * 岸线浪花 + 双层滚动水纹 + 岸上静态植被 + 顺流漂浮物。全为纯 Phaser 视觉,不进 ECS 批绘 */
  private buildRiverVisuals(mapDef: MapDef, cfg: RiverConfig): void {
    const vw = this.mapW
    const vh = this.mapH
    const r = riverRect(vw, vh, cfg.width * UNIT)
    const horizontal = r.horizontal

    // 两岸暗带(河道以外的跨轴余量),外缘更暗给一点纵深
    const statics = this.worldVisuals
    const gBank = this.add.graphics().setDepth(0)
    gBank.fillStyle(BANK_COLOR, 1)
    gBank.fillRect(0, 0, vw, vh)
    statics.push(gBank)
    gBank.fillStyle(BANK_FAR_COLOR, 1)
    if (horizontal) {
      if (r.y > 24) gBank.fillRect(0, 0, vw, Math.max(0, r.y - 18))
      gBank.fillRect(0, Math.min(vh, r.y + r.h + 18), vw, vh)
    } else {
      if (r.x > 24) gBank.fillRect(0, 0, Math.max(0, r.x - 18), vh)
      gBank.fillRect(Math.min(vw, r.x + r.w + 18), 0, vw, vh)
    }

    // 河水:跨向「岸暗心亮」的两段渐变
    const gWater = this.add.graphics().setDepth(0.2)
    statics.push(gWater)
    const edge = shade(mapDef.palette.map, 0.78)
    const mid = shade(mapDef.palette.map, 1.12)
    if (horizontal) {
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

    // 岸线浪花:贴岸白线 + 断续泡点(种子固定,同局重建不变)
    const gFoam = this.add.graphics().setDepth(0.4)
    statics.push(gFoam)
    gFoam.lineStyle(2, 0xffffff, 0.3)
    const foamRng = new Rng(this.run.decorSeed ^ 0xf0a8)
    const alongLen = horizontal ? r.w : r.h
    for (const e of horizontal ? [r.y, r.y + r.h] : [r.x, r.x + r.w]) {
      if (horizontal) gFoam.lineBetween(0, e, vw, e)
      else gFoam.lineBetween(e, 0, e, vh)
      let along = foamRng.next() * 40
      while (along < alongLen) {
        const size = 1.5 + foamRng.next() * 2.5
        const off = (foamRng.next() - 0.5) * 6
        gFoam.fillStyle(0xffffff, 0.14 + foamRng.next() * 0.14)
        if (horizontal) gFoam.fillCircle(along, e + off, size)
        else gFoam.fillCircle(e + off, along, size)
        along += 24 + foamRng.next() * 60
      }
    }

    // 双层水纹(视差滚动)
    const texKey = this.ensureWaveTexture(horizontal)
    for (const [alpha, speed] of [
      [0.1, cfg.waveSlow * UNIT],
      [0.16, cfg.waveFast * UNIT],
    ] as const) {
      const tile = this.add
        .tileSprite(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, texKey)
        .setAlpha(alpha)
        .setDepth(0.6)
      tile.tilePositionX = Math.random() * 256
      tile.tilePositionY = Math.random() * 256
      this.waveTiles.push({ tile, speed })
      statics.push(tile)
    }

    // 岸上静态植被:沿长轴等距掷点(种子固定),只落在岸带内
    const def = mapDef.decor
    const decorRng = new Rng(this.run.decorSeed)
    const bands: [number, number][] = horizontal
      ? [
          [0, r.y],
          [r.y + r.h, vh],
        ]
      : [
          [0, r.x],
          [r.x + r.w, vw],
        ]
    for (const [b0, b1] of bands) {
      const bandW = b1 - b0
      if (bandW < 0.3 * UNIT) continue
      for (let along = 0.5 * UNIT; along < alongLen; along += UNIT * (0.9 + decorRng.next() * 0.7)) {
        if (decorRng.next() > 0.7) continue
        const emoji = def.emojis[Math.floor(decorRng.next() * def.emojis.length)]!
        const sizeU = def.sizeU[0] + decorRng.next() * (def.sizeU[1] - def.sizeU[0])
        const size = Math.min(sizeU * UNIT, bandW * 0.9)
        const cross = b0 + size / 2 + decorRng.next() * Math.max(1, bandW - size)
        statics.push(
          emojiImage(this, horizontal ? along : cross, horizontal ? cross : along, emoji, size, 'player')
            .setAlpha(def.alpha[0] + decorRng.next() * (def.alpha[1] - def.alpha[0]))
            .setRotation((decorRng.next() * 2 - 1) * 0.6)
            .setDepth(0.8),
        )
      }
    }

    // 漂浮物(顺流循环):初始均匀铺满,之后 updateRiver 推进
    const pool = mapDef.drift ?? ['1f343']
    const halfCross = (horizontal ? r.h : r.w) / 2
    for (let i = 0; i < cfg.driftCount; i++) {
      const emoji = pool[Math.floor(Math.random() * pool.length)]!
      const d: Drift = {
        image: emojiImage(this, 0, 0, emoji, (0.35 + Math.random() * 0.25) * UNIT, 'player')
          .setAlpha(0.5)
          .setDepth(1.5),
        uPx: Math.random() * alongLen,
        baseCross: (Math.random() * 2 - 1) * halfCross * 0.92,
        speedMul: 1,
        swayPhase: Math.random() * Math.PI * 2,
        swayAmp: (0.06 + Math.random() * 0.12) * UNIT,
        spin: (Math.random() * 2 - 1) * 0.5,
      }
      d.speedMul = this.driftSpeed(d.baseCross / halfCross, cfg)
      statics.push(d.image)
      this.drifts.push(d)
      this.placeDrift(d, r, 0)
    }
  }

  private driftSpeed(crossFrac: number, cfg: RiverConfig): number {
    return (
      driftProfile(crossFrac) *
      (cfg.driftSpeedMul[0] + Math.random() * (cfg.driftSpeedMul[1] - cfg.driftSpeedMul[0]))
    )
  }

  /** 无缝水纹贴图(按朝向各生成一次):沿流向的白色弧形流痕 */
  private ensureWaveTexture(horizontal: boolean): string {
    const key = horizontal ? 'river-wave-h' : 'river-wave-v'
    if (this.textures.exists(key)) return key
    const size = 256
    const canvas = this.textures.createCanvas(key, size, size)
    if (!canvas) return key
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
      if (horizontal) {
        ctx.moveTo(cx - len / 2, cy)
        ctx.quadraticCurveTo(cx, cy - bow, cx + len / 2, cy)
      } else {
        ctx.moveTo(cx, cy - len / 2)
        ctx.quadraticCurveTo(cx + bow, cy, cx, cy + len / 2)
      }
      ctx.stroke()
    }
    canvas.refresh()
    return key
  }

  private placeDrift(d: Drift, r: RiverRect, elapsedMs: number): void {
    const cross =
      (r.horizontal ? r.y + r.h / 2 : r.x + r.w / 2) + d.baseCross + Math.sin(elapsedMs / 1250 + d.swayPhase) * d.swayAmp
    if (r.horizontal) d.image.setPosition(this.mapW - d.uPx, cross)
    else d.image.setPosition(cross, d.uPx)
  }

  /** 水面动效逐帧推进(镜像 updateWater):水纹贴图偏移 + 漂浮物顺流/摇摆/自旋 */
  private updateRiver(sim: Sim, delta: number): void {
    const cfg = MAPS[this.run.mapId].river
    if (!cfg) return
    const dt = delta / 1000
    const r = riverRect(this.mapW, this.mapH, cfg.width * UNIT)
    for (const w of this.waveTiles) {
      if (r.horizontal) w.tile.tilePositionX += w.speed * dt
      else w.tile.tilePositionY -= w.speed * dt
    }
    const alongLen = r.horizontal ? this.mapW : this.mapH
    const margin = UNIT
    const halfCross = (r.horizontal ? r.h : r.w) / 2
    for (const d of this.drifts) {
      d.uPx += cfg.flow * UNIT * d.speedMul * dt
      if (d.uPx > alongLen + margin) {
        // 漂出下游 → 回上游重新进场(换个横位/速度)
        d.uPx = -margin
        d.baseCross = (Math.random() * 2 - 1) * halfCross * 0.92
        d.speedMul = this.driftSpeed(d.baseCross / halfCross, cfg)
      }
      d.image.rotation += d.spin * dt
      this.placeDrift(d, r, sim.elapsedMs)
    }
  }

  /** 断壁世界建场(镜像 BoundedScene.createWalls):按种子铺断壁 → 网格 + 可达刷怪格 → 逐格画石块。
   * 网格/流场是纯逻辑(sim.walls),此处只负责视觉与回填 */
  private createWalls(sim: Sim, cfg: WallsConfig): void {
    const cols = Math.round(this.mapW / UNIT)
    const rows = Math.round(this.mapH / UNIT)
    const rng = new Rng(this.run.decorSeed ^ 0x5eed)
    const blocked = generateRuins(() => rng.next(), cols, rows, {
      blocks: cfg.blocks,
      maxLen: cfg.maxLen,
      centerClearU: cfg.centerClearU,
    })
    const grid = new WallGrid(cols, rows, UNIT, blocked)
    // 只在「从中心可达」的通行格刷怪,保证敌人总能寻路到队伍
    const cells = [...reachableCells(grid, Math.floor(cols / 2), Math.floor(rows / 2))]
    sim.walls = { grid, flowCellX: -1, flowCellY: -1, reflowAcc: 0, spawnCells: cells, smashed: [] }
    // 逐格填充石块 + 顶沿提亮假高度(逐格存引用供碾墙单格销毁)
    const palette = MAPS[this.run.mapId].palette
    const base = Phaser.Display.Color.IntegerToColor(palette.map).darken(38).color
    const top = Phaser.Display.Color.IntegerToColor(palette.map).darken(18).color
    const capH = Math.max(3, UNIT * 0.22)
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (!blocked[cy * cols + cx]) continue
        const px = cx * UNIT + UNIT / 2
        const py = cy * UNIT + UNIT / 2
        this.wallTiles.set(cy * cols + cx, [
          this.add.rectangle(px, py, UNIT - 2, UNIT - 2, base).setDepth(2),
          this.add.rectangle(px, cy * UNIT + 1 + capH / 2, UNIT - 2, capH, top).setDepth(2.1),
        ])
      }
    }
  }

  /** 排空本帧被碾碎的断壁(镜像 smashWallAt 的视觉部分):拆石块 + 扬尘 */
  private drainSmashedWalls(sim: Sim): void {
    const w = sim.walls
    if (!w || w.smashed.length === 0) return
    for (const idx of w.smashed) {
      const objs = this.wallTiles.get(idx)
      if (!objs) continue
      for (const o of objs) o.destroy()
      this.wallTiles.delete(idx)
      const x = ((idx % w.grid.cols) + 0.5) * UNIT
      const y = (Math.floor(idx / w.grid.cols) + 0.5) * UNIT
      const c = this.add.circle(x, y, UNIT * 0.4, 0xbcae95, 0.6).setDepth(5)
      this.tweens.add({ targets: c, scale: 1.8, alpha: 0, duration: 320, onComplete: () => c.destroy() })
    }
    w.smashed.length = 0
  }

  /** 无限世界装饰分块滚动(镜像 InfiniteScene.ensureChunks):视野覆盖的块集合变化时
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
          spawnDecor(this.world, atlas, {
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

  /** 终波缩圈的视觉(镜像 InfiniteScene.updateZone;圈半径与掉血在 worlds.ts 纯逻辑侧):
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
  private updateMeteorFx(sim: Sim, delta: number): void {
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
    cur.sphere.rotation += (delta / 1000) * 1.4 // 增量累加:入场朝向恒为 0,且不吃世界时标
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
    playSfx('wave')
    // 先冻结战场弹结算横幅(UIScene 渲染),停留片刻再走过场
    this.events.emit('wave-complete', {
      wave: run.wave - 1,
      kills: run.kills - this.waveBaseKills,
      coins: run.coins - this.waveBaseCoins,
      levels: run.xp.level - this.waveBaseLevel,
    })
    this.time.delayedCall(WAVE.summaryMs, () => {
      if (finished) this.scene.start('result', { win: true })
      else if (run.cardDraws > 0) this.scene.start('cards')
      else this.scene.start(promoteStep(run) ? 'promote' : 'shop')
    })
  }

  /** 地图装饰:按 run 种子随机散布的低透明度 emoji(镜像 BoundedScene.drawDecor),作 ECS 静态实体。
   * 无限世界改走分块滚动(见 ensureChunks):世界没有边,不能一次铺完 */
  private spawnDecor(run: RunState, atlas: EcsAtlas): void {
    if (this.infinite) return this.ensureChunks(atlas)
    // 奔流的岸上植被 / 工厂的散落零件随各自视觉层一并铺,不走全图散布
    if (MAPS[run.mapId].river || MAPS[run.mapId].torus) return
    const rng = new Rng(run.decorSeed)
    const cols = Math.round(this.mapW / UNIT)
    const rows = Math.round(this.mapH / UNIT)
    for (const d of rollDecor(MAPS[run.mapId].decor, () => rng.next(), cols, rows)) {
      spawnDecor(this.world, atlas, {
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
    if (!this.ready || !sim) return
    // 本帧两个时长写死在帧起点:此后所有 system 都是 (sim) => void,自己从 sim 读。
    // 世界时长在时停窗口内随队伍移动量放缩(动则时行、静则近乎凝固),窗口外恒等于真实帧长
    sim.dtMs = delta
    sim.wdtMs = delta * worldTimeScale(sim)
    // 过场冻结期(波末横幅/失败结算):世界与战斗全停,但碎片飞散与金币弹入照旧收尾——
    // 旧实现只 physics.pause(),这两样是 tween 驱动的,不受冻结影响
    if (this.ending) {
      stepFrozenVisuals(sim)
      this.cues?.step(sim.fxMs)
      this.rings?.step(sim.fxMs)
      this.damageText?.step(sim.fxMs)
      return
    }
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
    // 键盘优先,否则取 HUD 摇杆向量(镜像 ArcadeBattleScene 的输入合流);
    // moveInputRaw 键盘满推=1、摇杆取模长,供时停世界时标读
    // 队长技能冷却按真实时钟推进(时停不额外拖长 CD,玩家可预期)
    this.run.skillCdMs = tickSkillCd(this.run.skillCdMs, delta)

    const keyed = kx !== 0 || ky !== 0
    const stick = hudMoveVector()
    sim.teamDir = keyed ? norm(kx, ky) : stick
    sim.moveInputRaw = keyed ? 1 : Math.min(1, Math.hypot(stick.x, stick.y))

    // 相机视口回填(纯逻辑侧的子弹回收按视野判定,镜像 cullProjectiles)
    const wv = this.cameras.main.worldView
    sim.view.x = wv.x
    sim.view.y = wv.y
    sim.view.right = wv.right
    sim.view.bottom = wv.bottom
    // 索敌快照先行重建:stepSim 内的抛射物 onHit 效果链要用本帧位置
    refreshEnemyTargets(sim)
    stepSim(sim)
    // 队员快照重建:敌方能力索敌读它,须先于任何敌方出手
    refreshMemberTargets(sim)
    // 新登场的持械敌人装配 + 魔尘复形
    armEnemies(sim)
    // 能力系统(敌我共用一套:闸门 → 冷却 → 逐 kind 施放;世界时长,时停期队伍的枪也一并凝住)
    stepAbilities(sim)
    // 部件动画:把时钟翻算成帧下标(帧惰性烘焙,未就绪保持静态帧)
    updateAnims(sim)
    // 亡语重放(分裂/诱饵/治疗/冷枪:本帧内所有死亡的敌人在死亡点触发)
    runDeathEffects(sim)
    // 区域(地面毒圈/灼烧区 + 寒气光环):跟位/开关/到期,再 team 脉冲烧敌 / enemy 节流烧队员
    updateZones(sim)
    // 拾取物(金币 / 战场增减益同一条):磁吸 → 到手 → 到期淡出
    updatePickups(sim)
    this.drainCollects()
    // 虫巢周期生成子敌(护巢子敌绕巢;拆巢暴走)
    updateSpawners(sim)
    // 刷怪节奏
    spawnStep(sim)
    this.updateTelegraphs()
    // 排空本帧视觉事件:须先于下面的过场判定——否则致死那一帧的死亡爆点/飘字会被 return 吞掉
    // 两个特效层先步进再排空：step 顺带把「本帧视觉钟」写进去，投放据此定起点。
    // 反过来的话本帧新投的会拿到上一帧的时钟——开局第一帧甚至会被当场判过期丢掉
    this.cues?.step(sim.fxMs)
    this.rings?.step(sim.fxMs)
    this.damageText?.step(sim.fxMs)
    this.drainDamageNumbers()
    this.drainBursts()
    this.drainRings()
    this.drainCues()
    // 受击震屏:本帧有队员挨打则轻抖画面(镜像 hurtMember 的 cameras.shake)。
    // 同样须先于过场判定——致死那一帧的抖屏否则被 return 吞掉且永远补不回来
    if (sim.memberHitCount > this.seenHitCount) {
      this.seenHitCount = sim.memberHitCount
      if (this.hitShakeOn) this.cameras.main.shake(HIT_SHAKE.durationMs, HIT_SHAKE.intensity)
    }
    this.updateHpBars()
    // 终波 Boss 被击败 → 通关结算(镜像 onBossDown → endWave)
    if (!this.testMode && sim.bossDown) {
      // 稍候片刻让碎块飞散可见,再走通关结算(镜像 onBossDown 的 700ms)。
      // 这 700ms 世界照常运转(不置 ending),否则碎块凝住、爆点也放不出来
      sim.bossDown = false
      this.time.delayedCall(700, () => {
        if (this.sim && !this.ending) this.scheduleWaveEnd(settleWave(this.sim))
      })
    }
    // 全队阵亡 → 失败结算(试炼场同样结算:镜像旧 gameOver 无 testMode 门槛)
    if (sim.over) {
      this.ending = true
      this.run.combatMs += sim.elapsedMs // 败局也计入本波已打的时长(镜像 gameOver)
      playSfx('over')
      this.time.delayedCall(900, () => this.scene.start('result', { win: false }))
      return
    }
    this.centerObj.setPosition(sim.center.x, sim.center.y)
    this.updateDayNight(sim)
    this.updateWaterVignette(sim)
    this.updateZone(sim)
    this.updateMeteorFx(sim, delta)
    this.drainSmashedWalls(sim)
    this.updateRiver(sim, delta)
    this.updatePortals(sim, delta)
    // 无限世界:相机走到哪,装饰分块跟到哪(块集合不变则整段免算)
    if (this.infinite && this.atlas) this.ensureChunks(this.atlas)
    // 冷雾浓度跟随时停态（越静越浓），淡入淡出走实时 delta
    const chillTarget = sim.timeStopMsLeft > 0 ? (1 - sim.chrono) * TIMESTOP.chillMaxAlpha : 0
    this.timeStopFxAlpha += (chillTarget - this.timeStopFxAlpha) * Math.min(1, delta / TIMESTOP.fadeMs)
    this.timeStopFx?.setFillStyle(TIMESTOP.chillColor, this.timeStopFxAlpha)
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
      moveSpeed: MoveSpeed.v[sim.captain]!,
      elapsed: sim.elapsedMs,
      memberPos: sim.members.map((eid) => ({ x: Transform.x[eid]!, y: Transform.y[eid]! })),
      frames: sim.members.map((eid) => Sprite.frame[eid]!),
      enemies: query(this.world, [Enemy]).length,
      // 护巢子敌数(Nest.of>=0):虫巢生成的子敌带巢引用,自然刷怪的敌人恒 -1,借此隔离测量
      broods: Array.from(query(this.world, [Enemy]), (eid) => Nest.of[eid]!).filter((n) => n >= 0).length,
      enemyPos: Array.from(query(this.world, [Enemy]), (eid) => ({ x: Transform.x[eid]!, y: Transform.y[eid]! })),
      kills: sim.run.kills,
      stats: { damage: [...sim.run.stats.damage], kills: [...sim.run.stats.kills], damageTaken: [...sim.run.stats.damageTaken] },
      wave: sim.run.wave,
      coins: sim.run.coins,
      xpLevel: sim.run.xp.level,
      liveCoins: liveCoins(this.world),
      projectiles: query(this.world, [Projectile]).length,
      eprojectiles: query(this.world, [EnemyProj]).length,
      field: {
        pickups: pickupCounts(sim).pickups,
        carriers: pickupCounts(sim).carriers,
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
      // 在场区域数(地面毒圈 + 寒气光环):到期不回收 / 跟随型不随武器退场都会在这里堆积
      zones: query(this.world, [Zone]).length,
      // 在场的能力子实体数(弩塔 + 小蜂):验证同时在场上限与逐个退场
      minions: query(this.world, [Minion]).length,
      logicalW: viewport.logicalWidth,
      logicalH: viewport.logicalHeight,
      // 残垣:阻挡格数 + 可达刷怪格数(验证断壁成型与连通)
      walls: sim.walls ? sim.walls.grid.blocked.filter(Boolean).length : 0,
      spawnCells: sim.walls?.spawnCells.length ?? 0,
      // 深空:天体横扫态(null=不在途)
      meteor: sim.meteor ? { travelling: sim.meteor.travelling, t: sim.meteor.t } : null,
    }
  }
}
