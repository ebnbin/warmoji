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
import { shellPull } from '../src/data/nebula.ts'
import { deckEdgeAngle, halfBeamAt, hydrostatics, stability, staticHeel } from '../src/data/ship.ts'
import { GROUND_PPU } from '../src/data/texel.ts'
import { pathText, runChecks, withNested } from '../src/data/runCheck.ts'
import { render } from '../src/emoji/painted/design.ts'
import { PAINTED } from '../src/emoji/painted/index.ts'
import type { Issue } from '../src/data/runCheck.ts'
import type { CharacterAuthoring } from '../src/types/characters'
import type { EnemyDef, EnemyKind } from '../src/types/enemies'
import type { ItemDef } from '../src/types/items'
import type { MapDef, NebulaConfig } from '../src/types/maps'
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
  if (m.river) need(m.river.upstream >= 1 && m.river.downstream >= 0 && m.river.downstream <= 1, `maps.${id}.river 的逆流倍率须不小于 1，顺流倍率须在 [0, 1] 内`)
  if (m.ice) need(m.ice.waterExertion > 0 && m.ice.waterRegen >= 0, `maps.${id}.ice 的水里费力须为正、回复倍率不为负`)
}

/** 星云：壳层包着空腔，黑洞整个落在空腔里，视界外还有能站的地方；流星的积分步长能在时限里走完 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'nebula') === (m.nebula !== undefined), `maps.${id} 是星云当且仅当写了 nebula`)
  const n = m.nebula
  if (!n) continue
  const [near, far] = n.hole.fromCenterU
  need(n.shell.innerU > 0 && n.shell.outerU > n.shell.innerU && n.shell.gm > 0, `maps.${id}.nebula.shell 须内径为正、外径大于内径、引力为正`)
  need(n.contain.speedMul >= 1 && n.contain.leapU >= 0, `maps.${id}.nebula.contain 的速度余量不小于 1、瞬移余量不为负`)
  need(n.hole.gm > 0 && n.hole.softeningU > 0, `maps.${id}.nebula.hole 的引力与软化长度须为正`)
  need(n.hole.horizonU > n.hole.softeningU / Math.SQRT2, `maps.${id}.nebula.hole.horizonU 须大于软化长度的 1/√2，视界外的引力才随距离单调减小`)
  need(near >= 0 && near <= far && far + n.hole.horizonU < n.shell.innerU, `maps.${id}.nebula.hole 的位置范围须落在空腔里`)
  need(n.hole.clearU > n.hole.horizonU, `maps.${id}.nebula.hole.clearU 须大于视界`)
  need(n.meteor.stepMs > 0 && n.meteor.maxFlightMs >= n.meteor.stepMs, `maps.${id}.nebula.meteor 的积分步长须为正且不超过最长飞行时间`)
  need(n.meteor.speedU > 0 && n.meteor.radiusU > 0 && n.meteor.warnMs >= 0 && n.meteor.offsetU >= 0, `maps.${id}.nebula.meteor 的速度与半径须为正`)
  need(n.meteor.radiusU < n.shell.innerU, `maps.${id}.nebula.meteor.radiusU 须小于空腔半径，瞄准点才收得进空腔`)
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
 * 船：甲板收得拢、桅杆两边走得过去；空船正浮稳定。身体之间不互相挤开，最坏是最多的怪全叠在最宽处的舷墙边：
 * 那时也不翻、甲板边不入水（直舷公式还成立），倾角还得超过身体脚下的摩擦角，闲着的身体才滑得起来
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
  need(h.bulwarkU > 0 && h.seaU > 0 && h.neckU > 0 && h.mastU > 0, `maps.${id}.ship.hull 的舷墙、海面、窄缝与桅杆须为正`)
  need(h.masts.length >= 2, `maps.${id}.ship.hull.masts 至少两根：队伍从最前面两根桅杆之间出发`)
  for (const at of h.masts) need(at > 0 && at < 1 && halfBeamAt(h, at * h.lengthU) >= h.mastU + 2, `maps.${id}.ship.hull.masts 的 ${at} 须立在甲板上、两边各留得出两格的路`)
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
  need(g.lowSide === undefined || (g.lowSide.mul >= 1 && g.lowSide.fullDeg > 0 && g.lowSide.fullDeg < 90), `${at}.lowSide 的倍率不小于 1、角度在 0 到 90 度之间`)
  for (const [k, d] of kinds) {
    const p = `${at}.kinds.${k}`
    need(d.weight > 0 && (d.perSec ?? 1) > 0, `${p} 的权重与限速须为正`)
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

/** 身体的体力上限须为正、体力回复不为负 */
const checkStamina = (st: { readonly maxStamina?: number; readonly staminaRegen?: number } | undefined, path: string): void => {
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

/** 走进壳层停下的半径：终端漂移 g·fall 追上速度的地方，壳层里引力随半径单调增大；外缘都追不上就停不下 */
const shellStopU = (shell: NebulaConfig['shell'], fall: number, speedU: number): number => {
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
/** 星云壳层困得住每个角色与敌人：停下处再往外瞬移，仍在壳外引力重新追不上它的逃逸半径以内 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  const n = m.nebula
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
    need(shellStopU(n.shell, b.fall, v) + n.contain.leapU <= escapeU, `maps.${id}.nebula.shell 困不住 ${b.path}：走到停下处再往外瞬移 ${n.contain.leapU} 格就逃出引力`)
  }
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
