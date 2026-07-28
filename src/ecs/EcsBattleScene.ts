import Phaser from 'phaser'
import { textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { UNIT } from '../util/units'
import { MEMBER } from '../data/characters'
import { HIT_SHAKE } from '../data/feel'
import { TIMESTOP } from '../data/timeStop'
import { burstEmitter } from '../util/fx'
import { CueLayer } from './render/cues'
import { RingLayer } from './render/rings'
import { DamageTextLayer } from './render/damageText'
import { loadSettings } from '../save/settings'
import { browserStorage } from '../util/storage'
import { UI_FONT, FONT } from '../util/fonts'
import { norm } from '../util/vec'
import { applyBackground } from '../util/background'
import { playSfx } from '../audio/sfx'
import { OUTLINED_EMOJIS, PLAIN_EMOJIS } from '../manifest'
import { getRun, promoteStep } from '../run/state'
import type { RunState } from '../run/state'
import { bossFor, MAPS } from '../data/maps'
import { onFloe } from '../war/maps/ice'
import { ECS_SCENE_KEY } from './keys'
import { makeWorld } from './world'
import type { EcsWorld } from './world'
import { hasComponent, query } from 'bitecs'
import { Alive, Boss, Dormant, Enemy, FACTION, Faction, GrantCoins, Hp, CharHp, MoveSpeed, Nest, PICKUP_SET, Projectile, RENDERABLE, Revive, Sprite, Transform, Zone } from './components'
import { EcsAtlas } from './atlas'
import { EcsSpriteBatch, SPRITE_BANDS } from './render/spriteBatch'
import { remapSim } from './systems/shared/remap'
import { viewFor } from './views'
import type { MapView, ViewCtx } from './views'
import { makeSim } from './sim'
import { clearEcsStore, modDef } from './store'
import { armCaptain, armTeam } from './entities/loadout'
import { requestCast } from './systems/shared/ability'
import { Minion } from './components'
import { stepFrame } from './systems/pipeline/frame'
import { replayDeath } from './systems/shared/death'
import { pickupCounts } from './entities/pickup'
import { spawnBossEcs, spawnSurgeEcs } from './entities/enemy'
import { scheduleCarrier } from './entities/schedule'
import { telegraphCount } from './entities/telegraph'
import { activeMods } from './entities/modifier'
import { Due, Lifetime, Meteor, Modifier } from './components'

import { initialLayout, stepFrozenVisuals, worldTimeScale } from './sim'
import { settleWave } from './systems/shared/wave'
import { isBossWave, isEliteWave, waveAt, waveDurationMs, WAVE } from '../data/waves'
import { xpToNext } from '../war/xp'
import { CAPTAINS } from '../data/captains'
import { aggregateTeamCards } from '../data/cards'
import type { TeamEffects } from '../types/items'
import { INVINCIBLE_HP, spawnParams, sandboxInvincible } from '../run/sandbox'
import { tickSkillCd } from '../war/skill'
import { hudMoveVector, setActiveHudHost } from '../run/hudHost'
import type { HudHost } from '../run/hudHost'
import type { HudSnapshot } from '../run/hudHost'
import type { Sim } from './sim'
import { drain } from './outbox'
import type { Burst } from './outbox'
import { rollWaveCarriers } from '../war/battleFx'
import { centerX, centerY } from './utils/team'

// ECS 实验战斗场景(宿主壳):Phaser 只做画布/相机/输入/音频宿主;战斗世界(实体+系统+
// 自绘渲染)全在 ECS。P2:有界森林图 + 队伍编队/orbit/游移/跟随弹簧 + 键盘/相机跟随。

// 夜雾:整块暗幕的颜色/深度/尺寸(与 BoundedScene 同值)
// 浮冰图:深水底色 + 落水蓝渐晕(与 IceScene 同值)
function held(key?: Phaser.Input.Keyboard.Key): boolean {
  return key?.isDown ?? false
}

/** 在场金币数(探针):挂了 GrantCoins 的那些拾取物 */
function liveCoins(world: EcsWorld): number {
  let n = 0
  for (const eid of query(world, PICKUP_SET as unknown as object[])) {
    if (hasComponent(world, eid, GrantCoins)) n++
  }
  return n
}

export class EcsBattleScene extends Phaser.Scene implements HudHost {
  private world!: EcsWorld
  /** 本图的视觉：每张图一份实现（views.ts）。**scene 只握接口，不认识任何一张具体的图** */
  private map!: MapView
  private ctx!: ViewCtx
  private atlas?: EcsAtlas
  /** 一次性特效层（池化自绘，不挂 tween；见 render/cues.ts） */
  private cues?: CueLayer
  /** 实体光圈层（待拾脉冲 / 携带者光环；见 render/rings.ts） */
  private rings?: RingLayer
  private sim?: Sim
  private ready = false
  /** HUD 宿主契约：UIScene 据此显示实验室控件、正计时 */
  sandbox = false
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
  /** 粒子爆点发射器(死亡紫爆 / 拾币金爆 / 灰烟) */
  private deathBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private coinBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private puffBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  /** 昼夜图夜雾：整块暗色矩形 + 反相圆遮罩在其上「挖洞」露出队伍周围 */
  /** 时停冷雾遮罩：屏幕固定的大矩形，alpha 由时停态逐帧驱动（越静越浓） */
  private timeStopFx?: Phaser.GameObjects.Rectangle
  private timeStopFxAlpha = 0
  /** 浮冰图落水蓝渐晕：屏幕固定，队伍在水里时脉冲提示 */
  private waterVignette?: Phaser.GameObjects.Rectangle
  /** 无限图终波缩圈：圈线 + 圈外红渐晕（圈本体状态在 sim.worldState.zone，纯逻辑侧算） */
  /** 深空图天体横扫的预警车道：跟着横扫实体的 eid 走（球体是那颗实体自己的贴图） */
  /** 工厂图（环面）：跨缝分身的条带相机 + 传送门光带/脉动边线 */
  /** 单屏图（奔流/工厂）的静态视觉层：视口变化时整体重建 */
  /** 同上，但是 ECS 装饰实体（岸上植被 / 散落零件 / 水面漂浮物）：
   * 它们的落点由地图尺寸推出，视口一变就得按新尺寸重铺，故与 worldVisuals 同生共死 */
  /** 奔流图水面动效：双层水纹贴图（漂浮物已是装饰实体，不在此列） */
  /** 残垣图断壁：格索引 → 该格的石块/顶沿视觉（碾墙时单格销毁） */
  /** 无限图装饰分块：块键 → 该块的装饰实体 eid；视野块集合变化才增删 */
  private centerObj!: Phaser.GameObjects.Zone
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
  private mapW = 0
  private mapH = 0

  constructor() {
    super(ECS_SCENE_KEY)
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
    this.timeStopFx = undefined
    this.timeStopFxAlpha = 0
  }

  create(): void {
    this.resetSceneFields()
    this.world = makeWorld()
    ;(window as unknown as { __ecsWorld?: EcsWorld }).__ecsWorld = this.world

    const run = getRun()
    this.run = run
    this.sandbox = run.sandbox
    this.teamFx = aggregateTeamCards(run.teamCards)
    const mapDef = MAPS[run.mapId]
    applyBackground(mapDef.palette)
    // 本图的视觉全交给它自己那份 MapView（views.ts）——**scene 不认识任何一张具体的图**
    this.map = viewFor(run.mapId)
    this.ctx = { scene: this, world: this.world, run, def: mapDef, anchor: undefined as never, w: 0, h: 0 }
    const { w, h, origin } = this.map.layout(this.ctx)
    this.ctx.w = this.mapW = w
    this.ctx.h = this.mapH = h
    this.map.build(this.ctx)

    // 队伍锚点（相机跟随目标）：出生点由本图的 layout 给
    const center = origin
    this.centerObj = this.add.zone(center.x, center.y, 1, 1)
    ;(this.ctx as { anchor: Phaser.GameObjects.Zone }).anchor = this.centerObj
    this.map.camera(this.ctx)

    // 时停冷雾遮罩：屏幕固定的大矩形，**任意地图通用**，故不属于任何一份 MapView
    this.timeStopFx = this.add
      .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 6000, 6000, TIMESTOP.chillColor, 0)
      .setScrollFactor(0)
      .setDepth(88)

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
      this.map.destroy(this.ctx)
    })

    // 注:ESC = 暂停,绑定在共用的 UIScene 上(与旧竞技场同一处);此处不再另接一份,
    // 否则同一次按键会既暂停又退出。
  }

  private async boot(run: RunState, center: { x: number; y: number }, hint: Phaser.GameObjects.Text): Promise<void> {
    const atlas = await EcsAtlas.build(this, OUTLINED_EMOJIS, PLAIN_EMOJIS)
    if (!this.scene.isActive()) return
    this.atlas = atlas
    // 开局清上一局遗留的模块级状态(eid 从 0 重新分配,旧局引用不能留给新实体)
    clearEcsStore()
    for (const b of SPRITE_BANDS) new EcsSpriteBatch(this, this.world, atlas, b.depth, b.zMin, b.zMax)
    this.cues = new CueLayer(this, this.world)
    this.rings = new RingLayer(this, this.world)
    this.ctx.atlas = atlas
    this.map.decor(this.ctx, atlas)
    this.sandbox = run.sandbox
    const settings = loadSettings(browserStorage())
    this.hitShakeOn = settings.hitShake
    this.damageNumbersOn = settings.damageNumbers
    this.damageText = new DamageTextLayer(this, this.world, this.damageNumbersOn)
    // 粒子爆点(镜像 deathBurst/coinBurst 的配色与速度)
    this.deathBurst = burstEmitter(this, [0x8e24aa, 0xab47bc, 0x6a1b9a, 0xf3e5f5], 230)
    this.coinBurst = burstEmitter(this, [0xffb300, 0xffdc5d, 0xfff8e1], 150, 340)
    this.puffBurst = burstEmitter(this, [0x757575, 0x9e9e9e, 0xe0e0e0], 130, 520)
    this.sim = makeSim(this.world, atlas, run, run.sandbox, center, this.mapW, this.mapH)
    initialLayout(this.sim)
    this.map.onSimReady(this.ctx, this.sim)
    this.sim.hooks.onStart(this.sim)
    // 亡语同步重放:killEnemy 内当场跑(同帧先死者的治疗要救得到同伴)
    const simRef = this.sim
    simRef.onDeathFx = (d) => replayDeath(simRef, d)
    armTeam(this.sim, run, run.sandbox)
    armCaptain(this.sim, run)
    for (let i = 0; i < this.sim.characters.length; i++) {
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
    if (!run.sandbox) this.scheduleCarriers()
    this.waveBaseKills = run.kills
    this.waveBaseCoins = run.coins
    this.waveBaseLevel = run.xp.level
    // 精英波:开场警示横幅后放敌潮(镜像 setup 的 isEliteWave 分支)
    if (!run.sandbox && isEliteWave(run.wave)) {
      this.time.delayedCall(600, () => {
        const sim = this.sim
        if (!sim || sim.over) return
        this.events.emit('wave-warning', { title: '精英来袭', sub: '敌人潮涌来，小心金边强敌！' })
        spawnSurgeEcs(sim)
      })
    }
    // 正常模式 Boss 波开场:先开世界终波机关(无限图缩圈以此刻队伍位置张开),再预告投放本图 Boss
    if (!run.sandbox && isBossWave(run.wave)) {
      // 缩圈的视觉由无限图那份 MapView 自己按 worldState.zone 惰性建（见 views.ts）
      this.sim.hooks.onFinalWave(this.sim)
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


  /** 探针：显示列表里**没在参与深度排序**的对象数（见 render/layer.ts）。
   * 恒 0 是「深度带真的生效」唯一的外部可观测量——一旦不是 0，那些对象的叠放次序
   * 就退化成进列表的先后，谁后建谁在上 */
  private unsortedLayers(): number {
    let n = 0
    for (const o of this.children.list) {
      if (typeof (o as unknown as { _depth?: unknown })._depth !== 'number') n++
    }
    return n
  }

  /** 排空本帧的出站信箱。每种事件一条 drain——收信人没准备好(特效层未建/飘字关掉)
   * 也照样清空,信箱只进不出就是一路涨到卡顿 */
  private drainOutbox(): void {
    const out = this.sim!.out
    // 到手的战场拾取:广播到 HUD 弹「到手」横幅
    drain(out.collects, (defs) => {
      for (const d of defs) {
        this.events.emit('field-collected', { emoji: d.emoji, name: d.name, desc: d.desc, polarity: d.polarity })
      }
    })
    // 粒子爆点:按 kind 分发到死亡/拾币发射器(镜像 deathBurst/coinBurst.explode)。
    // 全映射：Burst 新增一种 kind 而不在此登记 = 编译不过（从前的三元链末尾会把
    // 任何没认出来的 kind 都当成死亡紫爆）
    drain(out.bursts, (bs) => {
      const byKind: Record<Burst['kind'], Phaser.GameObjects.Particles.ParticleEmitter> = {
        death: this.deathBurst,
        coin: this.coinBurst,
        puff: this.puffBurst,
      }
      for (const b of bs) byKind[b.kind]!.explode(b.count, b.x, b.y)
    })
    // 全屏白闪:唯一没能变成实体的特效(屏幕固定,不在世界坐标里)
    if (out.flash) {
      this.cues?.screenFlash(out.flash.color, out.flash.alpha, out.flash.durationMs)
      out.flash = null
    }
  }

  /** 逐帧队员血条:跟位 + 比例变化才重绘(镜像 drawMemberHp);阵亡隐藏、复活自动恢复 */
  private updateHpBars(): void {
    const sim = this.sim!
    for (let i = 0; i < sim.characters.length; i++) {
      const m = sim.characters[i]!
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
      const ratio = Math.max(0, CharHp.hp[m]! / CharHp.max[m]!)
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
      battleFx: (sim ? activeMods(sim) : []).map((e) => ({
        emoji: modDef[e]!.emoji,
        polarity: modDef[e]!.polarity,
        remainMs: Math.max(0, Lifetime.until[e]! - elapsed),
        totalMs: Modifier.totalMs[e]!,
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
      pending: sim ? telegraphCount(sim) : 0,
      objects: this.children.list.length,
      bodies: 0,
      combatSec: Math.floor(totalSec),
      spawnIntervalMs: Math.round(this.sandbox ? spawnParams().intervalMs : wave.spawnIntervalMs),
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

  /** 试炼场免死开关变更后重算队员血量上限(镜像 applySandboxInvincible) */
  applySandboxInvincible(): void {
    const sim = this.sim
    if (!sim) return
    const mh = sandboxInvincible() ? INVINCIBLE_HP : MEMBER.maxHp
    for (const m of sim.characters) {
      CharHp.max[m] = mh
      CharHp.hp[m] = sandboxInvincible() ? mh : Math.min(CharHp.hp[m]!, mh)
    }
  }



  /** 视口变化（旋转 / 拉窗口）：世界尺寸由本图的 layout 说了算；变了才整体重映射
   * ——「长轴进度 + 跨轴偏移」的通用几何在 war/remap，与旧图共用一份 */
  private onViewportChanged(): void {
    const sim = this.sim
    const fromW = this.mapW
    const fromH = this.mapH
    const { w, h } = this.map.layout(this.ctx)
    this.ctx.w = this.mapW = w
    this.ctx.h = this.mapH = h
    // 视觉层（含本图的装饰实体）整体归本图自己重建，场景只管世界尺寸这件事
    this.map.resize(this.ctx)
    if (w === fromW && h === fromH) return
    if (sim) {
      sim.mapW = w
      sim.mapH = h
      remapSim(sim, fromW, fromH, w, h)
      this.centerObj.setPosition(centerX(sim), centerY(sim))
    }
  }















  /** 本波携带者排期(镜像 scheduleCarriers):按预算铺开,均匀撒在本波中前段(留出波末空档)。
   * 第 1 波是纯净开场,不出战场拾取 */
  private scheduleCarriers(): void {
    const sim = this.sim
    if (!sim || this.run.wave < 2) return
    const carriers = rollWaveCarriers(this.run.mapId, this.run.wave, isBossWave(this.run.wave), () => sim.rng.next())
    if (carriers.length === 0) return
    const dur = waveDurationMs(this.run.wave)
    // 排期是实体（Due + Carrier），走世界钟——从前是 Phaser delayedCall，走墙钟，
    // 于是时停期间携带者照常到点，而同一波的普通刷怪跟着 wdtMs 慢下来
    carriers.forEach((pickup, i) => {
      scheduleCarrier(sim, dur * 0.12 + (dur * 0.7 * i) / carriers.length, pickup)
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
    // 波次时间到 → 结算 + 过场(试炼场无尽,便于性能观测)。用上一帧 elapsedMs 判定(晚 1 帧无碍)
    if (!this.sandbox && sim.elapsedMs >= waveDurationMs(sim.run.wave)) {
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
    // 一帧的仿真侧：次序与依赖声明在 systems/pipeline/frame.ts，由 order.test.ts 校验
    stepFrame(sim)
    // 排空本帧视觉事件:须先于下面的过场判定——否则致死那一帧的死亡爆点/飘字会被 return 吞掉
    // 两个特效层先步进再排空：step 顺带把「本帧视觉钟」写进去，投放据此定起点。
    // 反过来的话本帧新投的会拿到上一帧的时钟——开局第一帧甚至会被当场判过期丢掉
    this.cues?.step(sim.fxMs)
    this.rings?.step(sim.fxMs)
    this.damageText?.step(sim.fxMs)
    this.drainOutbox()
    // 受击震屏:本帧有队员挨打则轻抖画面(镜像 hurtCharacter 的 cameras.shake)。
    // 同样须先于过场判定——致死那一帧的抖屏否则被 return 吞掉且永远补不回来
    if (sim.characterHitCount > this.seenHitCount) {
      this.seenHitCount = sim.characterHitCount
      if (this.hitShakeOn) this.cameras.main.shake(HIT_SHAKE.durationMs, HIT_SHAKE.intensity)
    }
    this.updateHpBars()
    // 终波 Boss 被击败 → 通关结算(镜像 onBossDown → endWave)
    if (!this.sandbox && sim.bossDown) {
      // 稍候片刻让碎块飞散可见,再走通关结算(镜像 onBossDown 的 700ms)。
      // 这 700ms 世界照常运转(不置 ending),否则碎块凝住、爆点也放不出来
      sim.bossDown = false
      this.time.delayedCall(700, () => {
        if (this.sim && !this.ending) this.scheduleWaveEnd(settleWave(this.sim))
      })
    }
    // 全队阵亡 → 失败结算(试炼场同样结算:镜像旧 gameOver 无 sandbox 门槛)
    if (sim.over) {
      this.ending = true
      this.run.combatMs += sim.elapsedMs // 败局也计入本波已打的时长(镜像 gameOver)
      playSfx('over')
      this.time.delayedCall(900, () => this.scene.start('result', { win: false }))
      return
    }
    this.centerObj.setPosition(centerX(sim), centerY(sim))
    this.map.step(this.ctx, sim, delta)
    // 冷雾浓度跟随时停态（越静越浓），淡入淡出走实时 delta
    const chillTarget = sim.timeStopMsLeft > 0 ? (1 - sim.chrono) * TIMESTOP.chillMaxAlpha : 0
    this.timeStopFxAlpha += (chillTarget - this.timeStopFxAlpha) * Math.min(1, delta / TIMESTOP.fadeMs)
    this.timeStopFx?.setFillStyle(TIMESTOP.chillColor, this.timeStopFxAlpha)
    ;(window as unknown as { __ecs?: object }).__ecs = {
      ready: true,
      unsortedLayers: this.unsortedLayers(),
      blindSprites: query(this.world, RENDERABLE as unknown as object[]).filter((e) => Sprite.frame[e]! < 0).length,
      pages: this.atlas?.pageCount ?? 0,
      centerX: centerX(sim),
      centerY: centerY(sim),
      characters: sim.characters.length,
      mapW: this.mapW,
      mapH: this.mapH,
      dirX: sim.teamDir.x,
      dirY: sim.teamDir.y,
      moveSpeed: MoveSpeed.v[sim.captain]!,
      elapsed: sim.elapsedMs,
      memberPos: sim.characters.map((eid) => ({ x: Transform.x[eid]!, y: Transform.y[eid]! })),
      frames: sim.characters.map((eid) => Sprite.frame[eid]!),
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
      eprojectiles: query(this.world, [Projectile, Faction]).filter((e) => Faction.v[e] === FACTION.enemy).length,
      field: {
        pickups: pickupCounts(sim).pickups,
        carriers: pickupCounts(sim).carriers,
        active: activeMods(sim).map((e) => ({ id: modDef[e]!.id, remainMs: Math.max(0, Lifetime.until[e]! - sim.elapsedMs) })),
      },
      over: sim.over,
      alive: sim.characters.filter((eid) => Alive.v[eid]).length,
      memberHp: sim.characters.map((eid) => CharHp.hp[eid]!),
      // 浮冰:队伍中心是否落水(非浮冰图恒 false)
      inWater: this.waterVignette !== undefined && !onFloe(centerX(sim), centerY(sim), this.mapW),
      // 无限世界:休眠敌人数 + 相机位置(验证无边界跟随)+ 终波缩圈半径
      dormant: Array.from(query(this.world, [Enemy]), (eid) => Dormant.v[eid]!).filter((v) => v === 1).length,
      camX: this.cameras.main.scrollX + this.cameras.main.width / 2,
      camY: this.cameras.main.scrollY + this.cameras.main.height / 2,
      zoneR: sim.worldState.zone?.r ?? 0,
      // 在场区域数(地面毒圈 + 寒气光环):到期不回收 / 跟随型不随武器退场都会在这里堆积
      zones: query(this.world, [Zone]).length,
      // 在场的能力子实体数(弩塔 + 小蜂):验证同时在场上限与逐个退场
      minions: query(this.world, [Minion]).length,
      // 出站信箱积压:帧末排空后应恒 0,不为 0 即某条 drain 没清(只进不出会一路涨)
      outbox: sim.out.bursts.length + sim.out.collects.length + (sim.out.flash ? 1 : 0),
      logicalW: viewport.logicalWidth,
      logicalH: viewport.logicalHeight,
      // 残垣:阻挡格数 + 可达刷怪格数(验证断壁成型与连通)
      walls: sim.worldState.walls ? sim.worldState.walls.grid.blocked.filter(Boolean).length : 0,
      spawnCells: sim.worldState.walls?.spawnCells.length ?? 0,
      // 深空:天体横扫态(null=不在途)
      meteor: ((m) => (m === undefined ? null : { travelling: sim.elapsedMs >= Due.at[m]!, t: Meteor.t[m]! }))(query(this.world, [Meteor])[0]),
    }
  }
}
