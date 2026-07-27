import { UNIT } from '../util/units'
import { norm } from '../util/vec'
import { TEAM, MEMBER } from '../data/characters'
import { SPAWN } from '../data/enemies'
import { randomMapPoint } from '../war/spawn'
import { MAPS } from '../data/maps'
import type { IceConfig, InfiniteConfig, MapDef, MapId, RiverConfig, ShrinkRingConfig, SpaceConfig } from '../types/maps'
import { approach, onFloe } from '../war/maps/ice'
import { outsideZone, ringPoint, zoneRadiusAt } from '../war/maps/world'
import { clampToDisc, confineVelocity, meteorSweep } from '../war/maps/space'
import { clampToRiver, flowVector, pastDownstream, riverRect } from '../war/maps/river'
import { ghostImages, torusDelta, torusDist2, wrapPoint } from '../war/maps/void'
import type { RiverRect } from '../war/maps/river'
import { isHorizontal } from '../war/remap'
import { PICKUPS } from '../data/pickups'
import { query } from 'bitecs'
import { Alive, Boss, Dormant, ENEMY_SET, Radius, Slide, Transform } from './components'
import { enemyDef } from './store'
import { FlowField } from '../war/maps/ruins'
import { applyDamage, hurtCharacter } from './systems/shared/combat'
import type { Sim } from './sim'
import type { Point } from '../util/vec'
import { fleeSteer } from '../war/enemyAi'

// 世界钩子(纯逻辑):各地图与「有界森林」不同的那几处行为,收在这里按 mapId 取一份。
// 旧实现把这些散在 8 个 Scene 子类的 override 里;ECS 侧仿真是纯函数,故改成一张
// 「钩子表」——sim 持有一份,系统在该拐弯的地方调它,默认实现即森林语义,
// 各图只覆写自己不同的那几项(bounded 作基,展开后改写)。
// 只收「行为」钩子;地图专属视觉(水面/缩圈/传送门)仍在场景侧。

const ZERO: Point = { x: 0, y: 0 }
const NO_GHOSTS: Point[] = []

export interface WorldHooks {
  /** 世界差向量(索敌/追击/磁吸/接触/编队的几何基元):环面取最短差(可能穿缝);默认直减。
   * 有了它,「朝目标走」「够不够得着」这类判断在环面上自动隔门成立 */
  worldDelta(sim: Sim, fromX: number, fromY: number, toX: number, toY: number): Point
  /** 索敌镜像(环面:真身之外再给三个镜像坐标,能力零改动即可隔门瞄准);默认无 */
  ghosts(sim: Sim, x: number, y: number): Point[]
  /** 坐标回绕(环面穿缝即绕到对侧):弹体/跟随点等自由实体逐帧过一道;默认原样 */
  wrap(sim: Sim, x: number, y: number): Point
  /** 玩家子弹寿命(ms;环面上永远飞不出屏,只能按寿命回收);0 = 不按寿命,按视野回收 */
  projectileLifeMs(sim: Sim): number
  /** 队伍的世界漂移(奔流恒定顺流);默认无。加在本帧输入位移之上,再过 constrainTeam */
  teamDrift(sim: Sim, delta: number): Point
  /** 队伍位移约束:有界钳制 / 冰面动量积分 / 河道钳制 / 圆盘禁锢。
   * next = 本帧输入想走到的位置;返回实际落点 */
  constrainTeam(sim: Sim, next: Point, delta: number): Point
  /** 敌人落点约束(有界钳制 + 断壁贴墙滑动;无界世界原样放行) */
  constrainEnemy(sim: Sim, eid: number, x: number, y: number): Point
  /** 敌人出生落点约束(镜像 constrainEnemyPos):分裂/子敌/尸壳的出生帧就位,
   * 与逐帧的 constrainEnemy 不同——残垣图不做贴墙滑动(旧实现出生只走盒子钳制) */
  constrainSpawn(sim: Sim, x: number, y: number, radius: number): Point
  /** 追击方向:残垣图走流场绕墙(穿墙敌人除外);其余图径直朝目标 */
  chaseDir(sim: Sim, eid: number, tx: number, ty: number): Point
  /** 视线遮挡:线段 a→b 的首个撞墙点(索敌 + 子弹裁墙共用);无墙图恒 null */
  wallHit(sim: Sim, ax: number, ay: number, bx: number, by: number): Point | null
  /** 碾碎该处断壁(拆迁 Boss 冲刺);无墙图空转 */
  smashWall(sim: Sim, x: number, y: number): void
  /** 游荡方向修正:有界图撞边折返(残垣图另加撞墙掉头);无界世界原样放行 */
  wanderDir(sim: Sim, eid: number, dx: number, dy: number): Point
  /** 逃跑方向修正:有界图贴边沿墙滑行,不顶死在边上;无界世界原样放行 */
  fleeDir(sim: Sim, eid: number, awayX: number, awayY: number): Point
  /** 敌人行为速度的后处理(冰面打滑低通 / 河流漂移);默认原样返回。
   * 击退分量不在此列——要脆要即时,由 steerEnemies 单独叠加 */
  postSteerEnemy(sim: Sim, eid: number, vx: number, vy: number, delta: number): { vx: number; vy: number }
  /** 本帧总位移的世界禁锢(深空引力井):与 postSteerEnemy 相反,**含击退**——
   * 旧 applyFieldDrag 作用在 body.velocity 上,那时击退已叠进去了。
   * confineVelocity 对速度线性,故作用在位移上与作用在合成速度上等价。默认原样 */
  confineEnemyStep(sim: Sim, eid: number, dx: number, dy: number): Point
  /** 击退衰减时间常数倍率(冰面低摩擦令击退滑得更远) */
  knockbackTauMul(sim: Sim): number
  /** 金币落点约束(冰面钳进浮冰,免得漂进水里隔着掉血区捡不回) */
  constrainCoin(sim: Sim, x: number, y: number): Point
  /** 金币的闲置速度(不在磁吸范围时;奔流 = 随波逐流);默认静止 */
  coinIdleVelocity(sim: Sim): Point
  /** 金币的额外回收条件(奔流:漂出下游即被冲走);默认不回收 */
  cullCoin(sim: Sim, x: number, y: number): boolean
  /** 死亡碎片飞散落点(有界图不许飞出地图;环面回绕);默认原样 */
  constrainShard(sim: Sim, x: number, y: number): Point
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
  worldDelta(_sim, fromX, fromY, toX, toY) {
    return { x: toX - fromX, y: toY - fromY }
  },
  ghosts() {
    return NO_GHOSTS
  },
  wrap(_sim, x, y) {
    return { x, y }
  },
  projectileLifeMs() {
    return 0
  },
  teamDrift() {
    return ZERO
  },
  constrainTeam(sim, next) {
    // 钳制边距 = 队伍环半径 + 队员判定半径,整环都留在图内(格值需 ×UNIT 换算成 px)
    const clampMin = (TEAM.ringRadius + MEMBER.radius) * UNIT
    return {
      x: Math.min(Math.max(next.x, clampMin), sim.mapW - clampMin),
      y: Math.min(Math.max(next.y, clampMin), sim.mapH - clampMin),
    }
  },
  constrainEnemy(sim, _eid, x, y) {
    return {
      x: x < 0 ? 0 : x > sim.mapW ? sim.mapW : x,
      y: y < 0 ? 0 : y > sim.mapH ? sim.mapH : y,
    }
  },
  constrainSpawn(sim, x, y) {
    return {
      x: x < 0 ? 0 : x > sim.mapW ? sim.mapW : x,
      y: y < 0 ? 0 : y > sim.mapH ? sim.mapH : y,
    }
  },
  chaseDir(_sim, eid, tx, ty) {
    return norm(tx - Transform.x[eid]!, ty - Transform.y[eid]!)
  },
  wallHit() {
    return null
  },
  smashWall() {},
  /** 撞边折返:接近地图边缘时翻转对应方向分量(镜像 BoundedScene.wanderDir) */
  wanderDir(sim, eid, dx, dy) {
    const margin = 0.6 * UNIT
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    return {
      x: (x < margin && dx < 0) || (x > sim.mapW - margin && dx > 0) ? -dx : dx,
      y: (y < margin && dy < 0) || (y > sim.mapH - margin && dy > 0) ? -dy : dy,
    }
  },
  fleeDir(sim, eid, awayX, awayY) {
    return fleeSteer(Transform.x[eid]!, Transform.y[eid]!, awayX, awayY, sim.mapW, sim.mapH, 1.5 * UNIT)
  },
  postSteerEnemy(_sim, _eid, vx, vy) {
    return { vx, vy }
  },
  confineEnemyStep(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  knockbackTauMul() {
    return 1
  },
  constrainCoin(sim, x, y) {
    const r = PICKUPS.coin.radius * UNIT // 格值需 ×UNIT 换算成 px,整枚币都留在图内
    return {
      x: Math.min(Math.max(x, r), sim.mapW - r),
      y: Math.min(Math.max(y, r), sim.mapH - r),
    }
  },
  coinIdleVelocity() {
    return ZERO
  },
  cullCoin() {
    return false
  },
  constrainShard(sim, x, y) {
    return {
      x: x < 0 ? 0 : x > sim.mapW ? sim.mapW : x,
      y: y < 0 ? 0 : y > sim.mapH ? sim.mapH : y,
    }
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
  constrainEnemy(_sim, _eid, x, y) {
    return { x, y }
  },
  constrainSpawn(_sim, x, y) {
    return { x, y }
  },
  wanderDir(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  constrainShard(_sim, x, y) {
    return { x, y }
  },
  fleeDir(_sim, _eid, awayX, awayY) {
    return { x: awayX, y: awayY }
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
    const r = PICKUPS.coin.radius * UNIT // 格值需 ×UNIT 换算成 px
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
      for (const m of sim.characters) if (Alive.v[m]) hurtCharacter(sim, m, dmg, '寒水', 0x4fc3f7)
    }
    const edmg = Math.round(cfg.waterEnemyDps * frac)
    for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
      if (!onFloe(Transform.x[eid]!, Transform.y[eid]!, px)) applyDamage(sim, eid, edmg)
    }
  },
}

// ── 残垣(ruins:有界 + 断壁)─────────────────────────────────

/** 断壁世界:有界竞技场叠断壁——挡移动(队伍贴墙滑、敌人贴墙滑)、挡子弹、挡视线,
 * 敌人走流场绕墙包抄(穿墙的幽灵直线穿行、破墙的拆迁 Boss 冲刺碾墙);
 * 只在「从中心可达」的通行格刷怪,保证敌人总能寻到队伍 */
const ruins: WorldHooks = {
  ...bounded,
  constrainTeam(sim, next, delta) {
    const box = bounded.constrainTeam(sim, next, delta)
    const w = sim.walls
    return w ? w.grid.resolveMove(sim.center.x, sim.center.y, box.x, box.y) : box
  },
  constrainEnemy(sim, eid, x, y) {
    const box = bounded.constrainEnemy(sim, eid, x, y)
    const w = sim.walls
    // 穿墙(幽灵)/破墙(拆迁 Boss)不吃墙碰撞;其余贴墙滑动兜底,防击退/游荡把敌人挤进墙
    const def = enemyDef[eid]
    if (!w || def?.phasesWalls || def?.breaksWalls) return box
    return w.grid.resolveMove(Transform.x[eid]!, Transform.y[eid]!, box.x, box.y)
  },
  /** 追击:穿墙敌人直线穿行;其余走流场绕墙,不可达回退直线 */
  chaseDir(sim, eid, tx, ty) {
    const w = sim.walls
    if (!w || enemyDef[eid]?.phasesWalls) return bounded.chaseDir(sim, eid, tx, ty)
    const dir = w.flow?.sampleDir(Transform.x[eid]!, Transform.y[eid]!)
    if (dir && (dir.x !== 0 || dir.y !== 0)) return dir
    return bounded.chaseDir(sim, eid, tx, ty)
  },
  /** 游荡:盒子折返基础上,前方是墙就掉头 */
  wanderDir(sim, eid, dx, dy) {
    const d = bounded.wanderDir(sim, eid, dx, dy)
    const w = sim.walls
    if (!w) return d
    const ahead = 0.8 * UNIT
    if (w.grid.pointBlocked(Transform.x[eid]! + d.x * ahead, Transform.y[eid]! + d.y * ahead)) {
      return { x: -d.x, y: -d.y }
    }
    return d
  },
  wallHit(sim, ax, ay, bx, by) {
    return sim.walls?.grid.segmentHit(ax, ay, bx, by) ?? null
  },
  /** 碾碎该格:网格置通行 + 排进待拆队列(场景侧拆视觉/扬尘)+ 逼流场下帧重算 */
  smashWall(sim, x, y) {
    const w = sim.walls
    if (!w) return
    const cx = w.grid.cellX(x)
    const cy = w.grid.cellY(y)
    if (!w.grid.isBlockedCell(cx, cy)) return
    w.grid.setBlocked(cx, cy, false)
    w.smashed.push(cy * w.grid.cols + cx)
    w.flowCellX = -1
  },
  /** 只在从中心可达的通行格刷怪,且离队伍中心足够远(镜像 pickSpawn) */
  spawnPoint(sim, boss) {
    const w = sim.walls
    if (!w || w.spawnCells.length === 0) return bounded.spawnPoint(sim, boss)
    const cfg = MAPS[sim.mapId].walls!
    const minCellDist = cfg.spawnMinCellDist + (boss ? 2 : 0)
    const ccx = w.grid.cellX(sim.center.x)
    const ccy = w.grid.cellY(sim.center.y)
    const min2 = minCellDist * minCellDist
    const cellCenter = (idx: number): Point => ({
      x: ((idx % w.grid.cols) + 0.5) * UNIT,
      y: (Math.floor(idx / w.grid.cols) + 0.5) * UNIT,
    })
    let fallback = cellCenter(w.spawnCells[0]!)
    for (let i = 0; i < 24; i++) {
      const idx = w.spawnCells[Math.floor(sim.rng.next() * w.spawnCells.length)]!
      const p = cellCenter(idx)
      fallback = p
      const dx = (idx % w.grid.cols) - ccx
      const dy = Math.floor(idx / w.grid.cols) - ccy
      if (dx * dx + dy * dy >= min2) return p
    }
    return fallback
  },
  /** 敌弹:出界回收之外,进墙也销毁 */
  cullEnemyProjectile(sim, x, y) {
    return bounded.cullEnemyProjectile(sim, x, y) || (sim.walls?.grid.pointBlocked(x, y) ?? false)
  },
  /** 逐帧低频重算流场(队伍格变了 / 到点就重算) */
  tick(sim, delta) {
    const w = sim.walls
    if (!w) return
    w.reflowAcc += delta
    const cx = w.grid.cellX(sim.center.x)
    const cy = w.grid.cellY(sim.center.y)
    if (cx === w.flowCellX && cy === w.flowCellY && w.reflowAcc < MAPS[sim.mapId].walls!.reflowMs) return
    w.flow = new FlowField(w.grid, cx, cy)
    w.flowCellX = cx
    w.flowCellY = cy
    w.reflowAcc = 0
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
  constrainEnemy(_sim, _eid, x, y) {
    return { x, y }
  },
  constrainSpawn(_sim, x, y) {
    return { x, y }
  },
  // 世界没有边:游荡不折返、逃跑不贴边、敌弹只按寿命回收、碎片与金币落点都不钳
  wanderDir(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  fleeDir(_sim, _eid, awayX, awayY) {
    return { x: awayX, y: awayY }
  },
  cullEnemyProjectile() {
    return false
  },
  constrainShard(_sim, x, y) {
    return { x, y }
  },
  constrainCoin(_sim, x, y) {
    return { x, y }
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
    for (const m of sim.characters) {
      if (!Alive.v[m]) continue
      if (outsideZone({ x: Transform.x[m]!, y: Transform.y[m]! }, zone, zone.r)) {
        hurtCharacter(sim, m, cfg.tickDamage, '毒雾', 0xef5350)
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
 * 向外的运动分量按到圆心距离衰减(边缘全挡),队员/敌人/Boss 谁也逃不出去。
 * 队伍在引力井之外另有硬钳兜底,敌人只有引力井(镜像旧实现:硬钳只用在出生与队伍身上);
 * 另有天体横扫:预警直线 → 球体匀速划过,压到的实体敌我通吃 */
const space: WorldHooks = {
  ...infinite,
  constrainTeam(sim, next) {
    const r = fieldR(sim)
    const v = confineVelocity(sim.center.x, sim.center.y, 0, 0, next.x - sim.center.x, next.y - sim.center.y, r)
    return clampToDisc(sim.center.x + v.x, sim.center.y + v.y, 0, 0, r)
  },
  constrainSpawn(sim, x, y, radius) {
    return clampToDisc(x, y, 0, 0, fieldR(sim) - radius)
  },
  /** 敌人禁锢:削掉本帧位移里向外的分量(镜像 applyFieldDrag)。
   * 逐帧不再硬钳位置——旧实现对敌人只有这道「引力井」,硬钳只用在出生与队伍身上;
   * 引力井在边缘把向外分量全抵消,击退到了边上自然推不动,不需要墙 */
  confineEnemyStep(sim, eid, dx, dy) {
    return confineVelocity(Transform.x[eid]!, Transform.y[eid]!, 0, 0, dx, dy, fieldR(sim))
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
    for (const mem of sim.characters) {
      if (!Alive.v[mem] || m.hit.has(mem)) continue
      if (Math.hypot(Transform.x[mem]! - x, Transform.y[mem]! - y) < rr) {
        m.hit.add(mem)
        hurtCharacter(sim, mem, cfg.damage, '天体', 0xffaa33)
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

// ── 奔流(river)────────────────────────────────────────────

function riverCfg(sim: Sim): RiverConfig {
  return MAPS[sim.mapId].river!
}

/** 河道矩形:世界 = 逻辑视口 × viewScale(场景侧写进 mapW/mapH),河道沿长轴贯穿、跨轴居中 */
function riverOf(sim: Sim): RiverRect {
  return riverRect(sim.mapW, sim.mapH, riverCfg(sim).width * UNIT)
}

function flowOf(sim: Sim): Point {
  return flowVector(isHorizontal(sim.mapW, sim.mapH), riverCfg(sim).flow * UNIT)
}

/** 奔流:单屏固定相机 + 恒定水流——万物随波逐流(子弹除外)。
 * 只有队伍与 Boss 被钳在河道内;普通敌人跨向不能上岸、沿流向可漂出屏外(借无限图休眠);
 * 金币纯随波逐流,漂出下游即被冲走 */
const river: WorldHooks = {
  ...bounded,
  teamDrift(sim, delta) {
    const f = flowOf(sim)
    const dt = delta / 1000
    return { x: f.x * dt, y: f.y * dt }
  },
  /** 自主移动 + 水流漂移后钳入河道(挂机会被推到下游边并卡住) */
  constrainTeam(sim, next) {
    return clampToRiver(next, riverOf(sim), (TEAM.ringRadius + MEMBER.radius) * UNIT)
  },
  /** 落点跨向钳入河道(分裂怪贴岸溅出等边缘情况兜底);沿流向不钳 */
  constrainEnemy(sim, eid, x, y) {
    const r = riverOf(sim)
    const rad = Radius.v[eid]!
    if (r.horizontal) return { x, y: Math.min(Math.max(y, r.y + rad), r.y + r.h - rad) }
    return { x: Math.min(Math.max(x, r.x + rad), r.x + r.w - rad), y }
  },
  constrainSpawn(sim, x, y, radius) {
    const r = riverOf(sim)
    if (r.horizontal) return { x, y: Math.min(Math.max(y, r.y + radius), r.y + r.h - radius) }
    return { x: Math.min(Math.max(x, r.x + radius), r.x + r.w - radius), y }
  },
  /** 敌人:行为速度叠水流,再钳住跨向速度(不能上岸);Boss 两轴都钳(与玩家同款) */
  postSteerEnemy(sim, eid, vx, vy) {
    const f = flowOf(sim)
    const r = riverOf(sim)
    let ox = vx + f.x
    let oy = vy + f.y
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const rad = Boss.v[eid] === 1 ? Radius.v[eid]! : 0
    if (Boss.v[eid] === 1 || !r.horizontal) {
      if (x <= r.x + rad && ox < 0) ox = 0
      if (x >= r.x + r.w - rad && ox > 0) ox = 0
    }
    if (Boss.v[eid] === 1 || r.horizontal) {
      const lo = r.y + (Boss.v[eid] === 1 ? rad : Radius.v[eid]!)
      const hi = r.y + r.h - (Boss.v[eid] === 1 ? rad : Radius.v[eid]!)
      if (y <= lo && oy < 0) oy = 0
      if (y >= hi && oy > 0) oy = 0
    }
    return { vx: ox, vy: oy }
  },
  // 沿流向漂出屏外是设计的一部分:游荡不折返、逃跑不贴边、敌弹只按寿命回收、碎片不钳
  wanderDir(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  fleeDir(_sim, _eid, awayX, awayY) {
    return { x: awayX, y: awayY }
  },
  cullEnemyProjectile() {
    return false
  },
  constrainShard(_sim, x, y) {
    return { x, y }
  },
  /** 河道内均匀随机(贴边留半格);Boss 另取距队伍 ≥5 格的点 */
  spawnPoint(sim, boss) {
    const r = riverOf(sim)
    const pad = 0.5 * UNIT
    const pick = (): Point => ({
      x: r.x + pad + sim.rng.next() * (r.w - pad * 2),
      y: r.y + pad + sim.rng.next() * (r.h - pad * 2),
    })
    let pos = pick()
    if (!boss) return pos
    for (let i = 0; i < 24; i++) {
      pos = pick()
      const dx = pos.x - sim.center.x
      const dy = pos.y - sim.center.y
      if (dx * dx + dy * dy >= 5 * UNIT * (5 * UNIT)) break
    }
    return pos
  },
  // 金币随波逐流、不钳;休眠同无限图(屏内永不触发,漂出屏外的敌人冻结)
  constrainCoin(_sim, x, y) {
    return { x, y }
  },
  activeHalf(sim) {
    return MAPS[sim.mapId].infinite!.activeHalf * UNIT
  },
  // 不在磁吸范围的金币纯随波逐流,漂出下游一段即被冲走(玩家钳在屏内,永远追不回)
  coinIdleVelocity(sim) {
    return flowOf(sim)
  },
  cullCoin(sim, x, y) {
    return pastDownstream({ x, y }, sim.mapW, sim.mapH, riverCfg(sim).coinCullPad * UNIT)
  },
}

// ── 环面(void:工厂)────────────────────────────────────────

/** 环面竞技场:四边两两粘合,坐标按模回绕,没有墙。尺寸即 mapW/mapH(场景侧按朝向定长短边)。
 * 一切「距离/方向」改用环面最短差——这是传送门成为真实拓扑而非装饰的关键;
 * 索敌另喂三个镜像坐标,能力零改动即可隔门瞄准;子弹永远飞不出屏,按寿命回收 */
const torus: WorldHooks = {
  ...bounded,
  worldDelta(sim, fromX, fromY, toX, toY) {
    return torusDelta({ x: fromX, y: fromY }, { x: toX, y: toY }, sim.mapW, sim.mapH)
  },
  ghosts(sim, x, y) {
    return ghostImages({ x, y }, sim.mapW, sim.mapH)
  },
  wrap(sim, x, y) {
    return wrapPoint({ x, y }, sim.mapW, sim.mapH)
  },
  constrainShard(sim, x, y) {
    return wrapPoint({ x, y }, sim.mapW, sim.mapH)
  },
  projectileLifeMs(sim) {
    return MAPS[sim.mapId].torus!.projectileLifeMs
  },
  // 不钳制,穿缝回绕
  constrainTeam(sim, next) {
    return wrapPoint(next, sim.mapW, sim.mapH)
  },
  constrainEnemy(sim, _eid, x, y) {
    return wrapPoint({ x, y }, sim.mapW, sim.mapH)
  },
  constrainSpawn(sim, x, y) {
    return wrapPoint({ x, y }, sim.mapW, sim.mapH)
  },
  constrainCoin(sim, x, y) {
    return wrapPoint({ x, y }, sim.mapW, sim.mapH)
  },
  // 环面上没有边可撞,游荡不折返;敌弹只按寿命回收
  wanderDir(_sim, _eid, dx, dy) {
    return { x: dx, y: dy }
  },
  fleeDir(_sim, _eid, awayX, awayY) {
    return { x: awayX, y: awayY }
  },
  cullEnemyProjectile() {
    return false
  },
  /** 全场随机(环面上无所谓贴边);Boss 另取环面距队伍 ≥5 格的点 */
  spawnPoint(sim, boss) {
    const pick = (): Point => ({ x: sim.rng.next() * sim.mapW, y: sim.rng.next() * sim.mapH })
    let pos = pick()
    if (!boss) return pos
    for (let i = 0; i < 24; i++) {
      pos = pick()
      if (torusDist2(pos, sim.center, sim.mapW, sim.mapH) >= 5 * UNIT * (5 * UNIT)) break
    }
    return pos
  },
}

/** 世界形态 → 钩子的**全映射**：MapDef 新增一种 kind 而不在此登记 = 编译不过。
 * 从前是一串 if + 兜底 return bounded，漏一种就静默按有界图跑 */
const BY_KIND: Record<MapDef['kind'], WorldHooks> = {
  bounded,
  daynight: bounded, // 昼夜只换配色与光照，世界几何同有界基线
  ruins: ruins,
  ice,
  river,
  void: torus,
  space,
  infinite,
}

/** 按地图取世界钩子。ice / walls 这两条先判——它们是「本图带没带这套配置」，
 * 与世界形态正交（残垣是 ruins 形态 + walls 配置，浮冰是 bounded 形态 + ice 配置） */
export function worldFor(mapId: MapId): WorldHooks {
  const def = MAPS[mapId]
  if (def.ice) return ice
  if (def.walls) return ruins
  return BY_KIND[def.kind]!
}

