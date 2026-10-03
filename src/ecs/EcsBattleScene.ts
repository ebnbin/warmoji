import Phaser from 'phaser'
import { viewport, VIEWPORT_CHANGED } from '../util/apply'
import { UNIT } from '../util/units'
import { CHARACTERS, memberBase } from '../data/characters'
import { HIT_SHAKE } from '../data/feel'
import { TIMESTOP } from '../data/timeStop'
import { burstEmitter } from '../ui/fx'
import { CueLayer } from './render/cues'
import { RingLayer } from './render/rings'
import { DamageTextLayer } from './render/damageText'
import { loadSettings } from '../save/settings'
import { browserStorage } from '../util/storage'
import { FONT_FAMILY, TEXT } from '../ui/theme'
import { norm } from '../util/vec'
import type { Point } from '../util/vec'
import { applyBackground } from '../util/background'
import { mainCameraOnly } from '../util/camera'
import { playSfx } from '../audio/sfx'
import { OUTLINED_EMOJIS, PLAIN_EMOJIS } from '../manifest'
import { getRun, INVINCIBLE_HP, nextStep, runDef, stepOf } from '../run/state'
import { claimNothing, levelUpOptions, pendingLevelUps } from '../run/levelUp'
import { memberLevel, teamLeveled } from '../run/members'
import { goStep } from '../scene/teamPage'
import { openLevelUp } from '../scene/levelUp'
import { rewardText } from '../scene/runLines'
import type { RunState } from '../run/state'
import { MAPS } from '../data/maps'
import { makeWorld } from './world'
import type { EcsWorld } from './world'
import { hasComponent, query } from 'bitecs'
import { Alive, Boss, Cd, Charges, Ctl, Enemy, FACTION, Faction, Stage, Facing, GrantCoins, Hp, PICKUP_SET, Projectile, Revive, Stats, Transform } from './components'
import { dragging, staminaLeft } from './systems/shared/stamina'
import { EcsAtlas } from './atlas'
import { EcsSpriteBatch, SPRITE_BANDS } from './render/spriteBatch'
import { LayerType, TriBatch } from './render/layer'
import { place } from './render/tri'
import { Presentation } from './presentation'
import { remapSim } from './systems/shared/remap'
import { clockSec } from './fight/clock'
import { Fog, setOverlayFill, viewFor } from './views'
import type { MapView, ViewCtx } from './views'
import { makeSim } from './sim'
import { abilityRequires, bodyLook, modDef, statBase } from './store'
import { foldBody, lastingStats, setStatLayer, statsOf } from './utils/stats'
import { aimAt } from './systems/shared/fire'
import { sourceOf } from './utils/source'
import { resetEntityStorage } from './storage'
import { armTeam, memberGear } from './entities/loadout'
import { levelUpsOnField, sweepLevelUps } from './entities/pickup'
import { joinTeam, relevel } from './entities/team'
import { requestCast } from './systems/shared/ability'
import { openStage, ready } from './systems/shared/avail'
import { skillRemainMs } from './systems/tickSkillCooldowns'
import { stepFrame } from './systems/pipeline/frame'
import { replayDeath } from './systems/shared/death'
import { spawnBoss } from './entities/enemy'
import { telegraphCount } from './entities/telegraph'
import { activeMods } from './entities/modifier'
import { Lifetime, Modifier } from './components'

import { initialLayout, stepFrozenVisuals, worldTimeScale } from './sim'
import { openWave, settleWave } from './systems/shared/wave'
import { waveAt, WAVE } from '../data/waves'
import { SURGE } from '../data/enemies'
import { curveOf, phasesOf, timeLimitMs } from '../data/runs'
import { enterFight } from '../run/flow'
import type { FightDef } from '../types/runs'
import { callSquad, streamInterval } from './fight/spawns'
import { fightGoals, fightMods, fightVerdict, lastPhase, markFightBase, nextPhase, phaseMs, phaseOf, startPhase, switchBlock, timeLeftMs } from './fight/state'
import { xpMaxed, xpToNext } from '../run/xp'
import { spawnParams } from './sandbox/knobs'
import { HudEvent, hudMoveVector, setActiveHudHost } from '../run/hudHost'
import type { HudEvents, HudHost, LeaderSkill, MemberSheet, SquadSnapshot } from '../run/hudHost'
import type { ClockSnapshot, HudSnapshot, TiltSnapshot } from '../run/hudHost'
import { crossings, elongation, hourAt, secsBetween, SYNODIC_DAYS } from '../data/cave'
import { deckTilt } from './worlds/ship'
import type { AbilityDef } from '../types/abilityDefs'
import type { Sim } from './sim'
import { drain } from './outbox'
import type { Burst } from './outbox'
import { leaderX, leaderY } from './utils/team'
import { SceneKey } from '../scene/keys'
import { battleDevProvider, watchSandboxSteady } from './devProvider'
import { defineDevFlag } from '../devtools'
import type { DevProvider, DevProviderHost } from '../devtools'
import { gainTeamXp } from './systems/shared/combat'
import { hit } from './systems/shared/damage'
import { bodySource, WORLD_SOURCE } from './utils/source'
import { nearestTarget } from './utils/targets'
import { canSwitchLeader, handoverCamOffset, switchLeader } from './systems/shared/leader'
import { telegraphOne } from './entities/enemy'
import { enemyDef } from './store'
import { wallLoops } from './worlds/basin'
import { gateLoad, gatesNow, gateStats } from './worlds/gates'

const showTargets = defineDevFlag({ id: 'battle.targets', group: '战斗', label: '显示队员目标连线', desc: '从每个队员画到其当前目标' })
const showWalls = defineDevFlag({ id: 'battle.walls', group: '战斗', label: '显示碰撞边界', desc: '勾出身体走不进去的岩壁、山体、舷墙与桅杆' })
const showGates = defineDevFlag({ id: 'battle.gates', group: '战斗', label: '显示出怪口', desc: '画出敌人从哪些地方进场，越亮的这十秒出得越多' })

/** 出怪口按种类上色 */
const GATE_COLORS = [0x00e5ff, 0xffd740, 0x69f0ae, 0xff6e40, 0xe040fb, 0xb2ff59, 0xff4081, 0x40c4ff] as const

function held(key?: Phaser.Input.Keyboard.Key): boolean {
  return key?.isDown ?? false
}

function liveCoins(world: EcsWorld): number {
  let n = 0
  for (const eid of query(world, PICKUP_SET)) {
    if (hasComponent(world, eid, GrantCoins)) n++
  }
  return n
}

/** 视野规则的黑幕有多黑 */
const VISION_FOG_ALPHA = 0.92

/** 倒下的队员几秒后起来；这一场不会自己起来是 null */
function reviveSec(sim: Sim, m: number): number | null {
  const at = Revive.at[m]!
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - sim.elapsedMs) / 1000)) : null
}

/** 瞄准线的长度：位移走多远，或效果把东西放出去多远 */
function aimReach(a: AbilityDef): number {
  const s = a.shape
  if (s.kind === 'sprint' || s.kind === 'leap') return s.distance
  if (s.kind === 'segment') return s.reach
  let r = 0
  for (const fx of a.onHit ?? []) {
    if (fx.kind === 'portal' || fx.kind === 'warp') r = Math.max(r, fx.distance)
    if (fx.kind === 'shadow') r = Math.max(r, fx.dash)
    if (fx.kind === 'barrier' && fx.shape === 'wall') r = Math.max(r, fx.offset ?? 0)
  }
  return r
}

export class EcsBattleScene extends Phaser.Scene implements HudHost, DevProviderHost {
  private world!: EcsWorld
  private map!: MapView
  private ctx!: ViewCtx
  private atlas?: EcsAtlas
  private cues?: CueLayer
  private rings?: RingLayer
  private paint?: Presentation
  private sim?: Sim
  private ready = false
  run!: RunState
  /** 这一场的规则 */
  private fightDef!: FightDef
  private ending = false
  private waveBaseKills = 0
  private waveBaseCoins = 0
  private hitShakeOn = false
  private seenHitCount = 0
  private shownLeader = -1
  private skillAim: Point | null = null
  private aimGfx?: Phaser.GameObjects.Graphics
  private damageText?: DamageTextLayer
  private bursts!: Record<Burst['kind'], Phaser.GameObjects.Particles.ParticleEmitter>
  private timeStopFx?: Phaser.GameObjects.Rectangle
  private timeStopFxAlpha = 0
  private camAnchor!: Phaser.GameObjects.Zone
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
  private mapW = 0
  private mapH = 0
  private bootGen = 0
  private devGfx?: Phaser.GameObjects.Graphics
  private wallGfx?: Phaser.GameObjects.Graphics
  private gateGfx?: Phaser.GameObjects.Graphics
  /** 这一场看得见的范围之外的黑幕；没有视野规则就没有 */
  private fog?: Fog
  /** 升级弹窗开着，战斗停着 */
  private choosing = false
  /** 这一场赢了、小结放完，正在领剩下的升级 */
  private settling = false
  /** 每名队员装上能力时的等级，按名单位置 */
  private armedLevels: number[] = []

  constructor() {
    super(SceneKey.Battle)
  }

  private get hud(): HudEvents {
    return this.events
  }

  /** Phaser 跨局复用同一个 Scene 实例，可变字段须在此重置 */
  private resetSceneFields(): void {
    this.atlas = undefined
    this.cues = undefined
    this.rings = undefined
    this.paint = undefined
    this.sim = undefined
    this.ready = false
    this.ending = false
    this.waveBaseKills = 0
    this.waveBaseCoins = 0
    this.seenHitCount = 0
    this.shownLeader = -1
    this.skillAim = null
    this.aimGfx = undefined
    this.damageText = undefined
    this.timeStopFx = undefined
    this.timeStopFxAlpha = 0
    this.devGfx = undefined
    this.wallGfx = undefined
    this.gateGfx = undefined
    this.fog = undefined
    this.choosing = false
    this.settling = false
    this.armedLevels = []
  }

  devProvider(): DevProvider {
    return battleDevProvider(this)
  }

  devSpawn(kind: 'one' | 'elite' | 'surge' | 'boss'): void {
    const sim = this.sim
    if (!sim || sim.over) return
    if (kind === 'one') telegraphOne(sim, { hpMul: 1 })
    else if (kind === 'elite') telegraphOne(sim, { hpMul: 1, elite: true })
    else if (kind === 'surge') callSquad(sim, SURGE)
    else spawnBoss(sim)
  }

  devKillAll(): void {
    const sim = this.sim
    if (!sim || sim.over) return
    for (const eid of [...query(this.world, [Enemy])]) hit(sim, WORLD_SOURCE, eid, 1e9, { tick: true })
  }

  devGrant(kind: 'coins' | 'level'): void {
    const sim = this.sim
    if (!sim) return
    if (kind === 'coins') this.run.coins += 1000
    else gainTeamXp(sim, Math.max(1, xpToNext(this.run) - this.run.xp.xp))
  }

  devEndWave(): void {
    const sim = this.sim
    if (!sim || sim.over || this.ending || this.endless) return
    settleWave(sim)
    this.scheduleWaveEnd()
  }

  /** 跳过这一阶段，接上下一阶段；已是最后一个阶段就不动 */
  devNextPhase(): void {
    const sim = this.sim
    if (!sim || sim.over || this.ending || lastPhase(sim.fight)) return
    nextPhase(sim)
  }

  /** 这一阶段的进度：第几个阶段、开始了多久、难度时钟，每条连续刷怪此刻的间隔与放出了几只，各条目标 */
  devPhaseText(): string {
    const sim = this.sim
    if (!sim) return '不在战斗中'
    const f = sim.fight
    return [
      `阶段 ${f.phase + 1}/${phasesOf(f.def).length} · 已 ${(phaseMs(sim) / 1000).toFixed(1)} 秒 · 难度时钟 ${Math.round(clockSec(sim))} 秒`,
      ...f.streams.map((st, i) => `连续刷怪 ${i + 1} · 间隔 ${Math.round(streamInterval(sim, st))} ms · 已放 ${st.spawned}${st.rule.total === undefined ? '' : `/${st.rule.total}`}`),
      ...fightGoals(sim).map((g) => `目标 · ${g.text}`),
    ].join('\n')
  }

  /** 出怪口的统计：每种眼下几处、一共出了几只、最近十秒出了几只，吸附不到在原地出来的与落点到时换地方的次数 */
  devGateText(): string {
    const sim = this.sim
    if (!sim) return '不在战斗中'
    const st = gateStats(sim)
    if (!st) return '这张图没有出怪口：敌人在能站的地方原地冒出来'
    return [
      ...st.rows.map((r) => `${r.name.padEnd(4, '　')} ${String(r.n).padStart(3)} 处 · 共 ${String(r.total).padStart(5)} · 十秒 ${String(r.recent).padStart(4)}`),
      `够不着出怪口、原地出来 ${st.misses} · 落点站不住换地方 ${st.moves}`,
    ].join('\n')
  }

  devResetSkill(): void {
    this.run.skillCd.fill(0)
    for (const e of this.sim?.skills ?? []) {
      Cd.left[e] = 0
      if (hasComponent(this.world, e, Charges)) Charges.n[e] = Charges.max[e]!
    }
  }

  devEnemyCounts(): { name: string; n: number }[] {
    const counts = new Map<string, number>()
    for (const eid of query(this.world, [Enemy])) {
      const name = enemyDef[eid]?.name ?? '?'
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n)
  }

  private drawDevTargets(sim: Sim): void {
    if (!showTargets()) {
      this.devGfx?.clear()
      return
    }
    this.devGfx ??= this.add.graphics().setDepth(90)
    const g = this.devGfx
    g.clear()
    g.lineStyle(2, 0xffdc5d, 0.7)
    for (const m of sim.characters) {
      if (!Alive.v[m]) continue
      const t = nearestTarget(sim, bodySource(sim, m), Transform.x[m]!, Transform.y[m]!, Infinity)
      if (!t) continue
      g.lineBetween(Transform.x[m]!, Transform.y[m]!, t.x, t.y)
      g.strokeCircle(t.x, t.y, Math.max(6, t.radius))
    }
  }

  /** 碰撞边界一局里不变：头一回打开时画好，之后只管显隐；盖在战斗画面一切之上 */
  private drawDevWalls(sim: Sim): void {
    if (!showWalls()) {
      this.wallGfx?.setVisible(false)
      return
    }
    if (!this.wallGfx) {
      const g = (this.wallGfx = this.add.graphics().setDepth(1001))
      g.lineStyle(0.05 * UNIT, 0xff00ff, 1)
      const b = sim.hooks.basin(sim)
      if (b) for (const loop of wallLoops(b)) g.strokePoints(loop.map((p) => new Phaser.Math.Vector2(p.x, p.y)), false, true)
    }
    this.wallGfx.setVisible(true)
  }

  /** 出怪口会随地图变（火山口只在喷发时有）：开着就每帧重画；口子画圈、边画线、抛入画它抛得到的圈，越亮这十秒出得越多 */
  private drawDevGates(sim: Sim): void {
    if (!showGates()) {
      this.gateGfx?.setVisible(false)
      return
    }
    const g = (this.gateGfx ??= this.add.graphics().setDepth(1002))
    g.clear()
    g.setVisible(true)
    const kinds = Object.keys(MAPS[sim.mapId].gates?.kinds ?? {})
    for (const gate of gatesNow(sim)) {
      if (gate.shape === 'area') continue
      const color = GATE_COLORS[kinds.indexOf(gate.kind) % GATE_COLORS.length]!
      const alpha = Math.min(1, 0.35 + gateLoad(sim, gate) * 0.08)
      g.lineStyle(0.06 * UNIT, color, alpha)
      if (gate.shape === 'segment') {
        g.lineBetween(gate.ax, gate.ay, gate.bx, gate.by)
        const mx = (gate.ax + gate.bx) / 2
        const my = (gate.ay + gate.by) / 2
        g.lineBetween(mx, my, mx + gate.nx * 0.5 * UNIT, my + gate.ny * 0.5 * UNIT)
      } else {
        g.strokeCircle(gate.ax, gate.ay, Math.max(0.25 * UNIT, gate.r))
        if (gate.nx !== 0 || gate.ny !== 0) g.lineBetween(gate.ax, gate.ay, gate.ax + gate.nx * 0.8 * UNIT, gate.ay + gate.ny * 0.8 * UNIT)
      }
    }
  }

  create(): void {
    this.resetSceneFields()
    this.world = makeWorld()

    const run = getRun()
    this.run = run
    this.fightDef = enterFight(run)
    const mapDef = MAPS[run.mapId]
    applyBackground(mapDef.palette)
    this.map = viewFor(run.mapId)
    this.camAnchor = this.add.zone(0, 0, 1, 1)
    this.ctx = { scene: this, world: this.world, run, def: mapDef, anchor: this.camAnchor, w: 0, h: 0 }
    const { w, h, origin } = this.map.layout(this.ctx)
    this.ctx.w = this.mapW = w
    this.ctx.h = this.mapH = h
    this.map.build(this.ctx)

    this.camAnchor.setPosition(origin.x, origin.y)
    this.map.camera(this.ctx)

    this.timeStopFx = mainCameraOnly(
      this.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 6000, 6000, TIMESTOP.chillColor, 0)
        .setScrollFactor(0)
        .setDepth(88),
    )

    this.cursors = this.input.keyboard?.createCursorKeys()
    const kb = this.input.keyboard
    this.wasd = kb ? { W: kb.addKey('W'), A: kb.addKey('A'), S: kb.addKey('S'), D: kb.addKey('D') } : undefined

    const hint = mainCameraOnly(
      this.add
        .text(viewport.logicalWidth / 2, 40, '构建图集…', {
          fontFamily: FONT_FAMILY,
          fontSize: `${TEXT.label.size}px`,
          color: '#8fa1b5',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(1000),
    )

    const gen = ++this.bootGen
    this.boot(gen, run, hint).catch((e: unknown) => {
      console.error('战斗启动失败', e)
      if (gen === this.bootGen) hint.setText('战斗启动失败，请暂停后结束本局')
    })

    setActiveHudHost(this)
    this.scene.launch(SceneKey.Ui)
    if (this.knobs) watchSandboxSteady(this)
    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bootGen++
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      this.events.off(Phaser.Scenes.Events.RESUME, this.onResume, this)
      this.scene.stop(SceneKey.Ui)
      this.atlas?.dispose()
      this.cues?.destroy()
      this.rings?.destroy()
      this.damageText?.destroy()
      this.map.destroy(this.ctx)
    })
  }

  private async boot(gen: number, run: RunState, hint: Phaser.GameObjects.Text): Promise<void> {
    const atlas = await EcsAtlas.build(this, OUTLINED_EMOJIS, PLAIN_EMOJIS)
    if (gen !== this.bootGen) return
    this.atlas = atlas
    resetEntityStorage()
    const paint = new Presentation()
    this.paint = paint
    for (const b of SPRITE_BANDS) new EcsSpriteBatch(this, this.world, atlas, b.depth, b.zMin, b.zMax, paint.sprites)
    this.cues = new CueLayer(this, this.world)
    this.rings = new RingLayer(this, this.world, { below: paint.marks, above: paint.trail })
    new TriBatch(this, LayerType.Paint, 11, (o, m) => place(o, m, paint.bars))
    new TriBatch(this, LayerType.Paint, 40, (o, m) => place(o, m, paint.pointer))
    this.ctx.atlas = atlas
    this.map.decor(this.ctx, atlas)
    const settings = loadSettings(browserStorage())
    this.hitShakeOn = settings.hitShake
    this.bursts = {
      death: burstEmitter(this, [0x8e24aa, 0xab47bc, 0x6a1b9a, 0xf3e5f5], 230),
      coin: burstEmitter(this, [0xffb300, 0xffdc5d, 0xfff8e1], 150, 340),
      puff: burstEmitter(this, [0x757575, 0x9e9e9e, 0xe0e0e0], 130, 520),
      splash: burstEmitter(this, [0xe3f2fd, 0xbbdefb, 0xffffff, 0x90caf9], 190, 620, { gravityY: 520 }),
      steam: burstEmitter(this, [0xfafafa, 0xeceff1, 0xe0e0e0], 55, 1300, { gravityY: -70, scale: { start: 0.6, end: 1.6 }, alpha: { start: 0.5, end: 0 } }),
      sparks: burstEmitter(this, [0xffe082, 0xff9800, 0xff3d00], 240, 700, { gravityY: 180, blendMode: Phaser.BlendModes.ADD }),
      snow: burstEmitter(this, [0xffffff, 0xe3f2fd, 0xd6e9f8], 120, 900, { gravityY: 90 }),
      leaves: burstEmitter(this, [0x7cb342, 0x558b2f, 0x9ccc65, 0x8d6e63], 110, 950, { gravityY: 110, rotate: { min: 0, max: 360 } }),
      glow: burstEmitter(this, [0xd1c4e9, 0x80deea, 0xffffff, 0xb388ff], 150, 800, { blendMode: Phaser.BlendModes.ADD }),
    }
    const origin = { x: this.camAnchor.x, y: this.camAnchor.y }
    this.sim = makeSim(this.world, atlas, run, origin, this.mapW, this.mapH, settings.damageNumbers, this.fightDef)
    if (this.sim.damageNumbers) this.damageText = new DamageTextLayer(this, this.sim.damageNumbers)
    this.shownLeader = this.sim.leader
    initialLayout(this.sim)
    this.sim.hooks.onStart(this.sim)
    hint.setText('绘制地图…')
    await this.map.onSimReady(this.ctx, this.sim)
    if (gen !== this.bootGen) return
    const simRef = this.sim
    simRef.onDeathFx = (d) => replayDeath(simRef, d)
    armTeam(this.sim, run)
    this.armedLevels = run.roster.map((_, slot) => memberLevel(run, slot))
    if (Number.isFinite(this.sim.fight.rules.vision)) this.fog = new Fog(this)
    startPhase(this.sim)
    this.waveBaseKills = run.kills
    this.waveBaseCoins = run.coins
    openWave(this.sim)
    markFightBase(this.sim)
    this.ready = true
    hint.destroy()
  }


  private drainOutbox(): void {
    const out = this.sim!.out
    drain(out.banners, (bs) => {
      for (const b of bs) this.hud.emit(HudEvent.WaveWarning, b)
    })
    drain(out.collects, (defs) => {
      for (const d of defs) {
        this.hud.emit(HudEvent.FieldCollected, { emoji: d.emoji, name: d.name, desc: d.desc, polarity: d.polarity })
      }
    })
    drain(out.bursts, (bs) => {
      for (const b of bs) this.bursts[b.kind].explode(b.count, b.x, b.y)
    })
    if (out.flash) {
      this.cues?.screenFlash(out.flash.color, out.flash.alpha, out.flash.durationMs)
      out.flash = null
    }
  }

  hudSnapshot(): HudSnapshot {
    const sim = this.sim
    const elapsed = sim?.elapsedMs ?? 0
    const boss = sim ? query(this.world, [Enemy, Boss]).find((eid) => Boss.v[eid] === 1) : undefined
    const left = sim ? timeLeftMs(sim) : (timeLimitMs(phasesOf(this.fightDef)[0]!) ?? Infinity)
    const phases = phasesOf(this.fightDef).length
    const name = this.fightDef.name
    const xpNext = xpToNext(this.run)
    return {
      xp: xpMaxed(this.run) ? xpNext : this.run.xp.xp,
      xpNext,
      level: teamLeveled(this.run) ? this.run.xp.level : null,
      levelUps: pendingLevelUps(this.run),
      kills: this.run.kills,
      coins: this.run.coins,
      label: name === undefined ? null : phases > 1 ? `${name} ${(sim?.fight.phase ?? 0) + 1}/${phases}` : name,
      seconds: Math.floor(elapsed / 1000),
      remainMs: Number.isFinite(left) ? Math.max(0, left) : null,
      goals: sim ? fightGoals(sim) : [],
      bossHp: boss !== undefined ? Hp.v[boss]! : null,
      bossMaxHp: boss !== undefined ? Hp.max[boss]! : 1,
      battleFx: (sim ? activeMods(sim) : []).map((e) => ({
        emoji: modDef[e]!.emoji,
        name: modDef[e]!.name,
        desc: modDef[e]!.desc,
        polarity: modDef[e]!.polarity,
        remainMs: Math.max(0, Lifetime.until[e]! - elapsed),
        totalMs: Modifier.totalMs[e]!,
      })),
      tilt: sim ? tiltSnapshot(sim) : null,
      clock: sim ? clockSnapshot(sim) : null,
    }
  }

  perfSnapshot(): {
    enemies: number
    projectiles: number
    coins: number
    pending: number
    objects: number
    spawnIntervalMs: number
    atlasPages: number
  } {
    const sim = this.sim
    const wave = waveAt(curveOf(runDef(this.run)), sim ? clockSec(sim) : this.run.combatMs / 1000)
    return {
      enemies: query(this.world, [Enemy]).length,
      projectiles: query(this.world, [Projectile]).length,
      coins: liveCoins(this.world),
      pending: sim ? telegraphCount(sim) : 0,
      objects: this.children.list.length,
      spawnIntervalMs: Math.round(sim?.fight.knobs ? spawnParams().intervalMs : wave.spawnIntervalMs),
      atlasPages: this.atlas?.pageCount ?? 0,
    }
  }

  squadSnapshot(): SquadSnapshot | null {
    const sim = this.sim
    if (!sim) return null
    return {
      leaderSlot: sim.characters.indexOf(sim.leader),
      switching: sim.handover !== null,
      members: sim.characters.map((m, slot) => {
        const def = CHARACTERS[this.run.roster[slot]!]
        return {
          emoji: bodyLook[m] ?? def.emoji,
          name: def.name,
          skillIcon: def.skill.icon,
          cdRemainMs: this.run.skillCd[slot] ?? 0,
          cdMs: def.skill.cdMs,
          alive: Alive.v[m] === 1,
          hp: Hp.v[m]!,
          max: Hp.max[m]!,
          reviveSec: reviveSec(sim, m),
          stamina: staminaLeft(m),
          tired: dragging(sim, m),
        }
      }),
    }
  }

  teamSheets(): MemberSheet[] {
    const sim = this.sim
    if (!sim) return []
    return sim.characters.map((m, slot) => {
      const def = CHARACTERS[this.run.roster[slot]!]
      return {
        emoji: bodyLook[m] ?? def.emoji,
        level: memberGear(this.run, slot).level,
        leader: m === sim.leader,
        alive: Alive.v[m] === 1,
        hp: Hp.v[m]!,
        max: Hp.max[m]!,
        reviveSec: reviveSec(sim, m),
        stamina: staminaLeft(m),
        tired: dragging(sim, m),
        now: statsOf(m),
        lasting: lastingStats(m),
      }
    })
  }

  switchLeader(slot: number): boolean {
    const sim = this.sim
    if (!sim || this.ending) return false
    const eid = sim.characters[slot]
    if (eid === undefined || !canSwitchLeader(sim, eid)) return false
    switchLeader(sim, eid)
    sim.fight.switchedAt = sim.fxMs
    sim.run.stats.switches += 1
    return true
  }

  switchBlock(): string | null {
    return this.sim ? switchBlock(this.sim) : null
  }

  skillBlock(): string | null {
    return this.sim && !this.sim.fight.rules.skills ? '这一场不能放主动技能' : null
  }

  leaderSkill(): LeaderSkill | null {
    const sim = this.sim
    if (!sim) return null
    const slot = sim.characters.indexOf(sim.leader)
    const def = CHARACTERS[this.run.roster[slot]!]
    const a = def.skill.ability
    const root = sim.skills[slot]
    const open = root === undefined ? 0 : openStage(sim, root)
    return {
      icon: def.skill.icon,
      name: def.skill.name,
      emoji: bodyLook[sim.leader] ?? def.emoji,
      remainMs: root === undefined ? 0 : skillRemainMs(sim, root),
      cdMs: def.skill.cdMs,
      aim: def.skill.aim,
      rangeU: aimReach(a),
      charges: root !== undefined && hasComponent(this.world, root, Charges) ? Charges.n[root]! : -1,
      recastMs: open !== 0 ? Math.max(0, Stage.open[open]! - sim.elapsedMs) : 0,
      holdMs: a.hold?.maxMs ?? 0,
    }
  }

  /** 不给方向就用摇杆方向，摇杆没推就用队长朝向；连段开着时接下一段；按住蓄力的带上蓄了几成 */
  castLeaderSkill(dir: Point | null, holdRatio = 0): boolean {
    const sim = this.sim
    if (!sim || sim.over || this.ending || this.skillBlock()) return false
    const leader = sim.leader
    if (!Alive.v[leader] || !Ctl.cast[leader]) return false
    const slot = sim.characters.indexOf(leader)
    const root = sim.skills[slot]
    if (root === undefined) return false
    const e = openStage(sim, root) || root
    if (!ready(sim, e)) return false
    if (abilityRequires[e] && !aimAt(sim, e, sourceOf(sim, e))) return false
    const def = CHARACTERS[this.run.roster[slot]!]
    const stick = sim.teamDir
    const d = dir ?? (stick.x !== 0 || stick.y !== 0 ? norm(stick.x, stick.y) : { x: Facing.x[leader]!, y: Facing.y[leader]! })
    sim.aim = { x: d.x, y: d.y }
    requestCast(sim, e, holdRatio)
    sim.run.stats.casts += 1
    playSfx('levelup')
    this.hud.emit(HudEvent.SkillCast, def.skill.name)
    return true
  }

  setSkillAim(dir: Point | null): void {
    this.skillAim = dir
  }

  private drawSkillAim(sim: Sim): void {
    const dir = this.skillAim
    const sk = dir ? this.leaderSkill() : null
    if (!dir || !sk || sk.rangeU <= 0) {
      this.aimGfx?.clear()
      return
    }
    this.aimGfx ??= this.add.graphics().setDepth(40)
    const g = this.aimGfx
    const x = Transform.x[sim.leader]!
    const y = Transform.y[sim.leader]!
    const ex = x + dir.x * sk.rangeU * UNIT
    const ey = y + dir.y * sk.rangeU * UNIT
    g.clear()
    g.lineStyle(7, 0xffffff, 0.3)
    g.lineBetween(x, y, ex, ey)
    g.lineStyle(3, 0xffdc5d, 0.9)
    g.lineBetween(x, y, ex, ey)
    g.fillStyle(0xffdc5d, 0.9)
    g.fillCircle(ex, ey, 10)
  }

  /** 队伍由试炼场的旋钮给出 */
  get knobs(): boolean {
    return runDef(this.run).team === 'knobs'
  }

  /** 这一阶段没有结束规则，一直打下去 */
  get endless(): boolean {
    return (this.sim ? phaseOf(this.sim.fight) : phasesOf(this.fightDef)[0]!).ends.length === 0
  }

  /** 无敌切换后立刻生效：换掉队员的生命上限，开无敌时补满 */
  applyInvincible(): void {
    const sim = this.sim
    if (!sim) return
    sim.run.roster.forEach((id, slot) => {
      const m = sim.characters[slot]!
      const base = memberBase(CHARACTERS[id])
      statBase[m] = sim.run.invincible ? { ...base, maxHp: INVINCIBLE_HP } : base
      foldBody(sim.world, sim, m)
      if (sim.run.invincible) Hp.v[m] = Hp.max[m]!
    })
  }

  /** 旋钮改了这一场给队伍的常驻修正后立刻换上 */
  applyKnobs(): void {
    const sim = this.sim
    if (!sim) return
    const mods = fightMods(sim.fight, FACTION.team)
    for (const eid of query(this.world, [Stats])) if (Faction.v[eid] === FACTION.team) setStatLayer(eid, 'fight', mods)
  }



  private onViewportChanged(): void {
    const sim = this.sim
    const fromW = this.mapW
    const fromH = this.mapH
    const { w, h, origin } = this.map.layout(this.ctx)
    this.ctx.w = this.mapW = w
    this.ctx.h = this.mapH = h
    this.map.resize(this.ctx)
    if (w === fromW && h === fromH) return
    if (sim) {
      sim.mapW = w
      sim.mapH = h
      remapSim(sim, fromW, fromH, w, h)
      this.camAnchor.setPosition(leaderX(sim), leaderY(sim))
    } else {
      this.camAnchor.setPosition(origin.x, origin.y)
    }
  }















  /** 这一场赢了：记下队长、打出小结，稍后走到下一步 */
  private scheduleWaveEnd(): void {
    this.ending = true
    const sim = this.sim!
    const run = sim.run
    run.leaderId = run.roster[sim.characters.indexOf(sim.leader)]!
    playSfx('wave')
    this.hud.emit(HudEvent.WaveComplete, {
      title: `${this.fightDef.name ?? '本场'}完成！`,
      kills: run.kills - this.waveBaseKills,
      coins: run.coins - this.waveBaseCoins,
      reward: rewardText(this.fightDef.reward),
    })
    nextStep(run)
    this.time.delayedCall(WAVE.summaryMs, () => this.settle())
  }

  /** 小结之后：地上没捡的升级替玩家捡起来，逐个选完再走到下一步 */
  private settle(): void {
    this.settling = true
    if (this.sim) {
      sweepLevelUps(this.sim)
      this.drainOutbox()
    }
    this.proceed()
  }

  /** 后面还有步骤才领：最后一场打完直接去结算 */
  private proceed(): void {
    while (stepOf(this.run) && pendingLevelUps(this.run) > 0) if (this.chooseLevelUp()) return
    goStep(this, this.run)
  }

  /** 领下一次升级：已经没有能选的就作废，否则战斗停住、弹出升级弹窗；返回弹没弹出来 */
  private chooseLevelUp(): boolean {
    if (levelUpOptions(this.run).length === 0) {
      claimNothing(this.run)
      return false
    }
    this.choosing = true
    const onField = this.sim ? levelUpsOnField(this.sim).length : 0
    openLevelUp(this, { settling: this.settling, queued: pendingLevelUps(this.run) - onField })
    return true
  }

  /** 队长捡起了升级道具：捡起来还没选的就先选 */
  private takeLevelUps(sim: Sim): void {
    if (this.choosing || pendingLevelUps(this.run) <= levelUpsOnField(sim).length) return
    this.chooseLevelUp()
  }

  /** 从升级弹窗回来：领到的升级当场生效；小结之后接着领下一次 */
  private onResume(): void {
    if (!this.choosing) return
    this.choosing = false
    if (this.settling) this.proceed()
    else this.syncTeam()
  }

  /** 按本局的名单与等级补上新招的队员，给升了级的队员换上新能力 */
  private syncTeam(): void {
    const sim = this.sim
    if (!sim || !this.atlas) return
    for (let slot = sim.characters.length; slot < this.run.roster.length; slot++) {
      joinTeam(sim, this.atlas, slot)
      this.armedLevels[slot] = memberLevel(this.run, slot)
    }
    this.run.roster.forEach((_, slot) => {
      const level = memberLevel(this.run, slot)
      if (this.armedLevels[slot] === level) return
      relevel(sim, slot)
      this.armedLevels[slot] = level
    })
  }


  update(_time: number, delta: number): void {
    const sim = this.sim
    if (!this.ready || !sim) return
    sim.dtMs = delta
    sim.wdtMs = delta * worldTimeScale(sim)
    if (this.ending) {
      stepFrozenVisuals(sim)
      this.cues?.step(sim.fxMs)
      this.rings?.step(sim.fxMs)
      this.damageText?.step(sim.fxMs)
      return
    }
    const leftMs = timeLeftMs(sim)
    const lastFrame = sim.wdtMs >= leftMs
    if (lastFrame) sim.wdtMs = leftMs
    const kx =
      (held(this.cursors?.left) || held(this.wasd?.A) ? -1 : 0) +
      (held(this.cursors?.right) || held(this.wasd?.D) ? 1 : 0)
    const ky =
      (held(this.cursors?.up) || held(this.wasd?.W) ? -1 : 0) +
      (held(this.cursors?.down) || held(this.wasd?.S) ? 1 : 0)

    const keyed = kx !== 0 || ky !== 0
    const stick = hudMoveVector()
    sim.teamDir = keyed ? norm(kx, ky) : stick
    sim.moveInputRaw = keyed ? 1 : Math.min(1, Math.hypot(stick.x, stick.y))

    const wv = this.cameras.main.worldView
    sim.view.x = wv.x
    sim.view.y = wv.y
    sim.view.right = wv.right
    sim.view.bottom = wv.bottom
    stepFrame(sim)
    if (sim.leader !== this.shownLeader) {
      this.shownLeader = sim.leader
      const def = CHARACTERS[this.run.roster[sim.characters.indexOf(sim.leader)]!]
      playSfx('whoosh')
      this.hud.emit(HudEvent.LeaderChanged, { emoji: bodyLook[sim.leader] ?? def.emoji, name: def.name })
    }
    this.cues?.step(sim.fxMs)
    this.rings?.step(sim.fxMs)
    this.damageText?.step(sim.fxMs)
    this.drainOutbox()
    if (sim.characterHitCount > this.seenHitCount) {
      this.seenHitCount = sim.characterHitCount
      if (this.hitShakeOn) this.cameras.main.shake(HIT_SHAKE.durationMs, HIT_SHAKE.intensity)
    }
    this.paint?.step(sim)
    this.drawDevTargets(sim)
    this.drawDevWalls(sim)
    this.drawDevGates(sim)
    this.drawSkillAim(sim)
    if (sim.over) {
      this.lose('全军覆没')
      return
    }
    const camOff = handoverCamOffset(sim)
    this.camAnchor.setPosition(leaderX(sim) + camOff.x, leaderY(sim) + camOff.y)
    this.map.step(this.ctx, sim, delta)
    this.fog?.show(leaderX(sim), leaderY(sim), sim.fight.rules.vision * UNIT, VISION_FOG_ALPHA)
    const chillTarget = sim.timeStopMsLeft > 0 ? (1 - sim.chrono) * TIMESTOP.chillMaxAlpha : 0
    this.timeStopFxAlpha += (chillTarget - this.timeStopFxAlpha) * Math.min(1, delta / TIMESTOP.fadeMs)
    if (this.timeStopFx) setOverlayFill(this.timeStopFx, TIMESTOP.chillColor, this.timeStopFxAlpha)
    // 须在 stepFrame 与全灭判定之后：时限内全灭判负
    const verdict = fightVerdict(sim, lastFrame)
    if (verdict?.win) {
      settleWave(sim)
      this.scheduleWaveEnd()
    } else if (verdict) {
      this.lose(verdict.reason)
    } else {
      this.takeLevelUps(sim)
    }
  }

  /** 这一局输了：停在此刻，稍后去结算 */
  private lose(reason: string): void {
    this.ending = true
    this.run.combatMs += this.sim!.elapsedMs
    playSfx('over')
    this.time.delayedCall(900, () => this.scene.start(SceneKey.Result, { win: false, reason }))
  }
}

/** 船上的一局：甲板此刻往哪边倾、倾多少，以及站着会滑的门槛 */
function tiltSnapshot(sim: Sim): TiltSnapshot | null {
  const ship = sim.worldState.ship
  const cfg = MAPS[sim.mapId].ship
  if (!ship || !cfg) return null
  const t = deckTilt(ship)
  return {
    down: t.down,
    deg: (t.angle * 180) / Math.PI,
    bow: { x: ship.deck.bx, y: ship.deck.by },
    slipDeg: (Math.atan(cfg.friction.body.static) * 180) / Math.PI,
  }
}

/** 溶洞里的一局：太阳与月亮此刻的时角、月相，以及离天黑（太阳落到时间放慢的那个高度）或天亮还有几秒 */
function clockSnapshot(sim: Sim): ClockSnapshot | null {
  const cave = sim.worldState.cave
  const cfg = MAPS[sim.mapId].cave
  if (!cave || !cfg) return null
  const hour = hourAt(cfg.sky, clockSec(sim))
  const turn = crossings(cfg.sky, cfg.sky.dwellCenterDeg)
  if (!turn) return null
  const night = hour >= turn.set || hour < turn.rise
  const sun = ((hour - 12) / 12) * Math.PI
  return {
    sun,
    moon: sun - elongation(cave.sky.age),
    phase: cave.sky.age / SYNODIC_DAYS,
    night,
    inSec: secsBetween(cfg.sky, hour, night ? turn.rise : turn.set),
  }
}
