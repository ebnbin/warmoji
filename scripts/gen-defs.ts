import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ABILITIES } from '../defs/abilities.ts'
import { AI } from '../defs/ai.ts'
import { ANIMATIONS } from '../defs/animations.ts'
import { BATTLEFIELD } from '../defs/battlefield.ts'
import { CHARACTERS } from '../defs/characters.ts'
import { COMBAT } from '../defs/combat.ts'
import { DIFFICULTY } from '../defs/difficulty.ts'
import { ECONOMY } from '../defs/economy.ts'
import { EDITOR_DRAFT } from '../defs/editor.ts'
import { ENEMIES } from '../defs/enemies.ts'
import { FEEL } from '../defs/feel.ts'
import { ITEMS } from '../defs/items.ts'
import { LEVEL_STATS } from '../defs/levels.ts'
import { MAP_DEFAULTS } from '../defs/mapdefaults.ts'
import { MAPS } from '../defs/maps.ts'
import { MUTATORS } from '../defs/mutators.ts'
import { OBSTACLES } from '../defs/obstacles.ts'
import { PICKUPS } from '../defs/pickups.ts'
import { PROGRESSION } from '../defs/progression.ts'
import { ROLES } from '../defs/roles.ts'
import { RUNS } from '../defs/runs.ts'
import { SFX } from '../defs/sfx.ts'
import { STAMINA } from '../defs/stamina.ts'
import { STATS } from '../defs/stats.ts'
import { TEAM_BASELINE } from '../defs/team.ts'
import { TIMESTOP } from '../defs/timestop.ts'
import { WEAPONS } from '../defs/weapons.ts'
import { MAX_CHAR_LEVEL } from '../src/data/charLevel.ts'
import { shellPull } from '../src/data/nebulaOld.ts'
import { ACCRETION_ETA, captureU, einsteinU, floorDepthU, ISCO_RS, schwarzschildU, SHADOW_RS, shellRecaptureU, stopRadiusU, wallU } from '../src/maps/nebula/physics.ts'
import { bulgeU, deckEdgeAngle, halfBeamAt, hydrostatics, spawnS, spritOf, stability, staticHeel } from '../src/maps/ship/physics.ts'
import { depth, floeOutline, GRAVITY, simple } from '../src/maps/floe/model.ts'
import { makeMasonry, ruinsPlan, toWorld } from '../src/maps/ruins/layout.ts'
import { bodyField } from '../src/maps/ruins/masonry.ts'
import { roomAt } from '../src/maps/basin.ts'
import { FRAME_U, SAFE_U, SPAWN_CLEAR_U, UNIT, VIEW } from '../src/util/units.ts'
import { WindSea } from '../src/maps/floe/sea.ts'
import { crossings, discViewFactor, noonElevDeg, skyLux, torchReachU } from '../src/maps/cave/sky.ts'
import { GROUND_PPU } from '../src/data/texel.ts'
import { bankShape, meadowPlan } from '../src/maps/meadow/layout.ts'
import { bridgeLocal, CREST_U, sakuraPlan, SINK_M, weirLocal } from '../src/maps/sakura/layout.ts'
import { bridgeLocal as mapleBridgeLocal, CREST_U as MAPLE_CREST_U, maplePlan, SINK_M as MAPLE_SINK_M, weirLocal as mapleWeirLocal } from '../src/maps/maple/layout.ts'
import { circuitPlan, COPPER_CELL_U, NET_SLOTS } from '../src/maps/circuit/layout.ts'
import { deepPlan } from '../src/maps/deep/layout.ts'
import { fits, homePose, hullOf, innerOf, rimOf } from '../src/maps/deep/sub.ts'
import { nexusPlan, warpApart } from '../src/maps/nexus/layout.ts'
import { diffusionU, frontWidthU, petriPlan } from '../src/maps/petri/model.ts'
import { cornersOf, dreamlandPlan } from '../src/maps/dreamland/layout.ts'
import { templePlan } from '../src/maps/temple/layout.ts'
import { SUN } from '../src/data/light.ts'
import { HEIGHT_SPAN, TIME_QUANT } from '../src/maps/desert/stamp.ts'
import { pathText, runChecks, withNested } from '../src/data/runCheck.ts'
import { render } from '../src/emoji/painted/design.ts'
import { PAINTED } from '../src/emoji/painted/index.ts'
import type { Issue } from '../src/data/runCheck.ts'
import type { CharacterAuthoring } from '../src/types/characters'
import type { EnemyDef, EnemyKind } from '../src/types/enemies'
import type { Span } from '../src/types/obstacles'
import type { ItemDef } from '../src/types/items'
import type { MapDef, NebulaOldConfig } from '../src/types/maps'
import type { MutatorDef, RunDef } from '../src/types/runs'

const errors: string[] = []
const need = (ok: boolean, msg: string): void => {
  if (!ok) errors.push(msg)
}

for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  for (const row of [...m.mix, ...(m.dayMix ?? []), ...(m.nightMix ?? [])]) {
    const e = ENEMIES[row.kind]
    need(e !== undefined && e.role !== 'boss', `maps.${id} 的出怪配比须引用非 Boss 的敌人：${row.kind}`)
  }
  need(ENEMIES[m.boss]?.role === 'boss', `maps.${id}.boss 须引用 Boss：${m.boss}`)
}

/** 地面费力、场内费力和身体的赶路耗体力，出现在哪都不能为负；属性修正的加值可以为负，由属性表的下限兜住 */
const noNegativeExertion = (v: unknown, path: string): void => {
  if (typeof v !== 'object' || v === null) return
  for (const [k, x] of Object.entries(v)) {
    if (k === 'add') continue
    if (k === 'exertion') need(typeof x === 'number' && x >= 0, `${path}.${k} 不能为负`)
    else noNegativeExertion(x, `${path}.${k}`)
  }
}
noNegativeExertion({ maps: MAPS, enemies: ENEMIES, abilities: ABILITIES, weapons: WEAPONS, characters: CHARACTERS, items: ITEMS }, 'defs')

need(STAMINA.slowFrom > 0 && STAMINA.slowFrom <= 1, 'stamina.slowFrom 须在 (0, 1] 内')
need(STAMINA.floor > 0 && STAMINA.floor < 1, 'stamina.floor 须在 (0, 1) 内')
need(STAMINA.warnAt > 0 && STAMINA.warnAt < STAMINA.slowFrom, 'stamina.warnAt 须在 0 与 slowFrom 之间')
need(STAMINA.restDelayMs >= 0 && STAMINA.rampMs > 0, 'stamina 的恢复节奏须为正')
need(STAMINA.draft > 0 && STAMINA.draft <= 1, 'stamina.draft 须在 (0, 1] 内')

/** 每张图赶路都耗体力、歇着都能回；逆流比平地累，顺流比平地省 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need(m.stamina.exertion > 0 && m.stamina.regen > 0, `maps.${id}.stamina 的费力与回复倍率须为正`)
  if (m.oldRiver) need(m.oldRiver.upstream >= 1 && m.oldRiver.downstream >= 0 && m.oldRiver.downstream <= 1, `maps.${id}.oldRiver 的逆流倍率须不小于 1，顺流倍率须在 [0, 1] 内`)
  if (m.ice) need(m.ice.waterExertion > 0 && m.ice.waterRegen >= 0, `maps.${id}.ice 的水里费力须为正、回复倍率不为负`)
}

/** 单位的光：光色与影子色是 24 位颜色，影子有浓度、往外铺得开 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  const l = m.light
  if (!l) continue
  const rgb = (c: number): boolean => Number.isInteger(c) && c >= 0 && c <= 0xffffff
  need(rgb(l.sun) && rgb(l.shade), `maps.${id}.light 的颜色须是 24 位 RGB`)
  if (!l.shadow) continue
  need(rgb(l.shadow.color), `maps.${id}.light.shadow.color 须是 24 位 RGB`)
  need(l.shadow.alpha > 0 && l.shadow.alpha <= 1, `maps.${id}.light.shadow.alpha 须在 (0, 1] 内`)
  need(l.shadow.length > 0, `maps.${id}.light.shadow.length 须为正`)
}

/** 旧星云：壳层包着空腔，黑洞整个落在空腔里，视界外还有能站的地方；流星的积分步长能在时限里走完 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'nebulaOld') === (m.nebulaOld !== undefined), `maps.${id} 是旧星云当且仅当写了 nebulaOld`)
  const n = m.nebulaOld
  if (!n) continue
  const [near, far] = n.hole.fromCenterU
  need(n.shell.innerU > 0 && n.shell.outerU > n.shell.innerU && n.shell.gm > 0, `maps.${id}.nebulaOld.shell 须内径为正、外径大于内径、引力为正`)
  need(n.contain.speedMul >= 1 && n.contain.leapU >= 0, `maps.${id}.nebulaOld.contain 的速度余量不小于 1、瞬移余量不为负`)
  need(n.hole.gm > 0 && n.hole.softeningU > 0, `maps.${id}.nebulaOld.hole 的引力与软化长度须为正`)
  need(n.hole.horizonU > n.hole.softeningU / Math.SQRT2, `maps.${id}.nebulaOld.hole.horizonU 须大于软化长度的 1/√2，视界外的引力才随距离单调减小`)
  need(near >= 0 && near <= far && far + n.hole.horizonU < n.shell.innerU, `maps.${id}.nebulaOld.hole 的位置范围须落在空腔里`)
  need(n.hole.clearU > n.hole.horizonU, `maps.${id}.nebulaOld.hole.clearU 须大于视界`)
  need(n.meteor.stepMs > 0 && n.meteor.maxFlightMs >= n.meteor.stepMs, `maps.${id}.nebulaOld.meteor 的积分步长须为正且不超过最长飞行时间`)
  need(n.meteor.speedU > 0 && n.meteor.radiusU > 0 && n.meteor.warnMs >= 0 && n.meteor.offsetU >= 0, `maps.${id}.nebulaOld.meteor 的速度与半径须为正`)
  need(n.meteor.radiusU < n.shell.innerU, `maps.${id}.nebulaOld.meteor.radiusU 须小于空腔半径，瞄准点才收得进空腔`)
}

/** 火山：盆地的边在地图边与中线之间、火山口贴着地图边的中段、山体够不着地图的角和中线；一次喷发的预兆与出熔岩都在下一次之前结束 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'volcano') === (m.volcano !== undefined), `maps.${id} 是火山当且仅当写了 volcano`)
  const v = m.volcano
  if (!v) continue
  const c = v.cone
  const e = v.eruption
  const l = v.lava
  const r = v.rim
  const side = Math.min(m.size?.w ?? MAP_DEFAULTS.width, m.size?.h ?? MAP_DEFAULTS.height)
  need(r.insetU[0] > 0 && r.insetU[0] <= r.insetU[1] && r.insetU[1] < side / 4, `maps.${id}.volcano.rim.insetU 须让盆地的边落在地图边以内、离中线足够远`)
  need(r.waveU > 0 && r.cornerU >= 0 && r.neckU > 0, `maps.${id}.volcano.rim 的波长、窄缝须为正，磨角不为负`)
  need(r.cliffU > 0 && r.cliffHeight > 0 && r.backSlope >= 0, `maps.${id}.volcano.rim 的崖壁须有宽有高，高地往外不升高`)
  need(v.cellU > 0 && v.cellU * 2 <= c.craterU, `maps.${id}.volcano.cellU 须为正且火山口至少两格宽`)
  need(Number.isInteger(GROUND_PPU * v.cellU), `maps.${id}.volcano.cellU 须让每个熔岩格在地面贴图上占整数个像素（地面每格 ${GROUND_PPU} 像素）`)
  need(c.insetU[0] >= 0 && c.insetU[0] <= c.insetU[1] && c.insetU[1] + c.blockU < side / 2, `maps.${id}.volcano.cone.insetU 须让挡路圈落在地图边与中线之间`)
  need(c.blockU + 2 <= side / 4, `maps.${id}.volcano.cone.blockU 须让挡路圈离地图的角至少两格（火山口落在边的中段）`)
  need(c.blockJitter >= 0 && c.blockJitter < 0.5, `maps.${id}.volcano.cone.blockJitter 须在 0 到 0.5 之间`)
  need(c.insetU[1] < c.blockU * (1 - c.blockJitter), `maps.${id}.volcano.cone 须让山体压过地图边：山后没有路，绕山总从朝地图里的那一侧`)
  need(c.craterU + v.cellU * 2 <= c.blockU && c.blockU < c.radiusU, `maps.${id}.volcano.cone 须火山口、熔岩漫出的那圈都在挡路圈里，缓坡铺到挡路圈外`)
  need(c.footHeight > 0 && c.footHeight < c.height, `maps.${id}.volcano.cone 的山脚须高于平地、低于口沿`)
  need(c.craterDepth > 0 && c.lakeDepth > 0 && c.lakeDepth < c.craterDepth && c.gullyDepth >= 0, `maps.${id}.volcano.cone 的熔岩湖须低于火山口沿`)
  need(v.terrain.tilt >= 0 && v.terrain.relief >= 0 && v.terrain.waveU > 0, `maps.${id}.volcano.terrain 的坡度、起伏不为负，波长为正`)
  need(e.firstMs >= 0 && e.warnMs > 0 && e.rate > 0 && e.waneMs > 0 && e.peakMs > 0 && e.peakMs < e.effuseMs, `maps.${id}.volcano.eruption 的时长与流量须为正，流量在停之前涨到顶`)
  need(e.intervalJitterMs >= 0 && e.intervalMs - e.intervalJitterMs > e.warnMs + e.effuseMs, `maps.${id}.volcano.eruption 的间隔减去抖动须长过预兆加出熔岩`)
  need(Number.isInteger(e.lobes[0]) && Number.isInteger(e.lobes[1]) && e.lobes[0] >= 1 && e.lobes[0] <= e.lobes[1], `maps.${id}.volcano.eruption.lobes 须为不小于 1 的整数范围`)
  need(e.lobeDeg > 0 && e.lobeFloor >= 0 && e.lobeSpreadDeg >= 0 && e.lobeSpreadDeg <= 180, `maps.${id}.volcano.eruption 的股宽须为正、股外的比例不为负、股心的范围在 0 到 180 度之间`)
  need(Number.isInteger(e.history) && e.history >= 0, `maps.${id}.volcano.eruption.history 须为非负整数`)
  need(l.stepMs > 0 && l.mobility > 0 && l.mobilityPow >= 0 && l.cooling > 0 && l.coolRadiusU > 0, `maps.${id}.volcano.lava 的步长、流动与冷却须为正`)
  need(l.yieldHot >= 0 && l.yieldHot <= l.yieldCold, `maps.${id}.volcano.lava 的屈服强度须不为负且冷时不小于热时`)
  need(l.solidus > 0 && l.solidus < 1, `maps.${id}.volcano.lava.solidus 须在 0 到 1 之间`)
  need(l.teamDps >= 0 && l.enemyDps >= 0 && l.tickMs > 0, `maps.${id}.volcano.lava 的伤害不为负、结算间隔为正`)
}

/**
 * 船：连舷墙放得进安全区，首斜桅伸出船头也还在方框里；甲板收得拢、桅杆两边走得过去，出发的地方前后都有桅杆、四周空得开；空船正浮稳定。
 * 身体之间不互相挤开，最坏是最多的怪全叠在最宽处的舷墙边：那时也不翻、甲板边不入水（直舷公式还成立），倾角还得超过身体脚下的摩擦角，闲着的身体才滑得起来
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'ship') === (m.ship !== undefined), `maps.${id} 是船当且仅当写了 ship`)
  const c = m.ship
  if (!c) continue
  const h = c.hull
  const d = c.hydro
  const w = c.weight
  const f = c.friction
  need(c.meterPerU > 0, `maps.${id}.ship.meterPerU 须为正`)
  need(h.beamU > 0 && h.lengthU > h.beamU, `maps.${id}.ship.hull 的船宽须为正、船长大于船宽`)
  need(h.bow > 0 && h.stern > 0 && h.bow + h.stern < 1 && h.bowPow > 0 && h.sternPow >= 1, `maps.${id}.ship.hull 船头与船尾收拢的两段不重叠，收拢的指数为正、船尾的不小于 1`)
  need(h.transom > 0 && h.transom < 1 && h.transomBulge >= 0, `maps.${id}.ship.hull.transom 须在 0 到 1 之间、横板不往里凹`)
  need(h.bulwarkU > 0 && h.bulwarkM > 0 && h.neckU > 0 && h.mastU > 0, `maps.${id}.ship.hull 的舷墙、窄缝与桅杆须为正`)
  const outU = h.lengthU + bulgeU(h) + h.bulwarkU * 2
  need(outU <= FRAME_U - SAFE_U * 2 && h.beamU + h.bulwarkU * 2 <= FRAME_U - SAFE_U * 2, `maps.${id}.ship.hull 连舷墙 ${+outU.toFixed(2)}×${h.beamU + h.bulwarkU * 2} 格，放不进安全区`)
  need(outU / 2 - h.bulwarkU + (spritOf(h).boom.s - h.lengthU) + 1 <= FRAME_U / 2, `maps.${id}.ship 的第一斜桅伸出船头后离方框边不到一格：船一纵摇端头就甩出方框`)
  const start = spawnS(h)
  need(h.masts.some((at) => at * h.lengthU < start) && h.masts.some((at) => at * h.lengthU > start), `maps.${id}.ship.hull.masts 须在出发的地方前后都有：队伍从两根桅杆之间出发`)
  need(halfBeamAt(h, start) >= SPAWN_CLEAR_U, `maps.${id}.ship 出发的地方离舷墙不到 ${SPAWN_CLEAR_U} 格`)
  for (const at of h.masts) {
    need(at > 0 && at < 1 && halfBeamAt(h, at * h.lengthU) >= h.mastU + 2, `maps.${id}.ship.hull.masts 的 ${at} 须立在甲板上、两边各留得出两格的路`)
    need(Math.abs(at * h.lengthU - start) >= SPAWN_CLEAR_U + h.mastU, `maps.${id}.ship.hull.masts 的 ${at} 离出发的地方不到 ${SPAWN_CLEAR_U} 格`)
  }
  need(d.draftM > 0 && d.depthM > d.draftM && d.midship > 0 && d.midship <= 1 && d.kgM > 0 && d.rho > 0, `maps.${id}.ship.hydro 的吃水、型深、舯剖面系数、重心与密度须合理：型深大于吃水，系数在 (0, 1] 内`)
  need(d.rollGyration > 0 && d.pitchGyration > 0 && d.rollAdded >= 0 && d.pitchAdded >= 0, `maps.${id}.ship.hydro 的惯性半径须为正、附加质量不为负`)
  need(d.rollDamping > 0 && d.rollDamping < 1 && d.pitchDamping > 0 && d.pitchDamping < 1, `maps.${id}.ship.hydro 的阻尼比须在 0 到 1 之间`)
  need(w.bodyKg > 0 && w.bodyRadiusU > 0 && w.bodyHeightM >= 0 && w.pickupKg >= 0 && w.ballKg >= 0, `maps.${id}.ship.weight 的重量与尺寸不为负、身体的须为正`)
  need(c.sea.speedMs >= 0 && c.sea.swells.every((s) => s.heightM > 0 && s.periodS > 0), `maps.${id}.ship.sea 的船速不为负、涌浪的波高与周期须为正`)
  need(f.body.static >= f.body.kinetic && f.body.kinetic > 0 && f.coin.static >= f.coin.kinetic && f.coin.kinetic > 0 && f.ballRolling >= 0, `maps.${id}.ship.friction 的静摩擦须不小于动摩擦、动摩擦为正、滚动摩擦不为负`)
  need(c.gait.flatResistance > 0 && c.gait.downhillMax >= 1 && c.gait.effortMin > 0 && c.gait.effortMin <= 1, `maps.${id}.ship.gait 的平地阻力须为正、下坡倍率不小于 1、最少的费力在 (0, 1] 内`)
  need(Number.isInteger(c.balls.count) && c.balls.count >= 0 && c.balls.radiusU > 0 && c.balls.restitution >= 0 && c.balls.restitution <= 1, `maps.${id}.ship.balls 的个数为非负整数、半径为正、恢复系数在 [0, 1] 内`)
  const hs = hydrostatics(c)
  need(stability(c, hs, 0).gmT > 0, `maps.${id}.ship 空船的初稳性高须为正`)
  const crowd = DIFFICULTY.spawn.maxAlive * w.bodyKg
  const st = stability(c, hs, crowd)
  const heel = staticHeel(st, crowd * (h.beamU / 2 - w.bodyRadiusU) * c.meterPerU)
  const deg = (r: number): string => `${+((r * 180) / Math.PI).toFixed(1)}°`
  need(st.gmT > 0, `maps.${id}.ship 压上 ${DIFFICULTY.spawn.maxAlive} 个身体后初稳性高须仍为正`)
  need(heel < deckEdgeAngle(c, st), `maps.${id}.ship ${DIFFICULTY.spawn.maxAlive} 个身体叠在舷墙边时倾 ${deg(heel)}，超过甲板边入水的 ${deg(deckEdgeAngle(c, st))}`)
  need(Math.tan(heel) > f.body.static, `maps.${id}.ship ${DIFFICULTY.spawn.maxAlive} 个身体叠在舷墙边时只倾 ${deg(heel)}，闲着的身体滑不起来`)
}

/**
 * 出怪口：吸附半径为正；每种的权重为正、限速为正、只出的敌人都存在；抛入的才写抛得到多远、只能摆在地标上，整片地面上的只能钻出或落下；
 * 头目出怪口接得住这张图的头目；配比里的每种敌人都有出怪口接
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  const g = m.gates
  if (!g) continue
  const kinds = Object.entries(g.kinds)
  const at = `maps.${id}.gates`
  need(g.snapU > 0 && kinds.length > 0, `${at} 的吸附半径须为正、至少一种出怪口`)
  need(g.lean === undefined || (g.lean.mul >= 1 && g.lean.full > 0), `${at}.lean 的倍率不小于 1、偏满的量为正`)
  for (const [k, d] of kinds) {
    const p = `${at}.kinds.${k}`
    need(d.weight > 0 && (d.perSec ?? 1) > 0 && (d.snapU ?? 1) > 0, `${p} 的权重、限速与吸附半径须为正`)
    need(d.only === undefined || (d.only.length > 0 && d.only.every((e) => ENEMIES[e] !== undefined)), `${p}.only 须引用存在的敌人`)
    need((d.enter === 'lob') === (d.reachU !== undefined) && (d.reachU ?? 1) > 0, `${p} 抛入的才写抛得到多远，且须为正`)
    need(d.enter !== 'lob' || d.at.kind === 'mark', `${p} 抛入的出怪口只能摆在地标上`)
    need(d.at.kind !== 'ground' || d.enter === 'rise' || d.enter === 'drop', `${p} 摆在整片地面上的只能钻出或落下`)
    if (d.at.kind === 'rim') need(d.at.segU > 0 && (d.at.away?.minU ?? 0) >= 0, `${p} 的段长须为正，离地标的距离不为负`)
    if (d.at.kind === 'nooks') need(d.at.spacingU > 0 && (d.at.away?.minU ?? 0) >= 0, `${p} 的间距须为正，离地标的距离不为负`)
  }
  const takes = (e: EnemyKind): boolean => kinds.some(([, d]) => d.only === undefined || d.only.includes(e))
  const boss = g.boss === undefined ? undefined : g.kinds[g.boss]
  need(g.boss === undefined || (boss !== undefined && (boss.only?.includes(m.boss) ?? true)), `${at}.boss 须是这张图的一种出怪口，接得住头目 ${m.boss}`)
  for (const row of [...m.mix, ...(m.dayMix ?? []), ...(m.nightMix ?? [])]) need(takes(row.kind), `${at} 没有出怪口接配比里的 ${row.kind}`)
}

/** 进场动作：时长为正，高度与距离不为负，落点的距离范围从正数起 */
{
  const e = FEEL.entrance
  need(e.walk.ms > 0 && e.climb.ms > 0 && e.drop.ms > 0 && e.lob.minMs > 0, 'feel.entrance 的时长须为正')
  need(e.walk.heightU >= 0 && e.climb.heightU >= 0 && e.drop.heightU >= 0 && e.lob.heightPerU >= 0 && e.lob.msPerU >= 0 && e.climb.outU >= 0, 'feel.entrance 的高度、距离不为负')
  for (const [name, r] of [['walk', e.walk.distU], ['climb', e.climb.distU]] as const) need(r[0] > 0 && r[0] <= r[1], `feel.entrance.${name}.distU 须从正数起、下限不大于上限`)
}

/**
 * 浮冰：参数合理，冰面在安全区里四周还留着海，冰比海水轻、压满雪也还浮在海面上；摩擦是雪最大、新冰最小。按标准身体：平时的风吹不动站在新冰上的，
 * 阵风吹得动站在新冰上的、吹不动站在雪上的（雪是避风的地方）；每个角色都游得过海流。抽一批种子生成轮廓：不自交，出生的冰心四周空得开
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'floe') === (m.floe !== undefined), `maps.${id} 是浮冰当且仅当写了 floe`)
  const f = m.floe
  if (!f) continue
  const s = f.shape
  const span = (r: readonly [number, number]): boolean => r[0] > 0 && r[0] <= r[1]
  const at = `maps.${id}.floe`
  need(f.meterPerU > 0 && f.cellU > 0, `${at} 的尺度、格子须为正`)
  need(s.spanU > 0 && s.spanU < FRAME_U - SAFE_U * 2, `${at}.shape.spanU 须为正，冰面在安全区里四周还留着海`)
  need(s.turnDeg >= 0 && s.sideDeg >= 0 && s.sideU >= 0 && s.bendU >= 0 && s.jagU >= 0, `${at}.shape 的偏转、拐折与锯齿不为负`)
  need(s.cutChance >= 0 && s.cutChance <= 1 && s.leadChance >= 0 && s.leadChance <= 1, `${at}.shape 的概率须在 [0, 1] 内`)
  need(Number.isInteger(s.bites[0]) && Number.isInteger(s.bites[1]) && s.bites[0] >= 0 && s.bites[0] <= s.bites[1], `${at}.shape.bites 须为非负整数范围`)
  need([s.cutU, s.biteDepthU, s.biteWidthU, s.leadU, s.leadWidthU, s.seamWidthU, s.roundU].every(span), `${at}.shape 的范围须为正且下限不大于上限`)
  const ice = f.ice
  need(ice.thicknessM > 0 && ice.youngM > 0 && ice.youngM < ice.thicknessM && ice.density > 0 && ice.density < ice.seaDensity, `${at}.ice 须新冰比老冰薄、冰比海水轻`)
  need(ice.thicknessM * (1 - ice.density / ice.seaDensity) > (f.snow.maxM * f.snow.density) / ice.seaDensity, `${at} 的冰面压满最深的雪也须高出海面`)
  need(f.snow.maxM >= 0 && f.snow.cover >= 0 && f.snow.cover <= 1 && f.snow.density > 0 && f.snow.waveU > 0 && f.snow.bareU >= 0, `${at}.snow 的雪深、覆盖与尺度须合理`)
  const fr = f.friction
  need([fr.snow, fr.ice, fr.young].every((v) => v.static >= v.kinetic && v.kinetic > 0) && fr.loose > 0, `${at}.friction 的静摩擦须不小于动摩擦、动摩擦为正`)
  need(fr.young.kinetic <= fr.ice.kinetic && fr.ice.kinetic <= fr.snow.kinetic && fr.young.static <= fr.ice.static && fr.ice.static <= fr.snow.static, `${at}.friction 须雪最不滑、新冰最滑`)
  const b = f.body
  need(b.footFrac > 0 && b.footFrac <= 1 && b.swimRatio > 0 && b.swimRatio < 1 && b.refRadiusU > 0 && b.dragU > 0 && b.freezeSec > 0 && b.climbFrac >= 0 && b.climbFrac <= 1, `${at}.body 的比例在 (0, 1] 内、尺度与冻僵时长为正`)
  const w = f.wind
  need(w.meanMs >= 0 && w.gustMs >= w.meanMs && w.firstMs >= 0 && w.riseMs > 0 && w.holdMs >= 0 && w.fallMs > 0 && w.jitterMs >= 0, `${at}.wind 的风速与时长须合理，阵风不弱于平时`)
  need(w.intervalMs - w.jitterMs > w.riseMs + w.holdMs + w.fallMs, `${at}.wind 的间隔减去抖动须长过一轮阵风`)
  need(w.airDensity > 0 && w.dragArea > 0 && w.driftRatio >= 0 && w.veerDeg >= 0 && w.driftDeg >= 0, `${at}.wind 的空气、风阻与漂流须不为负`)
  need(w.meanMs > 0 && w.fetchM > 0, `${at}.wind 的平时风速与风区须为正：海面的风浪按它们长成`)
  const sea = new WindSea(0, 1, w.meanMs, w.fetchM, f.meterPerU, GRAVITY)
  need(sea.long.variance > 0 && sea.short.variance > 0, `${at}.wind 的风浪谱须在长浪、短浪两张图上都有浪：平时的风速与风区让谱峰落在图能画出的波长里`)
  need(f.waterExertion > 0 && f.waterRegen >= 0 && f.coldTickMs > 0, `${at} 的水里费力与结算间隔须为正、回复倍率不为负`)
  const push = (v: number): number => 0.5 * w.airDensity * w.dragArea * v * v
  need(push(w.meanMs) < fr.young.static * GRAVITY, `${at} 平时的风须吹不动站在新冰上的标准身体`)
  need(push(w.gustMs) > fr.young.static * GRAVITY, `${at} 的阵风须吹得动站在新冰上的标准身体`)
  need(push(w.gustMs) < fr.snow.static * GRAVITY, `${at} 的阵风须吹不动站在雪上的标准身体`)
  const current = (w.driftRatio * w.meanMs) / f.meterPerU
  for (const [cid, c] of Object.entries<CharacterAuthoring>(CHARACTERS)) need(c.stats.moveSpeed * b.swimRatio > current * 1.2, `${at} 的海流（${current.toFixed(2)} 格/秒）快得让 characters.${cid} 游不回来`)
  for (let k = 0; k < 16; k++) {
    const { outline } = floeOutline(k * 7919 + 13, f)
    need(simple(outline), `${at} 第 ${k} 个样本的轮廓自交`)
    need(depth(outline, 0, 0) >= SPAWN_CLEAR_U, `${at} 第 ${k} 个样本的冰心离冰缘不到 ${SPAWN_CLEAR_U} 格`)
  }
}

/**
 * 溶洞：地图放得进方框的安全区；洞厅、支洞与天窗都落得进地图；太阳每天升起又落下，时间放慢的窗口罩住天黑那段；正午天窗下的天光亮过熄火把的门槛，
 * 星光暗过刷怪的门槛；火把照得清的范围盖得住夜里的镜头，夜里的镜头又看得见整个队伍
 */
const DEG = Math.PI / 180
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'cave') === (m.cave !== undefined), `maps.${id} 是溶洞当且仅当写了 cave`)
  const c = m.cave
  if (!c) continue
  const mapW = m.size?.w ?? MAP_DEFAULTS.width
  const mapH = m.size?.h ?? MAP_DEFAULTS.height
  const side = Math.min(mapW, mapH)
  const span = (r: readonly [number, number]): boolean => r[0] <= r[1]
  const ints = (r: readonly [number, number]): boolean => Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] >= 0 && span(r)
  const { hall, skylights: s, alcoves: a, formations: f, pools: p, sky, light, torch, view } = c
  need(hall.insetU[0] > 0 && span(hall.insetU) && hall.waveU > 0 && hall.cornerU >= 0 && hall.neckU > 0 && hall.wallU > 0, `maps.${id}.cave.hall 的边距、波长、窄缝与洞壁宽须为正，磨角不为负`)
  need(hall.ceilingM > f.stalagmiteM[1] && hall.ceilingM > s.rubbleM, `maps.${id}.cave.hall.ceilingM 须高过最高的石笋与碎石坡`)
  need(Math.max(mapW, mapH) <= FRAME_U - SAFE_U * 2, `maps.${id}.cave 的地图须放得进方框的安全区`)
  need(a.outU + a.pocketU + 1.2 < side / 2 - 4, `maps.${id}.cave.alcoves 往外走的深度须让洞厅中间留得出地方`)
  need(s.mainU[0] > 0 && span(s.mainU) && s.mainOffsetU[0] >= 0 && span(s.mainOffsetU) && s.jitter >= 0 && s.jitter < 0.5 && s.gapU >= 0, `maps.${id}.cave.skylights 的半径与偏移须为正、起伏在 0 到 0.5 之间`)
  need(s.mainOffsetU[1] + s.mainU[1] * (1 + s.jitter) < side / 2 - Math.max(hall.insetU[1], a.outU + a.pocketU + 1.2) - 1, `maps.${id}.cave.skylights 的主天窗须整个开在洞厅上方`)
  need(ints(s.mainCount) && s.mainCount[0] >= 1, `maps.${id}.cave.skylights 至少一个大天窗：出生点附近要有天光`)
  need(ints(s.minorCount) && s.minorU[0] > 0 && span(s.minorU) && s.rubbleM >= 0 && s.rubbleSpread >= 1, `maps.${id}.cave.skylights 的小天窗个数须为非负整数、半径为正，碎石坡不比天窗小`)
  need(ints(a.count) && a.count[0] >= 1, `maps.${id}.cave.alcoves 至少一条：白天怪物要有暗处出来`)
  need(a.widthU > 2 * hall.neckU && a.outU > a.widthU / 2 && a.alongU[0] > 0 && span(a.alongU) && a.pocketU * 2 >= a.widthU, `maps.${id}.cave.alcoves 须宽过窄缝、拐进岩体、尽头的暗室不比通道窄`)
  need(ints(f.columns) && ints(f.stalagmites) && ints(f.clusters) && f.columnU[0] > f.blockU && span(f.columnU), `maps.${id}.cave.formations 的个数须为非负整数，石柱挡路`)
  need(f.stalagmiteU[0] > 0 && span(f.stalagmiteU) && f.stalagmiteM[0] > 0 && span(f.stalagmiteM) && f.lowM[0] > 0 && span(f.lowM), `maps.${id}.cave.formations 的石笋尺寸须为正`)
  {
    const B = OBSTACLES.body
    const layerM = B.heightM / B.layers
    const over = Math.floor(B.layers * B.step)
    need(f.lowM[1] <= over * layerM && f.stalagmiteM[0] > B.heightM, `maps.${id}.cave.formations 的矮石笋须矮得让标准身体跨过去，挡路的石笋须高过标准身体`)
  }
  need(f.clearU >= SPAWN_CLEAR_U + hall.neckU, `maps.${id}.cave.formations.clearU 须比出生点要空出的 ${SPAWN_CLEAR_U} 格再宽一道窄缝：石头之间的窄缝填平后，出生点四周也空得开`)
  need(ints(p.count) && p.sizeU[0] > 0 && span(p.sizeU) && p.viscosity >= 1 && p.exertion >= 0, `maps.${id}.cave.pools 的个数须为非负整数、尺寸为正，水里不比平地快`)
  need(Math.abs(Math.tan(sky.latitudeDeg * DEG) * Math.tan(sky.declinationDeg * DEG)) < 1, `maps.${id}.cave.sky 须让太阳每天升起又落下`)
  need(sky.dayS > 0 && sky.startHour >= 0 && sky.startHour < 24 && sky.extinction > 0 && sky.dwell >= 0 && sky.dwellWidthDeg > 0, `maps.${id}.cave.sky 的一天须为正、开局的钟点在一天里`)
  const dusk = crossings(sky, sky.dwellCenterDeg)
  need(dusk !== null && sky.dwellCenterDeg < 0, `maps.${id}.cave.sky.dwellCenterDeg 须落在日落之后、太阳每天都经过的高度`)
  need(light.albedo > 0 && light.albedo < 1 && light.bounceU > 0 && ints(light.glowCount) && light.glowLux >= 0 && light.glowLux < c.spawnLux, `maps.${id}.cave.light 的反照率在 0 到 1 之间，荧光暗过刷怪的门槛`)
  need(torch.candela > 0 && torch.heightM > 0 && torch.staggerMs >= 0 && torch.igniteLux > c.spawnLux && torch.douseLux > torch.igniteLux, `maps.${id}.cave.torch 须比刷怪的门槛亮时就点起，熄火的门槛高过点火的（不来回闪）`)
  need(view.darkLux > 0 && view.brightLux > view.darkLux && view.clearLux > 0 && view.nightU > 0 && view.dayU > view.nightU, `maps.${id}.cave.view 须白天比夜里看得远、照度门槛为正`)
  const noon = noonElevDeg(sky)
  const noonSky = skyLux(noon) * discViewFactor(s.mainU[0], hall.ceilingM)
  need(noonSky > torch.douseLux, `maps.${id}.cave 正午主天窗正下方的天光只有 ${Math.round(noonSky)} 勒克斯，熄不了火把`)
  need(skyLux(-18) < c.spawnLux, `maps.${id}.cave 深夜的星光须暗过刷怪的门槛`)
  const reach = torchReachU(torch, view.clearLux)
  need(reach >= view.nightU / 2, `maps.${id}.cave 火把只照得清 ${reach.toFixed(1)} 格，盖不住夜里镜头短边的一半 ${view.nightU / 2} 格`)
  const squad = FEEL.squad.fanDistance + TEAM_BASELINE.member.radius * TEAM_BASELINE.team.followerSizeMul
  need(view.nightU / 2 > squad, `maps.${id}.cave.view.nightU 的一半须大于 ${squad} 格，夜里看得见跟在身后的队员`)
  need(view.dayU <= FRAME_U, `maps.${id}.cave.view.dayU 须让白天的镜头落在方框以内`)
}

/**
 * 草甸：参数说得通；陡坡背着太阳时，最矮最缓的一段影子也落得出坡脚；抽一批种子真的生成一遍：每张都生成得出来，
 * 开局站位离边够远，栅栏有门，林子里有树，栅栏外有羊
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'meadow') === (m.meadow !== undefined), `maps.${id} 是草甸当且仅当写了 meadow`)
  const g = m.meadow
  if (!g) continue
  const at = `maps.${id}.meadow`
  const range = (v: readonly [number, number], int: boolean): boolean => v[0] >= 0 && v[0] <= v[1] && (!int || (Number.isInteger(v[0]) && Number.isInteger(v[1])))
  const { bank, forest, trail, fence, flowers, turf } = g
  need(g.meterPerU > 0 && g.sizeU > 0 && g.neckU > 0, `${at} 的米每格、地图边长与窄缝须为正`)
  need(g.sizeU <= FRAME_U - SAFE_U * 2, `${at}.sizeU 须放得进方框的安全区`)
  need(g.areaU2[0] > 0 && range(g.areaU2, false) && g.areaU2[1] < g.sizeU * g.sizeU, `${at}.areaU2 须为正的范围、小于整张地图`)
  need(turf.reliefM >= 0 && turf.waveU > 0 && turf.riseM >= 0, `${at}.turf 的起伏、坡度不为负，波长为正`)
  need(bank.insetU[0] > 0 && range(bank.insetU, false) && bank.insetU[1] < g.sizeU / 4, `${at}.bank.insetU 须让坡脚落在地图边与中线之间`)
  need(bank.bendU >= 0 && bank.waveU > 0 && range(bank.spurs, true) && bank.spurU[0] > 0 && range(bank.spurU, false) && bank.spurWidthU[0] > 0 && range(bank.spurWidthU, false), `${at}.bank 的弯与鼓包须为正的范围`)
  need(bank.heightM[0] > 0 && range(bank.heightM, false) && bank.riseM[0] > 0 && range(bank.riseM, false), `${at}.bank 的坡高与坡面每格升多少须为正的范围`)
  // 陡坡背着太阳（太阳在坡那边）时：顺着坡的法向，光线每往草地这边一格降 drop 米；坡最矮最缓的一段挡下的光，也要在坡脚外落下一溜影子
  const sunLen = Math.hypot(SUN.x, SUN.y)
  for (const c of [SUN.x, -SUN.x, SUN.y, -SUN.y].map((v) => v / sunLen).filter((v) => v > 0)) {
    const drop = ((SUN.z / sunLen) * g.meterPerU) / c
    const width = bank.heightM[0] / bank.riseM[0]
    let over = 0
    for (let t = 0; t <= 1; t += 0.01) over = Math.max(over, bank.heightM[0] * bankShape(t) - drop * width * t)
    need(over / drop >= 0.25, `${at}.bank 最矮最缓的一段坡背着太阳时，影子只落出坡脚 ${(over / drop).toFixed(2)} 格，须至少 0.25 格：坡要比太阳的光线陡`)
  }
  need(forest.insetU[0] > 0 && range(forest.insetU, false) && forest.insetU[1] < g.sizeU / 4, `${at}.forest.insetU 须让林缘落在地图边与中线之间`)
  need(forest.bendU >= 0 && forest.waveU > 0 && forest.scallopU >= 0 && range(forest.lobes, true) && forest.lobeU[0] > 0 && range(forest.lobeU, false) && forest.lobeWidthU[0] > 0 && range(forest.lobeWidthU, false), `${at}.forest 的弯与林舌草湾须为正的范围`)
  need(forest.crownU[0] > 0 && range(forest.crownU, false) && forest.heightM[0] > 0 && range(forest.heightM, false) && forest.edgeU[0] > 0 && range(forest.edgeU, false), `${at}.forest 的树冠与树高须为正的范围`)
  need(forest.birch >= 0 && forest.birch <= 1 && forest.overhangU >= 0 && forest.overhangU < forest.edgeU[0], `${at}.forest 的白桦占比须在 [0, 1] 内，树冠探进草地的那截比最小的树冠还小`)
  need(trail.notchU > 0 && trail.widthU > g.neckU * 2 && trail.logU[0] > trail.widthU && range(trail.logU, false), `${at}.trail 的路口须走得进去、比窄缝宽，倒木比路口宽`)
  need(fence.insetU[0] > 0 && range(fence.insetU, false) && fence.insetU[1] < g.sizeU / 4, `${at}.fence.insetU 须让栅栏落在地图边与中线之间`)
  need(fence.skewDeg >= 0 && fence.skewDeg < 30 && fence.kinkDeg >= 0 && fence.kinkDeg < 30, `${at}.fence 的斜度与拐角须在 0 到 30 度之间`)
  need(fence.postU > 0 && fence.heightM > 0 && fence.gateU > 0 && fence.farChance >= 0 && fence.farChance <= 1, `${at}.fence 的桩距、桩高与门宽须为正，在对边的概率在 [0, 1] 内`)
  need(flowers.cover > 0 && flowers.cover < 1 && flowers.patchU > 0, `${at}.flowers 的覆盖须在 (0, 1) 内、花片的尺度为正`)
  need(range(g.sheep, true), `${at}.sheep 须为非负整数范围`)
  for (let s = 0; s < 24; s++) {
    const plan = meadowPlan(g, s * 7919 + 13)
    const where = `${at} 第 ${s} 个样本`
    need(roomAt(plan.basin, plan.start.x * UNIT, plan.start.y * UNIT) >= SPAWN_CLEAR_U * UNIT, `${where} 的开局站位离边不到 ${SPAWN_CLEAR_U} 格`)
    need(plan.gate.index >= 0 && plan.posts.length >= 4, `${where} 的栅栏没有门或太短`)
    need(plan.trees.length > 0 && plan.sheep.length >= Math.min(1, g.sheep[1]), `${where} 的林子里没有树或栅栏外没有羊`)
  }
}

/**
 * 深海：参数说得通；头骨挡得住标准身体、大石头比标准身体矮的子弹飞得过去；艇身收得出艇尾、门开在一样粗的那一段、比标准身体高，门口那一片装得下队长和跟在身后的队员，
 * 喘上气补得比憋气掉得快，满满一口气撑得过潜艇开走一次的两倍时间，开走一次走完才到下一次；
 * 抽一批种子真的生成一遍：每张都生成得出来，开局站位离边够远，陡坎沿、岩堆脚、鲸骨与冷泉都有出怪的地标，潜艇在开局站位旁停得下、也开得出去
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'deep') === (m.deep !== undefined), `maps.${id} 是深海当且仅当写了 deep`)
  const d = m.deep
  if (!d) continue
  const at = `maps.${id}.deep`
  const span = (v: readonly [number, number]): boolean => v[0] <= v[1]
  const pos = (v: readonly [number, number]): boolean => v[0] > 0 && span(v)
  const ints = (v: readonly [number, number]): boolean => Number.isInteger(v[0]) && Number.isInteger(v[1]) && v[0] >= 0 && span(v)
  const { floor, walls, rubble, lip, boulders, whale, seeps, sub } = d
  const half = d.sizeU / 2 - SPAWN_CLEAR_U - 1
  need(d.meterPerU > 0 && d.sizeU > 0 && d.neckU > 0, `${at} 的米每格、地图边长与窄缝须为正`)
  need(d.sizeU <= FRAME_U - SAFE_U * 2, `${at}.sizeU 须放得进方框的安全区`)
  need(pos(d.areaU2) && d.areaU2[1] < d.sizeU * d.sizeU, `${at}.areaU2 须为正的范围、小于整张地图`)
  need(floor.reliefM >= 0 && floor.waveU > 0 && floor.tiltM >= 0, `${at}.floor 的起伏与坡度不为负、波长为正`)
  for (const [name, e] of [['walls', walls], ['rubble', rubble], ['lip', lip]] as const) {
    need(pos(e.insetU) && e.bendU >= 0 && e.waveU > 0 && e.insetU[1] + e.bendU < half, `${at}.${name} 的边距、弯与波长须为正，边落在地图边与出生点四周的空地之间`)
  }
  need(pos(walls.heightM) && pos(walls.slopeU), `${at}.walls 的壁高与壁宽须为正的范围`)
  need(pos(rubble.blockU) && pos(rubble.heightM) && rubble.slopeU > 0, `${at}.rubble 的石块、堆高与堆宽须为正`)
  need(lip.dropM > 0, `${at}.lip.dropM 须为正：坎外是往下的坡`)
  const B = OBSTACLES.body
  const clearM = (B.heightM / B.layers) * Math.floor(B.layers * B.step)
  need(ints(boulders.count) && pos(boulders.radiusU) && pos(boulders.heightM) && boulders.heightM[0] > clearM, `${at}.boulders 的个数须为非负整数、尺寸为正，最矮的也挡得住标准身体`)
  need(boulders.clearU >= SPAWN_CLEAR_U && boulders.gapU > 2 * d.neckU && boulders.wallShare >= 0 && boulders.wallShare <= 1, `${at}.boulders 离出生点至少 ${SPAWN_CLEAR_U} 格、彼此隔得开窄缝，靠壁的占比在 [0, 1] 内`)
  need(pos(whale.lengthM) && whale.clearU >= SPAWN_CLEAR_U && whale.skullM > clearM, `${at}.whale 的鲸长须为正，头骨离出生点至少 ${SPAWN_CLEAR_U} 格、高得挡住标准身体`)
  need(ints(seeps.count) && seeps.count[0] >= 1 && pos(seeps.radiusU) && seeps.clearU >= SPAWN_CLEAR_U, `${at}.seeps 至少一处、半径为正，离出生点至少 ${SPAWN_CLEAR_U} 格`)
  const hull = hullOf(sub)
  need(sub.beamU > 0 && sub.lengthU > sub.beamU && hull.tail < hull.neck && hull.neck <= hull.door && hull.door <= hull.bow && hull.r - hull.tailR < hull.neck - hull.tail, `${at}.sub 的艇身太短：收不出艇尾，门也要开在一样粗的那一段`)
  need(sub.heightM > B.heightM && sub.cruiseM > B.heightM, `${at}.sub 的艇身须比标准身体高，开走时浮得过身体的头顶`)
  need(sub.hold > 0 && sub.breath > sub.hold && sub.drownSec > 0 && sub.tickMs > 0, `${at}.sub 憋气要掉气、换气补得比掉得快，呛水的时长与节拍为正`)
  const squad = FEEL.squad.fanDistance + TEAM_BASELINE.member.radius * TEAM_BASELINE.team.followerSizeMul
  need(sub.doorU >= squad + 0.5, `${at}.sub 门口那一片只有 ${sub.doorU} 格，装不下跟在队长身后 ${squad.toFixed(2)} 格的队员`)
  need(sub.roomU > 0 && pos(sub.moveU) && sub.moveU[1] < d.sizeU, `${at}.sub 的艇壁离边要留空，开走的距离须为正、比地图小`)
  need(sub.firstMs > 0 && sub.jitterMs >= 0 && sub.warnMs > 0 && sub.riseMs > 0 && sub.settleMs > 0 && sub.speedMs > 0, `${at}.sub 开走的各段时长与速度须为正`)
  const transitMs = sub.riseMs + sub.settleMs + ((sub.moveU[1] * d.meterPerU) / sub.speedMs) * 1000
  need(sub.intervalMs - sub.jitterMs > sub.warnMs + transitMs, `${at}.sub 潜艇开走一次走完前不该到下一次`)
  need((STATS.maxStamina.base / sub.hold) * 1000 >= transitMs * 2, `${at}.sub 满满一口气撑 ${(STATS.maxStamina.base / sub.hold).toFixed(1)} 秒，撑不过潜艇开走一次的两倍时间`)
  for (let s = 0; s < 24; s++) {
    const where = `${at} 第 ${s} 个样本`
    let plan: ReturnType<typeof deepPlan>
    try {
      plan = deepPlan(d, s * 7919 + 13)
    } catch (e) {
      need(false, `${where} 生成不出来：${(e as Error).message}`)
      continue
    }
    const sx = plan.start.x * UNIT
    const sy = plan.start.y * UNIT
    need(roomAt(plan.basin, sx, sy) >= SPAWN_CLEAR_U * UNIT, `${where} 的开局站位离边不到 ${SPAWN_CLEAR_U} 格`)
    const mk = plan.marks
    need(mk.abyss.length >= 3 && mk.rubble.length >= 2 && mk.bones.length >= 2 && mk.seep.length >= seeps.count[0], `${where} 的陡坎沿、岩堆脚、鲸骨或冷泉缺出怪的地标`)
    const berth = { plan, hull, rim: rimOf(hull, 48), inner: innerOf(hull, 0.5) }
    const home = homePose(berth, sub)
    need(fits(berth, sub, home, sub.roomU * UNIT), `${where} 的潜艇在开局站位旁停不下：艇壁离边与石头不到 ${sub.roomU} 格`)
    let moves = 0
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2
      const r = ((sub.moveU[0] + sub.moveU[1]) / 2) * UNIT
      const x = home.x + Math.cos(a) * r
      const y = home.y + Math.sin(a) * r
      if ([0, 1, 2, 3, 4, 5, 6, 7].some((j) => fits(berth, sub, { x, y, a: (j / 8) * Math.PI * 2 }, sub.roomU * UNIT))) moves++
    }
    need(moves >= 4, `${where} 的潜艇从开局停的地方开不出去：开走的距离上几乎找不到停得下的地方`)
  }
}

/**
 * 樱庭：参数说得通；槛下的溪比槛顶低过汇的深度；抽一批种子真的生成一遍：每张都生成得出来，
 * 开局站位离边够远，桥两头落在能走的地方，石槛顶没有塌下去的缺口
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'sakura') === (m.sakura !== undefined), `maps.${id} 是樱庭当且仅当写了 sakura`)
  const s = m.sakura
  if (!s) continue
  const at = `maps.${id}.sakura`
  const range = (v: readonly [number, number], int: boolean): boolean => v[0] >= 0 && v[0] <= v[1] && (!int || (Number.isInteger(v[0]) && Number.isInteger(v[1])))
  const { wall, forest: fo, stream: st, flow: f, rocks: rk, sill: sl, bridge: bg, trees: tr, body: b } = s
  need(s.meterPerU > 0 && s.cellU > 0 && s.sizeU > 0 && s.neckU > 0, `${at} 的米每格、地形格子、地图边长与窄缝须为正`)
  need(s.sizeU <= FRAME_U - SAFE_U * 2, `${at}.sizeU 须放得进方框的安全区`)
  need(s.areaU2[0] > 0 && range(s.areaU2, false) && s.areaU2[1] < s.sizeU * s.sizeU, `${at}.areaU2 须是比整张地图小的正的范围`)
  need(wall.insetU[0] > wall.thickU / 2 && range(wall.insetU, false) && wall.skewDeg >= 0 && wall.skewDeg < 30 && wall.kinkDeg >= 0 && wall.kinkDeg < 30, `${at}.wall 的墙身离地图边至少半个墙厚，整条斜与中途拐都不到 30 度`)
  need(wall.thickU > 0 && wall.heightM > 0 && wall.eaveU >= 0 && wall.gateU > 0, `${at}.wall 的墙厚、墙高、院门宽须为正，屋檐不为负`)
  need(fo.insetU[0] > 0 && range(fo.insetU, false) && fo.bendU >= 0 && fo.waveU > 0 && fo.scallopU >= 0 && range(fo.lobes, true) && range(fo.lobeU, false) && fo.lobeWidthU[0] > 0 && range(fo.lobeWidthU, false), `${at}.forest 的林缘离地图边、弯的幅度与波长、林舌草湾的大小须说得通`)
  need(st.slantDeg > 0 && st.slantDeg < 45 && st.turnDeg >= 0 && st.meanderU >= 0 && st.minBend >= 1 && st.wallGapU >= 0, `${at}.stream 的斜角在 (0, 45) 度里，偏角与蜿蜒不为负、弯道半径至少一个水面宽、离寺墙不为负`)
  need(f.discharge > 0 && f.widthCoef > 0 && f.depthCoef > 0 && f.manning > 0 && f.bedShape >= 1, `${at}.flow 的流量、水力几何系数与糙率须为正，断面形状指数不小于 1`)
  need(f.riffle > 0 && f.riffle <= 1 && f.pool >= 1 && f.thalwegShift >= 0 && f.thalwegShift < 1, `${at}.flow 的浅滩不深过平均、深潭不浅过平均，深泓偏不出溪岸`)
  need(f.bankM > 0 && f.bankU > 0 && f.floodSlope >= 0 && f.reliefM >= 0, `${at}.flow 的溪岸须有高有宽，滩地不往溪里倾`)
  need(rk.radiusU[0] > 0 && range(rk.radiusU, false) && range(rk.gapU, false) && rk.gapU[1] < b.radiusU && rk.heightM > 0, `${at}.rocks 的石头有大小，石缝窄过身子的半径，石顶露出水面`)
  need(sl.rampU > 0 && sl.dropM + 0.3 > SINK_M && sl.postU > 0 && sl.heightM > 0, `${at}.sill 的槛前有坡，槛下的溪比槛顶低过 ${SINK_M} 米（水流到那里才算落下去），竹栅有桩距有高`)
  need(bg.widthU > s.neckU * 2 && bg.rampU > 0 && bg.riseM > 0 && bg.at[0] > 0 && range(bg.at, false) && bg.at[1] < 1, `${at}.bridge 的桥面须比窄缝宽、坡道与拱有长有高，架在溪的 (0, 1) 段`)
  need(tr.crownU[0] > tr.overhangU && range(tr.crownU, false) && tr.heightM[0] > 0 && range(tr.heightM, false) && range(tr.inside, true) && tr.templeGapU > 0, `${at}.trees 的树冠须比能走进去的那截大，树高为正，空地上的棵数为非负整数范围，寺里的间距为正`)
  need(b.kg > 0 && b.radiusU > 0 && b.density > 0 && b.drag > 0, `${at}.body 的体重、半径、密度与阻力系数须为正`)
  need(b.legs > 0 && b.legs <= 1 && b.hip > 0 && b.hip < 1 && b.lever > 0 && b.mu > 0, `${at}.body 的腿宽须在 (0, 1] 内，胯高在 (0, 1) 内，扶正力臂与脚底摩擦系数为正`)
  need(b.swim >= 0 && b.wetM > 0, `${at}.body 的划水不为负，湿地水深为正`)
  for (let k = 0; k < 8; k++) {
    const plan = sakuraPlan(s, k * 7919 + 13)
    const where = `${at} 第 ${k} 个样本`
    need(roomAt(plan.basin, plan.start.x * UNIT, plan.start.y * UNIT) >= SPAWN_CLEAR_U * UNIT, `${where} 的开局站位离边不到 ${SPAWN_CLEAR_U} 格`)
    const br = plan.bridge
    for (const sgn of [-1, 1]) {
      const x = br.x + br.ax * sgn * (br.half - 0.3)
      const y = br.y + br.ay * sgn * (br.half - 0.3)
      need(roomAt(plan.basin, x * UNIT, y * UNIT) > 0.5 * UNIT && Math.abs(bridgeLocal(br, x, y).a) < br.half, `${where} 的桥头没落在能走的地方`)
    }
    const t = plan.terrain
    let notch = 0
    for (let i = 0; i < t.z.length; i++) {
      const wl = weirLocal(plan.weir, t.x0 + ((i % t.cols) + 0.5) * t.cell, t.y0 + (Math.floor(i / t.cols) + 0.5) * t.cell)
      if (wl.side < plan.weir.half && wl.along >= 0 && wl.along < CREST_U - 0.05 && t.z[i]! < plan.weir.crest - 0.01) notch++
    }
    need(notch === 0, `${where} 的石槛顶有 ${notch} 格塌了下去，水会从缺口漏走`)
  }
}

/**
 * 红叶林：参数说得通；槛下的溪比槛顶低过汇的深度；抽一批种子真的生成一遍：每张都生成得出来，
 * 开局站位离边够远，桥两头落在能走的地方，石槛顶没有塌下去的缺口
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'maple') === (m.maple !== undefined), `maps.${id} 是红叶林当且仅当写了 maple`)
  const s = m.maple
  if (!s) continue
  const at = `maps.${id}.maple`
  const range = (v: readonly [number, number], int: boolean): boolean => v[0] >= 0 && v[0] <= v[1] && (!int || (Number.isInteger(v[0]) && Number.isInteger(v[1])))
  const { wall, forest: fo, stream: st, flow: f, rocks: rk, sill: sl, bridge: bg, trees: tr, body: b } = s
  need(s.meterPerU > 0 && s.cellU > 0 && s.sizeU > 0 && s.neckU > 0, `${at} 的米每格、地形格子、地图边长与窄缝须为正`)
  need(s.sizeU <= FRAME_U - SAFE_U * 2, `${at}.sizeU 须放得进方框的安全区`)
  need(s.areaU2[0] > 0 && range(s.areaU2, false) && s.areaU2[1] < s.sizeU * s.sizeU, `${at}.areaU2 须是比整张地图小的正的范围`)
  need(wall.insetU[0] > wall.thickU / 2 && range(wall.insetU, false) && wall.skewDeg >= 0 && wall.skewDeg < 30 && wall.kinkDeg >= 0 && wall.kinkDeg < 30, `${at}.wall 的墙身离地图边至少半个墙厚，整条斜与中途拐都不到 30 度`)
  need(wall.thickU > 0 && wall.heightM > 0 && wall.eaveU >= 0 && wall.gateU > 0, `${at}.wall 的墙厚、墙高、院门宽须为正，屋檐不为负`)
  need(fo.insetU[0] > 0 && range(fo.insetU, false) && fo.bendU >= 0 && fo.waveU > 0 && fo.scallopU >= 0 && range(fo.lobes, true) && range(fo.lobeU, false) && fo.lobeWidthU[0] > 0 && range(fo.lobeWidthU, false), `${at}.forest 的林缘离地图边、弯的幅度与波长、林舌草湾的大小须说得通`)
  need(st.slantDeg > 0 && st.slantDeg < 45 && st.turnDeg >= 0 && st.meanderU >= 0 && st.minBend >= 1 && st.wallGapU >= 0, `${at}.stream 的斜角在 (0, 45) 度里，偏角与蜿蜒不为负、弯道半径至少一个水面宽、离寺墙不为负`)
  need(f.discharge > 0 && f.widthCoef > 0 && f.depthCoef > 0 && f.manning > 0 && f.bedShape >= 1, `${at}.flow 的流量、水力几何系数与糙率须为正，断面形状指数不小于 1`)
  need(f.riffle > 0 && f.riffle <= 1 && f.pool >= 1 && f.thalwegShift >= 0 && f.thalwegShift < 1, `${at}.flow 的浅滩不深过平均、深潭不浅过平均，深泓偏不出溪岸`)
  need(f.bankM > 0 && f.bankU > 0 && f.floodSlope >= 0 && f.reliefM >= 0, `${at}.flow 的溪岸须有高有宽，滩地不往溪里倾`)
  need(rk.radiusU[0] > 0 && range(rk.radiusU, false) && range(rk.gapU, false) && rk.gapU[1] < b.radiusU && rk.heightM > 0, `${at}.rocks 的石头有大小，石缝窄过身子的半径，石顶露出水面`)
  need(sl.rampU > 0 && sl.dropM + 0.3 > MAPLE_SINK_M && sl.postU > 0 && sl.heightM > 0, `${at}.sill 的槛前有坡，槛下的溪比槛顶低过 ${MAPLE_SINK_M} 米（水流到那里才算落下去），竹栅有桩距有高`)
  need(bg.widthU > s.neckU * 2 && bg.rampU > 0 && bg.riseM > 0 && bg.at[0] > 0 && range(bg.at, false) && bg.at[1] < 1, `${at}.bridge 的桥面须比窄缝宽、坡道与拱有长有高，架在溪的 (0, 1) 段`)
  need(tr.crownU[0] > tr.overhangU && range(tr.crownU, false) && tr.heightM[0] > 0 && range(tr.heightM, false) && range(tr.inside, true) && tr.templeGapU > 0, `${at}.trees 的树冠须比能走进去的那截大，树高为正，空地上的棵数为非负整数范围，寺里的间距为正`)
  need(b.kg > 0 && b.radiusU > 0 && b.density > 0 && b.drag > 0, `${at}.body 的体重、半径、密度与阻力系数须为正`)
  need(b.legs > 0 && b.legs <= 1 && b.hip > 0 && b.hip < 1 && b.lever > 0 && b.mu > 0, `${at}.body 的腿宽须在 (0, 1] 内，胯高在 (0, 1) 内，扶正力臂与脚底摩擦系数为正`)
  need(b.swim >= 0 && b.wetM > 0, `${at}.body 的划水不为负，湿地水深为正`)
  for (let k = 0; k < 8; k++) {
    const plan = maplePlan(s, k * 7919 + 13)
    const where = `${at} 第 ${k} 个样本`
    need(roomAt(plan.basin, plan.start.x * UNIT, plan.start.y * UNIT) >= SPAWN_CLEAR_U * UNIT, `${where} 的开局站位离边不到 ${SPAWN_CLEAR_U} 格`)
    const br = plan.bridge
    for (const sgn of [-1, 1]) {
      const x = br.x + br.ax * sgn * (br.half - 0.3)
      const y = br.y + br.ay * sgn * (br.half - 0.3)
      need(roomAt(plan.basin, x * UNIT, y * UNIT) > 0.5 * UNIT && Math.abs(mapleBridgeLocal(br, x, y).a) < br.half, `${where} 的桥头没落在能走的地方`)
    }
    const t = plan.terrain
    let notch = 0
    for (let i = 0; i < t.z.length; i++) {
      const wl = mapleWeirLocal(plan.weir, t.x0 + ((i % t.cols) + 0.5) * t.cell, t.y0 + (Math.floor(i / t.cols) + 0.5) * t.cell)
      if (wl.side < plan.weir.half && wl.along >= 0 && wl.along < MAPLE_CREST_U - 0.05 && t.z[i]! < plan.weir.crest - 0.01) notch++
    }
    need(notch === 0, `${where} 的石槛顶有 ${notch} 格塌了下去，水会从缺口漏走`)
  }
}

/**
 * 电路板：参数说得通——过道与两尖之间走得过标准身体，时钟线的线距比线宽宽，队长和小怪站在开关的圆金上脚碰不到盘外带电的铜（栅格再差一格也碰不到）；
 * 抽一批种子真的生成一遍：每块都生成得出来，开局站位四周空着，带电网络的条数编得进电流着色器，电弧的处数在范围里
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'circuit') === (m.circuit !== undefined), `maps.${id} 是电路板当且仅当写了 circuit`)
  const c = m.circuit
  if (!c) continue
  const at = `maps.${id}.circuit`
  const range = (v: readonly [number, number], int: boolean): boolean => v[0] >= 0 && v[0] <= v[1] && (!int || (Number.isInteger(v[0]) && Number.isInteger(v[1])))
  const body = TEAM_BASELINE.member.radius * 2
  const { frame, shock, rail, clock, arc, button } = c
  need(c.mmPerU > 0 && c.bodyMM > 0 && c.sizeU > 0 && c.neckU > 0 && c.plazaU - 0.5 >= SPAWN_CLEAR_U, `${at} 的毫米每格、身高、地图边长与窄缝须为正，开局空地空得出出生点要的格数`)
  need(c.sizeU <= FRAME_U - SAFE_U * 2, `${at}.sizeU 须放得进方框的安全区`)
  need(c.areaU2[0] > 0 && range(c.areaU2, false) && c.areaU2[1] < c.sizeU * c.sizeU, `${at}.areaU2 须为正的范围、小于整张地图`)
  need(frame.insetU[0] > 0 && range(frame.insetU, false) && frame.chamferU[0] > 0 && range(frame.chamferU, false) && frame.heightMM > 0, `${at}.frame 的内缩、斜角与罩高须为正`)
  need(range(c.aisleU, false) && c.aisleU[0] > body + c.neckU * 2 && range(c.chipU, false), `${at}.aisleU 须走得过标准身体，chipU 须为非负的范围`)
  need(shock.teamDps > 0 && shock.enemyDps > 0 && shock.tickMs > 0 && shock.footFrac > 0 && shock.footFrac <= 1, `${at}.shock 的伤害与结算间隔须为正，脚的范围在 (0, 1] 内`)
  need(rail.widthU[0] > 0 && range(rail.widthU, false), `${at}.rail.widthU 须为正的范围`)
  need(clock.traces[0] >= 1 && range(clock.traces, true) && clock.widthU > 0 && clock.pitchU > clock.widthU, `${at}.clock 须至少一条线，线距比线宽宽`)
  need(clock.offMs > 0 && clock.warnMs > 0 && clock.onMs > 0, `${at}.clock 的节拍须为正`)
  need(arc.count[0] >= 1 && range(arc.count, true) && arc.count[1] <= 3, `${at}.arc.count 须在 1 到 3 处之间`)
  need(arc.gapU[0] > body && range(arc.gapU, false) && arc.reachU >= 0, `${at}.arc.gapU 须走得过标准身体`)
  need(arc.restMs >= 0 && arc.chargeMs > 0 && arc.arcMs > 0 && arc.teamDamage > 0 && arc.enemyDamage > 0, `${at}.arc 的节拍与伤害须为正`)
  need(button.padU > 0 && button.plateU[0] > button.padU && range(button.plateU, false) && button.reachU[0] > 0 && range(button.reachU, false), `${at}.button 的开关、铜板与连线须为正，铜板比开关大`)
  need(button.holdMs > 0 && button.rearmMs >= 0, `${at}.button 通多久须为正、歇多久不能为负`)
  const feet = Math.max(TEAM_BASELINE.member.radius * TEAM_BASELINE.team.leaderSizeMul, ...m.mix.map((row) => ENEMIES[row.kind]?.radius ?? 0)) * shock.footFrac
  need(button.touchU > 0 && button.padU - button.touchU > feet + COPPER_CELL_U, `${at}.button.touchU 须为正，离盘边比队长和小怪的脚宽出一格栅格：站在开关上碰不到带电的铜`)
  for (let s = 0; s < 16; s++) {
    const plan = circuitPlan(c, s * 7919 + 13)
    const where = `${at} 第 ${s} 个样本`
    need(roomAt(plan.basin, plan.start.x * UNIT, plan.start.y * UNIT) >= (c.plazaU - 0.5) * UNIT, `${where} 的开局站位四周不够空`)
    need(plan.nets.length <= NET_SLOTS, `${where} 的带电网络太多，编不进电流着色器`)
    need(plan.gaps.length >= arc.count[0] && plan.gaps.length <= arc.count[1], `${where} 的电弧处数不在范围里`)
  }
}

/**
 * 天枢：大厅放得进方框的安全区，开局空地空得出出生点要的格数；门线是整格长、落在格线上；
 * 全息台挡得住标准身体、又比平射的子弹矮；门的对数不超过颜色的种数，挪门的间隔比预警长。
 * 抽一批种子真的生成一遍：每个都生成得出来，开局站位四周空着，门的对数在范围里，同一对朝向相同、隔得够远，横竖两种门各有足够的地方挪
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'nexus') === (m.nexus !== undefined), `maps.${id} 是天枢当且仅当写了 nexus`)
  const c = m.nexus
  if (!c) continue
  const at = `maps.${id}.nexus`
  const range = (v: readonly [number, number], int: boolean): boolean => v[0] >= 0 && v[0] <= v[1] && (!int || (Number.isInteger(v[0]) && Number.isInteger(v[1])))
  const w = c.warps
  const B = OBSTACLES.body
  const layerM = B.heightM / B.layers
  const chestM = (B.layers - 0.5) * layerM
  const layersOf = (h: number): number => Math.ceil(h / layerM - 1e-9)
  need(c.sizeU > 0 && c.sizeU <= FRAME_U - SAFE_U * 2, `${at}.sizeU 须放得进方框的安全区`)
  need(c.plazaU - 0.5 >= SPAWN_CLEAR_U, `${at}.plazaU 须空得出出生点要的格数`)
  need(c.glassU > 0 && c.neckU > 0 && range(c.chamferU, false) && c.chamferU[1] < c.sizeU / 2, `${at} 的玻璃地面、窄缝与切角须为正，切角小于半边`)
  need(c.pillars.radiusU > 0 && range(c.pillars.count, true) && range(c.pillars.ringU, false) && c.pillars.ringU[0] > c.plazaU + c.pillars.radiusU, `${at}.pillars 须在开局空地以外`)
  need(c.pedestals.radiusU > 0 && range(c.pedestals.count, true), `${at}.pedestals 的半径须为正、座数是整数范围`)
  need(layersOf(c.pedestals.heightM) > Math.floor(B.layers * B.step) && layersOf(c.pedestals.heightM) * layerM < chestM, `${at}.pedestals.heightM 须挡得住标准身体、又比平射的子弹矮`)
  need(c.cores.widthU > c.cores.doorU * 2 && c.cores.depthU > 0 && range(c.cores.count, true) && c.cores.count[1] <= 2, `${at}.cores 须放得下两扇门，最多两座`)
  need(range(c.hatches, true), `${at}.hatches 须是整数范围`)
  need(Number.isInteger(w.lenU) && w.lenU > 0, `${at}.warps.lenU 须是整格：门线落在格线上`)
  need(w.pairs[0] >= 1 && range(w.pairs, true) && w.pairs[1] <= 3, `${at}.warps.pairs 须在 1 到 3 对之间：门的颜色只有三种`)
  need(w.apronU >= 1 && w.apartU > w.lenU && w.pairU > w.apartU, `${at}.warps 门线两侧至少空一格，同一对隔得比任两扇门远，任两扇门的中点隔得比门长`)
  need(w.warnMs > 0 && range(w.everyMs, false) && w.everyMs[0] > w.warnMs, `${at}.warps 挪门的间隔须比预警长`)
  need(c.tiles.fadeMs > 0, `${at}.tiles.fadeMs 须为正`)
  for (let s = 0; s < 16; s++) {
    const plan = nexusPlan(c, s * 7919 + 13)
    const where = `${at} 第 ${s} 个样本`
    need(roomAt(plan.basin, plan.start.x * UNIT, plan.start.y * UNIT) >= (c.plazaU - 0.5) * UNIT, `${where} 的开局站位四周不够空`)
    const pairs = plan.warps.length / 2
    need(pairs >= w.pairs[0] && pairs <= w.pairs[1], `${where} 的门的对数不在范围里`)
    for (let k = 0; k < plan.warps.length; k += 2) {
      const a = plan.warps[k]!
      const b = plan.warps[k + 1]!
      need(a.axis === b.axis && warpApart(a, b, w.lenU) >= w.pairU, `${where} 的第 ${k / 2} 对门朝向不同或隔得太近`)
    }
    for (const axis of [0, 1]) need(plan.spots.filter((p) => p.axis === axis).length >= 12, `${where} 摆得下${axis === 0 ? '竖' : '横'}门的地方不到 12 处，门挪不开`)
  }
}

/**
 * 培养皿：皿放得进安全区，开局空地空得出出生点、落在划线区以内；四区划线的区数、道数是范围，每区落菌的间距一区比一区稀；
 * 菌落的前沿在格子上长得圆（过渡带宽过一格），显式积分不出负数也不发散，皿边常驻的一圈宽过一格、碰不到开局空地；
 * 算作菌落的密度线、黏脚、溶菌的参数说得通，标准身体溶出的圈盖得过它掉的金币；
 * 抽一批种子真的生成一遍：每只皿都接种上了菌落，皿心的空地上没有，开局站位四周空着
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'petri') === (m.petri !== undefined), `maps.${id} 是培养皿当且仅当写了 petri`)
  const p = m.petri
  if (!p) continue
  const at = `maps.${id}.petri`
  const range = (v: readonly [number, number], int: boolean): boolean => v[0] >= 0 && v[0] <= v[1] && (!int || (Number.isInteger(v[0]) && Number.isInteger(v[1])))
  const { dish, streak, colony, stick, lysis } = p
  need(p.mmPerU > 0 && dish.radiusU > 0 && dish.wallU > 0, `${at} 的毫米每格、皿的半径与壁厚须为正`)
  need(dish.radiusU + dish.wallU <= (FRAME_U - SAFE_U * 2) / 2, `${at}.dish 须放得进方框的安全区`)
  need(p.plazaU - 0.5 >= SPAWN_CLEAR_U && p.plazaU < dish.radiusU * streak.band[0], `${at}.plazaU 须空得出出生点要的格数，且落在划线区以内`)
  need(range(streak.quadrants, true) && streak.quadrants[0] >= 1 && streak.quadrants[1] <= 4, `${at}.streak.quadrants 须在 1 到 4 区之间`)
  need(range(streak.strokes, true) && streak.strokes[0] >= 1, `${at}.streak.strokes 须至少划一道`)
  need(streak.band[0] > 0 && streak.band[0] < streak.band[1] && streak.band[1] < 1, `${at}.streak.band 须在 (0, 1) 倍半径之间、由内到外`)
  need(streak.spacingU.every((g, i) => g > 0 && (i === 0 || g >= streak.spacingU[i - 1]!)), `${at}.streak.spacingU 须为正、一区比一区稀`)
  need(streak.colonyU[0] > 0 && range(streak.colonyU, false) && range(streak.strays, true), `${at}.streak 的菌落半径须为正的范围，杂菌个数为非负整数范围`)
  need(colony.cellU > 0 && colony.stepMs > 0 && colony.growth > 0 && colony.frontU > 0 && colony.waveU > 0 && colony.preS >= 0 && colony.matureS > 0, `${at}.colony 的格子、步长、增长率、前沿速度、波长与长熟的时间须为正，先长的时间不为负`)
  need(colony.patchy >= 0 && colony.patchy < 1 && colony.mature > 0 && colony.mature < 1, `${at}.colony 的起伏须在 [0, 1) 内，长熟的密度在 (0, 1) 内`)
  need(frontWidthU(p) >= colony.cellU, `${at}.colony 增长率最高处前沿的过渡带只有 ${frontWidthU(p).toFixed(3)} 格，须宽过一格格子：太窄的前沿在格子上长不圆`)
  const dt = colony.stepMs / 1000
  need((diffusionU(p) / colony.cellU ** 2) * dt <= 0.3 && colony.growth * (1 + colony.patchy) * dt <= 0.5, `${at}.colony.stepMs 太长：显式积分会出负数或发散`)
  need(colony.rimU >= colony.cellU && colony.rimU < dish.radiusU - p.plazaU, `${at}.colony.rimU 须宽过一格格子，且碰不到开局的空地`)
  need(p.edge > 0 && p.edge < 1, `${at}.edge 须在 (0, 1) 内`)
  need(stick.viscosity >= 1 && stick.exertion >= 0, `${at}.stick 的黏度须不小于 1，多耗的体力不为负`)
  need(lysis.holdS > 0 && lysis.halfLifeS > 0 && lysis.lysePerS > 0, `${at}.lysis 的留存、半衰期与溶菌速度须为正`)
  need(lysis.radiusU >= 1, `${at}.lysis.radiusU 须不小于 1 格：标准身体溶出的圈盖得过它掉的金币散开的范围`)
  for (let s = 0; s < 16; s++) {
    const plan = petriPlan(p, s * 7919 + 13)
    const where = `${at} 第 ${s} 个样本`
    need(plan.seeds.length > 0, `${where} 一个菌落也没接种上`)
    need(plan.seeds.every((d) => Math.hypot(d.x - plan.cx, d.y - plan.cy) - d.r >= p.plazaU), `${where} 有菌落落进了皿心的空地`)
    need(roomAt(plan.basin, plan.cx * UNIT, plan.cy * UNIT) >= (p.plazaU - 0.5) * UNIT, `${where} 的开局站位四周不够空`)
  }
}

/**
 * 神庙：前庭放得进安全区，开局站位四周空得开；机关的个数是范围、时长与伤害说得通；压板只有队长踩得下去、跟着的队员与老鼠跳蝗太轻，
 * 飞镖飞得过贴地爬的蛇与老鼠的头顶、扎得到标准身体，滚石碾得死小怪、比石槽窄，头目卡在陷坑口、别的身体都掉得下去；
 * 抽一批种子真的生成一遍：机关个数在范围里，能走的地方都在安全区里，开局站位四周空着
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'temple') === (m.temple !== undefined), `maps.${id} 是神庙当且仅当写了 temple`)
  const c = m.temple
  if (!c) continue
  const at = `maps.${id}.temple`
  const range = (v: readonly [number, number], int: boolean): boolean => v[0] >= 0 && v[0] <= v[1] && (!int || (Number.isInteger(v[0]) && Number.isInteger(v[1])))
  const B = OBSTACLES.body
  const layerM = B.heightM / B.layers
  const ref = B.refRadiusU
  const weight = (r: number): number => (r / ref) ** 3
  const harm = (h: { team: number; enemy: number; boss: number }): boolean => h.team >= 0 && h.boss >= 0 && h.enemy >= 0 && h.enemy <= 1
  const { court, pyramid: py, plate, darts, spikes, boulder, pit } = c
  need(c.meterPerU > 0 && court.skewDeg >= 0 && court.jungleU >= 0 && court.waveU > 0 && court.cornerU > 0 && court.neckU > 0, `${at}.court 的尺度、弯曲与磨角须为正`)
  need(range(court.depthU, false) && range(court.widthU, false) && court.depthU[0] > 0 && court.widthU[0] > 0, `${at}.court 的深与宽须为正的范围`)
  need(c.plazaU - 0.5 >= SPAWN_CLEAR_U && c.shiftU >= 0 && c.shiftU + c.plazaU < court.depthU[0] / 2, `${at}.plazaU 须空得出出生点要的格数，开局站位挪开后仍在前庭里`)
  need(Number.isInteger(py.tiers) && py.tiers >= 1 && py.tierU > 0 && py.tierM > 0 && py.stairU > 0 && py.stairOutU > 0 && py.doorU > 0 && py.doorU < py.stairU, `${at}.pyramid 的层数是正整数，尺寸为正，门比台阶窄`)
  need(c.altar.lengthU > 0 && c.altar.widthU > 0 && c.altar.gapU > 0 && c.altar.heightM > 0 && c.altar.heightM < (B.layers - 0.5) * layerM, `${at}.altar 须有大小，矮过平射的子弹`)
  need(c.walls.thickU > 0 && c.walls.heightM > B.heightM && c.walls.headU > 0 && c.walls.snoutU > 0, `${at}.walls 须有厚度、高过标准身体`)
  need(range(c.jungle.crownU, false) && c.jungle.crownU[0] > 0 && range(c.jungle.heightM, false) && c.jungle.overhangU >= 0 && range(c.jungle.roots, true) && range(c.jungle.rootU, false), `${at}.jungle 的树与树根须是合理的范围`)
  const lead = TEAM_BASELINE.member.radius * TEAM_BASELINE.team.leaderSizeMul
  const follower = TEAM_BASELINE.member.radius * TEAM_BASELINE.team.followerSizeMul
  need(plate.sizeU > 0 && weight(lead) >= plate.weight && weight(follower) < plate.weight, `${at}.plate.weight 须让队长踩得下去、跟着的队员踩不下去`)
  for (const e of ['rat', 'locust'] as const) need(weight(ENEMIES[e].radius) < plate.weight, `${at}.plate.weight 须让 ${e} 踩不下去：玩法说明里说它太轻`)
  need(weight(ENEMIES[m.boss].radius) >= plate.weight, `${at}.plate.weight 须让头目踩得下去`)
  const timing = (t: { primeMs: number; rearmMs: number }): boolean => t.primeMs > 0 && t.rearmMs > 0
  need(range(darts.count, true) && darts.count[0] >= 1 && timing(darts) && darts.laneU > plate.sizeU && Number.isInteger(darts.rows) && darts.rows >= 1 && Number.isInteger(darts.perRow) && darts.perRow >= 1 && darts.rowMs > 0 && darts.speedU > 0 && harm(darts.harm), `${at}.darts 的个数、时长、排数、速度与伤害须合理，过道放得下压板`)
  for (const e of ['snake', 'rat'] as const) need(((ENEMIES[e].span?.[1] ?? B.layers - 1) + 1) * layerM <= darts.heightM, `${at}.darts.heightM 须高过 ${e} 的头顶：玩法说明里说它从镖底下钻过去`)
  need(darts.heightM < B.heightM, `${at}.darts.heightM 须扎得到标准身体`)
  need(range(spikes.count, true) && spikes.count[0] >= 1 && timing(spikes) && range(spikes.lengthU, false) && range(spikes.widthU, false) && spikes.widthU[0] > 0 && spikes.heightM > 0 && spikes.upMs > 0 && spikes.viscosity >= 1 && harm(spikes.harm), `${at}.spikes 的个数、大小、时长与伤害须合理`)
  need(range(boulder.count, true) && boulder.count[0] >= 1 && timing(boulder) && boulder.radiusU > 0 && boulder.radiusU * 2 < boulder.grooveU && boulder.speedU > 0 && boulder.pushU > 0 && harm(boulder.harm), `${at}.boulder 的个数、时长与伤害须合理，滚石比石槽窄`)
  need(boulder.harm.enemy >= 1, `${at}.boulder.harm.enemy 须碾得死小怪：玩法说明里说当场碾死`)
  need(range(pit.count, true) && pit.count[0] >= 1 && timing(pit) && pit.sizeU > 0 && pit.openMs > 0 && pit.climbMs > 0 && harm(pit.harm), `${at}.pit 的个数、大小、时长与伤害须合理`)
  need(ENEMIES[m.boss].radius >= pit.bigU, `${at}.pit.bigU 须让头目卡在坑口`)
  need(lead < pit.bigU && m.mix.every((row) => ENEMIES[row.kind].radius < pit.bigU), `${at}.pit.bigU 须让队员与小怪都掉得下去`)
  need(pit.sizeU > 2 * lead, `${at}.pit.sizeU 须掉得下队长`)
  for (let s = 0; s < 16; s++) {
    const plan = templePlan(c, s * 7919 + 13)
    const where = `${at} 第 ${s} 个样本`
    const count = (k: string): number => plan.traps.filter((t) => t.kind === k).length
    for (const [k, r] of [['darts', darts.count], ['spikes', spikes.count], ['boulder', boulder.count], ['pit', pit.count]] as const) need(count(k) >= r[0] && count(k) <= r[1], `${where} 的 ${k} 个数不在范围里`)
    need(roomAt(plan.basin, plan.start.x * UNIT, plan.start.y * UNIT) >= (c.plazaU - 0.5) * UNIT, `${where} 的开局站位四周不够空`)
    const b = plan.basin
    let out = 0
    for (let j = 0; j < b.rows; j++) {
      for (let i = 0; i < b.cols; i++) {
        if (b.room[j * b.cols + i]! <= 0) continue
        const x = b.x0 / UNIT + (i + 0.5) * (b.cell / UNIT)
        const y = b.y0 / UNIT + (j + 0.5) * (b.cell / UNIT)
        if (x < SAFE_U || y < SAFE_U || x > FRAME_U - SAFE_U || y > FRAME_U - SAFE_U) out++
      }
    }
    need(out === 0, `${where} 有 ${out} 格能走的地方出了安全区`)
  }
}

/**
 * 梦幻乐园：台面、内圈、外圈由里往外，外圈放得进安全区，出发的台面正中四周空得开；两圈传送带与台沿的入口都过得去最大的身体；
 * 倾到底时闲着的身体滑得起来、又不陡得站不住；入口关严之后台子才动，最短的一次停留也等得到入口开足；传送带慢过最慢的队员，逆着也走得动
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'dreamland') === (m.dreamland !== undefined), `maps.${id} 是梦幻乐园当且仅当写了 dreamland`)
  const c = m.dreamland
  if (!c) continue
  const at = `maps.${id}.dreamland`
  const { fence, operator: o, gate, belt, friction: f, gait } = c
  const range = (v: readonly [number, number], min: number): boolean => v[0] >= min && v[0] <= v[1]
  need(c.meterPerU > 0 && Number.isInteger(c.sides) && c.sides >= 3 && Number.isFinite(c.rotDeg), `${at} 的米每格须为正，边数是不小于 3 的整数`)
  need(c.stageU > 0 && c.innerU > c.stageU && c.outerU > c.innerU && c.pivotM > 0, `${at} 的台面、内圈、外圈须由里往外，支点高须为正`)
  need(c.stageU * Math.cos(Math.PI / c.sides) >= SPAWN_CLEAR_U + fence.postU, `${at}.stageU 的台面正中离台沿不到 ${SPAWN_CLEAR_U} 格`)
  const plan = dreamlandPlan(c)
  const reach = Math.max(...cornersOf(plan, plan.outer).flatMap((p) => [Math.abs(p.x - plan.cx), Math.abs(p.y - plan.cy)])) / UNIT
  need(reach <= FRAME_U / 2 - SAFE_U, `${at}.outerU 的外圈伸出中心 ${+reach.toFixed(2)} 格，放不进安全区`)
  const body = Math.max(TEAM_BASELINE.member.radius * TEAM_BASELINE.team.leaderSizeMul, ENEMIES[m.boss].radius, ...m.mix.map((row) => ENEMIES[row.kind]?.radius ?? 0))
  need(c.innerU - c.stageU >= 2 * body && c.outerU - c.innerU >= 2 * body, `${at} 的两圈传送带须走得过最大的身体（半径 ${body} 格）`)
  need(fence.heightM > 0 && fence.postU > 0 && plan.door / UNIT >= 1.5 * body, `${at}.fence 的高与立柱须为正，入口须过得去最大的身体`)
  const tilt = Math.atan(c.pivotM / (c.stageU * c.meterPerU))
  const deg = (r: number): string => `${+((r * 180) / Math.PI).toFixed(1)}°`
  need(Math.tan(tilt) > f.body.static && Math.tan(tilt) > f.coin.static, `${at} 倾到底只有 ${deg(tilt)}，闲着的身体与金币滑不起来`)
  need(tilt <= Math.PI / 6, `${at} 倾到底有 ${deg(tilt)}，陡得站不住`)
  need(o.warnMs > 0 && o.tiltMs > 0 && o.levelMs > 0 && range(o.holdMs, 0) && o.holdMs[0] > 0 && range(o.restMs, 0) && o.direct >= 0 && o.direct <= 1, `${at}.operator 的时长须为正、范围从小到大，直接转向的概率在 [0, 1] 内`)
  need(gate.openMs >= 0 && gate.swingMs > 0 && gate.closeMs >= gate.swingMs, `${at}.gate 离开前提早关的时间须够关上一次门：台子动之前门已关严`)
  need(o.holdMs[0] > gate.openMs + gate.swingMs + gate.closeMs, `${at}.operator.holdMs 最短的一次停留须等得到入口开足`)
  need(belt.speedU > 0 && belt.warnMs >= 0 && belt.turnMs > 0 && range(belt.flipMs, 0) && belt.flipMs[0] > belt.warnMs + belt.turnMs, `${at}.belt 的速度与换向的时长须为正，两次换向之间放得下预警与换向`)
  const slowest = Math.min(...Object.values<CharacterAuthoring>(CHARACTERS).map((ch) => ch.stats.moveSpeed))
  need(belt.speedU < slowest, `${at}.belt.speedU 须慢过最慢的队员（${slowest} 格/秒），逆着传送带也走得动`)
  need(f.body.static >= f.body.kinetic && f.body.kinetic > 0 && f.coin.static >= f.coin.kinetic && f.coin.kinetic > 0, `${at}.friction 的静摩擦须不小于动摩擦、动摩擦为正`)
  need(gait.flatResistance > 0 && gait.downhillMax >= 1 && gait.effortMin > 0 && gait.effortMin <= 1, `${at}.gait 的平地阻力须为正、下坡倍率不小于 1、最少的费力在 (0, 1] 内`)
}

/**
 * 沙漠：一圈就是方框，地面与印子的贴图每格的像素数是整数、沙地横竖挪半圈落在整像素上；镜头看到的长边比一圈小，平常的屏幕不用拉近；
 * 最大的沙丘从脊线中点往哪边伸都不到半圈（按离它最近的那一份算高才对）；坡度、休止角、走路的代谢说得通；平时的风吹不起沙、沙暴吹得起，
 * 一场沙暴在下一场之前刮完；标准身体的印子平时留得住一阵，沙暴最猛时累到见底的印子也在一阵里填平；印子贴图记得下一小时落下的沙
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'desert') === (m.desert !== undefined), `maps.${id} 是沙漠当且仅当写了 desert`)
  const d = m.desert
  if (!d) continue
  const at = `maps.${id}.desert`
  need(m.size === undefined, `maps.${id} 是沙漠，一圈就是方框，不写 size`)
  const w = FRAME_U
  const h = FRAME_U
  const span = (r: readonly [number, number]): boolean => r[0] > 0 && r[0] <= r[1]
  const ints = (r: readonly [number, number]): boolean => Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] >= 1 && r[0] <= r[1]
  need(Number.isInteger(GROUND_PPU) && (w * GROUND_PPU) % 2 === 0, `${at} 的沙地贴图须每格整数个像素、一圈的像素数是偶数：横竖挪半圈落在整像素上`)
  need(Number.isInteger(d.tracks.perU) && d.tracks.perU > 0, `${at}.tracks.perU 须是正整数：印子贴图每格整数个格子`)
  need(d.meterPerU > 0 && d.sunDeg > 5 && d.sunDeg < 85, `${at} 的米每格须为正、太阳的仰角在 5 到 85 度之间`)
  need(d.viewMaxU >= VIEW.minLong / UNIT && d.viewMaxU <= w - 4, `${at}.viewMaxU 须不小于平常屏幕的长边 ${VIEW.minLong / UNIT} 格、比一圈小 4 格以上：每样东西只画一份`)
  const dc = d.dunes
  need(ints(dc.pairs) && ints(dc.lobes) && span(dc.heightM), `${at}.dunes 的对数与沙包数须为正整数范围、高为正的范围`)
  need(dc.stossSlope > 0 && dc.stossSlope < dc.leeSlope && dc.leeSlope < Math.tan((33 * Math.PI) / 180), `${at}.dunes 迎风坡须比背风坡缓，背风坡须缓过 33 度的休止角：沙丘是圆的，没有落沙坡`)
  need(dc.width > 0 && dc.turnDeg >= 0 && dc.turnDeg < 90, `${at}.dunes 的宽须为正、朝向的偏离在 0 到 90 度之间`)
  const bump = 8 / (3 * Math.sqrt(3))
  const back = (bump * dc.heightM[1]) / dc.stossSlope
  const front = (bump * dc.heightM[1]) / dc.leeSlope
  const half = (dc.width * (back + front)) / 2
  const reachU = Math.hypot(front * 0.65 + Math.max(back, front), ((dc.lobes[1] - 1) * half * 1.1) / 2 + half) / d.meterPerU
  need(reachU < w / 2 - 1, `${at}.dunes 最大的沙丘伸出中心 ${reachU.toFixed(1)} 格，须不到半圈 ${w / 2} 格`)
  need(d.windSpreadDeg >= 0 && d.windSpreadDeg <= 180, `${at}.windSpreadDeg 须在 0 到 180 度之间`)
  need(d.swell.heightM >= 0 && Number.isInteger(d.swell.waves) && d.swell.waves >= 1, `${at}.swell 的幅度不为负、一圈起伏的次数为正整数`)
  need(span(d.flats.loose) && d.flats.loose[1] < 1 && Number.isInteger(d.flats.patches) && d.flats.patches >= 1, `${at}.flats 的松实须在 (0, 1) 内由实到松、斑块数为正整数`)
  need(Number.isInteger(d.landmarks.pairs) && d.landmarks.pairs >= 1 && d.landmarks.gapU > 0, `${at}.landmarks 的对数为正整数、间隔为正`)
  need(2 * d.landmarks.pairs * Math.PI * (d.landmarks.gapU / 2) ** 2 < w * h, `${at}.landmarks 摆不下：${2 * d.landmarks.pairs} 样标志物彼此隔 ${d.landmarks.gapU} 格`)
  const g = d.gait
  need(g.softSand >= 1 && g.packRelief >= 0 && g.packRelief < 1 && g.maxPower > 1 && g.downhillMax >= 1, `${at}.gait 的松沙倍率不小于 1、踩实在 [0, 1) 内、最大出力大于 1、下坡倍率不小于 1`)
  need(d.shadeRegen > m.stamina.regen, `${at}.shadeRegen 须大于向阳处的回复 ${m.stamina.regen}`)
  const t = d.tracks
  need(t.depthM > 0 && t.firm > 0 && t.firm <= 1 && t.tired >= 1 && t.dragFrom > 0 && t.dragFrom <= 1, `${at}.tracks 的深浅须为正，实沙的比例在 (0, 1] 内，累的倍率不小于 1`)
  need(t.depthM * t.tired * 1.15 < HEIGHT_SPAN, `${at}.tracks 标准身体累到见底时冲刺踩出的印子须浅于印子贴图记得下的 ${HEIGHT_SPAN} 米`)
  need(t.stride > 0 && t.foot > 0 && t.pack > 0 && t.pack <= 1 && t.lifeS > 0, `${at}.tracks 的步幅、脚长、踩实与留存的秒数须为正`)
  need(TIME_QUANT * 65535 >= 3600, `${at}.tracks 印子贴图记得下的时刻只够 ${((TIME_QUANT * 65535) / 60).toFixed(0)} 分钟，须够打满一个钟头`)
}

/** 身体的体力上限须为正、体力回复不为负 */
const checkStamina =(st: { readonly maxStamina?: number; readonly staminaRegen?: number } | undefined, path: string): void => {
  need((st?.maxStamina ?? 1) > 0 && (st?.staminaRegen ?? 0) >= 0, `${path} 的体力上限须为正、体力回复不为负`)
}
for (const [id, c] of Object.entries<CharacterAuthoring>(CHARACTERS)) checkStamina(c.stats, `characters.${id}`)
for (const [id, e] of Object.entries<EnemyDef>(ENEMIES)) checkStamina(e.stats, `enemies.${id}`)

for (const [id, c] of Object.entries<CharacterAuthoring>(CHARACTERS)) {
  need(new Set(c.tags).size === c.tags.length, `characters.${id}.tags 不能重复`)
  for (const k of [0, 1]) {
    const tiers = [...c.weapons.map((w) => WEAPONS[w].upgrades[k]), ...c.innate.map((i) => i.upgrades[k])]
    const names = new Set(tiers.flatMap((t) => (t ? [t.card.name] : [])))
    need(names.size === 1, `characters.${id} 第 ${k + 1} 档升级卡须存在且各载体一致`)
  }
}

for (const e of Object.values(ENEMIES).flatMap(withNested)) {
  const lm = e.drive
  if (lm.kind !== 'standoff') continue
  for (const a of e.abilities ?? []) {
    const range = 'range' in a ? a.range : undefined
    need(range === undefined || range > lm.standoffDist, `enemies.${e.kind} 的能力射程须大于 standoffDist`)
  }
}

/** 身段：层号是 0 ≤ lo ≤ hi 的整数；头目高过标准身体；蜂群悬空 */
{
  const ok = (sp: Span | undefined): boolean => sp === undefined || (Number.isInteger(sp[0]) && Number.isInteger(sp[1]) && sp[0] >= 0 && sp[0] <= sp[1])
  for (const e of Object.values(ENEMIES).flatMap(withNested)) {
    need(ok(e.span) && (e.forms ?? []).every((f) => ok(f.span)), `enemies.${e.kind} 的身段须是 0 ≤ lo ≤ hi 的整数层`)
    need(e.role !== 'boss' || (e.span !== undefined && e.span[1] >= OBSTACLES.body.layers), `enemies.${e.kind} 是头目，须高过标准身体`)
  }
  need(ok(COMBAT.swarmSpan) && COMBAT.swarmSpan[0] > 0, 'combat.swarmSpan 须悬空')
}

/** 走进壳层停下的半径：终端漂移 g·fall 追上速度的地方，壳层里引力随半径单调增大；外缘都追不上就停不下 */
const shellStopU = (shell: NebulaOldConfig['shell'], fall: number, speedU: number): number => {
  if (shellPull(shell, shell.outerU) * fall < speedU) return Infinity
  let lo = shell.innerU
  let hi = shell.outerU
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (shellPull(shell, mid) * fall >= speedU) hi = mid
    else lo = mid
  }
  return hi
}
/** 旧星云壳层困得住每个角色与敌人：停下处再往外瞬移，仍在壳外引力重新追不上它的逃逸半径以内 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  const n = m.nebulaOld
  if (!n) continue
  const bodies = [
    ...Object.entries<CharacterAuthoring>(CHARACTERS).map(([k, c]) => ({ path: `characters.${k}`, fall: c.body.mass / c.body.drag, speedU: c.stats.moveSpeed })),
    ...Object.values(ENEMIES)
      .flatMap(withNested)
      .map((e) => ({ path: `enemies.${e.kind}`, fall: COMBAT.enemyBody.mass / COMBAT.enemyBody.drag, speedU: e.speed })),
  ]
  for (const b of bodies) {
    const v = b.speedU * n.contain.speedMul
    const escapeU = Math.sqrt((n.shell.gm * b.fall) / v)
    need(shellStopU(n.shell, b.fall, v) + n.contain.leapU <= escapeU, `maps.${id}.nebulaOld.shell 困不住 ${b.path}：走到停下处再往外瞬移 ${n.contain.leapU} 格就逃出引力`)
  }
}

/**
 * 星云：壳层包着空腔；黑洞连同吸积盘长到最大也整个落在空腔里，离队伍的出发点（球心）够远；最能走的身体只走进壳层一点就被拉住，瞬移出去也回得来，
 * 走得最深也落在方框安全区的内切圆里；
 * 爱因斯坦环落在一般角色走不出来的半径上；最慢的敌人也有刷怪的地方
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'nebula') === (m.nebula !== undefined), `maps.${id} 是星云当且仅当写了 nebula`)
  const n = m.nebula
  if (!n) continue
  const { shell, contain, hole, swallow, accretion, disk, meteor } = n
  const [near, far] = hole.fromCenterU
  const at = `maps.${id}.nebula`
  need(shell.innerU > 0 && shell.outerU > shell.innerU && shell.gm > 0, `${at}.shell 须空腔半径为正、外缘大于空腔、引力为正`)
  need(shell.rise >= 0 && shell.tau > 1, `${at}.shell 的密度只能往外涨、整层光深须大于 1：被照亮的内壁才落在壳层里`)
  need(contain.speedMul >= 1 && contain.depthU > 0 && contain.leapU >= 0, `${at}.contain 的速度余量不小于 1、深度为正、瞬移余量不为负`)
  need(hole.gm > 0 && hole.maxGm >= hole.gm && hole.lightU > 0, `${at}.hole 的引力须为正、上限不小于开局、光速为正`)
  need(near >= 0 && near <= far && far < shell.innerU, `${at}.hole 的位置范围须落在空腔里`)
  need(shell.innerU + contain.depthU <= FRAME_U / 2 - SAFE_U, `${at}.shell 空腔半径加上走进壳层的深度须落在方框安全区的内切圆里`)
  need(disk.outerRs > ISCO_RS && disk.innerK > 0, `${at}.disk 须铺到最内稳定圆轨道以外、色温为正`)
  need(swallow.bodyGm >= 0 && swallow.bodyRadiusU > 0 && swallow.pickupGm >= 0 && swallow.shotGm >= 0, `${at}.swallow 的质量不为负、身体的参考半径为正`)
  need(swallow.lightEta > 0 && swallow.lightEta < ACCRETION_ETA, `${at}.swallow.lightEta 须在 0 与薄盘的 1/16 之间：径直掉进去的东西放的光不会比绕到最内稳定圆轨道的还多`)
  need(accretion.bondiGm > 0 && accretion.riseMs > 0 && accretion.viscousMs > 0, `${at}.accretion 的吸积率与时标须为正：平时的吸积光度是光度的单位`)
  need(meteor.firstMs >= 0 && meteor.warnMs >= 0 && meteor.intervalJitterMs >= 0 && meteor.intervalMs - meteor.intervalJitterMs > meteor.warnMs, `${at}.meteor 的间隔减去抖动须长过预兆`)
  need(meteor.speedU > 0 && meteor.speedJitter >= 0 && meteor.speedJitter < 1 && meteor.radiusU > 0 && meteor.radiusU < shell.innerU, `${at}.meteor 的速度与半径须为正、半径小于空腔`)
  need(meteor.offsetU >= 0 && meteor.damage >= 0 && meteor.gm >= 0 && meteor.maxFlightMs > 0, `${at}.meteor 的偏移、伤害与质量不为负、飞行时限为正`)
  need(meteor.shatterU > 0 && meteor.shatterU < shell.outerU - shell.innerU, `${at}.meteor.shatterU 须落在壳层里`)
  need(n.spawnClearU >= 0, `${at}.spawnClearU 不为负`)
  need(n.cameraU > 0, `${at}.cameraU 须为正：镜头在平面上方`)
  const rsMax = schwarzschildU(hole.maxGm, hole.lightU)
  need(far + Math.max(disk.outerRs, SHADOW_RS) * rsMax < shell.innerU, `${at}.hole 长到最大时阴影与吸积盘须整个落在空腔里`)
  const characters = Object.entries<CharacterAuthoring>(CHARACTERS).map(([k, c]) => ({ path: `characters.${k}`, fall: c.body.mass / c.body.drag, speedU: c.stats.moveSpeed }))
  const enemyFall = COMBAT.enemyBody.mass / COMBAT.enemyBody.drag
  const enemies = Object.values(ENEMIES)
    .flatMap(withNested)
    .map((e) => ({ path: `enemies.${e.kind}`, fall: enemyFall, speedU: e.speed }))
  for (const b of [...characters, ...enemies]) {
    if (b.speedU <= 0) continue
    const q = b.fall / (b.speedU * contain.speedMul)
    const stop = stopRadiusU(shell, q)
    need(stop - shell.innerU <= contain.depthU, `${at}.shell 拦不住 ${b.path}：以 ${contain.speedMul} 倍速往外走会走进壳层 ${+(stop - shell.innerU).toFixed(2)} 格，超过 ${contain.depthU}`)
    need(stop + contain.leapU <= shellRecaptureU(shell, q), `${at}.shell 困不住 ${b.path}：走到停下处再往外瞬移 ${contain.leapU} 格就逃出引力`)
  }
  for (const b of characters) {
    const reach = captureU(hole.maxGm, rsMax, b.fall / b.speedU)
    need(reach < near - 1, `${at}.hole 长到最大时 ${b.path} 在出发点就走不出来：离黑洞 ${near} 格，走不出来的半径 ${+reach.toFixed(2)}`)
  }
  const ratios = characters.map((b) => b.fall / b.speedU).sort((x, y) => x - y)
  const median = ratios[Math.floor(ratios.length / 2)]!
  for (const gm of [hole.gm, hole.maxGm]) {
    const rs = schwarzschildU(gm, hole.lightU)
    const reach = captureU(gm, rs, median)
    for (const d of [near, far]) {
      const ring = einsteinU(rs, floorDepthU(wallU(shell), d), n.cameraU)
      need(Math.abs(ring - reach) <= reach * 0.15, `${at}.hole 的爱因斯坦环（${+ring.toFixed(2)} 格）须落在一般角色走不出来的半径（${+reach.toFixed(2)} 格）上下一成五以内：GM ${gm}、离中心 ${d} 格`)
      need(disk.outerRs * rs < ring, `${at}.disk 铺到 ${+(disk.outerRs * rs).toFixed(2)} 格，盖住了爱因斯坦环（${+ring.toFixed(2)} 格）：GM ${gm}、离中心 ${d} 格`)
    }
  }
  const slowest = Math.min(...[...m.mix.map((r) => ENEMIES[r.kind]!.speed), ENEMIES[m.boss]!.speed])
  const clear = captureU(hole.maxGm, rsMax, enemyFall / slowest) + n.spawnClearU
  need(slowest > 0 && clear + 2 < near + shell.innerU - 1, `${at} 最慢的敌人走不出来的半径（${+clear.toFixed(2)} 格）太大，空腔里没有刷怪的地方`)
}

const PACK = new Set(readFileSync('scripts/emoji/ordering.txt', 'utf8').split(/\s+/))

const CHECKS = runChecks({
  enemies: ENEMIES,
  maps: MAPS,
  pools: BATTLEFIELD.pools,
  characters: CHARACTERS,
  maxCharLevel: MAX_CHAR_LEVEL,
  team: TEAM_BASELINE.team,
  radius: TEAM_BASELINE.member.radius,
  fanDistance: FEEL.squad.fanDistance,
})

/** 查出的问题记下来，前面写上是哪一份定义 */
const report = (where: string, issues: readonly Issue[]): void => {
  for (const i of issues) errors.push(`${where}${i.at.length > 0 ? ` ${pathText(i.at)}` : ''}：${i.why}`)
}

report('difficulty.curve', CHECKS.curve(DIFFICULTY.curve))

for (const [id, r] of Object.entries<RunDef>(RUNS)) {
  need(PACK.has(r.emoji), `runs.${id} 的 emoji 不在表情包里：${r.emoji}`)
  report(`runs.${id}`, CHECKS.run(r))
}

need(PACK.has(EDITOR_DRAFT.emoji), `editor 的 emoji 不在表情包里：${EDITOR_DRAFT.emoji}`)
report('editor', CHECKS.run(EDITOR_DRAFT))

const mutatorEmojis = new Map<string, string>()
for (const [id, m] of Object.entries<MutatorDef>(MUTATORS)) {
  need(PACK.has(m.emoji), `mutators.${id} 的 emoji 不在表情包里：${m.emoji}`)
  const dup = mutatorEmojis.get(m.emoji)
  need(dup === undefined, `mutators.${id} 与 mutators.${dup} 用了同一个 emoji`)
  mutatorEmojis.set(m.emoji, id)
  need(Number.isInteger(m.heat) && m.heat >= 1, `mutators.${id}.heat 须是正整数`)
  need(m.rules !== undefined || m.enemyMods !== undefined, `mutators.${id} 至少要改一样东西`)
  report(`mutators.${id}.rules`, CHECKS.rules(m.rules))
}

/** 新画风：码位要在表情包里；配方里有的动画都得绑上，部件一一对应到图里的层，转过、缩放的部件给了转轴 */
for (const [id, d] of Object.entries(PAINTED)) {
  need(PACK.has(id), `新画风的 ${id} 不在表情包里`)
  const layers = render(id, d).layers
  const clips = ANIMATIONS.animations[id]?.clips ?? {}
  for (const clipId of Object.keys(d.rig ?? {})) need(clipId in clips, `新画风的 ${id} 绑了配方里没有的 ${clipId} 动画`)
  for (const [clipId, clip] of Object.entries(clips)) {
    const rig = d.rig?.[clipId as keyof typeof clips]
    const at = `新画风的 ${id} 的 ${clipId} 动画`
    if (!rig) {
      need(false, `${at} 没绑`)
      continue
    }
    need(rig.parts.length === clip.parts.length, `${at} 绑了 ${rig.parts.length} 个部件，配方里有 ${clip.parts.length} 个`)
    const used = new Set<string>()
    rig.parts.forEach((r, i) => {
      need(r.layers.length > 0, `${at} 的第 ${i} 个部件没绑层`)
      for (const name of r.layers) {
        need(layers.includes(name), `${at} 的第 ${i} 个部件绑了图里没有的层 ${name}`)
        need(!used.has(name), `${at} 的层 ${name} 绑给了不止一个部件`)
        used.add(name)
      }
      const turns = (clip.parts[i]?.keyframes ?? []).some((k) => (k.rotate ?? 0) !== 0 || (k.scale ?? 1) !== 1 || (k.scaleX ?? 1) !== 1 || (k.scaleY ?? 1) !== 1)
      need(!turns || (r.cx !== undefined && r.cy !== undefined), `${at} 的第 ${i} 个部件会转或缩放，要给转轴`)
    })
  }
}

const itemEmojis = new Map<string, string>()
for (const [id, i] of Object.entries<ItemDef>(ITEMS)) {
  need(PACK.has(i.emoji), `items.${id} 的 emoji 不在表情包里：${i.emoji}`)
  const dup = itemEmojis.get(i.emoji)
  need(dup === undefined, `items.${id} 与 items.${dup} 用了同一个 emoji`)
  itemEmojis.set(i.emoji, id)
  need(i.maxStacks === undefined || i.maxStacks >= 1, `items.${id}.maxStacks 至少为 1`)
}

/** 障碍：标准身体至少两层、跨得过贴地的一层，跨不过平射飞的那一层；贯穿次数是非负整数，强度为正 */
{
  const { body, blastM, materials } = OBSTACLES
  const over = Math.floor(body.layers * body.step)
  need(body.refRadiusU > 0 && body.heightM > 0 && blastM > 0, 'obstacles 的半径、身高与爆炸的高度须为正')
  need(Number.isInteger(body.layers) && body.layers >= 2 && over >= 1 && over < body.layers - 1, 'obstacles.body.layers 须是不小于 2 的整数，标准身体跨得过贴地的一层、跨不过平射飞的顶层')
  for (const [id, m] of Object.entries(materials)) {
    need(m.pierce === null || (Number.isInteger(m.pierce) && m.pierce >= 0), `obstacles.materials.${id}.pierce 须是非负整数或 null`)
    need(m.strength === null || m.strength > 0, `obstacles.materials.${id}.strength 须为正或 null`)
  }
}

/**
 * 残垣：参数说得通；石块的厚度分得出挡人与挡弹——总有几层石块高的墙只挡标准身体、平射与视线从上面过去；原本的墙与石柱挡得住平射与视线，
 * 柱廊的矮墙挡人不挡平射，封门的木板挡得住平射与视线；门洞、柱间、回廊与台地边放得下压过半径的大个子。抽一批种子生成：
 * 从回廊院走得到台地上几乎所有能走的地方，标准身体走得过的通道大个子也都走得过
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'ruins') === (m.ruins !== undefined), `maps.${id} 是残垣当且仅当写了 ruins`)
  need((m.kind === 'oldRuins') === (m.walls !== undefined), `maps.${id} 是旧残垣当且仅当写了 walls`)
  const r = m.ruins
  if (!r) continue
  const at = `maps.${id}.ruins`
  const span = (v: readonly [number, number]): boolean => v[0] <= v[1]
  const pos = (v: readonly [number, number]): boolean => v[0] > 0 && span(v)
  const ints = (v: readonly [number, number]): boolean => Number.isInteger(v[0]) && Number.isInteger(v[1]) && v[0] >= 0 && span(v)
  const { site, plan: p, masonry: ms, arcade: a, decay: d, timber: t, rubble: rb, fall, dust, trees } = r
  const B = OBSTACLES.body
  const layerM = B.heightM / B.layers
  const layersOf = (h: number): number => Math.ceil(h / layerM - 1e-9)
  // 标准身体跨得过的、平射与视线从上面过得去的最高的墙，层数
  const over = Math.floor(B.layers * B.step)
  const flat = B.layers - 1
  const hc = ms.courseM
  const W = p.wallU
  need(r.meterPerU > 0 && r.cellU > 0 && r.cellU <= 0.5, `${at} 的米每格须为正，砌体格子在 (0, 0.5] 格内`)
  need(pos(site.marginU) && site.waveU > 0 && site.neckU > 0, `${at}.site 的边距、波长与窄缝须为正`)
  need(site.marginU[0] >= 2 * r.bodyCapU && site.neckU >= r.bodyCapU, `${at}.site 台地边离院落外框须放得下按 bodyCapU 算的大个子，填掉的窄缝也不窄于他`)
  need(span(p.tiltDeg) && p.tiltDeg[0] >= 0 && p.tiltDeg[1] <= 45, `${at}.plan.tiltDeg 须在 0 到 45 度之间`)
  need(pos(p.garthU) && pos(p.depthU) && pos(p.roomU) && pos(p.doorU) && ints(p.gates) && p.loops >= 0 && p.loops <= 1, `${at}.plan 的尺寸须为正，门的道数是非负整数，多开门的概率在 [0, 1] 内`)
  need(p.walkU - W.inner / 2 - Math.max(W.parapet / 2, a.radiusU) >= 2 * r.bodyCapU, `${at}.plan.walkU 去掉内墙、矮墙与石柱后须放得下按 bodyCapU 算的大个子`)
  need(W.outer > 0 && W.inner > 0 && W.tower >= W.outer && W.parapet > 0, `${at}.plan.wallU 的墙厚须为正，塔楼的墙不比外墙薄`)
  need(p.depthU[0] - W.outer - W.inner / 2 >= 3, `${at}.plan.depthU 去掉墙厚后房间至少 3 格深`)
  need(p.roomU[0] - W.inner - 1 >= p.doorU[1], `${at}.plan.roomU 最短的开间也放得下最宽的门洞`)
  need(r.bodyCapU > 0 && r.gapU >= 2 * r.bodyCapU && p.doorU[0] >= r.gapU, `${at}.gapU 须放得下按 bodyCapU 算的大个子，最窄的门洞也不窄于 gapU`)
  need(pos(ms.heightM.outer) && pos(ms.heightM.inner) && pos(ms.heightM.tower) && ms.density > 0 && Number.isInteger(ms.bond) && ms.bond >= 1, `${at}.masonry 的高度与密度须为正，bond 是正整数`)
  need(hc > 0 && Math.floor((flat * layerM) / hc + 1e-9) > Math.floor((over * layerM) / hc + 1e-9), `${at}.masonry.courseM 须让标准身体跨得过的与平射飞得过的墙差至少一层石块`)
  need(layersOf(Math.min(ms.heightM.outer[0], ms.heightM.inner[0], ms.heightM.tower[0], ms.heightM.column)) > flat, `${at}.masonry 原本的墙与石柱须挡得住平射与视线`)
  const parapet = layersOf(Math.round(ms.heightM.parapet / hc) * hc)
  need(parapet > over && parapet <= flat, `${at}.masonry.heightM.parapet 砌成 ${parapet} 层高，须挡得住标准身体、挡不住平射`)
  need(a.radiusU > 0 && a.spacingU - 2 * a.radiusU >= r.gapU && ints(a.entries) && a.entries[0] >= 1, `${at}.arcade 的柱间须不窄于 gapU，每边至少一个入口：队伍从回廊院出发`)
  need(p.garthU[0] >= 2 * a.spacingU, `${at}.plan.garthU 须放得下每边至少两个柱间`)
  need(d.waveU > 0 && d.keep[0] >= 0 && d.keep[1] <= 1 && span(d.keep) && ints(d.razed) && pos(d.razeU) && ints(d.breaches) && pos(d.breachM3), `${at}.decay 的波长、保留比例、拆毁与破坏须合理`)
  need(d.broken >= 0 && d.fallen >= 0 && d.broken + d.fallen <= 1 && d.rubble >= 0 && d.rubble <= 1, `${at}.decay 的石柱折断与倒下的比例加起来不超过 1，留下的碎石比例在 [0, 1] 内`)
  need(ints(t.doors) && layersOf(t.heightM) > flat && t.thickU >= r.cellU, `${at}.timber 的门洞数须是非负整数，木板挡得住平射与视线、至少一格砌体格子厚`)
  need(rb.reposeDeg > 0 && rb.reposeDeg < 90 && rb.fullM > 0 && rb.viscosity >= 1 && rb.exertion >= 0, `${at}.rubble 的休止角在 0 到 90 度之间，碎石不比平地好走`)
  need(fall.damagePerKJ >= 0 && fall.radiusU >= 0, `${at}.fall 的伤害与范围不为负`)
  need(dust.perM3 >= 0 && dust.spreadU > 0 && dust.halfLifeS > 0 && dust.opaqueTau > 0, `${at}.dust 的参数须为正`)
  need(pos(trees.crownU) && pos(trees.heightM) && trees.gapU > 0, `${at}.trees 的树冠、树高与间距须为正`)
  need(r.reflowMs > 0, `${at}.reflowMs 须为正`)
  if (errors.length > 0) continue
  const strength = { masonry: OBSTACLES.materials.masonry.strength, timber: OBSTACLES.materials.timber.strength }
  const level = Math.floor((over * layerM) / hc + 1e-9)
  for (let k = 0; k < 6; k++) {
    const seed = k * 7919 + 17
    const plan = ruinsPlan(r, { strength, walk: level, bodyU: B.refRadiusU }, seed)
    const b = plan.basin
    const g = plan.grid
    const onSite = (i: number): boolean => {
      const ci = i % g.cols
      const w = toWorld(plan.frame, g.u0 + (ci + 0.5) * g.cell, g.v0 + ((i - ci) / g.cols + 0.5) * g.cell)
      return roomAt(b, w.x * UNIT, w.y * UNIT) > 0
    }
    const walk = new Uint8Array(g.cols * g.rows)
    for (let i = 0; i < walk.length; i++) if (onSite(i) && plan.n[i]! <= level && plan.timber[i]! <= 0) walk[i] = 1
    const fu = (plan.start.x - plan.frame.cx) * plan.frame.cos + (plan.start.y - plan.frame.cy) * plan.frame.sin + plan.frame.w / 2
    const fv = -(plan.start.x - plan.frame.cx) * plan.frame.sin + (plan.start.y - plan.frame.cy) * plan.frame.cos + plan.frame.h / 2
    const start = Math.floor((fv - g.v0) / g.cell) * g.cols + Math.floor((fu - g.u0) / g.cell)
    need(walk[start] === 1, `${at} 种子 ${seed} 的出生点站不住`)
    const seen = new Uint8Array(walk.length)
    const stack = [start]
    seen[start] = 1
    let reached = 0
    while (stack.length > 0) {
      const i = stack.pop()!
      reached++
      const ci = i % g.cols
      for (const j of [ci > 0 ? i - 1 : -1, ci < g.cols - 1 ? i + 1 : -1, i - g.cols, i + g.cols]) {
        if (j < 0 || j >= walk.length || seen[j] || !walk[j]) continue
        seen[j] = 1
        stack.push(j)
      }
    }
    const total = walk.reduce((s0, x) => s0 + x, 0)
    need(reached >= total * 0.9, `${at} 种子 ${seed} 从回廊院只走得到 ${Math.round((reached / total) * 100)}% 能走的地方`)
    // 窄口：从回廊院出发标准身体站得下的地方里，大个子站得下的连成一片，挡人的东西之间也没有只放得过标准身体的缝（差半格算格子的误差）
    const room = bodyField(makeMasonry(r, g, plan.structures, plan.n, plan.sid, plan.timber, plan.rubble), level)
    const flood = (ok: (i: number) => boolean, from: number, mark: Uint8Array, eight: boolean): boolean => {
      let edge = false
      const todo = [from]
      mark[from] = 1
      while (todo.length > 0) {
        const i = todo.pop()!
        const ci = i % g.cols
        const cj = (i - ci) / g.cols
        if (ci === 0 || cj === 0 || ci === g.cols - 1 || cj === g.rows - 1) edge = true
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const x = ci + di
            const y = cj + dj
            if ((di === 0 && dj === 0) || (!eight && di !== 0 && dj !== 0) || x < 0 || y < 0 || x >= g.cols || y >= g.rows) continue
            const j = y * g.cols + x
            if (mark[j] || !ok(j)) continue
            mark[j] = 1
            todo.push(j)
          }
        }
      }
      return edge
    }
    const parts = (ok: (i: number) => boolean, eight: boolean, inner: boolean): number => {
      const mark = new Uint8Array(walk.length)
      let n = 0
      for (let i = 0; i < walk.length; i++) if (!mark[i] && ok(i) && !(flood(ok, i, mark, eight) && inner)) n++
      return n
    }
    const stand = new Uint8Array(walk.length)
    if (room[start]! >= B.refRadiusU) flood((i) => room[i]! >= B.refRadiusU, start, stand, false)
    const big = (i: number): boolean => stand[i] === 1 && room[i]! >= r.bodyCapU - g.cell / 2
    need(parts(big, false, false) === 1 && parts((i) => stand[i] === 0, true, true) === parts((i) => !big(i), true, true), `${at} 种子 ${seed} 有标准身体走得过、按 bodyCapU 算的大个子走不过的窄口`)
  }
}

need(PROGRESSION.restRatio > 0 && PROGRESSION.restRatio <= 1, 'progression.restRatio 须在 (0, 1] 内')
need(PROGRESSION.xp.base > 0 && PROGRESSION.xp.growth >= 1, 'progression.xp 的底数须为正，增长不小于 1：越往后升级越难')
need(Number.isInteger(PROGRESSION.xp.maxLevel) && PROGRESSION.xp.maxLevel >= 2, 'progression.xp.maxLevel 须是不小于 2 的整数')

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

const OUT = 'src/assets'
mkdirSync(`${OUT}/emoji`, { recursive: true })
const write = (name: string, data: unknown): void =>
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 1) + '\n')
write('abilities', ABILITIES)
write('ai', AI)
write('animations', ANIMATIONS)
write('battlefield', BATTLEFIELD)
write('characters', CHARACTERS)
write('combat', COMBAT)
write('difficulty', DIFFICULTY)
write('economy', ECONOMY)
write('editor', EDITOR_DRAFT)
write('enemies', ENEMIES)
write('feel', FEEL)
write('items', ITEMS)
write('levels', LEVEL_STATS)
write('mapdefaults', MAP_DEFAULTS)
write('maps', MAPS)
write('mutators', MUTATORS)
write('obstacles', OBSTACLES)
write('pickups', PICKUPS)
write('progression', PROGRESSION)
write('roles', ROLES)
write('runs', RUNS)
write('sfx', SFX)
write('stamina', STAMINA)
write('stats', STATS)
write('team', TEAM_BASELINE)
write('timestop', TIMESTOP)
write('weapons', WEAPONS)

// ordering.txt 与 twemoji.txt 逐行对应，只拷贝不改写
for (const name of ['ordering.txt', 'twemoji.txt']) copyFileSync(`scripts/emoji/${name}`, `${OUT}/emoji/${name}`)
