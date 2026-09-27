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
import { getRun, INVINCIBLE_HP, nextStep, runDef } from '../run/state'
import { goStep } from '../scene/teamPage'
import type { RunState } from '../run/state'
import { MAPS } from '../data/maps'
import { makeWorld } from './world'
import type { EcsWorld } from './world'
import { hasComponent, query } from 'bitecs'
import { Alive, Boss, Cd, Charges, Ctl, Enemy, ENEMY_SET, FACTION, Faction, Res, Stage, Facing, GrantCoins, Hp, PICKUP_SET, Projectile, Revive, Stats, Tint, Transform, VisOff } from './components'
import { charSize } from './systems/shared/scale'
import { dragging, staminaLeft } from './systems/shared/stamina'
import { STAMINA, staminaTier } from '../data/stamina'
import type { StaminaTier } from '../data/stamina'
import { newEntity } from './entities/entity'
import { attachDrawable } from './entities/drawable'
import { EcsAtlas } from './atlas'
import { EcsSpriteBatch, SPRITE_BANDS } from './render/spriteBatch'
import { remapSim } from './systems/shared/remap'
import { setOverlayFill, viewFor } from './views'
import type { MapView, ViewCtx } from './views'
import { makeSim } from './sim'
import { abilityRequires, bodyLook, modDef, statBase } from './store'
import { foldBody, lastingStats, setStatLayer, statsOf } from './utils/stats'
import { aimAt } from './systems/shared/fire'
import { sourceOf } from './utils/source'
import { resetEntityStorage } from './storage'
import { armTeam, memberGear } from './entities/loadout'
import { requestCast } from './systems/shared/ability'
import { resDef } from './store'
import type { ResourceDef } from '../types/enemies'
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
import { timeLimitMs } from '../data/runs'
import { enterFight } from '../run/flow'
import type { FightDef } from '../types/runs'
import { callSquad, startFight } from './fight/spawns'
import { fightGoals, fightMods, fightVerdict, goalSpot, markFightBase, timeLeftMs } from './fight/state'
import { xpToNext } from '../run/xp'
import { spawnParams } from './sandbox/knobs'
import { HudEvent, hudMoveVector, setActiveHudHost } from '../run/hudHost'
import type { HudEvents, HudHost, LeaderSkill, MemberSheet, SquadSnapshot } from '../run/hudHost'
import type { HudSnapshot } from '../run/hudHost'
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

const showTargets = defineDevFlag({ id: 'battle.targets', group: '战斗', label: '显示队员目标连线', desc: '从每个队员画到其当前目标' })

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

const RES_COLOR: Record<ResourceDef['kind'], number> = { energy: 0xffee58, fury: 0xef5350, heat: 0xff9800, growth: 0x9ccc65 }
const STAMINA_COLOR: Record<StaminaTier, number> = { ok: 0x4dd0e1, slow: 0xffa726, low: 0xef5350 }

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
  private sim?: Sim
  private ready = false
  run!: RunState
  /** 这一场的规则 */
  private fightDef!: FightDef
  private ending = false
  private waveBaseKills = 0
  private waveBaseCoins = 0
  private hpBars: Phaser.GameObjects.Graphics[] = []
  private shownHp: number[] = []
  /** 每名队员头上的 💦：拖慢全队时才显出来 */
  private sweats: number[] = []
  /** 累到减速的敌人头上的 💦，按需从这里取 */
  private foeSweats: number[] = []
  private hitShakeOn = false
  private seenHitCount = 0
  private shownLeader = -1
  private skillAim: Point | null = null
  private aimGfx?: Phaser.GameObjects.Graphics
  private damageText?: DamageTextLayer
  private deathBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private coinBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private puffBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private timeStopFx?: Phaser.GameObjects.Rectangle
  private timeStopFxAlpha = 0
  private camAnchor!: Phaser.GameObjects.Zone
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
  private mapW = 0
  private mapH = 0
  private bootGen = 0
  private devGfx?: Phaser.GameObjects.Graphics
  private goalGfx?: Phaser.GameObjects.Graphics

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
    this.sim = undefined
    this.ready = false
    this.ending = false
    this.waveBaseKills = 0
    this.waveBaseCoins = 0
    this.hpBars = []
    this.shownHp = []
    this.sweats = []
    this.foeSweats = []
    this.seenHitCount = 0
    this.shownLeader = -1
    this.skillAim = null
    this.aimGfx = undefined
    this.damageText = undefined
    this.timeStopFx = undefined
    this.timeStopFxAlpha = 0
    this.devGfx = undefined
    this.goalGfx = undefined
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
    else gainTeamXp(sim, Math.max(1, xpToNext(this.run.xp.level) - this.run.xp.xp))
  }

  devEndWave(): void {
    const sim = this.sim
    if (!sim || sim.over || this.ending || this.endless) return
    settleWave(sim)
    this.scheduleWaveEnd()
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bootGen++
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
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
    for (const b of SPRITE_BANDS) new EcsSpriteBatch(this, this.world, atlas, b.depth, b.zMin, b.zMax)
    this.cues = new CueLayer(this, this.world)
    this.rings = new RingLayer(this, this.world)
    this.ctx.atlas = atlas
    this.map.decor(this.ctx, atlas)
    const settings = loadSettings(browserStorage())
    this.hitShakeOn = settings.hitShake
    this.deathBurst = burstEmitter(this, [0x8e24aa, 0xab47bc, 0x6a1b9a, 0xf3e5f5], 230)
    this.coinBurst = burstEmitter(this, [0xffb300, 0xffdc5d, 0xfff8e1], 150, 340)
    this.puffBurst = burstEmitter(this, [0x757575, 0x9e9e9e, 0xe0e0e0], 130, 520)
    const origin = { x: this.camAnchor.x, y: this.camAnchor.y }
    this.sim = makeSim(this.world, atlas, run, origin, this.mapW, this.mapH, settings.damageNumbers, this.fightDef)
    if (this.sim.damageNumbers) this.damageText = new DamageTextLayer(this, this.sim.damageNumbers)
    this.shownLeader = this.sim.leader
    initialLayout(this.sim)
    this.sim.hooks.onStart(this.sim)
    this.map.onSimReady(this.ctx, this.sim)
    const simRef = this.sim
    simRef.onDeathFx = (d) => replayDeath(simRef, d)
    armTeam(this.sim, run)
    for (let i = 0; i < this.sim.characters.length; i++) {
      this.hpBars.push(this.add.graphics().setDepth(11))
      this.shownHp.push(-1)
      this.sweats.push(this.newSweat())
    }
    startFight(this.sim)
    this.waveBaseKills = run.kills
    this.waveBaseCoins = run.coins
    openWave(this.sim)
    markFightBase(this.sim)
    if (this.fightDef.intro) this.sim.out.banners.push(this.fightDef.intro)
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
      const byKind: Record<Burst['kind'], Phaser.GameObjects.Particles.ParticleEmitter> = {
        death: this.deathBurst,
        coin: this.coinBurst,
        puff: this.puffBurst,
      }
      for (const b of bs) byKind[b.kind]!.explode(b.count, b.x, b.y)
    })
    if (out.flash) {
      this.cues?.screenFlash(out.flash.color, out.flash.alpha, out.flash.durationMs)
      out.flash = null
    }
  }

  /** 一滴 💦：先藏着，要用时再摆到头上 */
  private newSweat(): number {
    const e = newEntity(this.world)
    attachDrawable(this.world, e, this.atlas!, { id: '1f4a6', outline: 'player', x: 0, y: 0, size: 0.42 * UNIT, alpha: 0, z: 29 })
    return e
  }

  /** 把 💦 摆在身体右上方，上下跳着 */
  private placeSweat(sim: Sim, e: number, body: number, size: number): void {
    Transform.x[e] = Transform.x[body]! + VisOff.x[body]! + size * 0.34
    Transform.y[e] = Transform.y[body]! + VisOff.y[body]! - size * 0.42 - Math.abs(Math.sin(sim.fxMs / 160)) * 4
  }

  /** 拖慢全队的队员头上冒 💦 */
  private updateSweat(sim: Sim, i: number, m: number): void {
    const e = this.sweats[i]
    if (e === undefined) return
    const on = dragging(sim, m)
    Tint.alpha[e] = on ? 1 : 0
    if (on) this.placeSweat(sim, e, m, charSize(m))
  }

  /** 累到减速的敌人头上也冒 💦，这是反打的时机；看不清的敌人汗也跟着淡 */
  private updateFoeSweats(): void {
    const sim = this.sim!
    let used = 0
    for (const eid of query(this.world, ENEMY_SET)) {
      if (!Alive.v[eid] || staminaLeft(eid) >= STAMINA.slowFrom) continue
      const e = this.foeSweats[used] ?? this.newSweat()
      if (used === this.foeSweats.length) this.foeSweats.push(e)
      used++
      Tint.alpha[e] = Tint.alpha[eid]!
      this.placeSweat(sim, e, eid, Transform.h[eid]!)
    }
    for (let i = used; i < this.foeSweats.length; i++) Tint.alpha[this.foeSweats[i]!] = 0
  }

  /** 队员的血条与资源条；队长再多一条体力条，满了收起 */
  private updateHpBars(): void {
    const sim = this.sim!
    for (let i = 0; i < sim.characters.length; i++) {
      const m = sim.characters[i]!
      this.updateSweat(sim, i, m)
      const g = this.hpBars[i]
      if (!g) continue
      if (!Alive.v[m]) {
        g.setVisible(false)
        this.shownHp[i] = -1
        continue
      }
      g.setVisible(Tint.alpha[m]! > 0).setPosition(Transform.x[m]! + VisOff.x[m]!, Transform.y[m]! + VisOff.y[m]!)
      const ratio = Math.max(0, Math.min(1, Hp.v[m]! / Hp.max[m]!))
      const res = hasComponent(this.world, m, Res) ? Res.v[m]! / Math.max(1, Res.max[m]!) : -1
      const locked = res >= 0 && sim.elapsedMs < Res.lock[m]!
      const sta = m === sim.leader ? staminaLeft(m) : 1
      const key =
        (Math.round(ratio * 200) * 1000 + (res < 0 ? 999 : Math.round(res * 100)) * 2 + (locked ? Math.floor(sim.fxMs / 150) % 2 : 0)) * 1000 +
        (sta < 1 ? Math.round(sta * 100) : 999)
      if (key === this.shownHp[i]) continue
      this.shownHp[i] = key
      const w = 0.8 * UNIT
      let y = charSize(m) * 0.62
      g.clear()
      g.fillStyle(0x000000, 0.45)
      g.fillRect(-w / 2, y, w, 6)
      g.fillStyle(ratio > 0.5 ? 0x66bb6a : ratio > 0.25 ? 0xffdc5d : 0xef5350, 1)
      g.fillRect(-w / 2 + 1, y + 1, (w - 2) * ratio, 4)
      y += 7
      if (res >= 0) {
        g.fillStyle(0x000000, 0.45)
        g.fillRect(-w / 2, y, w, 5)
        g.fillStyle(locked ? (Math.floor(sim.fxMs / 150) % 2 ? 0xffffff : 0xff5722) : RES_COLOR[resDef[m]!.kind], 1)
        g.fillRect(-w / 2 + 1, y + 1, (w - 2) * res, 3)
        y += 6
      }
      if (sta >= 1) continue
      g.fillStyle(0x000000, 0.45)
      g.fillRect(-w / 2, y, w, 6)
      g.fillStyle(STAMINA_COLOR[staminaTier(sta)], 1)
      g.fillRect(-w / 2 + 1, y + 1, (w - 2) * sta, 4)
    }
  }

  hudSnapshot(): HudSnapshot {
    const sim = this.sim
    const elapsed = sim?.elapsedMs ?? 0
    const boss = sim ? query(this.world, [Enemy, Boss]).find((eid) => Boss.v[eid] === 1) : undefined
    const limit = timeLimitMs(this.fightDef)
    return {
      xp: this.run.xp.xp,
      xpNext: xpToNext(this.run.xp.level),
      kills: this.run.kills,
      coins: this.run.coins,
      label: this.fightDef.name ?? null,
      seconds: Math.floor(elapsed / 1000),
      remainMs: limit === undefined ? null : Math.max(0, limit - elapsed),
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
    const totalSec = (this.run.combatMs + (sim?.elapsedMs ?? 0)) / 1000
    const wave = waveAt(totalSec)
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
    return true
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
    if (!sim || sim.over || this.ending) return false
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
    playSfx('levelup')
    this.hud.emit(HudEvent.SkillCast, def.skill.name)
    return true
  }

  setSkillAim(dir: Point | null): void {
    this.skillAim = dir
  }

  /** 目标在视野外时，在队长身边画一个指过去的箭头 */
  private drawGoalPointer(sim: Sim): void {
    const spot = goalSpot(sim)
    const lx = leaderX(sim)
    const ly = leaderY(sim)
    const d = spot ? sim.hooks.worldDelta(sim, lx, ly, spot.x, spot.y) : null
    const v = sim.view
    if (!d || (lx + d.x >= v.x && lx + d.x <= v.right && ly + d.y >= v.y && ly + d.y <= v.bottom)) {
      this.goalGfx?.clear()
      return
    }
    this.goalGfx ??= this.add.graphics().setDepth(40)
    const g = this.goalGfx
    const u = norm(d.x, d.y)
    const r = charSize(sim.leader) * 0.75 + 0.3 * UNIT
    const tipX = lx + u.x * (r + 0.4 * UNIT)
    const tipY = ly + u.y * (r + 0.4 * UNIT)
    const w = 0.25 * UNIT
    g.clear()
    g.fillStyle(0x000000, 0.35)
    g.fillTriangle(tipX + u.x * 3, tipY + u.y * 3, lx + u.x * r - u.y * (w + 3), ly + u.y * r + u.x * (w + 3), lx + u.x * r + u.y * (w + 3), ly + u.y * r - u.x * (w + 3))
    g.fillStyle(0xffdc5d, 0.95)
    g.fillTriangle(tipX, tipY, lx + u.x * r - u.y * w, ly + u.y * r + u.x * w, lx + u.x * r + u.y * w, ly + u.y * r - u.x * w)
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

  /** 这一场没有结束规则，一直打下去 */
  get endless(): boolean {
    return this.fightDef.ends.length === 0
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
    })
    nextStep(run)
    this.time.delayedCall(WAVE.summaryMs, () => goStep(this, run))
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
    this.updateHpBars()
    this.updateFoeSweats()
    this.drawDevTargets(sim)
    this.drawSkillAim(sim)
    this.drawGoalPointer(sim)
    if (sim.over) {
      this.lose('全军覆没')
      return
    }
    const camOff = handoverCamOffset(sim)
    this.camAnchor.setPosition(leaderX(sim) + camOff.x, leaderY(sim) + camOff.y)
    this.map.step(this.ctx, sim, delta)
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
