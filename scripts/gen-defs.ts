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
import { EXPERIMENTS } from '../defs/experiments.ts'
import { FEEL } from '../defs/feel.ts'
import { ITEMS } from '../defs/items.ts'
import { LEVEL_STATS } from '../defs/levels.ts'
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
import { STATUSES } from '../defs/statuses.ts'
import { TEAM_BASELINE } from '../defs/team.ts'
import { TIMESTOP } from '../defs/timestop.ts'
import { WEAPONS } from '../defs/weapons.ts'
import { MAX_CHAR_LEVEL } from '../src/data/charLevel.ts'
import { ACCRETION_ETA, captureU, einsteinU, floorDepthU, ISCO_RS, schwarzschildU, SHADOW_RS, shellRecaptureU, stopRadiusU, wallU } from '../src/maps/nebula/physics.ts'
import { depth, floeOutline, GRAVITY, simple } from '../src/maps/floe/model.ts'
import { makeMasonry, ruinsPlan, toWorld } from '../src/maps/ruins/layout.ts'
import { bodyField } from '../src/maps/ruins/masonry.ts'
import { roomAt } from '../src/maps/basin.ts'
import { FRAME_U, SAFE_U, SPAWN_CLEAR_U, UNIT, VIEW } from '../src/util/units.ts'
import { WindSea } from '../src/maps/floe/sea.ts'
import { makeAmethyst } from '../src/maps/amethyst/layout.ts'
import { diffuseAt, directAt, makeLighting, stepLighting } from '../src/maps/amethyst/light.ts'
import { blankSky, crossing as amethystCrossing, secsUntil, skyAt as amethystSky, skyLux as amethystSkyLux, torchReach } from '../src/maps/amethyst/sky.ts'
import { centered, FRAME_MID } from '../src/maps/frame.ts'
import { Rng } from '../src/util/rng.ts'
import { GROUND_PPU } from '../src/data/texel.ts'
import { bankShape, meadowPlan } from '../src/maps/meadow/layout.ts'
import { bridgeLocal, CREST_U, sakuraPlan, SINK_M, weirLocal } from '../src/maps/sakura/layout.ts'
import { deepPlan } from '../src/maps/deep/layout.ts'
import { fits, homePose, hullOf, innerOf, rimOf } from '../src/maps/deep/sub.ts'
import { diffusionU, frontWidthU, petriPlan } from '../src/maps/petri/model.ts'
import { CARD_U, clockAt, makeStage, actOf, slabGap, slabOf, slabSd } from '../src/maps/theater/model.ts'
import { COLS, splits, stacks, exitPlan } from '../src/maps/exit/layout.ts'
import { SUN } from '../src/data/light.ts'
import { HEIGHT_SPAN, TIME_QUANT } from '../src/maps/desert/stamp.ts'
import { pathText, runChecks, withNested } from '../src/data/runCheck.ts'
import { SIGNALS } from '../src/data/signals.ts'
import type { MapSignals } from '../src/data/signals.ts'
import { animIssues } from '../src/emoji/animCheck.ts'
import { packSvg, parseEmojiPack } from '../src/emoji/pack.ts'
import { splitSvg } from '../src/emoji/svgSplit.ts'
import type { Issue } from '../src/data/runCheck.ts'
import type { AbilityDef, Cond, CondWho } from '../src/types/abilityDefs'
import type { StatusDef } from '../src/types/statuses'
import type { CharacterAuthoring } from '../src/types/characters'
import type { EnemyDef, EnemyKind, UnitBase } from '../src/types/enemies'
import type { Span } from '../src/types/obstacles'
import type { ItemDef } from '../src/types/items'
import type { MapDef } from '../src/types/maps'
import type { ExperimentDef, MutatorDef, RunDef } from '../src/types/runs'

const errors: string[] = []
const need = (ok: boolean, msg: string): void => {
  if (!ok) errors.push(msg)
}

for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  for (const kind of m.foes) {
    const e = ENEMIES[kind]
    need(e !== undefined && e.role !== 'boss', `maps.${id}.foes 须引用非 Boss 的敌人：${kind}`)
  }
  need(new Set(m.foes).size === m.foes.length, `maps.${id}.foes 不能重复`)
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

/** 每张图赶路都耗体力、歇着都能回 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) need(m.stamina.exertion > 0 && m.stamina.regen > 0, `maps.${id}.stamina 的费力与回复倍率须为正`)

/** 单位的光：光色与影子色是 24 位颜色，影子有浓度、往外铺得开 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  const l = m.light
  const rgb = (c: number): boolean => Number.isInteger(c) && c >= 0 && c <= 0xffffff
  need(rgb(l.sun) && rgb(l.shade), `maps.${id}.light 的颜色须是 24 位 RGB`)
  if (!l.shadow) continue
  need(rgb(l.shadow.color), `maps.${id}.light.shadow.color 须是 24 位 RGB`)
  need(l.shadow.alpha > 0 && l.shadow.alpha <= 1, `maps.${id}.light.shadow.alpha 须在 (0, 1] 内`)
  need(l.shadow.length > 0, `maps.${id}.light.shadow.length 须为正`)
}

/** 火山：盆地的边在地图边与中线之间、火山口贴着地图边的中段、山体够不着地图的角和中线；一次喷发的预兆与出熔岩都在下一次之前结束；整座山都积满雪 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'volcano') === (m.volcano !== undefined), `maps.${id} 是火山当且仅当写了 volcano`)
  const v = m.volcano
  if (!v) continue
  const c = v.cone
  const e = v.eruption
  const l = v.lava
  const r = v.rim
  const s = v.snow
  need(m.size !== undefined, `maps.${id} 是火山，须写 size`)
  if (!m.size) continue
  const side = Math.min(m.size.w, m.size.h)
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
  need(c.craterDepth > 0 && c.gullyDepth >= 0, `maps.${id}.volcano.cone 的火山口须有深度、冲沟深度不为负`)
  need(v.terrain.tilt >= 0 && v.terrain.relief >= 0 && v.terrain.waveU > 0, `maps.${id}.volcano.terrain 的坡度、起伏不为负，波长为正`)
  need(e.firstMs >= 0 && e.warnMs > 0 && e.rate > 0 && e.waneMs > 0 && e.peakMs > 0 && e.peakMs < e.effuseMs, `maps.${id}.volcano.eruption 的时长与流量须为正，流量在停之前涨到顶`)
  need(e.intervalJitterMs >= 0 && e.intervalMs - e.intervalJitterMs > e.warnMs + e.effuseMs, `maps.${id}.volcano.eruption 的间隔减去抖动须长过预兆加出熔岩`)
  need(Number.isInteger(e.lobes[0]) && Number.isInteger(e.lobes[1]) && e.lobes[0] >= 1 && e.lobes[0] <= e.lobes[1], `maps.${id}.volcano.eruption.lobes 须为不小于 1 的整数范围`)
  need(e.lobeDeg > 0 && e.lobeFloor >= 0 && e.lobeJitter >= 0 && e.lobeJitter < 0.5, `maps.${id}.volcano.eruption 的股宽须为正、股外的比例不为负、股心抖动不到半个间距`)
  need(Number.isInteger(e.history) && e.history >= 0, `maps.${id}.volcano.eruption.history 须为非负整数`)
  need(l.stepMs > 0 && l.mobility > 0 && l.mobilityPow >= 0 && l.cooling > 0 && l.coolRadiusU > 0, `maps.${id}.volcano.lava 的步长、流动与冷却须为正`)
  need(l.yieldHot >= 0 && l.yieldHot <= l.yieldCold, `maps.${id}.volcano.lava 的屈服强度须不为负且冷时不小于热时`)
  need(l.solidus > 0 && l.solidus < 1, `maps.${id}.volcano.lava.solidus 须在 0 到 1 之间`)
  need(l.teamDps >= 0 && l.enemyDps >= 0 && l.tickMs > 0, `maps.${id}.volcano.lava 的伤害不为负、结算间隔为正`)
  need(s.edgeU > 0 && s.shiftU >= 0 && s.wobble >= 0 && s.wobble < 0.5, `maps.${id}.volcano.snow 的雪区边须有宽度、中心往地图里挪的距离不为负、半径起伏在 0 到 0.5 倍之间`)
  need(s.radiusU * (1 - s.wobble) - s.edgeU > c.blockU * (1 + c.blockJitter) + s.shiftU, `maps.${id}.volcano.snow 须让整座山都落在积满雪的那片里`)
  need(s.warmMs >= 0 && s.coverMs > 0 && s.buryMs > 0, `maps.${id}.volcano.snow 的回凉时间不为负，积满与盖灰的时间为正`)
}

/**
 * 出怪口：吸附半径为正；每种的权重为正、限速为正、只出的敌人都存在；抛入的才写抛得到多远、只能摆在地标上，整片地面上的只能钻出或落下；
 * 头目出怪口接得住这张图的头目；配比里的每种敌人都有出怪口接
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  const g = m.gates
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
  for (const kind of m.foes) need(takes(kind), `${at} 没有出怪口接出没的 ${kind}`)
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
 * 紫晶洞：参数说得通；主晶洞与它上方的塌顶落得进地图，出生点在主晶洞里；挡路的晶体挡得住平射与视线，矮晶丛与地上的晶洞矮得标准身体跨得过去；
 * 太阳每天升过、落过晨昏的高度；火把照得清的范围盖得住夜里的镜头，夜里的镜头又看得见整个队伍。抽一批种子真的生成一遍、按正午与午夜算一遍光：
 * 暗道挖得够、出生点四周空得开；正午洞厅亮得看得清整个洞、塌顶下亮得熄得了火把，暗道尽头暗得出得了怪；没有月亮的午夜洞厅暗得出得了怪
 */
const DEG = Math.PI / 180
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'amethyst') === (m.amethyst !== undefined), `maps.${id} 是紫晶洞当且仅当写了 amethyst`)
  const a = m.amethyst
  if (!a) continue
  const at = `maps.${id}.amethyst`
  const span = (r: readonly [number, number]): boolean => r[0] <= r[1]
  const pos = (r: readonly [number, number]): boolean => r[0] > 0 && span(r)
  const ints = (r: readonly [number, number]): boolean => Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] >= 0 && span(r)
  const { chambers: ch, tunnels: tn, openings: op, crystals: cr, debris, sky, light, torch, view } = a
  need(m.size !== undefined, `${at} 须写 size`)
  if (!m.size) continue
  const mapW = m.size.w
  const mapH = m.size.h
  need(mapW === mapH && mapW <= FRAME_U - SAFE_U * 2, `${at} 的地图须是方的、放得进方框的安全区`)
  need(pos(ch.mainU) && ch.driftU >= 0 && ints(ch.sideCount) && pos(ch.sideU) && pos(ch.overlapU) && ch.jitter >= 0 && ch.jitter < 0.5, `${at}.chambers 的半径与叠进去的深度须为正、个数须为非负整数、起伏在 0 到 0.5 之间`)
  need(ch.wobbleU >= 0 && ch.waveU > 0 && ch.neckU > 0 && ch.rimU > 0 && ch.wallU > 0, `${at}.chambers 的起伏、波长、窄缝、离地图边的岩体与洞壁宽须为正`)
  const mainIn = ch.mainU[0] * (1 - ch.jitter) - ch.wobbleU - ch.driftU
  need(ch.mainU[1] * (1 + ch.jitter) + ch.wobbleU + ch.driftU <= mapW / 2 - ch.rimU, `${at}.chambers 的主晶洞须整个落在地图里`)
  need(mainIn > SPAWN_CLEAR_U + ch.neckU, `${at}.chambers 的出生点须在主晶洞里、四周空得开`)
  need(ch.overlapU[1] < ch.sideU[0], `${at}.chambers 小晶洞叠进主晶洞的深度须小于它的半径`)
  need(ints(tn.count) && tn.count[0] >= 1, `${at}.tunnels 至少一条：白天怪物要有暗处出来`)
  need(tn.widthU > 2 * ch.neckU && tn.outU > tn.widthU / 2 && pos(tn.turnU) && tn.pocketU * 2 >= tn.widthU && tn.rockU > 0, `${at}.tunnels 须宽过窄缝、拐进岩体，尽头的小晶洞不比洞道窄`)
  need(pos(op.breachU) && pos(op.breachOffsetU) && ints(op.sideBreaches) && pos(op.sideBreachU) && ints(op.rifts) && pos(op.riftLenU) && pos(op.riftWidthU), `${at}.openings 的尺寸须为正、个数须为非负整数`)
  need(op.jitter >= 0 && op.jitter < 0.5 && op.gapU >= 0 && op.debrisM >= 0 && op.debrisSpread >= 1, `${at}.openings 的起伏在 0 到 0.5 之间，碎晶坡不比塌顶小`)
  need(op.breachOffsetU[0] + op.breachU[0] + 0.8 < ch.mainU[0] - ch.driftU, `${at}.openings 最近最小的塌顶须开得进主晶洞`)
  need(ints(cr.clusters) && pos(cr.clusterU) && pos(cr.clusterM) && ints(cr.beams) && pos(cr.beamU) && pos(cr.beamLenU), `${at}.crystals 的晶簇与巨晶个数须为非负整数、尺寸为正`)
  need(ints(cr.geodes) && pos(cr.geodeU) && cr.geodeM > 0 && ints(cr.druse) && pos(cr.druseU) && pos(cr.druseM), `${at}.crystals 的晶洞与矮晶丛个数须为非负整数、尺寸为正`)
  need(ch.ceilingM > Math.max(cr.clusterM[1], op.debrisM, Math.sqrt(3) * cr.beamU[1] + 1.2), `${at}.chambers.ceilingM 须高过晶体与碎晶坡`)
  {
    const B = OBSTACLES.body
    const layerM = B.heightM / B.layers
    const over = Math.floor(B.layers * B.step)
    const flat = B.layers - 1
    const above = (h: number): boolean => Math.ceil(h / layerM - 1e-9) > flat
    need(above(cr.clusterM[0]) && above(Math.sqrt(3) * cr.beamU[0]), `${at}.crystals 的晶簇与巨晶须高过平射飞的那一层：挡得住子弹与视线`)
    need(cr.druseM[1] <= over * layerM && cr.geodeM <= over * layerM, `${at}.crystals 的矮晶丛与地上的晶洞须矮得让标准身体跨过去`)
  }
  need(cr.clearU >= SPAWN_CLEAR_U + ch.neckU, `${at}.crystals.clearU 须比出生点要空出的 ${SPAWN_CLEAR_U} 格再宽一道窄缝`)
  need(debris.viscosity >= 1 && debris.exertion >= 0, `${at}.debris 碎晶坡不比平地好走`)
  need(Math.abs(Math.tan(sky.latitudeDeg * DEG) * Math.tan(sky.declinationDeg * DEG)) < 1 && sky.twilightDeg > 0, `${at}.sky 须让太阳每天升起又落下、晨昏的高度为正`)
  need(amethystCrossing(sky, sky.twilightDeg) !== null && amethystCrossing(sky, -sky.twilightDeg) !== null, `${at}.sky 的太阳须每天升过、落过正负 twilightDeg 度`)
  need(sky.dayS > 0 && sky.duskS > 0 && sky.nightS > 0 && sky.dawnS > 0 && sky.startHour >= 0 && sky.startHour < 24 && sky.extinction > 0, `${at}.sky 的四段须各走一阵、开局的钟点在一天里、消光为正`)
  need(light.albedo > 0 && light.albedo < 1 && light.bounceU > 0 && light.tunnelFadeU > 0, `${at}.light 的反照率在 0 到 1 之间，反光铺开的范围与暗道里暗下去的快慢为正`)
  need(torch.candela > 0 && torch.heightM > 0 && torch.staggerMs >= 0 && torch.igniteLux > a.spawnLux && torch.douseLux > torch.igniteLux, `${at}.torch 须比刷怪的门槛亮时就点起，熄火的门槛高过点火的（不来回闪）`)
  need(view.darkLux > 0 && view.brightLux > view.darkLux && view.clearLux > 0 && view.nightU > 0 && view.dayU > view.nightU && view.dayU <= FRAME_U, `${at}.view 须白天比夜里看得远、白天的镜头落在方框以内、照度门槛为正`)
  need(amethystSkyLux(-18) < a.spawnLux, `${at} 深夜的星光须暗过刷怪的门槛`)
  const reach = torchReach(torch, view.clearLux)
  need(reach >= view.nightU / 2, `${at} 火把只照得清 ${reach.toFixed(1)} 格，盖不住夜里镜头短边的一半 ${view.nightU / 2} 格`)
  const squad = FEEL.squad.fanDistance + TEAM_BASELINE.member.radius * TEAM_BASELINE.team.followerSizeMul
  need(view.nightU / 2 > squad, `${at}.view.nightU 的一半须大于 ${squad} 格，夜里看得见跟在身后的队员`)
  if (errors.length > 0) continue
  const noon = amethystSky(sky, secsUntil(sky, sky.startHour, 12), blankSky())
  const midnight = amethystSky(sky, secsUntil(sky, sky.startHour, 0), blankSky())
  for (let k = 0; k < 6; k++) {
    const seed = k * 7919 + 23
    const L = makeAmethyst(a, centered(mapW, mapH), new Rng(seed))
    need(L.tunnels.length >= tn.count[0], `${at} 种子 ${seed} 只挖出 ${L.tunnels.length} 条暗道`)
    need(roomAt(L.basin, FRAME_MID.x, FRAME_MID.y) >= SPAWN_CLEAR_U * UNIT, `${at} 种子 ${seed} 的出生点四周空不出 ${SPAWN_CLEAR_U} 格`)
    const lt = makeLighting(L, a)
    stepLighting(lt, L, a, noon)
    need(lt.hallLux > view.brightLux, `${at} 种子 ${seed} 正午洞厅平均只有 ${lt.hallLux.toFixed(1)} 勒克斯，白天看不清整个洞`)
    const main = L.breaches[0]!
    need(main.r >= op.breachU[0] * UNIT * 0.75, `${at} 种子 ${seed} 的塌顶在主晶洞上方落不下`)
    const under = diffuseAt(lt, main.x, main.y) + directAt(lt, L.ceilingM, noon, main.x, main.y)
    need(under > torch.douseLux, `${at} 种子 ${seed} 正午塌顶下只有 ${under.toFixed(1)} 勒克斯，熄不了火把`)
    L.tunnels.forEach((t, i) => {
      const end = t.path[t.path.length - 1]!
      const lux = diffuseAt(lt, end.x, end.y) + directAt(lt, L.ceilingM, noon, end.x, end.y)
      need(lux < a.spawnLux, `${at} 种子 ${seed} 正午第 ${i + 1} 条暗道的尽头还有 ${lux.toFixed(2)} 勒克斯，白天出不了怪`)
    })
    stepLighting(lt, L, a, midnight)
    need(lt.hallLux < a.spawnLux, `${at} 种子 ${seed} 头一夜的午夜洞厅还有 ${lt.hallLux.toFixed(3)} 勒克斯，夜里出不了怪`)
  }
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
 * 樱花：参数说得通；槛下的溪比槛顶低过汇的深度；抽一批种子真的生成一遍：每张都生成得出来，
 * 开局站位离边够远，桥两头落在能走的地方，石槛顶没有塌下去的缺口
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'sakura') === (m.sakura !== undefined), `maps.${id} 是樱花当且仅当写了 sakura`)
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
 * 舞台：台面连四周的台板放得进安全区，台中空得出出生点；换幕的各段时长为正；
 * 矮布景挡得住标准身体、子弹从上面飞过、头目跨得过，高布景挡得住视线与平射；路宽过得去最大的小怪与头目，台边与布景之间也过得去；
 * 抽一批种子把四章都摆一遍：件数在范围里，都落在半边台上、不压台中线，别组之间留够路，开局那一幕不压着出生的空地，换页的钟按段走
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'theater') === (m.theater !== undefined), `maps.${id} 是舞台当且仅当写了 theater`)
  const c = m.theater
  if (!c) continue
  const at = `maps.${id}.theater`
  const { size, margin, gapU, turn: t } = c
  need(size.wU > 0 && size.hU > 0 && size.wU <= FRAME_U - SAFE_U * 2 && size.hU <= FRAME_U - SAFE_U * 2, `${at}.size 台面须放得进方框的安全区`)
  need(c.plazaU >= SPAWN_CLEAR_U && c.plazaU < size.hU / 2, `${at}.plazaU 须空得出出生点要的 ${SPAWN_CLEAR_U} 格，且落在页里`)
  need(Number.isInteger(c.pieces[0]) && Number.isInteger(c.pieces[1]) && c.pieces[0] >= 1 && c.pieces[0] <= c.pieces[1], `${at}.pieces 须为不小于 1 的整数范围`)
  need(t.firstMs > 0 && t.intervalMs - t.jitterMs > 0 && t.jitterMs >= 0, `${at}.turn 的第一幕与每幕演着的时长须为正`)
  need(t.lightMs > 0 && t.staggerMs >= 0 && t.flyMs > 0 && t.slideMs > 0 && t.lightMs <= t.staggerMs + t.flyMs, `${at}.turn 各段的时长须为正，聚光灯亮起来、收回去都放得进吊布景的那一段`)
  need(c.reflowMs > 0, `${at}.reflowMs 须为正`)
  const B = OBSTACLES.body
  const layer = B.heightM / B.layers
  const over = (span: Span): number => (span[0] + Math.floor((span[1] - span[0] + 1) * B.step)) * layer
  const top = (h: number): number => Math.ceil(h / layer - 1e-9) * layer
  const chest = (B.layers - 0.5) * layer
  const boss = ENEMIES[m.boss]
  const standard: Span = [0, B.layers - 1]
  need(top(c.lowM) > over(standard) + 1e-9, `${at}.lowM 须高过标准身体跨得过的 ${+over(standard).toFixed(2)} 米：矮布景要挡得住人`)
  need(top(c.lowM) < chest, `${at}.lowM 须低过平射的高度 ${+chest.toFixed(2)} 米：子弹要从矮布景上面飞过去`)
  need(top(c.lowM) <= over(boss.span ?? standard) + 1e-9, `${at}.lowM 须让头目 ${m.boss} 跨得过去`)
  const small = Math.max(TEAM_BASELINE.member.radius * TEAM_BASELINE.team.leaderSizeMul, ...m.foes.map((kind) => ENEMIES[kind]!.radius))
  need(gapU.low >= small * 2 + 0.2 && margin.low >= small * 2 + 0.2, `${at} 矮布景之间、矮布景与台边之间须过得去最大的小怪（半径 ${small} 格）`)
  need(gapU.tall >= boss.radius * 2 + 0.2 && margin.tall >= boss.radius * 2 + 0.2, `${at} 高布景之间、高布景与台边之间须过得去头目（半径 ${boss.radius} 格）`)
  need(margin.aisle > 0, `${at}.margin.aisle 须为正：布景不压台中线上的活门`)
  for (let s = 0; s < 6; s++) {
    const stage = makeStage(c, s * 7919 + 13)
    for (let i = 0; i < 4; i++) {
      const where = `${at} 第 ${s} 个样本的第 ${i} 页`
      let pg: ReturnType<typeof actOf>
      try {
        pg = actOf(c, stage, i)
      } catch (e) {
        need(false, `${where}：${(e as Error).message}`)
        continue
      }
      need(pg.pieces.length >= c.pieces[0] && pg.pieces.length <= c.pieces[1], `${where} 摆了 ${pg.pieces.length} 件，不在范围里`)
      for (const p of pg.pieces) {
        need(p.low || top(p.h) > chest, `${where} 的 ${p.kind} 不比平射高，挡不住子弹`)
        need(p.d >= CARD_U, `${where} 的 ${p.kind} 比卡纸还薄`)
        if (i === 0) need(slabSd(slabOf(p), stage.start.x, stage.start.y) >= c.plazaU, `${where} 的 ${p.kind} 压着出生的空地`)
        for (const q of pg.pieces) {
          if (q === p || q.group === p.group) continue
          need(slabGap(slabOf(p), slabOf(q)) >= (p.low || q.low ? gapU.low : gapU.tall) - 1e-6, `${where} 的 ${p.kind} 与 ${q.kind} 之间的路太窄`)
        }
      }
    }
    let last = -1
    for (let ms = 0; ms < 400000; ms += 250) {
      const k = clockAt(c, stage, ms)
      need(k.act >= last && k.at >= 0 && k.at <= k.len + 1e-6, `${at} 第 ${s} 个样本的换幕钟在 ${ms} 毫秒处倒着走或越出了段`)
      last = k.act
    }
  }
}

/**
 * 出口：舱室的格切得出来、要的每种间数都搭得出来、能走的方块落在整格上，最小的舱室也放得下入口与三扇门、开局那间放得下开局的空地；
 * 每间至少五间，门才都往前跳得开；门与入口站得下队长和跟在身后的队员、不压着墙角的出怪板，充能、发车的时长说得通；
 * 亮着的几间从全亮往下排、都比暗着的亮；四种配方各是一种摆在地标上的出怪口，地标上的出怪口只有配方与看守；
 * 抽一批种子真的生成一遍：间数在要的范围里，分到的格正好铺满方框；开局站位四周空着；每间舱室的入口、门与出怪板都落在那间能走的地方上、台子互不相压，各有会亮的瓷砖；
 * 每间两三扇门、不通回自己、不重复、没有两间互相通着；顺着出口走恰好走遍所有舱室绕回原处；四季都分到了舱室
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'exit') === (m.exit !== undefined), `maps.${id} 是出口当且仅当写了 exit`)
  const c = m.exit
  if (!c) continue
  const at = `maps.${id}.exit`
  const { maze: z, pad, racks: rk, emitters: em, light: li } = c
  const edge = z.gapU + z.lipU
  need(z.gapU > 0 && z.lipU > 0 && Number.isInteger(edge) && c.neckU > 0, `${at}.maze 的缝宽、台沿须为正、加起来是整格，窄缝须为正`)
  need(splits(FRAME_U, COLS, z.colU[0], z.colU[1]).length > 0, `${at}.maze 的列宽切不出 ${FRAME_U} 格的 ${COLS} 列`)
  need(z.rows.length > 0 && z.rows.every((r) => Number.isInteger(r.n) && r.n >= 1 && splits(FRAME_U, r.n, r.u[0], r.u[1]).length > 0), `${at}.maze.rows 的每一种都须切得出 ${FRAME_U} 格`)
  const counts = (r: readonly [number, number]): number[] => Array.from({ length: Math.max(0, r[1] - r[0] + 1) }, (_, k) => r[0] + k)
  need(z.rooms[0] <= z.rooms[1] && z.few[0] <= z.few[1] && Math.min(z.rooms[0], z.few[0]) >= 5, `${at}.maze 的间数范围须是正的、至少五间`)
  need([...counts(z.rooms), ...counts(z.few)].every((n) => stacks(c, n).length > 0), `${at}.maze 有的间数用 rows 搭不出来`)
  need(z.fewP >= 0 && z.fewP <= 1 && z.extraP >= 0 && z.extraP <= 1, `${at}.maze 的机会须在 0 到 1 之间`)
  const tight = Math.min(z.colU[0], ...z.rows.map((r) => r.u[0])) - edge * 2
  need(tight / 2 - pad.radiusU >= em.plateU + 0.5 && tight >= 2 * (pad.insetU + 2 * pad.radiusU) + 1, `${at}.maze 最小的舱室放不下入口与门`)
  need(Math.min(z.colU[0], ...z.rows.map((r) => Math.ceil(FRAME_U / r.n))) - edge * 2 >= SPAWN_CLEAR_U * 2 + 2, `${at}.maze 放不下开局的空地`)
  const squad = FEEL.squad.fanDistance + TEAM_BASELINE.member.radius * TEAM_BASELINE.team.followerSizeMul
  need(pad.radiusU >= squad * 0.75 && pad.insetU >= 0 && pad.cornerU - pad.radiusU >= em.plateU + 0.5, `${at}.pad 的台面太小，或压着墙角的出怪板`)
  need(pad.chargeMs > 0 && pad.drainMs > 0 && pad.transitMs > 0 && pad.spillU >= 0, `${at}.pad 的充能、漏能与穿行的时长须为正`)
  need(pad.shuttleMs > pad.warnMs + pad.transitMs && pad.warnMs > 0, `${at}.pad 发车的间隔须放得下预警与穿行`)
  need(rk.sizeU > 0 && rk.stepU > rk.sizeU + 2 * c.neckU && rk.heightM > 0 && rk.minU > 0 && rk.clearU >= 0, `${at}.racks 的边长与间距说不通`)
  need(c.pit.minU - 2 * c.pit.marginU >= 2 && c.pit.marginU >= pad.insetU + 2 * pad.radiusU + 1, `${at}.pit 的凹槽太小，或四周的回廊压着门`)
  need(Number.isInteger(em.plateU) && em.plateU >= 1 && em.markU > 0 && em.clearU >= 0, `${at}.emitters 的板长须是正整数，凝成形的半径为正`)
  need(c.jar.sizeU > 0 && c.jar.sizeU + 0.3 < Math.min(pad.cornerU, tight / 2) - pad.radiusU, `${at}.jar 的标本罐须为正、不压着门`)
  need(c.hopU > 0, `${at} 过一道门折合的路程须为正`)
  need(li.levels.length >= 1 && li.levels[0] === 1 && li.levels.every((v, k) => v > 0 && v <= (k === 0 ? 1 : li.levels[k - 1]!)) && li.wakeMs > 0 && li.dimMs > 0, `${at}.light 的亮度须从全亮往下排、都不是全黑，亮起来、暗下去的时间须为正`)
  need(c.tiles.teamFadeMs > 0 && c.tiles.foeFadeMs > 0, `${at}.tiles 的暗下去的时间须为正`)
  const g = m.gates
  need(new Set(c.recipes).size === 4 && c.recipes.every((k) => g.kinds[k]?.at.kind === 'mark'), `${at}.recipes 须是四种不同的、摆在地标上的出怪口`)
  need(g.boss === 'warden' && g.kinds.warden?.at.kind === 'mark', `${at} 的头目须从看守（地标上的出怪口 warden）出来`)
  for (const [k, d] of Object.entries(g.kinds)) need(d.at.kind !== 'mark' || k === 'warden' || c.recipes.includes(k), `${at} 地标上的出怪口 ${k} 既不是配方也不是看守`)
  for (let s = 0; s < 24; s++) {
    const plan = exitPlan(c, s * 7919 + 13)
    const where = `${at} 第 ${s} 个样本`
    const n = plan.rooms.length
    need((n >= z.rooms[0] && n <= z.rooms[1]) || (n >= z.few[0] && n <= z.few[1]), `${where} 切出了 ${n} 间`)
    need(plan.rooms.reduce((sum, r) => sum + (r.cell.x1 - r.cell.x0) * (r.cell.y1 - r.cell.y0), 0) === FRAME_U * FRAME_U, `${where} 的舱室没有正好铺满方框`)
    const home = plan.rooms[plan.start]!
    need(roomAt(plan.basins[plan.start]!, home.center.x * UNIT, home.center.y * UNIT) >= SPAWN_CLEAR_U * UNIT, `${where} 的开局站位离边不到 ${SPAWN_CLEAR_U} 格`)
    plan.rooms.forEach((room, i) => {
      const b = plan.basins[i]!
      const pads = [room.entry, ...room.doors]
      need(pads.every((p) => roomAt(b, p.x * UNIT, p.y * UNIT) >= pad.radiusU * UNIT * 0.9), `${where} 第 ${i} 间的入口或门没落在能走的地方`)
      need(pads.every((p, k) => pads.every((q, j) => j <= k || Math.hypot(p.x - q.x, p.y - q.y) >= pad.radiusU * 2 + 0.5)), `${where} 第 ${i} 间的入口与门压在了一起`)
      need(room.plates.length > 0 && room.plates.every((p) => roomAt(b, p.x * UNIT, p.y * UNIT) >= em.markU * UNIT * 0.5), `${where} 第 ${i} 间的出怪板没落在能走的地方`)
      need(plan.tiles.some((t) => t === i), `${where} 第 ${i} 间没有会亮的瓷砖`)
      const to = room.doors.map((d) => d.to)
      need(to.length >= 2 && to.length <= 3 && new Set(to).size === to.length && !to.includes(i), `${where} 第 ${i} 间的门数不对、重复或通回自己`)
      need(to.every((t) => !plan.rooms[t]!.doors.some((d) => d.to === i)), `${where} 第 ${i} 间和它通往的一间互相通着`)
      need(room.doors.filter((d) => d.exit).length === 1, `${where} 第 ${i} 间须恰好一扇出口`)
    })
    const seen = new Set<number>()
    let at0 = plan.start
    for (let k = 0; k < plan.rooms.length; k++) {
      seen.add(at0)
      at0 = plan.rooms[at0]!.doors.find((d) => d.exit)!.to
    }
    need(at0 === plan.start && seen.size === plan.rooms.length, `${where} 顺着出口走没有走遍所有舱室绕回原处`)
    need(new Set(plan.rooms.map((r) => r.season)).size === 4, `${where} 的四季没都分到舱室`)
  }
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
  need(Number.isInteger(d.cacti.pairs[0]) && Number.isInteger(d.cacti.pairs[1]) && d.cacti.pairs[0] >= 1 && d.cacti.pairs[0] <= d.cacti.pairs[1] && d.cacti.gapU > 0, `${at}.cacti 的对数为由少到多的正整数、间隔为正`)
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
  for (let k = 0; k < MAX_CHAR_LEVEL - 1; k++) {
    const tiers = [...c.weapons.map((w) => WEAPONS[w].upgrades[k]), ...c.innate.map((i) => i.upgrades[k])]
    const names = new Set(tiers.flatMap((t) => (t ? [t.card.name] : [])))
    need(names.size === 1, `characters.${id} 第 ${k + 1} 档升级卡须存在且各载体一致`)
  }
  for (const u of [...c.weapons.map((w) => WEAPONS[w].upgrades), ...c.innate.map((i) => i.upgrades)]) need(u.length < MAX_CHAR_LEVEL, `characters.${id} 的载体升级档不能多过等级上限：${u.length} 档`)
  need(LEVEL_STATS[id as keyof typeof LEVEL_STATS].length === MAX_CHAR_LEVEL - 1, `levels.${id} 须给 2 到 ${MAX_CHAR_LEVEL} 级每一级写属性`)
}

const units: [string, UnitBase][] = [...Object.values(ENEMIES).flatMap(withNested).map((e): [string, UnitBase] => [`enemies.${e.kind}`, e]), ...Object.entries<UnitBase>(CHARACTERS).map(([id, c]): [string, UnitBase] => [`characters.${id}`, c])]
for (const [at, u] of units) {
  for (const on of ['lowHp', 'idle', 'death'] as const) need((u.reactions ?? []).filter((r) => r.on === on).length <= 1, `${at} 的 ${on} 反应最多一条`)
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

/**
 * 视界：壳层包着空腔；黑洞连同吸积盘长到最大也整个落在空腔里，离队伍的出发点（球心）够远；最能走的身体只走进壳层一点就被拉住，瞬移出去也回得来，
 * 走得最深也落在方框安全区的内切圆里；
 * 爱因斯坦环落在一般角色走不出来的半径上；最慢的敌人也有刷怪的地方
 */
for (const [id, m] of Object.entries<MapDef>(MAPS)) {
  need((m.kind === 'nebula') === (m.nebula !== undefined), `maps.${id} 是视界当且仅当写了 nebula`)
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
  const slowest = Math.min(...[...m.foes.map((kind) => ENEMIES[kind]!.speed), ENEMIES[m.boss]!.speed])
  const clear = captureU(hole.maxGm, rsMax, enemyFall / slowest) + n.spawnClearU
  need(slowest > 0 && clear + 2 < near + shell.innerU - 1, `${at} 最慢的敌人走不出来的半径（${+clear.toFixed(2)} 格）太大，空腔里没有刷怪的地方`)
}

const PACK = new Set(readFileSync('scripts/emoji/ordering.txt', 'utf8').split(/\s+/))

/** 地图信号：同一个名字在哪种地图上说法都一样，关卡的说明按名字找说法 */
{
  const said = new Map<string, string>()
  for (const s of Object.values<MapSignals>(SIGNALS)) {
    for (const field of ['events', 'gauges', 'cues', 'marks'] as const) {
      for (const [name, label] of Object.entries(s[field] ?? {})) {
        const key = `${field}.${name}`
        const was = said.get(key)
        need(was === undefined || was === label, `signals 的 ${key} 在不同地图上说法不一样：${was} / ${label}`)
        said.set(key, label)
      }
    }
  }
}

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

/** 冒险按地图的顺序列章：每张图至多一章 */
const chapterMaps = Object.values<RunDef>(RUNS).flatMap((r) => (r.chapter === undefined ? [] : [r.chapter]))
need(new Set(chapterMaps).size === chapterMaps.length, `冒险里一张图只能有一章：${chapterMaps.join('、')}`)

for (const [id, e] of Object.entries<ExperimentDef>(EXPERIMENTS)) {
  need(PACK.has(e.emoji), `experiments.${id} 的 emoji 不在表情包里：${e.emoji}`)
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

/** 条件里每一处看的是谁 */
function condWhos(c: Cond): CondWho[] {
  return c.kind === 'all' || c.kind === 'any' ? c.of.flatMap(condWhos) : c.kind === 'not' ? condWhos(c.cond) : [c.who]
}

const itemEmojis = new Map<string, string>()
for (const [id, i] of Object.entries<ItemDef>(ITEMS)) {
  need(PACK.has(i.emoji), `items.${id} 的 emoji 不在表情包里：${i.emoji}`)
  const dup = itemEmojis.get(i.emoji)
  need(dup === undefined, `items.${id} 与 items.${dup} 用了同一个 emoji`)
  itemEmojis.set(i.emoji, id)
  need(i.maxStacks === undefined || i.maxStacks >= 1, `items.${id}.maxStacks 至少为 1`)
  for (const w of i.when ?? []) if ('if' in w) need(!condWhos(w.if).includes('target'), `items.${id}.when 的条件没有目标可看，只能看 self`)
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

/** 写进 JSON 的全部定义表 */
const TABLES = {
  abilities: ABILITIES,
  ai: AI,
  animations: ANIMATIONS,
  battlefield: BATTLEFIELD,
  characters: CHARACTERS,
  combat: COMBAT,
  difficulty: DIFFICULTY,
  economy: ECONOMY,
  editor: EDITOR_DRAFT,
  enemies: ENEMIES,
  experiments: EXPERIMENTS,
  feel: FEEL,
  items: ITEMS,
  levels: LEVEL_STATS,
  maps: MAPS,
  mutators: MUTATORS,
  obstacles: OBSTACLES,
  pickups: PICKUPS,
  progression: PROGRESSION,
  roles: ROLES,
  runs: RUNS,
  sfx: SFX,
  stamina: STAMINA,
  stats: STATS,
  statuses: STATUSES,
  team: TEAM_BASELINE,
  timestop: TIMESTOP,
  weapons: WEAPONS,
}

/** 状态：底色的轻重、强制行为的先后各不相同；种类编号放得进一个字节 */
{
  const list = Object.entries(STATUSES) as [string, StatusDef][]
  need(list.length < 255, `状态有 ${list.length} 种，超过了一个字节`)
  const ranks = list.flatMap(([, d]) => (d.tint ? [d.tint.rank] : []))
  need(new Set(ranks).size === ranks.length, `状态的底色轻重有重复：${ranks.join(',')}`)
  const order = list.flatMap(([, d]) => (d.forces ? [d.forces.priority] : []))
  need(new Set(order).size === order.length, `状态的强制行为先后有重复：${order.join(',')}`)
}

/** 键名里带 emoji 或 icon 的字段都是表情包里的码位，缺图的单位到运行时只会隐形 */
{
  const scan = (v: unknown, path: string, isEmoji: boolean): void => {
    if (typeof v === 'string') {
      if (isEmoji) need(PACK.has(v), `${path} 不在表情包里：${v}`)
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => scan(x, `${path}[${i}]`, isEmoji))
    } else if (v !== null && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) scan(x, `${path}.${k}`, /emoji|icon/i.test(k))
    }
  }
  for (const [name, data] of Object.entries(TABLES)) scan(data, name, false)
}

/** 动画配方：部件的下标对得上这张 emoji 的顶层元素，首尾姿态闭环 */
{
  const pack = parseEmojiPack(readFileSync('scripts/emoji/ordering.txt', 'utf8'), readFileSync('scripts/emoji/twemoji.txt', 'utf8'))
  const elementCount = (emoji: string): number | undefined => {
    const svg = packSvg(pack, emoji)
    return svg === null ? undefined : splitSvg(svg).els.length
  }
  for (const issue of animIssues(ANIMATIONS, elementCount)) need(false, issue)
}

/** 角色的能力：引用存在；主动技能手动出手、要拖着瞄准的才用摇杆瞄准；武器与天生能力自动出手 */
for (const [id, c] of Object.entries<CharacterAuthoring>(CHARACTERS)) {
  const skill = (ABILITIES as Record<string, AbilityDef | undefined>)[c.skill.ability]
  need(skill !== undefined, `characters.${id}.skill 引用了不存在的能力：${c.skill.ability}`)
  if (skill) {
    need(skill.trigger === 'manual', `characters.${id}.skill 的能力须手动出手：${c.skill.ability}`)
    need((c.skill.aim === true) === (skill.aim === 'stick'), `characters.${id}.skill 写了 aim，能力就须用摇杆瞄准，反之亦然：${c.skill.ability}`)
  }
  const carriers = [...c.weapons.map((w) => ({ at: `weapons.${w}`, base: WEAPONS[w].base, upgrades: WEAPONS[w].upgrades })), ...c.innate.map((i) => ({ at: `innate.${i.name}`, base: i.base, upgrades: i.upgrades }))]
  for (const cr of carriers) {
    for (const ref of [cr.base, ...cr.upgrades.map((t) => t.ability)]) {
      const a = (ABILITIES as Record<string, AbilityDef | undefined>)[ref]
      need(a !== undefined, `characters.${id} 的 ${cr.at} 引用了不存在的能力：${ref}`)
      need(a === undefined || a.trigger === 'auto', `characters.${id} 的 ${cr.at} 的能力须自动出手：${ref}`)
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

const OUT = 'src/assets'
mkdirSync(`${OUT}/emoji`, { recursive: true })
for (const [name, data] of Object.entries(TABLES)) writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 1) + '\n')

// ordering.txt 与 twemoji.txt 逐行对应，只拷贝不改写
for (const name of ['ordering.txt', 'twemoji.txt']) copyFileSync(`scripts/emoji/${name}`, `${OUT}/emoji/${name}`)
