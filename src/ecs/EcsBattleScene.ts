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
import { HeightOverlay } from './render/heights'
import { loadSettings } from '../save/settings'
import { browserStorage } from '../util/storage'
import { FONT_FAMILY, TEXT } from '../ui/theme'
import { norm } from '../util/vec'
import type { Point } from '../util/vec'
import { applyBackground } from '../util/background'
import { mainCameraOnly } from '../util/camera'
import { playSfx } from '../audio/sfx'
import { battleSprites } from '../manifest'
import { adoptRun, getRun, INVINCIBLE_HP, nextStep, runDef } from '../run/state'
import { anyChoice, claim, pendingLevelUps } from '../run/levelUp'
import type { Claim, FieldMember } from '../run/levelUp'
import { teamLeveled } from '../run/members'
import { goStep } from '../scene/teamPage'
import { openLevelUp } from '../scene/levelUp'
import type { LevelUpResult } from '../scene/levelUp'
import { rewardText } from '../scene/runLines'
import type { RunState } from '../run/state'
import { MAPS } from '../data/maps'
import { makeWorld } from './world'
import type { EcsWorld } from './world'
import { hasComponent, query } from 'bitecs'
import { Alive, Boss, Cd, Charges, Ctl, Enemy, FACTION, Faction, Stage, Facing, GrantCoins, Hp, PICKUP_SET, Projectile, Stats, Transform } from './components'
import { dragging, staminaLeft } from './systems/shared/stamina'
import { EcsAtlas } from './atlas'
import { EcsSpriteBatch, SPRITE_BANDS } from './render/spriteBatch'
import { FEET_DEPTH, LYING_DEPTH } from './render/bands'
import { SpriteBatch } from './render/sprites'
import { EcsShadowBatch } from './render/shadow'
import { LayerType, TriBatch } from './render/layer'
import { place } from './render/tri'
import { Presentation } from './presentation'
import { clockSec } from './fight/clock'
import { Fog, setOverlayFill } from './views'
import { viewFor } from './viewRegistry'
import type { MapView, ViewCtx } from './views'
import { SAFE } from '../maps/frame'
import { Lens } from './lens'
import type { Framing } from './lens'
import { makeSim } from './sim'
import { abilityDef, abilityRequires, bodyLook, modDef, statBase } from './store'
import { foldBody, lastingStats, setStatLayer, statsOf } from './utils/stats'
import { aimAt } from './systems/shared/fire'
import { sourceOf } from './utils/source'
import { resetEntities } from './entities/entity'
import { abilityGroup } from './entities/ability'
import { armTeam, memberGear } from './entities/loadout'
import { levelUpsOnField, scatterLevelUps } from './entities/pickup'
import { joinTeam, relevel, restoreMember, swapTeam } from './entities/team'
import { requestCast } from './systems/shared/ability'
import { openStage, ready, turnOf } from './systems/shared/avail'
import { skillRemainMs } from './systems/tickSkillCooldowns'
import { stepFrame, TICK_MS } from './systems/pipeline/frame'
import { replayDeath } from './systems/shared/death'
import { spawnBoss } from './entities/enemy'
import { telegraphCount } from './entities/telegraph'
import { activeMods } from './entities/modifier'
import { Act, Lifetime, Modifier, Radius, Uid } from './components'
import { isSameEntity } from './utils/identity'
import { bodyAt, describeBody } from './inspector'

import { initialLayout, stepFrozen } from './sim'
import { presentFrame, presentFrozen } from './present/frame'
import { openWave, settleWave } from './systems/shared/wave'
import { waveAt, WAVE } from '../data/waves'
import { SURGE } from '../data/enemies'
import { curveOf, timeLimitMs } from '../data/runs'
import { enterFight } from '../run/flow'
import type { FightDef } from '../types/runs'
import { callSquad, streamInterval } from './fight/spawns'
import { fightGoals, fightMods, fightVerdict, lastPhase, markFightBase, nextPhase, phaseMs, phaseOf, startPhase, switchBlock, timeLeftMs } from './fight/state'
import { xpToNext } from '../run/xp'
import { spawnParams } from './sandbox/knobs'
import { subCountdown } from '../maps/deep/sub'
import { HudEvent, hudMoveVector, setActiveHudHost } from '../run/hudHost'
import type { HudEvents, HudHost, LeaderSkill, MemberSheet, SquadSnapshot } from '../run/hudHost'
import type { BossBar, StageSnapshot, HudSnapshot, SubmarineSnapshot } from '../run/hudHost'
import { CHAPTERS, chapterOf } from '../maps/theater/model'
import { amethystClock } from '../maps/amethyst/world'
import type { AbilityDef } from '../types/abilityDefs'
import type { Sim } from './sim'
import { isSteadfast } from './utils/marks'
import { tenacityRatio } from './systems/shared/tenacity'
import { drain } from './outbox'
import { keepTape, TapePlayer, TapeRecorder } from './tape'
import type { DevCommand, Tape, TapeEvent } from './tape'
import type { Burst } from './outbox'
import { feedback } from './present/feedback'
import type { Show } from './present/feedback'
import { newDamageNumbers } from './present/damageNumbers'
import { leaderX, leaderY } from './utils/team'
import { SceneKey } from '../scene/keys'
import { battleDevTabs, lensMode, showGates, showGrid, showHeights, showTargets, showWalls, watchSandboxSteady } from './devTabs'
import type { DevSceneTabs, DevTabsHost } from '../devtools'
import { die, gainTeamXp } from './systems/shared/combat'
import { hit } from './systems/shared/damage'
import { bodySource, WORLD_SOURCE } from './utils/source'
import { nearestTarget } from './utils/targets'
import { canSwitchLeader, handoverCamOffset, switchLeader } from './systems/shared/leader'
import { telegraphOne } from './entities/enemy'
import { enemyDef } from './store'
import { wallLoops } from '../maps/basin'
import { gateLoad, gatesNow, gateStats } from './worlds/gates'

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

/** 一帧最多补走几步：卡得更久就丢掉落下的时间 */
const MAX_STEPS_PER_FRAME = 4

function unknownCommand(cmd: never): never {
  throw new Error(`开发指令没有处理：${JSON.stringify(cmd)}`)
}

/** 视野规则的黑幕有多黑 */
const VISION_FOG_ALPHA = 0.92


/** 瞄准线的长度：位移走多远，或效果把东西放出去多远 */
function aimReach(a: AbilityDef): number {
  const s = a.shape
  if (s.kind === 'sprint' || s.kind === 'leap') return s.distance
  if (s.kind === 'segment') return s.reach + (s.lungeDist ?? 0)
  let r = 0
  for (const fx of a.onHit ?? []) {
    if (fx.kind === 'portal' || fx.kind === 'warp') r = Math.max(r, fx.distance)
    if (fx.kind === 'shadow') r = Math.max(r, fx.dash)
    if (fx.kind === 'barrier' && fx.shape === 'wall') r = Math.max(r, fx.offset ?? 0)
  }
  return r
}

/** 头目的名字，进了有名字的阶段带上阶段名 */
function bossName(eid: number): string {
  const def = enemyDef[eid]
  const phase = def?.phases?.[Act.phase[eid]!]
  return phase?.name ? `${def!.name} · ${phase.name}` : (def?.name ?? '')
}

/** 场上活着的头目按出场先后排，各自的名字、生命与控制韧性 */
function bossBars(sim: Sim): BossBar[] {
  return [...query(sim.world, [Enemy, Boss])]
    .filter((eid) => Boss.v[eid] === 1 && Alive.v[eid] === 1)
    .sort((a, b) => Uid.v[a]! - Uid.v[b]!)
    .map((eid) => ({ uid: Uid.v[eid]!, name: bossName(eid), hp: Hp.v[eid]!, maxHp: Hp.max[eid]!, tenacity: tenacityRatio(sim.world, eid), steadfast: isSteadfast(sim, eid) }))
}

export class EcsBattleScene extends Phaser.Scene implements HudHost, DevTabsHost {
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
  /** 演出要用到的：开局时按设置备好 */
  private show!: Show
  private shownLeader = -1
  private skillAim: Point | null = null
  private aimGfx?: Phaser.GameObjects.Graphics
  private damageText?: DamageTextLayer
  private bursts!: Record<Burst['kind'], Phaser.GameObjects.Particles.ParticleEmitter>
  private timeStopFx?: Phaser.GameObjects.Rectangle
  private timeStopFxAlpha = 0
  /** 跟随时镜头对准的地方：队长，换人时从上一任那里滑过来 */
  private anchor: Point = { x: 0, y: 0 }
  private lens!: Lens
  private framing!: Framing
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
  private mapW = 0
  private mapH = 0
  private bootGen = 0
  private devGfx?: Phaser.GameObjects.Graphics
  private wallGfx?: Phaser.GameObjects.Graphics
  private gateGfx?: Phaser.GameObjects.Graphics
  private gridGfx?: Phaser.GameObjects.Graphics
  private heights?: HeightOverlay
  /** 这一场看得见的范围之外的黑幕；没有视野规则就没有 */
  private fog?: Fog
  /** 升级弹窗开着，战斗停着 */
  private choosing = false
  /** 攒着还没走的时间，毫秒 */
  private pendingMs = 0
  /** 模拟的快慢：0 是停住，停住时只走排着的那几步 */
  private rate = 1
  private queuedSteps = 0
  /** 检视中的身体：编号对不上就是换了实体 */
  private inspected: { readonly eid: number; readonly uid: number } | null = null
  private inspectGfx?: Phaser.GameObjects.Graphics
  /** 这一场正录着的录像；回放时没有 */
  private recorder: TapeRecorder | null = null
  /** 照录像重打时的回放 */
  private player: TapePlayer | null = null

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
    this.shownLeader = -1
    this.skillAim = null
    this.aimGfx = undefined
    this.damageText = undefined
    this.timeStopFx = undefined
    this.timeStopFxAlpha = 0
    this.devGfx = undefined
    this.wallGfx = undefined
    this.gateGfx = undefined
    this.gridGfx = undefined
    this.heights = undefined
    this.fog = undefined
    this.choosing = false
    this.pendingMs = 0
    this.rate = 1
    this.queuedSteps = 0
    this.inspected = null
    this.inspectGfx = undefined
    this.recorder = null
    this.player = null
  }

  devTabs(): DevSceneTabs {
    return battleDevTabs(this)
  }

  /** 开发面板的指令：和玩家的操作一样录进录像 */
  dev(cmd: DevCommand): void {
    this.issue({ t: this.sim?.tick ?? 0, k: 'dev', cmd })
  }

  private devApply(sim: Sim, cmd: DevCommand): void {
    switch (cmd.kind) {
      case 'spawn':
        if (sim.over) return
        if (cmd.what === 'one') telegraphOne(sim, { hpMul: 1 })
        else if (cmd.what === 'elite') telegraphOne(sim, { hpMul: 1, elite: true })
        else if (cmd.what === 'surge') callSquad(sim, SURGE)
        else spawnBoss(sim, cmd.n)
        return
      case 'killAll':
        if (sim.over) return
        for (const eid of [...query(this.world, [Enemy])]) hit(sim, WORLD_SOURCE, eid, 1e9, { tick: true })
        return
      case 'down': {
        if (sim.over) return
        const up = sim.characters.filter((m) => Alive.v[m])
        const m = up.find((x) => x !== sim.leader) ?? up[0]
        if (m !== undefined) die(sim, m, WORLD_SOURCE, 0, 0)
        return
      }
      case 'grant':
        if (cmd.what === 'coins') this.run.coins += 1000
        else gainTeamXp(sim, Math.max(1, xpToNext(this.run) - this.run.xp.xp))
        return
      case 'endWave':
        if (sim.over || this.ending || this.endless) return
        settleWave(sim)
        this.scheduleWaveEnd()
        return
      // 跳过这一阶段，接上下一阶段；已是最后一个阶段就不动
      case 'nextPhase':
        if (sim.over || this.ending || lastPhase(sim.fight)) return
        nextPhase(sim)
        return
      case 'resetSkill':
        this.run.skillCd.fill(0)
        for (const e of sim.skills.flatMap((root) => abilityGroup(sim, root))) {
          Cd.left[e] = 0
          if (hasComponent(this.world, e, Charges)) Charges.n[e] = Charges.max[e]!
        }
        return
      // 无敌切换后立刻生效：换掉队员的生命上限，开无敌时补满
      case 'invincible':
        sim.run.invincible = cmd.on
        sim.run.roster.forEach((id, slot) => {
          const m = sim.characters[slot]!
          const base = memberBase(CHARACTERS[id])
          statBase[m] = cmd.on ? { ...base, maxHp: INVINCIBLE_HP } : base
          foldBody(sim.world, sim, m)
          if (cmd.on) Hp.v[m] = Hp.max[m]!
        })
        return
      // 旋钮改了这一场给队伍的常驻修正后立刻换上
      case 'knobs': {
        const mods = fightMods(sim.fight, FACTION.team)
        for (const eid of query(this.world, [Stats])) if (Faction.v[eid] === FACTION.team) setStatLayer(eid, 'fight', mods)
        return
      }
      default:
        return unknownCommand(cmd)
    }
  }

  /** 这一阶段的进度：第几个阶段、开始了多久、难度时钟，每条连续刷怪此刻的间隔与放出了几只，各条目标 */
  devPhaseText(): string {
    const sim = this.sim
    if (!sim) return '不在战斗中'
    const f = sim.fight
    return [
      `阶段 ${f.phase + 1}/${f.def.phases.length} · 已 ${(phaseMs(sim) / 1000).toFixed(1)} 秒 · 难度时钟 ${Math.round(clockSec(sim))} 秒`,
      ...f.streams.map((st, i) => `连续刷怪 ${i + 1} · 间隔 ${Math.round(streamInterval(sim, st))} ms · 已放 ${st.spawned}${st.rule.total === undefined ? '' : `/${st.rule.total}`}`),
      ...fightGoals(sim).map((g) => `目标 · ${g.text}`),
    ].join('\n')
  }

  /** 出怪口的统计：每种眼下几处、一共出了几只、最近十秒出了几只，吸附不到在原地出来的与落点到时换地方的次数 */
  devGateText(): string {
    const sim = this.sim
    if (!sim) return '不在战斗中'
    const st = gateStats(sim)
    return [
      ...st.rows.map((r) => `${r.name.padEnd(4, '　')} ${String(r.n).padStart(3)} 处 · 共 ${String(r.total).padStart(5)} · 十秒 ${String(r.recent).padStart(4)}`),
      `够不着出怪口、原地出来 ${st.misses} · 落点站不住换地方 ${st.moves}`,
    ].join('\n')
  }

  devEnemyCounts(): { name: string; n: number }[] {
    const counts = new Map<string, number>()
    for (const eid of query(this.world, [Enemy])) {
      const name = enemyDef[eid]?.name ?? '?'
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n)
  }

  /** 模拟的快慢，0 是停住 */
  simRate(): number {
    return this.rate
  }

  setSimRate(rate: number): void {
    this.rate = rate
    this.queuedSteps = 0
  }

  /** 停住模拟，再往前走 n 步 */
  stepTicks(n: number): void {
    this.rate = 0
    this.queuedSteps += n
  }

  /** 点选画布上的一点：离它最近的身体拿来检视，点空了就不再检视 */
  inspectAt(px: number, py: number): void {
    const sim = this.sim
    if (!sim) return
    const w = this.lens.screen.toWorld(px, py)
    const eid = bodyAt(sim, w.x, w.y)
    this.inspected = eid < 0 ? null : { eid, uid: Uid.v[eid]! }
  }

  inspectText(): string {
    const sim = this.sim
    const s = this.inspected
    if (!sim || !s) return '没有在检视的单位：按"点选单位"，再点一下画面上的身体'
    if (!isSameEntity(this.world, s.eid, s.uid)) return `检视的单位（uid ${s.uid}）已经不在了`
    return describeBody(sim, s.eid)
  }

  /** 检视中的身体套一个圈 */
  private drawInspected(): void {
    const s = this.inspected
    if (!s || !isSameEntity(this.world, s.eid, s.uid)) {
      this.inspectGfx?.clear()
      return
    }
    const g = (this.inspectGfx ??= this.add.graphics().setDepth(95))
    g.clear()
    const r = Math.max(0.3 * UNIT, Radius.v[s.eid]! + 0.15 * UNIT)
    g.lineStyle(0.06 * UNIT, 0xffffff, 0.9)
    g.strokeCircle(Transform.x[s.eid]!, Transform.y[s.eid]!, r)
    g.lineStyle(0.03 * UNIT, 0x00e5ff, 1)
    g.strokeCircle(Transform.x[s.eid]!, Transform.y[s.eid]!, r + 0.08 * UNIT)
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
    const kinds = Object.keys(MAPS[sim.mapId].gates.kinds)
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

  /** 墙会塌、身体会跳：开着就每帧画身体与弹体，地形隔一会儿按镜头重新取样 */
  private drawDevHeights(sim: Sim): void {
    if (!showHeights()) {
      this.heights?.hide()
      return
    }
    this.heights ??= new HeightOverlay(this, this.lens)
    this.heights.draw(sim, this.time.now)
  }

  /**
   * 坐标网格按主镜头此刻拍到的范围每帧重画：每格一条线，过原点的两条另上色，按方框取景的地图再框出安全区；盖在战斗画面之上、碰撞边界与出怪口之下。
   * 线宽按屏幕上的粗细定：标准缩放时照原样，拉远看整张图时不跟着变细
   */
  private drawDevGrid(): void {
    if (!showGrid()) {
      this.gridGfx?.setVisible(false)
      return
    }
    const g = (this.gridGfx ??= this.lens.mainOnly(this.add.graphics().setDepth(1000)))
    g.clear()
    g.setVisible(true)
    const r = this.lens.screen.view()
    const k = viewport.renderScale / this.lens.screen.zoom()
    const right = r.x + r.w
    const bottom = r.y + r.h
    g.lineStyle(0.03 * UNIT * k, 0xffffff, 0.45)
    for (let x = Math.floor(r.x / UNIT) * UNIT; x <= right; x += UNIT) g.lineBetween(x, r.y, x, bottom)
    for (let y = Math.floor(r.y / UNIT) * UNIT; y <= bottom; y += UNIT) g.lineBetween(r.x, y, right, y)
    g.lineStyle(0.05 * UNIT * k, 0xff1744, 1)
    g.lineBetween(r.x, 0, right, 0)
    g.lineStyle(0.05 * UNIT * k, 0x00e676, 1)
    g.lineBetween(0, r.y, 0, bottom)
    if (this.framing.edge !== 'frame') return
    g.lineStyle(0.05 * UNIT * k, 0xffd600, 1)
    g.strokeRect(SAFE.x, SAFE.y, SAFE.w, SAFE.h)
  }

  create(data?: { readonly tape?: Tape }): void {
    this.resetSceneFields()
    this.world = makeWorld()

    const tape = data?.tape
    if (tape) adoptRun(structuredClone(tape.run))
    const run = getRun()
    if (tape) this.player = new TapePlayer(tape)
    else {
      this.recorder = new TapeRecorder(run)
      keepTape(this.recorder.tape)
    }
    this.run = run
    this.fightDef = enterFight(run)
    const mapDef = MAPS[run.mapId]
    applyBackground(mapDef.palette)
    this.map = viewFor(run.mapId)
    this.lens = new Lens(this)
    this.ctx = { scene: this, world: this.world, run, def: mapDef, lens: this.lens, decor: [], w: 0, h: 0, showWalls }
    const { w, h, origin } = this.map.layout(this.ctx)
    this.ctx.w = this.mapW = w
    this.ctx.h = this.mapH = h
    this.map.build(this.ctx)

    this.anchor = { x: origin.x, y: origin.y }
    this.framing = this.map.framing(this.ctx)
    this.lens.frame(this.framing)

    this.timeStopFx = this.lens.screen.cover(this.add.rectangle(0, 0, 1, 1, TIMESTOP.chillColor, 0).setDepth(88))

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
      this.player?.stop()
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
    const atlas = await EcsAtlas.build(this, battleSprites(run))
    if (gen !== this.bootGen) return
    this.atlas = atlas
    resetEntities()
    const paint = new Presentation()
    this.paint = paint
    const light = MAPS[run.mapId].light
    const lightAt = this.map.lightAt?.bind(this.map)
    // 布景躺在地上，和躺着的精灵画在同一层
    new SpriteBatch(this, LayerType.Decor, LYING_DEPTH, atlas, this.ctx.decor, light, lightAt)
    const leader = (): number => this.sim?.leader ?? -1
    for (const b of SPRITE_BANDS) new EcsSpriteBatch(this, this.world, atlas, b.depth, b.zMin, b.zMax, paint.sprites, light, lightAt, leader)
    if (light.shadow) new EcsShadowBatch(this, this.world, atlas, light.shadow)
    this.cues = new CueLayer(this, this.world, (r) => this.lens.screen.cover(r))
    this.rings = new RingLayer(this, this.world, { below: paint.marks, above: paint.trail })
    new TriBatch(this, LayerType.Paint, FEET_DEPTH, (o, m) => place(o, m, paint.feet))
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
      petals: burstEmitter(this, [0xffc1d9, 0xffe4ee, 0xf8bbd0, 0xffffff], 100, 1200, { gravityY: 55, rotate: { min: 0, max: 360 } }),
      sand: burstEmitter(this, [0xe8c27a, 0xd9a85b, 0xf3dca5, 0xc8954a], 120, 700, { gravityY: 160 }),
      silt: burstEmitter(this, [0x7d8fa3, 0x93a5b5, 0x5f7287, 0xa9b6c2], 60, 1500, { gravityY: 18, scale: { start: 0.7, end: 1.9 }, alpha: { start: 0.45, end: 0 } }),
      bubbles: burstEmitter(this, [0xe0f7ff, 0xb3e5fc, 0xffffff], 70, 1100, { gravityY: -150, scale: { start: 0.35, end: 0.75 }, alpha: { start: 0.85, end: 0 } }),
      maple: burstEmitter(this, [0xf2881e, 0xf6a830, 0xe8661c, 0xffbe48], 105, 1250, { gravityY: 60, rotate: { min: 0, max: 360 } }),
      shards: burstEmitter(this, [0xb48cff, 0x8e5bd9, 0xe2d2ff, 0x6a3fc0], 210, 620, { gravityY: 260, rotate: { min: 0, max: 360 } }),
      paper: burstEmitter(this, [0xfbf3df, 0xf1e4c4, 0xffffff, 0xe6d3ad], 120, 900, { gravityY: 140, rotate: { min: 0, max: 360 } }),
    }
    const origin = { x: this.anchor.x, y: this.anchor.y }
    this.sim = makeSim(this.world, atlas, run, origin, this.mapW, this.mapH, this.fightDef)
    const numbers = settings.damageNumbers ? newDamageNumbers() : null
    if (numbers) this.damageText = new DamageTextLayer(this, numbers)
    this.show = {
      sfx: playSfx,
      shake: () => {
        if (this.hitShakeOn) this.lens.screen.shake(HIT_SHAKE.durationMs, HIT_SHAKE.intensity)
      },
      numbers,
    }
    this.shownLeader = this.sim.leader
    initialLayout(this.sim)
    presentFrame(this.sim, 0)
    this.sim.hooks.onStart(this.sim)
    hint.setText('绘制地图…')
    await this.map.onSimReady(this.ctx, this.sim)
    if (gen !== this.bootGen) return
    const simRef = this.sim
    simRef.onDeathFx = (d) => replayDeath(simRef, d)
    armTeam(this.sim, run)
    if (Number.isFinite(this.sim.fight.rules.vision)) this.fog = new Fog(this, this.lens.screen)
    startPhase(this.sim)
    this.waveBaseKills = run.kills
    this.waveBaseCoins = run.coins
    openWave(this.sim)
    scatterLevelUps(this.sim, pendingLevelUps(run))
    markFightBase(this.sim)
    this.ready = true
    hint.destroy()
  }


  private drainOutbox(): void {
    const out = this.sim!.out
    drain(out.events, (es) => feedback(es, this.show))
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
    const left = sim ? timeLeftMs(sim) : (timeLimitMs(this.fightDef.phases[0]!) ?? Infinity)
    const phases = this.fightDef.phases.length
    const name = this.fightDef.name
    return {
      xp: this.run.xp.xp,
      xpNext: xpToNext(this.run),
      level: teamLeveled(this.run) ? this.run.xp.level : null,
      levelUps: pendingLevelUps(this.run),
      kills: this.run.kills,
      coins: this.run.coins,
      label: phases > 1 ? `${name} ${(sim?.fight.phase ?? 0) + 1}/${phases}` : name,
      seconds: Math.floor(elapsed / 1000),
      remainMs: Number.isFinite(left) ? Math.max(0, left) : null,
      goals: sim ? fightGoals(sim) : [],
      bosses: sim ? bossBars(sim) : [],
      battleFx: (sim ? activeMods(sim) : []).map((e) => ({
        emoji: modDef[e]!.emoji,
        name: modDef[e]!.name,
        desc: modDef[e]!.desc,
        polarity: modDef[e]!.polarity,
        remainMs: Math.max(0, Lifetime.until[e]! - elapsed),
        totalMs: Modifier.totalMs[e]!,
      })),
      clock: sim ? amethystClock(sim) : null,
      submarine: sim ? submarineSnapshot(sim) : null,
      stage: sim ? stageSnapshot(sim) : null,
    }
  }

  perfSnapshot(): {
    enemies: number
    projectiles: number
    coins: number
    pending: number
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
        stamina: staminaLeft(m),
        tired: dragging(sim, m),
        now: statsOf(m),
        lasting: lastingStats(m),
      }
    })
  }

  switchLeader(slot: number): boolean {
    return this.issue({ t: this.sim?.tick ?? 0, k: 'switch', slot })
  }

  private switchTo(sim: Sim, slot: number): boolean {
    if (this.ending) return false
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
    const root = sim.skills[slot]
    // 轮流出手的看轮到的那一式；装上的定义按像素算，瞄准线换回格
    const cur = root === undefined ? undefined : turnOf(sim, root)
    const now = cur === undefined ? undefined : abilityDef[cur]
    const open = root === undefined ? 0 : openStage(sim, root)
    return {
      icon: def.skill.icon,
      name: def.skill.name,
      emoji: bodyLook[sim.leader] ?? def.emoji,
      remainMs: cur === undefined ? 0 : skillRemainMs(sim, cur),
      cdMs: def.skill.cdMs,
      aim: def.skill.aim,
      rangeU: now ? aimReach(now) / UNIT : aimReach(def.skill.ability),
      charges: cur !== undefined && hasComponent(this.world, cur, Charges) ? Charges.n[cur]! : -1,
      recastMs: open !== 0 ? Math.max(0, Stage.open[open]! - sim.elapsedMs) : 0,
      holdMs: (now ?? def.skill.ability).hold?.maxMs ?? 0,
    }
  }

  castLeaderSkill(dir: Point | null, holdRatio = 0): boolean {
    return this.issue({ t: this.sim?.tick ?? 0, k: 'cast', dir: dir && { x: dir.x, y: dir.y }, hold: holdRatio })
  }

  /** 不给方向就用摇杆方向，摇杆没推就用队长朝向；连段开着时接下一段，轮流出手的放轮到的那一式；按住蓄力的带上蓄了几成 */
  private cast(sim: Sim, dir: Point | null, holdRatio: number): boolean {
    if (sim.over || this.ending || this.skillBlock()) return false
    const leader = sim.leader
    if (!Alive.v[leader] || !Ctl.cast[leader]) return false
    const slot = sim.characters.indexOf(leader)
    const root = sim.skills[slot]
    if (root === undefined) return false
    const e = openStage(sim, root) || turnOf(sim, root)
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

  /** 队伍由沙盒的旋钮给出 */
  get knobs(): boolean {
    return runDef(this.run).team === 'knobs'
  }

  /** 这一阶段没有结束规则，一直打下去 */
  get endless(): boolean {
    return (this.sim ? phaseOf(this.sim.fight) : this.fightDef.phases[0]!).ends.length === 0
  }



  /** 停住时 update 不跑：镜头当场按新尺寸摆好 */
  private onViewportChanged(): void {
    this.map.resize(this.ctx)
    this.framing = this.map.framing(this.ctx)
    this.lens.frame(this.framing)
    this.aimLens(0)
  }















  /** 这一场赢了：打出小结，稍后走到下一步；回放就停在这一刻 */
  private scheduleWaveEnd(): void {
    this.ending = true
    if (this.finishTape()) return
    const sim = this.sim!
    const run = sim.run
    playSfx('wave')
    this.hud.emit(HudEvent.WaveComplete, {
      title: `${this.fightDef.name}完成！`,
      kills: run.kills - this.waveBaseKills,
      coins: run.coins - this.waveBaseCoins,
      reward: rewardText(this.fightDef.reward),
    })
    nextStep(run)
    this.time.delayedCall(WAVE.summaryMs, () => this.settle())
  }

  /** 小结之后走到下一步：地上没捡的升级道具留到下一场 */
  private settle(): void {
    goStep(this, this.run)
  }

  /** 场上每一格此刻站着没有、还剩几成生命 */
  private fieldOf(sim: Sim): FieldMember[] {
    return sim.characters.map((m) => ({ alive: Alive.v[m] === 1, hp: Alive.v[m] === 1 ? Hp.v[m]! / Hp.max[m]! : 0 }))
  }

  /** 队长捡起了升级道具：已经没有能选的就作废，否则战斗停住、弹出升级弹窗；回放不弹窗，录下的领法在下一步之前放进来 */
  private takeLevelUps(sim: Sim): void {
    if (this.choosing || pendingLevelUps(this.run) <= levelUpsOnField(sim).length) return
    const field = this.fieldOf(sim)
    if (!anyChoice(this.run, field)) {
      claim(this.run, { kind: 'skip' })
      return
    }
    if (this.player) return
    this.choosing = true
    openLevelUp(this, { queued: pendingLevelUps(this.run) - levelUpsOnField(sim).length, field })
  }

  /** 从升级弹窗回来：领到的当场生效，录进录像 */
  private onResume(_sys: Phaser.Scenes.Systems, data?: LevelUpResult): void {
    if (!this.choosing) return
    this.choosing = false
    const sim = this.sim
    if (sim && data?.claim) this.issue({ t: sim.tick, k: 'claim', claim: data.claim })
  }

  /** 领一次升级：名单与等级记下，场上的人跟着换、升级、回满 */
  private applyClaim(sim: Sim, c: Claim): void {
    claim(this.run, c)
    switch (c.kind) {
      case 'upgrade':
        relevel(sim, c.slot)
        return
      case 'restore':
        restoreMember(sim, c.slot)
        return
      case 'join':
        if (c.slot === sim.characters.length) joinTeam(sim, c.slot)
        else swapTeam(sim, c.slot)
        return
      case 'skip':
        return
    }
  }


  /** 镜头每帧都要摆：战斗还没开始、已经结束也一样；坐标网格跟着镜头重画 */
  private aimLens(delta: number): void {
    this.lens.setMode(lensMode())
    this.lens.setFollowZoom(this.map.followZoom?.(this.ctx) ?? 1)
    this.lens.step(this.anchor, delta)
    this.drawDevGrid()
  }

  update(_time: number, delta: number): void {
    const sim = this.sim
    if (!this.ready || !sim) {
      this.aimLens(delta)
      return
    }
    if (this.ending) {
      stepFrozen(sim, delta)
      drain(sim.out.events, (es) => feedback(es, this.show))
      presentFrozen(sim)
      this.cues?.step(sim.fxMs)
      this.rings?.step(sim.fxMs)
      this.damageText?.step(sim.fxMs)
      this.aimLens(delta)
      return
    }
    const seen = this.lens.screen.visible()
    sim.view.x = seen.x
    sim.view.y = seen.y
    sim.view.right = seen.x + seen.w
    sim.view.bottom = seen.y + seen.h
    const steps = this.stepsFor(delta)
    const from = sim.tick
    for (let i = 0; i < steps; i++) if (!this.tick(sim)) break
    this.drainOutbox()
    presentFrame(sim, (sim.tick - from) * TICK_MS)
    if (sim.leader !== this.shownLeader) {
      this.shownLeader = sim.leader
      const def = CHARACTERS[this.run.roster[sim.characters.indexOf(sim.leader)]!]
      playSfx('whoosh')
      this.hud.emit(HudEvent.LeaderChanged, { emoji: bodyLook[sim.leader] ?? def.emoji, name: def.name })
    }
    this.cues?.step(sim.fxMs)
    this.rings?.step(sim.fxMs)
    this.damageText?.step(sim.fxMs)
    this.paint?.step(sim)
    this.drawDevTargets(sim)
    this.drawInspected()
    this.drawDevWalls(sim)
    this.drawDevGates(sim)
    this.drawDevHeights(sim)
    this.drawSkillAim(sim)
    const camOff = handoverCamOffset(sim)
    this.anchor.x = leaderX(sim) + camOff.x
    this.anchor.y = leaderY(sim) + camOff.y
    this.aimLens(delta)
    this.map.step(this.ctx, sim, delta)
    this.fog?.show(leaderX(sim), leaderY(sim), sim.fight.rules.vision * UNIT, VISION_FOG_ALPHA)
    const chillTarget = sim.timeStopMsLeft > 0 ? (1 - sim.chrono) * TIMESTOP.chillMaxAlpha : 0
    this.timeStopFxAlpha += (chillTarget - this.timeStopFxAlpha) * Math.min(1, delta / TIMESTOP.fadeMs)
    if (this.timeStopFx) setOverlayFill(this.timeStopFx, TIMESTOP.chillColor, this.timeStopFxAlpha)
  }

  /** 这一帧走几步：攒下的时间按步长四舍五入；落下太多就丢掉，免得越补越卡 */
  private stepsFor(delta: number): number {
    if (this.rate === 0) {
      this.pendingMs = 0
      const n = Math.min(this.queuedSteps, MAX_STEPS_PER_FRAME)
      this.queuedSteps -= n
      return n
    }
    this.pendingMs += delta * this.rate
    const n = Math.round(this.pendingMs / TICK_MS)
    if (n > MAX_STEPS_PER_FRAME) {
      this.pendingMs = 0
      return MAX_STEPS_PER_FRAME
    }
    this.pendingMs -= n * TICK_MS
    return n
  }

  /** 走一步：放进这一步之前的输入，推进模拟，再判胜负、领升级；返回这一帧还能不能接着走 */
  private tick(sim: Sim): boolean {
    this.feed(sim)
    if (this.ending) return false
    const lastFrame = stepFrame(sim)
    this.recorder?.check(sim)
    this.player?.check(sim)
    if (sim.over) {
      this.lose('全军覆没')
      return false
    }
    // 须在全灭判定之后：时限内全灭判负
    const verdict = fightVerdict(sim, lastFrame)
    if (verdict?.win) {
      settleWave(sim)
      this.scheduleWaveEnd()
      return false
    }
    if (verdict) {
      this.lose(verdict.reason)
      return false
    }
    this.takeLevelUps(sim)
    return !this.choosing
  }

  /** 放进第 sim.tick 步之前的输入：回放照录像放，平时读键盘与摇杆并录下 */
  private feed(sim: Sim): void {
    const player = this.player
    if (player) {
      for (const e of player.due(sim.tick)) this.apply(sim, e)
      const m = player.move()
      this.steer(sim, m.x, m.y, m.raw)
      return
    }
    const kx =
      (held(this.cursors?.left) || held(this.wasd?.A) ? -1 : 0) +
      (held(this.cursors?.right) || held(this.wasd?.D) ? 1 : 0)
    const ky =
      (held(this.cursors?.up) || held(this.wasd?.W) ? -1 : 0) +
      (held(this.cursors?.down) || held(this.wasd?.S) ? 1 : 0)
    const keyed = kx !== 0 || ky !== 0
    const stick = hudMoveVector()
    const dir = keyed ? norm(kx, ky) : stick
    const raw = keyed ? 1 : Math.min(1, Math.hypot(stick.x, stick.y))
    this.recorder?.poll(sim.tick)
    this.recorder?.move(sim.tick, dir.x, dir.y, raw)
    this.steer(sim, dir.x, dir.y, raw)
  }

  private steer(sim: Sim, x: number, y: number, raw: number): void {
    sim.teamDir.x = x
    sim.teamDir.y = y
    sim.moveInputRaw = raw
  }

  /** 实时的一条输入：放成了就录进录像；回放时只认录像里的 */
  private issue(e: Exclude<TapeEvent, { k: 'move' | 'settings' }>): boolean {
    const sim = this.sim
    if (!sim || this.player) return false
    this.recorder?.poll(sim.tick)
    if (!this.apply(sim, e)) return false
    this.recorder?.push(e)
    return true
  }

  /** 放进一条输入：实时与回放走同一条路；返回放没放成 */
  private apply(sim: Sim, e: Exclude<TapeEvent, { k: 'move' | 'settings' }>): boolean {
    switch (e.k) {
      case 'cast':
        return this.cast(sim, e.dir, e.hold)
      case 'switch':
        return this.switchTo(sim, e.slot)
      case 'dev':
        this.devApply(sim, e.cmd)
        return true
      case 'claim':
        this.applyClaim(sim, e.claim)
        return true
    }
  }

  /** 这一场打完：录像记下最后的校验值，回放比对；返回是不是在回放 */
  private finishTape(): boolean {
    const sim = this.sim!
    this.recorder?.finish(sim)
    const player = this.player
    if (!player) return false
    player.finish(sim)
    console.info(this.tapeText())
    return true
  }

  tapeText(): string {
    const sim = this.sim
    const p = this.player
    if (p) {
      const t = sim?.tick ?? 0
      const verdict =
        p.divergedAt !== null
          ? `从第 ${p.divergedAt} 步起对不上`
          : sim && p.beyond(sim)
            ? `录到的 ${p.tape.ticks} 步都对得上，再往后没有可比的`
            : `对得上 · 比对了 ${p.matched} 处`
      return `回放 · 第 ${t}/${p.tape.ticks} 步${p.over ? ' · 已打完' : ''}\n${verdict}`
    }
    const tape = this.recorder?.tape
    if (!tape) return '战斗还没开始'
    return `录制 · 第 ${tape.ticks} 步${tape.final !== null ? ' · 已打完' : ''}\n${tape.events.length} 条输入 · ${tape.checks.length} 个校验值`
  }

  /** 这一局输了：停在此刻，稍后去结算；回放就停在这一刻 */
  private lose(reason: string): void {
    this.ending = true
    if (this.finishTape()) return
    this.run.combatMs += this.sim!.elapsedMs
    playSfx('over')
    this.time.delayedCall(900, () => this.scene.start(SceneKey.Result, { win: false, reason }))
  }
}

/** 在深海打的一局：潜艇的倒计时 */
function submarineSnapshot(sim: Sim): SubmarineSnapshot | null {
  const deep = sim.worldState.deep
  const cfg = MAPS[sim.mapId].deep
  if (!deep || !cfg) return null
  const c = subCountdown(deep.sub, cfg, sim.elapsedMs)
  return { phase: c.phase, ratio: c.ratio, inSec: c.leftMs / 1000 }
}

/** 新一幕开演以后，幕名在换幕盘下面写这么久，毫秒 */
const STAGE_TITLE_MS = 4500
/** 离换幕不到这么久，换幕盘闪着催人，毫秒 */
const STAGE_WARN_MS = 3000

/** 在舞台里打的一局：换幕的倒计时 */
function stageSnapshot(sim: Sim): StageSnapshot | null {
  const s = sim.worldState.theater
  if (!s) return null
  const c = s.clock
  const fresh = c.phase === 'stand' && c.at < STAGE_TITLE_MS && c.act > 0
  const ch = CHAPTERS[chapterOf(s.stage, c.act)]!
  const title = fresh || c.phase === 'change' ? `第${ch.num}幕 · ${ch.name}` : null
  if (c.phase === 'change') return { phase: 'turn', ratio: 0, inSec: 0, title }
  const left = c.len - c.at
  return { phase: left < STAGE_WARN_MS ? 'warn' : 'stand', ratio: 1 - c.at / c.len, inSec: left / 1000, title }
}
