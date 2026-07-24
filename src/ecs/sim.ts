import { UNIT } from '../core/units'
import type { Rng } from '../core/rng'
import { FOLLOW, WANDER } from '../battle/config'
import { ORBIT } from '../characters/orbit'
import { TEAM, MEMBER } from '../characters/registry'
import { formationPosts, ringPostAngle } from '../characters/formation'
import type { FormationId } from '../characters/formation'
import { angleDiff, orbitTendency, pickDriver, stepPhase, threatWeight } from '../characters/orbit'
import type { OrbitThreat } from '../characters/orbit'
import { Alive, Depth, Follow, Threat, Transform, Wander } from './components'
import { steerEnemies, updateFrameTargets } from './enemy'
import { memberContact, memberVisual, reviveMembers, tickPoison } from './combat'
import { updateEnemyProjectiles, updateProjectiles } from './projectile'
import type { EcsWorld } from './world'
import type { Point } from '../core/vec'
import type { EffectCtx, TargetInfo } from '../abilities/types'

// ECS 战斗仿真状态 + 系统(纯逻辑,禁 phaser)。数学逐行镜像旧 BaseArenaScene 的
// updateOrbit / moveTeam / layoutTeam,常量与公式不变,只把「读写精灵」换成「读写组件」。

export interface Sim {
  world: EcsWorld
  /** 队伍中心(世界坐标) */
  center: { x: number; y: number }
  /** 环相位(可旋转环整体转动) */
  orbitPhase: number
  driverPost: number
  /** 本帧移动方向(输入系统写:键盘归一或摇杆向量) */
  teamDir: { x: number; y: number }
  /** 本帧移动量 0..1(键盘满推=1,摇杆取模长):供时停时标 */
  moveInputRaw: number
  /** 队伍移速(世界像素/秒) */
  moveSpeed: number
  formation: FormationId
  /** 阵容人数 */
  count: number
  /** 槽位 → 岗位 */
  postBySlot: number[]
  /** 槽位 → 环上秉性(避敌/迎敌) */
  lineupOrbit: number[]
  /** eid,按槽位序(稳定迭代) */
  members: number[]
  mapId: import('../maps/registry').MapId
  mapW: number
  mapH: number
  elapsedMs: number
  /** 本帧威胁点(敌人位置) */
  frameTargets: Point[]
  /** 累计击杀 */
  kills: number
  /** 全队阵亡(游戏结束标记;结算页在 P4) */
  over: boolean
  /** 本帧敌方存活快照(能力索敌共享;wire 每帧重建) */
  enemyTargets: TargetInfo[]
  /** 本帧队员存活快照(敌方能力索敌共享;enemyWire 每帧重建) */
  memberTargets: TargetInfo[]
  /** 敌人行为随机源(游荡换向/生成等;按 run 种子确定) */
  rng: Rng
  /** 波次/累计战斗时长(难度曲线) */
  wave: number
  combatMs: number
  /** 刷怪冷却 + 预告中待落地的敌人(telegraph 延迟) */
  spawnCooldownMs: number
  pendingSpawns: PendingSpawn[]
  /** 队伍侧共享效果执行面(抛射物 onHit 命中链复用;armTeam 后由场景注入) */
  effectCtx?: EffectCtx
}

/** 预告中待落地的敌人 */
export interface PendingSpawn {
  def: import('../enemies/registry').EnemyDef
  x: number
  y: number
  hp: number
  elite: boolean
  boss: boolean
  at: number
}

/** 队伍活感·探测与轨道(镜像 updateOrbit):逐员判定探测范围内有无敌人 + 环上主力驱动共享相位 */
function updateOrbit(sim: Sim, delta: number): void {
  const { count, formation } = sim
  if (sim.members.length === 0) return
  const range = ORBIT.detectRange * UNIT
  const rangeSq = range * range
  const wants = new Array<number>(sim.members.length).fill(0)
  let rotatable = false
  for (let slot = 0; slot < sim.members.length; slot++) {
    const eid = sim.members[slot]!
    Threat.v[eid] = 0
    if (!Alive.v[eid]) continue
    const bias = sim.lineupOrbit[slot] ?? 0
    const idx = sim.postBySlot[slot] ?? slot
    const base = ringPostAngle(formation, idx, count)
    if (base !== null) rotatable = true
    const theta = (base ?? 0) + sim.orbitPhase
    const threats: OrbitThreat[] = []
    for (const t of sim.frameTargets) {
      const dx = t.x - Transform.x[eid]!
      const dy = t.y - Transform.y[eid]!
      const dSq = dx * dx + dy * dy
      if (dSq >= rangeSq) continue
      Threat.v[eid] = 1
      if (base === null || bias === 0) break
      threats.push({
        diff: angleDiff(theta, Math.atan2(t.y - sim.center.y, t.x - sim.center.x)),
        weight: threatWeight(Math.sqrt(dSq), range),
      })
    }
    if (base !== null && bias !== 0) wants[idx] = orbitTendency(bias, threats)
  }
  if (!rotatable) return
  sim.driverPost = pickDriver(
    wants.map((w) => Math.abs(w)),
    Math.random,
  )
  sim.orbitPhase = stepPhase(sim.orbitPhase, sim.driverPost >= 0 ? (wants[sim.driverPost] ?? 0) : 0, delta)
}

/** 有界世界:队伍中心钳在盒内(镜像 ArenaScene.constrainTeam;断壁/漂移等后续世界钩子再叠) */
function constrainTeam(sim: Sim, next: Point): Point {
  const clampMin = (TEAM.ringRadius + MEMBER.radius) * UNIT
  return {
    x: Math.min(Math.max(next.x, clampMin), sim.mapW - clampMin),
    y: Math.min(Math.max(next.y, clampMin), sim.mapH - clampMin),
  }
}

/** 队伍位移 + 布局(镜像 moveTeam→layoutTeam) */
function moveTeam(sim: Sim, delta: number): void {
  const dir = sim.teamDir
  const step = (sim.moveSpeed * delta) / 1000
  const next = constrainTeam(sim, { x: sim.center.x + dir.x * step, y: sim.center.y + dir.y * step })
  sim.center.x = next.x
  sim.center.y = next.y
  layout(sim, delta)
}

/** 逐员:岗位偏移 + 待机游移 + 跟随弹簧 → 写 Transform/Depth(镜像 layoutTeam) */
function layout(sim: Sim, delta: number): void {
  const posts = formationPosts(sim.formation, sim.count, sim.orbitPhase)
  const moving = sim.teamDir.x !== 0 || sim.teamDir.y !== 0
  const dt = Math.min(delta, 50) / 1000
  const tSec = sim.elapsedMs / 1000
  for (let slot = 0; slot < sim.members.length; slot++) {
    const eid = sim.members[slot]!
    const idx = sim.postBySlot[slot] ?? slot
    const p = posts[idx] ?? { x: 0, y: 0 }
    const wanderOn = Alive.v[eid]! && !moving && !Threat.v[eid]
    let amp = Wander.amp[eid]!
    amp += ((wanderOn ? 1 : 0) - amp) * Math.min(1, delta / WANDER.rampMs)
    Wander.amp[eid] = amp
    const wander = amp * WANDER.radius
    const seed = Wander.seed[eid]!
    const tx = sim.center.x + p.x + Math.sin(tSec * WANDER.freqX + seed) * wander
    const ty = sim.center.y + p.y + Math.sin(tSec * WANDER.freqY + seed * 2.3) * wander
    // 跟随弹簧(用局部量演算,避免类型化数组元素的复合赋值歧义)
    let fx = Follow.x[eid]!
    let fy = Follow.y[eid]!
    let fvx = Follow.vx[eid]!
    let fvy = Follow.vy[eid]!
    if (dt > 0) {
      const k = Follow.k[eid]!
      const c = 2 * Math.sqrt(k) * FOLLOW.zeta
      fvx += (k * (tx - fx) - c * fvx) * dt
      fvy += (k * (ty - fy) - c * fvy) * dt
      fx += fvx * dt
      fy += fvy * dt
    }
    const lagX = tx - fx
    const lagY = ty - fy
    const lag = Math.hypot(lagX, lagY)
    if (lag > FOLLOW.maxLag) {
      const pull = 1 - FOLLOW.maxLag / lag
      fx += lagX * pull
      fy += lagY * pull
    }
    Follow.x[eid] = fx
    Follow.y[eid] = fy
    Follow.vx[eid] = fvx
    Follow.vy[eid] = fvy
    Transform.x[eid] = fx
    Transform.y[eid] = fy
    const guarded = sim.formation === 'guard' && idx === 0
    Depth.z[eid] = guarded ? 8.5 : 10 + (fy - sim.center.y) / UNIT
  }
}

/** 首帧前把队员摆到岗位(镜像 setup 里的 layoutTeam(0)) */
export function initialLayout(sim: Sim): void {
  layout(sim, 0)
}

/** 一帧仿真(镜像 update 的 updateOrbit→moveTeam→steerEnemies 次序);delta 为真实帧长(ms) */
export function stepSim(sim: Sim, delta: number): void {
  sim.elapsedMs += delta
  // 敌人位置汇入 frameTargets(队伍 orbit/游移门控据此),先于 orbit
  updateFrameTargets(sim)
  updateOrbit(sim, delta)
  moveTeam(sim, delta)
  reviveMembers(sim)
  tickPoison(sim)
  steerEnemies(sim, delta)
  updateProjectiles(sim, delta)
  updateEnemyProjectiles(sim, delta)
  memberContact(sim)
  memberVisual(sim)
}
