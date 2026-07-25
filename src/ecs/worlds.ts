import { UNIT } from '../core/units'
import { TEAM, MEMBER } from '../characters/registry'
import { SPAWN } from '../enemies/registry'
import { randomMapPoint } from '../enemies/spawn'
import { MAPS } from '../maps/registry'
import type { IceConfig, InfiniteConfig, MapId, ShrinkRingConfig, SpaceConfig } from '../maps/registry'
import { approach, onFloe } from '../maps/ice'
import { outsideZone, ringPoint, zoneRadiusAt } from '../maps/world'
import { clampToDisc, confineVelocity, meteorSweep } from '../maps/space'
import { PICKUPS } from '../pickups/registry'
import { query } from 'bitecs'
import { Alive, Boss, Dormant, ENEMY_SET, Slide, Transform } from './components'
import { applyDamage, hurtMember } from './combat'
import type { Sim } from './sim'
import type { Point } from '../core/vec'

// 世界钩子(纯逻辑):各地图与「有界森林」不同的那几处行为,收在这里按 mapId 取一份。
// 旧实现把这些散在 8 个 Scene 子类的 override 里;ECS 侧仿真是纯函数,故改成一张
// 「钩子表」——sim 持有一份,系统在该拐弯的地方调它,默认实现即森林语义,
// 各图只覆写自己不同的那几项(bounded 作基,展开后改写)。
// 只收「行为」钩子;地图专属视觉(水面/缩圈/传送门)仍在场景侧。

export interface WorldHooks {
  /** 队伍位移约束:有界钳制 / 冰面动量积分 / 环面回绕 / 圆盘禁锢。
   * next = 本帧输入想走到的位置;返回实际落点 */
  constrainTeam(sim: Sim, next: Point, delta: number): Point
  /** 敌人落点约束(有界钳制;无界世界原样放行) */
  constrainEnemy(sim: Sim, x: number, y: number): Point
  /** 游荡方向修正:有界图撞边折返(残垣图另加撞墙掉头);无界世界原样放行 */
  wanderDir(sim: Sim, eid: number, dx: number, dy: number): Point
  /** 敌人行为速度的后处理(冰面打滑低通 / 河流漂移);默认原样返回。
   * 击退分量不在此列——要脆要即时,由 steerEnemies 单独叠加 */
  postSteerEnemy(sim: Sim, eid: number, vx: number, vy: number, delta: number): { vx: number; vy: number }
  /** 击退衰减时间常数倍率(冰面低摩擦令击退滑得更远) */
  knockbackTauMul(sim: Sim): number
  /** 金币落点约束(冰面钳进浮冰,免得漂进水里隔着掉血区捡不回) */
  constrainCoin(sim: Sim, x: number, y: number): Point
  /** 敌弹的额外回收条件(有界图出地图即灭;无界世界只按寿命回收) */
  cullEnemyProjectile(sim: Sim, x: number, y: number): boolean
  /** 刷怪落点(有界:图内随机;无限:队伍中心外的环带) */
  spawnPoint(sim: Sim, boss: boolean): Point
  /** 休眠活跃方形的半边长(世界像素):出界的敌人冻结;Infinity = 本图不休眠 */
  activeHalf(sim: Sim): number
  /** 开局(队伍已就位):世界初始状态,如首个周期结算/首颗天体的时刻;默认无 */
  onStart(sim: Sim): void
  /** 终波开场(无限图在此张开缩圈);默认无 */
  onFinalWave(sim: Sim): void
  /** 世界逐帧结算(落水掉血/缩圈掉血等);默认无 */
  tick(sim: Sim, delta: number): void
}

/** 有界世界(森林/晨昏/浮冰共基线):中心钳在盒内、敌人钳在图内、图内随机刷怪、不休眠 */
const bounded: WorldHooks = {
  constrainTeam(sim, next) {
    const clampMin = (TEAM.ringRadius + MEMBER.radius) * UNIT
    return {
      x: Math.min(Math.max(next.x, clampMin), sim.mapW - clampMin),
      y: Math.min(Math.max(next.y, clampMin), sim.mapH - clampMin),
    }
  },
  constrainEnemy(sim, x, y) {
    return {
      x: x < 0 ? 0 : x > sim.mapW ? sim.mapW : x,
      y: y < 0 ? 0 : y > sim.mapH ? sim.mapH : y,
    }
  },
  /** 撞边折返:接近地图边缘时翻转对应方向分量(镜像 ArenaScene.wanderDir) */
  wanderDir(sim, eid, dx, dy) {
    const margin = 0.6 * UNIT
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    return {
      x: (x < margin && dx < 0) || (x > sim.mapW - margin && dx > 0) ? -dx : dx,
      y: (y < margin && dy < 0) || (y > sim.mapH - margin && dy > 0) ? -dy : dy,
    }
  },
  postSteerEnemy(_sim, _eid, vx, vy) {
    return { vx, vy }
  },
  knockbackTauMul() {
    return 1
  },
  constrainCoin(_sim, x, y) {
    return { x, y }
  },
  cullEnemyProjectile(sim, x, y) {
    return x < -UNIT || x > sim.mapW + UNIT || y < -UNIT || y > sim.mapH + UNIT
  },
  spawnPoint(sim, boss) {
    return randomMapPoint(
      sim.rng,
      sim.mapW,
      sim.mapH,
      (boss ? 2 : SPAWN.edgeInset) * UNIT,
      sim.center,
      SPAWN.minPlayerDist * UNIT * (boss ? 1.6 : 1),
    )
  },
  activeHalf() {
    return Infinity
  },
  onStart() {},
  onFinalWave() {},
  tick() {},
}

// ── 浮冰(ice)──────────────────────────────────────────────

function iceCfg(sim: Sim): IceConfig {
  return MAPS[sim.mapId].ice!
}

/** 浮冰边长(世界像素):地图即那块浮冰,故 mapW 就是它 */
function floePx(sim: Sim): number {
  return iceCfg(sim).floeU * UNIT
}

/** 浮冰世界:一切都打滑——队伍与敌人的「行为速度」都走低通(冰上滑、水中迟滞限速),
 * 击退不进低通(要脆)但衰减更慢(低摩擦滑得远);不钳制,可滑出浮冰落水。
 * 刷怪/金币仍按浮冰这块方形算(= bounded 的图内随机),故只覆写打滑与落水那几项 */
const ice: WorldHooks = {
  ...bounded,
  constrainTeam(sim, next, delta) {
    const cfg = iceCfg(sim)
    const dt = delta / 1000
    if (dt <= 0) return { x: sim.center.x, y: sim.center.y }
    // next 即本帧输入想走到的位置,反推「想要的速度」,再以时间常数 tau 缓慢趋近
    const desVx = (next.x - sim.center.x) / dt
    const desVy = (next.y - sim.center.y) / dt
    const on = onFloe(sim.center.x, sim.center.y, floePx(sim))
    const tau = on ? cfg.teamTauIce : cfg.teamTauWater
    const mul = on ? 1 : cfg.waterSpeedMul
    sim.teamVx = approach(sim.teamVx, desVx * mul, dt, tau)
    sim.teamVy = approach(sim.teamVy, desVy * mul, dt, tau)
    return { x: sim.center.x + sim.teamVx * dt, y: sim.center.y + sim.teamVy * dt }
  },
  // 无界:敌人不钳制(滑出浮冰照常,落水自有掉血结算);游荡也不折返(冰缘不是墙)
  constrainEnemy(_sim, x, y) {
    return { x, y }
  },
  wanderDir(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  postSteerEnemy(sim, eid, vx, vy, delta) {
    const cfg = iceCfg(sim)
    const dt = delta / 1000
    if (dt <= 0) return { vx, vy }
    const on = onFloe(Transform.x[eid]!, Transform.y[eid]!, floePx(sim))
    const tau = on ? cfg.enemyTauIce : cfg.teamTauWater
    const mul = on ? 1 : cfg.waterSpeedMul
    const sx = approach(Slide.x[eid]!, vx * mul, dt, tau)
    const sy = approach(Slide.y[eid]!, vy * mul, dt, tau)
    Slide.x[eid] = sx
    Slide.y[eid] = sy
    return { vx: sx, vy: sy }
  },
  knockbackTauMul(sim) {
    return iceCfg(sim).knockbackTauMul
  },
  constrainCoin(sim, x, y) {
    const r = PICKUPS.coin.radius
    const max = floePx(sim) - r
    return { x: Math.min(Math.max(x, r), max), y: Math.min(Math.max(y, r), max) }
  },
  cullEnemyProjectile(sim, x, y) {
    const m = 6 * UNIT
    const px = floePx(sim)
    return x < -m || x > px + m || y < -m || y > px + m
  },
  onStart(sim) {
    sim.worldTickAt = iceCfg(sim).waterTickMs
  },
  /** 落水结算:队伍(按中心)与各敌人(按各自位置)在水里每 tick 掉血,敌我通吃 */
  tick(sim) {
    const cfg = iceCfg(sim)
    if (sim.elapsedMs < sim.worldTickAt) return
    sim.worldTickAt = sim.elapsedMs + cfg.waterTickMs
    const px = floePx(sim)
    const frac = cfg.waterTickMs / 1000
    if (!onFloe(sim.center.x, sim.center.y, px)) {
      const dmg = Math.round(cfg.waterTeamDps * frac)
      for (const m of sim.members) if (Alive.v[m]) hurtMember(sim, m, dmg, '寒水')
    }
    const edmg = Math.round(cfg.waterEnemyDps * frac)
    for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
      if (!onFloe(Transform.x[eid]!, Transform.y[eid]!, px)) applyDamage(sim, eid, edmg)
    }
  },
}

// ── 无限世界(infinite:荒漠)────────────────────────────────

function infCfg(sim: Sim): InfiniteConfig {
  return MAPS[sim.mapId].infinite!
}

function ringCfg(sim: Sim): ShrinkRingConfig {
  return MAPS[sim.mapId].shrinkRing!
}

/** 无限世界:没有边,出生在原点、负坐标合法。队伍/敌人都不钳制;
 * 刷怪落在队伍中心外的环带;远离队伍的敌人休眠(冻结 AI、不占刷怪上限);
 * 终波以进波瞬间的队伍位置张开缩圈,圈外队员按 tick 掉血 */
const infinite: WorldHooks = {
  ...bounded,
  constrainTeam(_sim, next) {
    return next
  },
  constrainEnemy(_sim, x, y) {
    return { x, y }
  },
  // 世界没有边,游荡不折返、敌弹也只按寿命回收
  wanderDir(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  cullEnemyProjectile() {
    return false
  },
  spawnPoint(sim, boss) {
    const zone = sim.zone
    if (boss) return ringPoint(sim.rng, zone ?? sim.center, 6 * UNIT, 8 * UNIT)
    const cfg = infCfg(sim)
    const p = ringPoint(sim.rng, sim.center, cfg.spawnRingMin * UNIT, cfg.spawnRingMax * UNIT)
    // 终波:落点收进当前圈内(圈外刷怪毫无意义)
    if (!zone) return p
    const limit = zone.r - UNIT
    if (limit <= 0 || !outsideZone(p, zone, limit)) return p
    const d = Math.hypot(p.x - zone.x, p.y - zone.y) || 1
    return { x: zone.x + ((p.x - zone.x) / d) * limit, y: zone.y + ((p.y - zone.y) / d) * limit }
  },
  activeHalf(sim) {
    return infCfg(sim).activeHalf * UNIT
  },
  onFinalWave(sim) {
    sim.zone = { x: sim.center.x, y: sim.center.y, r: ringCfg(sim).r0 * UNIT }
    sim.worldTickAt = ringCfg(sim).tickMs
  },
  /** 缩圈:半径逐帧按曲线收(场景侧据此画圈),圈外队员每 tick 掉血(敌人不受圈伤) */
  tick(sim) {
    const zone = sim.zone
    if (!zone) return
    const cfg = ringCfg(sim)
    zone.r = zoneRadiusAt(sim.elapsedMs, cfg) * UNIT
    if (sim.elapsedMs < sim.worldTickAt) return
    sim.worldTickAt = sim.elapsedMs + cfg.tickMs
    for (const m of sim.members) {
      if (!Alive.v[m]) continue
      if (outsideZone({ x: Transform.x[m]!, y: Transform.y[m]! }, zone, zone.r)) {
        hurtMember(sim, m, cfg.tickDamage, '毒雾')
      }
    }
  },
}

// ── 深空(space)────────────────────────────────────────────

function spaceCfg(sim: Sim): SpaceConfig {
  return MAPS[sim.mapId].space!
}

/** 禁锢圈:圆心固定在世界原点(= 无限世界的出生点),半径由数据给 */
function fieldR(sim: Sim): number {
  return spaceCfg(sim).blackholeRadiusU * UNIT
}

/** 深空:无限世界的地基(相机跟随/分块星海/环带刷怪/休眠),但一切被困在圆形禁锢星域内——
 * 向外的运动分量按到圆心距离衰减(边缘全挡)+ 硬钳兜底,队员/敌人/Boss 谁也逃不出去;
 * 另有天体横扫:预警直线 → 球体匀速划过,压到的实体敌我通吃 */
const space: WorldHooks = {
  ...infinite,
  constrainTeam(sim, next) {
    const r = fieldR(sim)
    const v = confineVelocity(sim.center.x, sim.center.y, 0, 0, next.x - sim.center.x, next.y - sim.center.y, r)
    return clampToDisc(sim.center.x + v.x, sim.center.y + v.y, 0, 0, r)
  },
  constrainEnemy(sim, x, y) {
    return clampToDisc(x, y, 0, 0, fieldR(sim))
  },
  /** 敌人禁锢:削掉向外的速度分量(镜像 applyFieldDrag) */
  postSteerEnemy(sim, eid, vx, vy) {
    const v = confineVelocity(Transform.x[eid]!, Transform.y[eid]!, 0, 0, vx, vy, fieldR(sim))
    return { vx: v.x, vy: v.y }
  },
  constrainCoin(sim, x, y) {
    return clampToDisc(x, y, 0, 0, fieldR(sim) - UNIT * 0.5)
  },
  spawnPoint(sim, boss) {
    const cfg = infCfg(sim)
    const p = boss
      ? ringPoint(sim.rng, { x: 0, y: 0 }, 6 * UNIT, 8 * UNIT)
      : ringPoint(sim.rng, sim.center, cfg.spawnRingMin * UNIT, cfg.spawnRingMax * UNIT)
    return clampToDisc(p.x, p.y, 0, 0, fieldR(sim) - UNIT)
  },
  // 禁锢圈本就全程常驻,终波不再叠一层毒雾缩圈
  onFinalWave() {},
  onStart(sim) {
    sim.worldTickAt = 7000 // 首颗天体来得早一点,确保第一波就见识到横扫
  },
  /** 天体横扫:到点开预警 → 预警结束起划 → 沿直线匀速推进,压到的实体每次只砸一次 */
  tick(sim, delta) {
    const cfg = spaceCfg(sim).meteor
    const now = sim.elapsedMs
    const m = sim.meteor
    if (!m) {
      if (now < sim.worldTickAt) return
      const angle = sim.rng.next() * Math.PI * 2
      const offset = (sim.rng.next() * 2 - 1) * cfg.offsetU * UNIT
      const s = meteorSweep(sim.center.x, sim.center.y, angle, offset, (cfg.travelU * UNIT) / 2)
      sim.meteor = { travelling: false, sx: s.sx, sy: s.sy, ex: s.ex, ey: s.ey, until: now + cfg.warnMs, t: 0, hit: new Set() }
      return
    }
    if (!m.travelling) {
      if (now >= m.until) m.travelling = true
      return
    }
    const len = Math.hypot(m.ex - m.sx, m.ey - m.sy) || 1
    m.t += (cfg.speedU * UNIT * (delta / 1000)) / len
    const x = m.sx + (m.ex - m.sx) * m.t
    const y = m.sy + (m.ey - m.sy) * m.t
    const rr = cfg.radiusU * UNIT
    for (const mem of sim.members) {
      if (!Alive.v[mem] || m.hit.has(mem)) continue
      if (Math.hypot(Transform.x[mem]! - x, Transform.y[mem]! - y) < rr) {
        m.hit.add(mem)
        hurtMember(sim, mem, cfg.damage, '天体')
      }
    }
    for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
      if (Dormant.v[eid] || m.hit.has(eid)) continue
      if (Math.hypot(Transform.x[eid]! - x, Transform.y[eid]! - y) < rr) {
        m.hit.add(eid)
        applyDamage(sim, eid, cfg.damage)
      }
    }
    if (m.t < 1) return
    sim.meteor = null
    sim.worldTickAt = now + cfg.intervalMs + (sim.rng.next() * 2 - 1) * cfg.intervalJitterMs
  },
}

/** 按地图取世界钩子;未特化的图一律走有界基线 */
export function worldFor(mapId: MapId): WorldHooks {
  const def = MAPS[mapId]
  if (def.ice) return ice
  if (def.kind === 'space') return space
  if (def.kind === 'infinite') return infinite
  return bounded
}

/** 休眠维护(无限世界):出活跃方形的敌人冻结、回来即唤醒。Boss 永不休眠 */
export function updateDormancy(sim: Sim): void {
  const half = sim.hooks.activeHalf(sim)
  if (half === Infinity) return
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    const within =
      Boss.v[eid] === 1 ||
      (Math.abs(Transform.x[eid]! - sim.center.x) <= half && Math.abs(Transform.y[eid]! - sim.center.y) <= half)
    Dormant.v[eid] = within ? 0 : 1
  }
}
