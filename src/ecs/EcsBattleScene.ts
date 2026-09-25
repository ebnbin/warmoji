import Phaser from 'phaser'
import { textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { UNIT } from '../util/units'
import { MEMBER } from '../data/characters'
import { HIT_SHAKE } from '../data/feel'
import { TIMESTOP } from '../data/timeStop'
import { burstEmitter, setOverlayFill } from '../util/fx'
import { CueLayer } from './render/cues'
import { RingLayer } from './render/rings'
import { DamageTextLayer } from './render/damageText'
import { loadSettings } from '../save/settings'
import { browserStorage } from '../util/storage'
import { UI_FONT, FONT } from '../util/fonts'
import { norm } from '../util/vec'
import { applyBackground } from '../util/background'
import { mainCameraOnly } from '../util/camera'
import { playSfx } from '../audio/sfx'
import { OUTLINED_EMOJIS, PLAIN_EMOJIS } from '../manifest'
import { getRun, teamStep } from '../run/state'
import type { RunState } from '../run/state'
import { bossFor, MAPS } from '../data/maps'
import { BATTLE_SCENE_KEY, SANDBOX_SCENE_KEY } from './keys'
import { makeWorld } from './world'
import type { EcsWorld } from './world'
import { hasComponent, query } from 'bitecs'
import { Alive, Boss, Dormant, Enemy, GrantCoins, Hp, CharHp, PICKUP_SET, Projectile, Revive, Transform } from './components'
import { EcsAtlas } from './atlas'
import { EcsSpriteBatch, SPRITE_BANDS } from './render/spriteBatch'
import { remapSim } from './systems/shared/remap'
import { viewFor } from './views'
import type { MapView, ViewCtx } from './views'
import { makeSim } from './sim'
import { modDef } from './store'
import { resetEntityStorage } from './storage'
import { armCaptain, armTeam } from './entities/loadout'
import { requestCast } from './systems/shared/ability'
import { stepFrame } from './systems/pipeline/frame'
import { replayDeath } from './systems/shared/death'
import { spawnBoss, spawnSurge } from './entities/enemy'
import { scheduleCarrier } from './entities/schedule'
import { telegraphCount } from './entities/telegraph'
import { activeMods } from './entities/modifier'
import { Lifetime, Modifier } from './components'

import { initialLayout, stepFrozenVisuals, worldTimeScale } from './sim'
import { settleWave } from './systems/shared/wave'
import { isBossWave, isEliteWave, waveAt, waveDurationMs, WAVE } from '../data/waves'
import { xpToNext } from '../run/xp'
import { CAPTAINS } from '../data/captains'
import { aggregateTeamCards } from '../data/cards'
import type { TeamEffects } from '../types/items'
import { INVINCIBLE_HP, spawnParams, sandboxInvincible } from './sandbox/knobs'
import { tickSkillCd } from '../run/state'
import { hudMoveVector, setActiveHudHost } from '../run/hudHost'
import type { HudHost } from '../run/hudHost'
import type { HudSnapshot, WaveSummary } from '../run/hudHost'
import type { Sim } from './sim'
import { drain } from './outbox'
import type { Burst } from './outbox'
import { rollWaveCarriers } from './utils/battleFx'
import { centerX, centerY } from './utils/team'

/** Boss 倒下到结算的视觉等待，让碎块飞散可见 */
const BOSS_SETTLE_MS = 700

function held(key?: Phaser.Input.Keyboard.Key): boolean {
  return key?.isDown ?? false
}

function liveCoins(world: EcsWorld): number {
  let n = 0
  for (const eid of query(world, PICKUP_SET as unknown as object[])) {
    if (hasComponent(world, eid, GrantCoins)) n++
  }
  return n
}

export class EcsBattleScene extends Phaser.Scene implements HudHost {
  private world!: EcsWorld
  private map!: MapView
  private ctx!: ViewCtx
  private atlas?: EcsAtlas
  private cues?: CueLayer
  private rings?: RingLayer
  private sim?: Sim
  private ready = false
  sandbox = false
  run!: RunState
  /** 开局定 */
  private teamFx!: TeamEffects
  /** 置位后 update 早退 */
  private ending = false
  /** 本波开场基线，波末取增量 */
  private waveBaseKills = 0
  private waveBaseCoins = 0
  private waveBaseLevel = 1
  private hpBars: Phaser.GameObjects.Graphics[] = []
  private shownHp: number[] = []
  /** 仅整秒变化时重设文本 */
  private deadTexts: Phaser.GameObjects.Text[] = []
  private shownCountdown: number[] = []
  private hitShakeOn = false
  private seenHitCount = 0
  /** Boss 倒下时的 fxMs；-1 = 未倒下 */
  private bossDownAt = -1
  private damageText?: DamageTextLayer
  private deathBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private coinBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private puffBurst!: Phaser.GameObjects.Particles.ParticleEmitter
  private timeStopFx?: Phaser.GameObjects.Rectangle
  private timeStopFxAlpha = 0
  private centerObj!: Phaser.GameObjects.Zone
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
  private mapW = 0
  private mapH = 0
  /** 每次 create 递增；boot 等完图集后据此判断自己是否已过期 */
  private bootGen = 0

  constructor() {
    super(BATTLE_SCENE_KEY)
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
    this.waveBaseLevel = 1
    this.hpBars = []
    this.shownHp = []
    this.deadTexts = []
    this.shownCountdown = []
    this.seenHitCount = 0
    this.bossDownAt = -1
    this.damageText = undefined
    this.timeStopFx = undefined
    this.timeStopFxAlpha = 0
  }

  create(): void {
    this.resetSceneFields()
    this.world = makeWorld()

    const run = getRun()
    this.run = run
    this.sandbox = run.sandbox
    this.teamFx = aggregateTeamCards(run.teamCards)
    const mapDef = MAPS[run.mapId]
    applyBackground(mapDef.palette)
    this.map = viewFor(run.mapId)
    this.ctx = { scene: this, world: this.world, run, def: mapDef, anchor: undefined as never, w: 0, h: 0 }
    const { w, h, origin } = this.map.layout(this.ctx)
    this.ctx.w = this.mapW = w
    this.ctx.h = this.mapH = h
    this.map.build(this.ctx)

    this.centerObj = this.add.zone(origin.x, origin.y, 1, 1)
    ;(this.ctx as { anchor: Phaser.GameObjects.Zone }).anchor = this.centerObj
    this.map.camera(this.ctx)

    this.timeStopFx = mainCameraOnly(
      this.add
        .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 6000, 6000, TIMESTOP.chillColor, 0)
        .setScrollFactor(0)
        .setDepth(88),
    )

    this.cursors = this.input.keyboard?.createCursorKeys()
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D') as
      | Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
      | undefined

    const hint = mainCameraOnly(
      this.add
        .text(viewport.logicalWidth / 2, 40, '构建图集…', {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
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

    setActiveHudHost(this) // 须先登记再拉起 HUD
    this.scene.launch('ui')
    this.scene.launch(SANDBOX_SCENE_KEY)
    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bootGen++ // 在途的 boot 作废
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      this.scene.stop('ui')
      this.scene.stop(SANDBOX_SCENE_KEY)
      this.atlas?.dispose()
      this.cues?.destroy()
      this.rings?.destroy()
      this.damageText?.destroy()
      this.map.destroy(this.ctx)
    })

    // ESC 已绑定在 UIScene 上，此处不得再接
  }

  private async boot(gen: number, run: RunState, hint: Phaser.GameObjects.Text): Promise<void> {
    const atlas = await EcsAtlas.build(this, OUTLINED_EMOJIS, PLAIN_EMOJIS)
    // 场景关闭或重开后本次 boot 作废；暂停不作废
    if (gen !== this.bootGen) return
    this.atlas = atlas
    resetEntityStorage()
    for (const b of SPRITE_BANDS) new EcsSpriteBatch(this, this.world, atlas, b.depth, b.zMin, b.zMax)
    this.cues = new CueLayer(this, this.world)
    this.rings = new RingLayer(this, this.world)
    this.ctx.atlas = atlas
    this.map.decor(this.ctx, atlas)
    this.sandbox = run.sandbox
    const settings = loadSettings(browserStorage())
    this.hitShakeOn = settings.hitShake
    this.deathBurst = burstEmitter(this, [0x8e24aa, 0xab47bc, 0x6a1b9a, 0xf3e5f5], 230)
    this.coinBurst = burstEmitter(this, [0xffb300, 0xffdc5d, 0xfff8e1], 150, 340)
    this.puffBurst = burstEmitter(this, [0x757575, 0x9e9e9e, 0xe0e0e0], 130, 520)
    // 出生点以 centerObj 为准：开局前的视口变化只挪它
    const center = { x: this.centerObj.x, y: this.centerObj.y }
    this.sim = makeSim(this.world, atlas, run, run.sandbox, center, this.mapW, this.mapH, settings.damageNumbers)
    if (this.sim.damageNumbers) this.damageText = new DamageTextLayer(this, this.sim.damageNumbers)
    initialLayout(this.sim)
    this.sim.hooks.onStart(this.sim)
    this.map.onSimReady(this.ctx, this.sim)
    // 亡语须同步重放：同帧先死者的治疗要救得到同伴
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
    if (!run.sandbox && isEliteWave(run.wave)) {
      this.time.delayedCall(600, () => {
        const sim = this.sim
        if (!sim || sim.over) return
        this.events.emit('wave-warning', { title: '精英来袭', sub: '敌人潮涌来，小心金边强敌！' })
        spawnSurge(sim)
      })
    }
    // 先开终波机关，再预告投放 Boss
    if (!run.sandbox && isBossWave(run.wave)) {
      this.sim.hooks.onFinalWave(this.sim)
      this.time.delayedCall(600, () => {
        if (!this.sim || this.sim.over) return
        this.events.emit('wave-warning', {
          title: `${bossFor(run.mapId).name}出现`,
          sub:
            MAPS[run.mapId].finalWaveSub ??
            `击败它，或撑过 ${Math.round(waveDurationMs(run.wave) / 1000)} 秒！`,
        })
        spawnBoss(this.sim)
      })
    }
    this.ready = true
    hint.destroy()
  }


  /** 每种事件一条 drain，收信人没准备好也清空 */
  private drainOutbox(): void {
    const out = this.sim!.out
    drain(out.collects, (defs) => {
      for (const d of defs) {
        this.events.emit('field-collected', { emoji: d.emoji, name: d.name, desc: d.desc, polarity: d.polarity })
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

  /** 比例变化才重绘 */
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

  // ── HudHost ──

  hudSnapshot(): HudSnapshot {
    const sim = this.sim
    const elapsed = sim?.elapsedMs ?? 0
    const boss = sim ? query(this.world, [Enemy, Boss]).find((eid) => Boss.v[eid] === 1) : undefined
    return {
      xp: this.run.xp.xp,
      xpNext: xpToNext(this.run.xp.level),
      kills: this.run.kills,
      coins: this.run.coins,
      wave: this.run.wave,
      seconds: Math.floor(elapsed / 1000),
      remainMs: Math.max(0, waveDurationMs(this.run.wave) - elapsed),
      bossHp: boss !== undefined ? Hp.v[boss]! : null,
      bossMaxHp: bossFor(this.run.mapId).hp,
      battleFx: (sim ? activeMods(sim) : []).map((e) => ({
        emoji: modDef[e]!.emoji,
        polarity: modDef[e]!.polarity,
        remainMs: Math.max(0, Lifetime.until[e]! - elapsed),
        totalMs: Modifier.totalMs[e]!,
      })),
    }
  }

  skillSnapshot(): { remainMs: number; cdMs: number } {
    const s = CAPTAINS[this.run.captainId].skill
    return {
      remainMs: this.run.skillCdMs,
      cdMs: s.cdMs * this.teamFx.skillCdMul,
    }
  }

  perfSnapshot(): {
    enemies: number
    projectiles: number
    coins: number
    pending: number
    objects: number
    spawnIntervalMs: number
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
      spawnIntervalMs: Math.round(this.sandbox ? spawnParams().intervalMs : wave.spawnIntervalMs),
    }
  }

  castSkill(): boolean {
    const sim = this.sim
    // ending 期间放技能只会白白重置 CD
    if (!sim || sim.over || this.ending || this.run.skillCdMs > 0) return false
    const s = CAPTAINS[this.run.captainId].skill
    this.run.skillCdMs = s.cdMs * this.teamFx.skillCdMul
    playSfx('levelup')
    this.events.emit('skill-cast', s.name)
    requestCast(sim, sim.captain)
    return true
  }

  applySandboxInvincible(): void {
    const sim = this.sim
    if (!sim) return
    const mh = sandboxInvincible() ? INVINCIBLE_HP : MEMBER.maxHp
    for (const m of sim.characters) {
      CharHp.max[m] = mh
      CharHp.hp[m] = sandboxInvincible() ? mh : Math.min(CharHp.hp[m]!, mh)
    }
  }



  /** 世界尺寸变了才整体重映射 */
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
      this.centerObj.setPosition(centerX(sim), centerY(sim))
    } else {
      this.centerObj.setPosition(origin.x, origin.y)
    }
  }















  /** 均匀撒在本波中前段；第 1 波不出 */
  private scheduleCarriers(): void {
    const sim = this.sim
    if (!sim || this.run.wave < 2) return
    const carriers = rollWaveCarriers(this.run.mapId, this.run.wave, isBossWave(this.run.wave), () => sim.rng.next())
    if (carriers.length === 0) return
    const dur = waveDurationMs(this.run.wave)
    carriers.forEach((pickup, i) => {
      scheduleCarrier(sim, dur * 0.12 + (dur * 0.7 * i) / carriers.length, pickup)
    })
  }

  private scheduleWaveEnd(finished: boolean): void {
    this.ending = true
    const run = this.sim!.run
    playSfx('wave')
    this.events.emit('wave-complete', {
      wave: run.wave - 1,
      kills: run.kills - this.waveBaseKills,
      coins: run.coins - this.waveBaseCoins,
      levels: run.xp.level - this.waveBaseLevel,
    } satisfies WaveSummary)
    this.time.delayedCall(WAVE.summaryMs, () => {
      if (finished) this.scene.start('result', { win: true })
      else if (run.cardDraws > 0) this.scene.start('cards')
      else this.scene.start(teamStep(run) ?? 'shop')
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
    // 越线帧只模拟到时限为止，世界时间恰好停在波末
    const leftMs = this.sandbox ? Infinity : waveDurationMs(sim.run.wave) - sim.elapsedMs
    const lastFrame = sim.wdtMs >= leftMs
    if (lastFrame) sim.wdtMs = leftMs
    const kx =
      (held(this.cursors?.left) || held(this.wasd?.A) ? -1 : 0) +
      (held(this.cursors?.right) || held(this.wasd?.D) ? 1 : 0)
    const ky =
      (held(this.cursors?.up) || held(this.wasd?.W) ? -1 : 0) +
      (held(this.cursors?.down) || held(this.wasd?.S) ? 1 : 0)
    // 技能冷却按真实时钟推进，不随时停拖长
    this.run.skillCdMs = tickSkillCd(this.run.skillCdMs, delta)

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
    // 特效层先 step 再排空（step 写入本帧视觉钟）；排空须先于过场判定
    this.cues?.step(sim.fxMs)
    this.rings?.step(sim.fxMs)
    this.damageText?.step(sim.fxMs)
    this.drainOutbox()
    // 须先于过场判定
    if (sim.characterHitCount > this.seenHitCount) {
      this.seenHitCount = sim.characterHitCount
      if (this.hitShakeOn) this.cameras.main.shake(HIT_SHAKE.durationMs, HIT_SHAKE.intensity)
    }
    this.updateHpBars()
    if (!this.sandbox && sim.bossDown) {
      // 这段延迟内不置 ending，世界照常运转
      sim.bossDown = false
      this.bossDownAt = sim.fxMs
    }
    if (sim.over) {
      this.ending = true
      this.run.combatMs += sim.elapsedMs // 败局也计入
      playSfx('over')
      this.time.delayedCall(900, () => this.scene.start('result', { win: false }))
      return
    }
    this.centerObj.setPosition(centerX(sim), centerY(sim))
    this.map.step(this.ctx, sim, delta)
    const chillTarget = sim.timeStopMsLeft > 0 ? (1 - sim.chrono) * TIMESTOP.chillMaxAlpha : 0
    this.timeStopFxAlpha += (chillTarget - this.timeStopFxAlpha) * Math.min(1, delta / TIMESTOP.fadeMs)
    if (this.timeStopFx) setOverlayFill(this.timeStopFx, TIMESTOP.chillColor, this.timeStopFxAlpha)
    // 结算只在 stepFrame 之后：此前挂上的技能请求都已施放；须在全灭判定之后，时限内全灭判负
    const bossSettle = this.bossDownAt >= 0 && sim.fxMs - this.bossDownAt >= BOSS_SETTLE_MS
    if (lastFrame || bossSettle) this.scheduleWaveEnd(settleWave(sim))
  }
}
