import { addComponent, addEntity, query } from 'bitecs'
import { AI, ELITE, SPAWN, SURGE } from '../../data/enemies'
import type { EnemyDef, LocomotionDef } from '../../types/enemies'
import { waveAt } from '../../data/waves'
import {
  Alive,
  Anim,
  BaseOrbit,
  Boss,
  BreaksWalls,
  BVel,
  Chase,
  CoinThief,
  Dash,
  DashDetect,
  DashDist,
  DashTime,
  DashTimer,
  Detonate,
  Flee,
  Roam,
  Slowed,
  Standoff,
  Stationary,
  Steering,
  Charge,
  Depth,
  Despawn,
  DmgMul,
  Dormant,
  EDir,
  Elite,
  Enemy,
  ENEMY_SET,
  EnemyArm,
  EnemyPhase,
  EState,
  ETurn,
  Flash,
  Hp,
  Kv,
  Morph,
  Nest,
  Orphan,
  Poison,
  Pop,
  Quad,
  Radius,
  Slide,
  Slow,
  Speed,
  SpMul,
  Sprite,
  Thief,
  Tint,
  Transform,
} from '../components'
import { enemyCarries, enemyDef } from '../store'
import { armIdle } from '../systems/shared/anim'
import { ANIM_DEF } from '../../emoji/anim'
import type { Sim } from '../sim'
import type { FrameIndex } from '../frames'
import { toPx } from '../../war/px'
import { bossFor, MAPS } from '../../data/maps'
import type { MapDef } from '../../types/maps'
import { hourAt, isDayAt } from '../../war/maps/daynight'
import type { FieldPickupDef } from '../../types/battlefield'
import { enemyMixAt, pickEnemy } from '../../war/enemyAi'





// 敌人实体的生成:单只 spawnEnemy + 一窝 spawnBrood。
// 行为/转向/回收等系统在 ../enemy.ts。
// 敌人:装配 + 转向(locomotion 状态机 + 击退 + 世界钩子后处理)。

/** 出生时把 locomotion 翻译成组件。**这是 locomotion.kind 在整个生命周期里被读的
 * 唯一一次**——此后各转向系统只问「有没有挂我这个组件」（见 systems/steer*.ts）。
 *
 * **全映射**：LocomotionDef 新增一种而不在此登记 = 编译不过。从前是一条 else-if 链
 * 外加一个兜底 else，`flee` 在类型里声明了、这边却从没实现，被那个 else 静默当成
 * chase 蒙了过去。
 *
 * def 里的**判别联合一律拆成各自的组件**（冲刺的 trigger 与 length），于是
 * `if (trigger.kind === 'timer')` 就此变成 `hasComponent(DashTimer)`。 */
type LocoAttach<K extends LocomotionDef['kind']> = (
  sim: Sim,
  eid: number,
  lm: Extract<LocomotionDef, { kind: K }>,
) => void
const LOCOMOTIONS: { [K in LocomotionDef['kind']]: LocoAttach<K> } = {
  chase: (sim, eid) => addComponent(sim.world, eid, Chase),
  wander: (sim, eid) => addComponent(sim.world, eid, Roam),
  static: (sim, eid) => addComponent(sim.world, eid, Stationary),
  flee: (sim, eid, lm) => {
    addComponent(sim.world, eid, Flee)
    Flee.range[eid] = lm.range
  },
  coinThief: (sim, eid) => addComponent(sim.world, eid, CoinThief),
  standoff: (sim, eid, lm) => {
    addComponent(sim.world, eid, Standoff)
    Standoff.detectRange[eid] = lm.detectRange
    Standoff.standoffDist[eid] = lm.standoffDist
  },
  detonate: (sim, eid, lm) => {
    addComponent(sim.world, eid, Detonate)
    Detonate.triggerRange[eid] = lm.triggerRange
    Detonate.windupMs[eid] = lm.windupMs
    Detonate.blastRadius[eid] = lm.blastRadius
    Detonate.blastDamage[eid] = lm.blastDamage
    // def 还有个 knockback，自爆从来没用过它——不抄进组件，免得看着像还有人读
  },
  baseOrbit: (sim, eid, lm) => {
    addComponent(sim.world, eid, BaseOrbit)
    BaseOrbit.orbitRadius[eid] = lm.orbitRadius
    BaseOrbit.aggroRange[eid] = lm.aggroRange
    // 暴走倍率随子敌走：拆巢时直接叠，不必回头查它的走位是什么
    addComponent(sim.world, eid, Orphan)
    Orphan.speedMul[eid] = lm.orphanSpeedMul
    Orphan.damageMul[eid] = lm.orphanDamageMul
  },
  dash: (sim, eid, lm) => {
    addComponent(sim.world, eid, Dash)
    Dash.windupMs[eid] = lm.windupMs
    Dash.dashSpeed[eid] = lm.dashSpeed
    Dash.idleChase[eid] = lm.idle === 'chase' ? 1 : 0
    Dash.aimTeamCenter[eid] = lm.aim === 'teamCenter' ? 1 : 0
    Dash.lockAtLaunch[eid] = lm.lockAt === 'launch' ? 1 : 0
    Dash.whoosh[eid] = lm.sfx ? 1 : 0
    // idle 走 chase 的从「追」态起步
    EState.v[eid] = lm.idle === 'chase' ? 1 : 0
    if (lm.trigger.kind === 'timer') {
      addComponent(sim.world, eid, DashTimer)
      DashTimer.intervalMs[eid] = lm.trigger.intervalMs
      // 定时冲刺出生即预约第一次起冲
      Charge.nextDashAt[eid] = sim.elapsedMs + (lm.trigger.firstDelayMs ?? lm.trigger.intervalMs)
    } else {
      addComponent(sim.world, eid, DashDetect)
      DashDetect.range[eid] = lm.trigger.range
      DashDetect.cooldownMs[eid] = lm.trigger.cooldownMs
    }
    if (lm.length.kind === 'time') {
      addComponent(sim.world, eid, DashTime)
      DashTime.durationMs[eid] = lm.length.durationMs
    } else {
      addComponent(sim.world, eid, DashDist)
      DashDist.dist[eid] = lm.length.dist
    }
  },
}

/** 装配一个敌人实体(px 化 def),返回 eid */
export function spawnEnemy(
  sim: Sim,
  atlas: FrameIndex,
  def: EnemyDef,
  x: number,
  y: number,
  hp: number,
  elite: boolean,
  boss: boolean,
  /** 目标透明度(亡语诱饵尸壳半透明;入场弹入收敛到它而非恒 1) */
  alpha = 1,
): number {
  const world = sim.world
  const outline = elite || boss ? 'elite' : 'enemy'
  const size = def.size * (elite ? ELITE.sizeMul : 1)
  const eid = addEntity(world)
  addComponent(world, eid, Enemy)
  addComponent(world, eid, Alive)
  addComponent(world, eid, Transform)
  addComponent(world, eid, Speed)
  addComponent(world, eid, Hp)
  addComponent(world, eid, EState)
  addComponent(world, eid, Elite)
  addComponent(world, eid, Boss)
  addComponent(world, eid, Radius)
  addComponent(world, eid, DmgMul)
  addComponent(world, eid, SpMul)
  addComponent(world, eid, Kv)
  addComponent(world, eid, Slide)
  addComponent(world, eid, Dormant)
  addComponent(world, eid, Flash)
  addComponent(world, eid, Slow)
  addComponent(world, eid, Poison)
  addComponent(world, eid, Charge)
  addComponent(world, eid, Despawn)
  addComponent(world, eid, Morph)
  addComponent(world, eid, EDir)
  addComponent(world, eid, ETurn)
  // 转向的每帧派生量：走位系统的 query 认这几个，漏挂就是「敌人一动不动」
  addComponent(world, eid, BVel)
  addComponent(world, eid, Slowed)
  addComponent(world, eid, Steering)
  addComponent(world, eid, Anim)
  addComponent(world, eid, Sprite)
  addComponent(world, eid, Tint)
  addComponent(world, eid, Depth)
  // 出生落点过世界钩子(镜像 materializeEnemy 的 constrainEnemyPos):
  // 分裂/子敌贴岸溅出等边缘情况在出生帧就位,不必等下一帧才被拉回
  const born = sim.hooks.constrainSpawn(sim, x, y, def.radius)
  Transform.x[eid] = born.x
  Transform.y[eid] = born.y
  Transform.rot[eid] = 0
  // 入场弹入(镜像 materializeEnemy 的 scale/alpha tween):Boss 更慢更弹,普通怪快而线性
  Transform.w[eid] = size * (boss ? 0.2 : 0.3)
  Transform.h[eid] = Transform.w[eid]!
  Speed.v[eid] = def.speed
  Hp.v[eid] = hp
  Hp.max[eid] = hp
  EState.v[eid] = 0
  Charge.windupUntil[eid] = 0
  Charge.dashUntil[eid] = 0
  Charge.coolUntil[eid] = 0
  Charge.nextDashAt[eid] = 0
  BVel.x[eid] = 0
  BVel.y[eid] = 0
  Slowed.v[eid] = 1
  Steering.v[eid] = 0
  ;(LOCOMOTIONS[def.locomotion.kind] as LocoAttach<LocomotionDef['kind']>)(sim, eid, def.locomotion)
  if (def.breaksWalls) addComponent(world, eid, BreaksWalls)
  Despawn.at[eid] = 0
  Morph.until[eid] = 0
  Morph.vuln[eid] = 1
  Morph.cdUntil[eid] = 0
  Thief.eaten[eid] = 0
  Thief.nextEatAt[eid] = 0
  enemyCarries[eid] = undefined // 携带者由 spawnCarrier 落地后覆写
  Elite.v[eid] = elite ? 1 : 0
  Boss.v[eid] = boss ? 1 : 0
  Radius.v[eid] = def.radius
  DmgMul.v[eid] = elite ? ELITE.damageMul : 1
  SpMul.v[eid] = elite ? ELITE.speedMul : 1
  Nest.of[eid] = -1 // 非护巢子敌(spawnBrood 会覆盖为巢 eid)
  Nest.nextSpawnAt[eid] = def.spawner ? sim.elapsedMs + (def.spawner.firstDelayMs ?? def.spawner.intervalMs) : 0
  Kv.x[eid] = 0
  Kv.y[eid] = 0
  Slide.x[eid] = 0
  Slide.y[eid] = 0
  Dormant.v[eid] = 0
  EnemyArm.armed[eid] = 0 // eid 复用:新实体须重新装配能力
  // 敌人一并带 Alive:「持有者还在不在场上」对能力系统就此与阵营无关(队员阵亡与敌人离场同构)
  Alive.v[eid] = 1
  Flash.until[eid] = 0
  Slow.until[eid] = 0
  Slow.mul[eid] = 1
  Poison.until[eid] = 0
  // 游荡初始方向 + 首次换向(镜像 materializeEnemy 的随机相/换向计时)
  EDir.x[eid] = Math.cos(sim.rng.next() * Math.PI * 2)
  EDir.y[eid] = Math.sin(sim.rng.next() * Math.PI * 2)
  ETurn.at[eid] = sim.elapsedMs + AI.wander.spawnTurnMinMs + sim.rng.next() * AI.wander.spawnTurnJitterMs
  // 首发延迟(镜像 materializeEnemy 的 fireAt;lazy-arm 时喂入能力初始冷却)
  EnemyArm.fireDelayMs[eid] = 900 + sim.rng.next() * 1500
  // 行走摇摆随机相位(镜像 materializeEnemy 的 ph)
  EnemyPhase.v[eid] = sim.rng.next() * Math.PI * 2
  Sprite.frame[eid] = atlas.index(def.emoji, outline)
  Sprite.flipX[eid] = 0
  // 部件动画:idle 常驻翻帧,相位按出生随机相错开(镜像 materializeEnemy 的 anim.setIdle)
  armIdle(eid, def.emoji, outline, Sprite.frame[eid]!, (EnemyPhase.v[eid]! / (Math.PI * 2)) * ANIM_DEF.durMs)
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = boss ? 0.2 : 0.3 // 起点是绝对值,不乘目标 alpha(镜像 materializeEnemy 的 setAlpha)
  Pop.until[eid] = sim.elapsedMs + (boss ? 320 : 130)
  Pop.ms[eid] = boss ? 320 : 130
  Pop.size[eid] = size
  Pop.back[eid] = boss ? 1 : 0
  Pop.alpha[eid] = alpha
  Depth.z[eid] = boss ? 7 : 5
  Quad.v[eid] = 0
  enemyDef[eid] = def
  return eid
}

/** 最近活着的队员位置(镜像 nearestAlive)。距离走世界钩子的差向量——环面上取最短差,
 * 故返回的是「相对 (x,y) 的最近镜像」坐标:下游一律 norm(to - from),数学无需改动 */

/** 生成一窝子敌(镜像 spawnBrood):随机散开 scatter 生成 count 只,血量吃波次曲线。
 * ownerEid≥0 时记为护巢子敌(计入本巢上限 + baseOrbit 绕巢);分裂用 -1(无巢) */
export function spawnBrood(
  sim: Sim,
  atlas: FrameIndex,
  into: EnemyDef,
  count: number,
  cx: number,
  cy: number,
  scatter: number,
  ownerEid: number,
): void {
  const hpMul = waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier
  for (let i = 0; i < count; i++) {
    const ang = sim.rng.next() * Math.PI * 2
    const child = spawnEnemy(
      sim,
      atlas,
      into,
      cx + Math.cos(ang) * scatter,
      cy + Math.sin(ang) * scatter,
      Math.round(into.hp * hpMul),
      false,
      false,
    )
    if (ownerEid >= 0) Nest.of[child] = ownerEid
  }
}

/** 虫巢周期生成(镜像 spawnFromNest):全局在场上限让路 + 本巢上限只补到 maxAlive。
 * 场景侧驱动(需 atlas);敌人已死清腾出名额自然续生,巢被拆彻底停 */

// ── 刷怪：涌潮 / Boss / 携带者 ──────────────────────────────────────────────────

// 刷怪节奏(常规波次制):随跨波累计战斗时长递增难度,供给随在场人数缩放,Boss 波减压;
// 预告(telegraph)以「延迟落地」建模,视觉标记由场景侧按 pendingSpawns 对帐。
// 试炼场与常规刷怪分道:只补勾选的敌人,密度/难度走场内旋钮。

/** 当前时钟小时(昼夜图用;非昼夜图恒 undefined) */
export function dayNightOf(sim: Sim): { cfg: NonNullable<MapDef['dayNight']>; hour: number } | undefined {
  const cfg = MAPS[sim.mapId].dayNight
  if (!cfg) return undefined
  return { cfg, hour: hourAt((sim.run.combatMs + sim.elapsedMs) / 1000, cfg) }
}

/** 本图当前出怪表(昼夜图按时刻在 dayMix/nightMix 间切换,波内也实时换批) */
export function currentMix(sim: Sim): ReturnType<typeof enemyMixAt> {
  const m = MAPS[sim.mapId]
  const dn = dayNightOf(sim)
  const rows = dn ? ((isDayAt(dn.hour) ? m.dayMix : m.nightMix) ?? m.mix) : m.mix
  return enemyMixAt(rows, sim.run.wave)
}

/** 在场活跃敌人数(休眠者不占刷怪上限,镜像 spawnCapCount) */
export function awakeCount(sim: Sim): number {
  let n = 0
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) if (!Dormant.v[eid]) n++
  return n
}

/** 精英波敌潮(镜像 spawnSurge):在 spreadMs 内均摊排 SURGE.count 只,前 SURGE.elites 只强制金边。
 * 只排「何时出」,落点与出怪表留到各自时刻才现算——镜像旧实现把整个 spawnOne 塞进 delayedCall:
 * 敌潮会追着移动中的队伍铺开,⚠ 预告也一个个亮起,而非开场一次性算死 14 个落点 */
export function spawnSurgeEcs(sim: Sim): void {
  if (sim.over) return
  const hpMul = waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier
  for (let i = 0; i < SURGE.count; i++) {
    sim.pendingSurges.push({
      at: sim.elapsedMs + (i * SURGE.spreadMs) / SURGE.count,
      hpMul,
      forceElite: i < SURGE.elites,
    })
  }
}

/** 生成本图 Boss(镜像 spawnBoss:同一 materialize 管线,boss 标记金边/深度/HUD 血条)。
 * 正常模式的 Boss 波开场调用;测试模式经 __ecsSpawnEnemy(bossKind) 直投 */
export function spawnBossEcs(sim: Sim): void {
  if (sim.over) return
  const def = toPx(bossFor(sim.mapId))
  const pos = sim.hooks.spawnPoint(sim, true)
  // 与普通敌人同一条预告管线,只是标记更大、预告更久(镜像 spawnBoss)
  sim.pendingSpawns.push({
    def,
    x: pos.x,
    y: pos.y,
    hp: def.hp,
    elite: false,
    boss: true,
    at: sim.elapsedMs + SPAWN.telegraphMs * 1.6,
  })
}

/** 投放一名携带者(镜像 spawnCarrier):从当前出怪表取普通怪 + carries 载荷,走同一预告管线。
 * 场上过挤则本次跳过 */
export function spawnCarrierEcs(sim: Sim, pickup: FieldPickupDef): void {
  if (sim.over) return
  if (awakeCount(sim) + sim.pendingSpawns.length >= SPAWN.maxAlive) return
  const def = toPx(pickEnemy(currentMix(sim), () => sim.rng.next()))
  const hp = Math.round(def.hp * waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier)
  const pos = sim.hooks.spawnPoint(sim, false)
  sim.pendingSpawns.push({
    def,
    x: pos.x,
    y: pos.y,
    hp,
    elite: false,
    boss: false,
    at: sim.elapsedMs + SPAWN.telegraphMs,
    carries: pickup,
  })
}

// ── 魔尘变形：换外形与组件 ──────────────────────────────────────────────────

// 魔尘变形(仙子 morph):把敌人变成无害绵羊替身——缴械/无伤/缓速游荡,顶绵羊形象,
// 到期复原。Boss 免疫;同一敌人有冷却(变形期 + 复形后 MORPH_RECAST_CD)。镜像 applyHex/restoreMorph。
// 变形期的移动(半速游荡)在 steerEnemies、受伤倍率/无害在 combat、缴械/复形在 enemyWire。

/** 变形+复形冷却(镜像 ArcadeBattleScene.MORPH_RECAST_CD) */
export const MORPH_RECAST_CD = 5000

/** 施加变形(镜像 applyHex):Boss/冷却中拒绝;换绵羊帧、打断蓄力、清旋转 */
export function applyMorph(
  sim: Sim,
  atlas: FrameIndex,
  eid: number,
  spec: { durationMs: number; morphEmoji: string; vulnMul?: number },
): void {
  if (Boss.v[eid]) return
  if (sim.elapsedMs < Morph.cdUntil[eid]!) return
  const wasMorphed = Morph.until[eid] !== 0
  const until = sim.elapsedMs + spec.durationMs
  Morph.cdUntil[eid] = until + MORPH_RECAST_CD
  Morph.until[eid] = until
  Morph.vuln[eid] = spec.vulnMul ?? 1
  if (!wasMorphed) {
    const outline = Elite.v[eid] ? 'elite' : 'enemy'
    Sprite.frame[eid] = atlas.index(spec.morphEmoji, outline)
    // 动画整套换成替身的 idle 帧(未烘焙则停留静态替身形象)
    armIdle(eid, spec.morphEmoji, outline, Sprite.frame[eid]!, Anim.offset[eid]!)
    // 蓄力中被变形:打断状态机 + 清白闪染色 + 复位旋转
    if (EState.v[eid] === 2) {
      Tint.effect[eid] = 0
      Tint.color[eid] = 0xffffff
    }
    EState.v[eid] = 0
    Transform.rot[eid] = 0
    sim.pendingBursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 8, kind: 'puff' }) // 魔尘灰烟
  }
}

/** 复形(镜像 restoreMorph 的形象部分):换回本体帧;缴械后延由 enemyWire 掌管 */
export function restoreMorphVisual(atlas: FrameIndex, eid: number): void {
  const def = enemyDef[eid]
  if (!def) return
  const outline = Elite.v[eid] ? 'elite' : 'enemy'
  Sprite.frame[eid] = atlas.index(def.emoji, outline)
  armIdle(eid, def.emoji, outline, Sprite.frame[eid]!, Anim.offset[eid]!)
  Morph.until[eid] = 0
}
