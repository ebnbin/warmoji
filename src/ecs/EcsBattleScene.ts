import Phaser from 'phaser'
import { viewport } from '../core/apply'
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
import { ECS_SCENE_KEY } from './keys'
import { makeWorld } from './world'
import type { EcsWorld } from './world'
import { query } from 'bitecs'
import {
  Alive,
  Boss,
  Coin,
  Enemy,
  EnemyProj,
  EState,
  Hp,
  MAtkSlow,
  MHp,
  Morph,
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
import type { PendingSpawn, Sim } from './sim'
import { emojiImage } from '../emoji/textures'
import { toPx } from '../battle/px'
import { BOSSES, ELITE, ENEMY_DEFS, SPAWN } from '../enemies/registry'

// ECS 实验战斗场景(宿主壳):Phaser 只做画布/相机/输入/音频宿主;战斗世界(实体+系统+
// 自绘渲染)全在 ECS。P2:有界森林图 + 队伍编队/orbit/游移/跟随弹簧 + 键盘/相机跟随。

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
  /** 时停冷雾遮罩：屏幕固定的大矩形，alpha 由时停态逐帧驱动（越静越浓） */
  private timeStopFx?: Phaser.GameObjects.Rectangle
  private timeStopFxAlpha = 0
  private centerObj!: Phaser.GameObjects.Zone
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
  private mapW = 0
  private mapH = 0

  constructor() {
    super(ECS_SCENE_KEY)
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
    this.mapW = (mapDef.size?.w ?? MAP.width) * UNIT
    this.mapH = (mapDef.size?.h ?? MAP.height) * UNIT
    const margin = MAP.cameraMargin * UNIT

    // 地面:纯色面 + 右下阴影(镜像 ArenaScene.drawFloor)
    const g = this.add.graphics().setDepth(-1)
    const so = 0.25 * UNIT
    g.fillStyle(mapDef.palette.shadow, 1)
    g.fillRect(so, so, this.mapW, this.mapH)
    g.fillStyle(mapDef.palette.map, 1)
    g.fillRect(0, 0, this.mapW, this.mapH)

    const cam = this.cameras.main
    cam.setZoom(viewport.renderScale)
    cam.setBounds(-margin, -margin, this.mapW + margin * 2, this.mapH + margin * 2)

    // 时停冷雾遮罩（镜像 BaseArenaScene：屏幕固定大矩形，任意地图通用）
    this.timeStopFx = this.add
      .rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 6000, 6000, TIMESTOP.chillColor, 0)
      .setScrollFactor(0)
      .setDepth(88)

    const center = { x: this.mapW / 2, y: this.mapH / 2 }
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
    armTeam(this.sim, this, atlas, run, run.testMode)
    const captain = armCaptain(this.sim, this, atlas, run)
    this.captainAbilities = captain.abilities
    this.captainHandle = captain.handle
    for (let i = 0; i < this.sim.members.length; i++) {
      this.hpBars.push(this.add.graphics().setDepth(11))
      this.shownHp.push(-1)
    }
    if (!run.testMode) this.scheduleCarriers()
    // 正常模式 Boss 波开场:预告后投放本图 Boss(镜像 setup 的 isBossWave 分支)
    if (!run.testMode && isBossWave(run.wave)) {
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
      if (!Alive.v[m]) {
        g.setVisible(false)
        this.shownHp[i] = -1
        continue
      }
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

  /** 地图装饰:按 run 种子随机散布的低透明度 emoji(镜像 ArenaScene.drawDecor),作 ECS 静态实体 */
  private spawnDecor(run: RunState, atlas: EcsAtlas): void {
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
    }
  }
}
