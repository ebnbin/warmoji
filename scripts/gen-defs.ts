import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ABILITIES } from '../defs/abilities.ts'
import { AI } from '../defs/ai.ts'
import { ANIMATIONS } from '../defs/animations.ts'
import { BATTLEFIELD } from '../defs/battlefield.ts'
import { CHARACTERS } from '../defs/characters.ts'
import { COMBAT } from '../defs/combat.ts'
import { DIFFICULTY } from '../defs/difficulty.ts'
import { ECONOMY } from '../defs/economy.ts'
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
import { cycleOf, roundsOf, roundSteps } from '../src/data/rounds.ts'
import type { CharacterAuthoring } from '../src/types/characters'
import type { EnemyDef, EnemyKind } from '../src/types/enemies'
import type { ItemDef } from '../src/types/items'
import type { MapDef } from '../src/types/maps'
import type { ItemRarity } from '../src/types/items'
import type { MapId } from '../src/types/maps'
import type { FightDef, FightRules, GroupTraits, LegacyPhaseDef, LegacySquad, LevelPick, MixEntry, MutatorDef, RepeatDef, Rounds, RunDef, SpawnAt, StarRule, StepDef, TeamDef } from '../src/types/runs'
import type { DifficultyCurve } from '../src/types/waves'

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

const withNested = (e: EnemyDef): EnemyDef[] => [
  e,
  ...(e.spawner ? withNested(e.spawner.into) : []),
  ...(e.onDeath ?? []).flatMap((fx) => (fx.kind === 'split' ? withNested(fx.into) : [])),
]
for (const e of Object.values(ENEMIES).flatMap(withNested)) {
  const lm = e.drive
  if (lm.kind !== 'standoff') continue
  for (const a of e.abilities ?? []) {
    const range = 'range' in a ? a.range : undefined
    need(range === undefined || range > lm.standoffDist, `enemies.${e.kind} 的能力射程须大于 standoffDist`)
  }
}

const PACK = new Set(readFileSync('scripts/emoji/ordering.txt', 'utf8').split(/\s+/))

const inUnit = (x: number | undefined): boolean => x === undefined || (x >= 0 && x <= 1)

/** 站位的距离与散开范围 */
const checkAt = (at: SpawnAt | undefined, path: string): void => {
  if (at?.kind === 'ring' || at?.kind === 'behind') need(at.dist > 0, `${path} 的站位距离须为正`)
  if (at?.kind === 'point') need((at.spread ?? 0) >= 0, `${path} 的散开范围不为负`)
}

const isBoss = (kind: EnemyKind | undefined): boolean => kind !== undefined && ENEMIES[kind]?.role === 'boss'

/** 配比：不为空，引用非头目的敌人，权重为正 */
const checkMix = (mix: readonly MixEntry[], path: string): void => {
  need(mix.length > 0, `${path} 的配比不能为空`)
  for (const m of mix) need(ENEMIES[m.kind] !== undefined && !isBoss(m.kind) && m.weight > 0, `${path} 的配比须引用非头目的敌人、权重为正：${m.kind}`)
}

/** 查一批敌人时的上下文：在哪张图上打（一场、一局都没写是 undefined），这一场是不是按阶段写的，这一阶段的配比 */
type Where = { readonly map: MapId | undefined; readonly staged: boolean; readonly mix: readonly MixEntry[] | undefined }

/** 一批敌人的特征：指定的敌人存在，指定了就不再写配比；按阶段写的一场里没指定敌人的得有配比可抽；换走法须指定敌人；几率与倍率在范围内；要带的效果这张图的效果池里有 */
const checkTraits = (t: GroupTraits, where: Where, path: string): void => {
  need(t.enemy === undefined || ENEMIES[t.enemy] !== undefined, `${path} 引用了不存在的敌人：${t.enemy}`)
  need(t.enemy === undefined || t.mix === undefined, `${path} 指定了敌人就不用再写配比`)
  if (t.mix) checkMix(t.mix, path)
  need(!where.staged || t.enemy !== undefined || (t.mix ?? where.mix) !== undefined, `${path} 没指定敌人，这一批和这一阶段都没写配比`)
  need(t.drive === undefined || t.enemy !== undefined, `${path} 换走法须指定敌人`)
  need(inUnit(t.eliteChance), `${path} 的精英几率须在 [0, 1] 内`)
  need((t.stats?.mul?.maxHp ?? 1) > 0, `${path} 的血量倍率须为正`)
  need((t.loot?.xp ?? 0) >= 0 && (t.loot?.coins ?? 0) >= 0, `${path} 的战利品倍率不为负`)
  const pool = where.map === undefined ? undefined : BATTLEFIELD.pools[where.map]
  need(t.carry === undefined || pool === undefined || pool.some((d) => d.polarity === t.carry), `${path} 要带的效果在 ${where.map} 的效果池里没有`)
}

/** 一队敌人：数量、精英、间隔与血量倍率在范围内，特征合规，护卫引用非头目的敌人 */
const checkSquad = (sq: LegacySquad, where: Where, path: string): void => {
  need(sq.count >= 1 && (sq.spreadMs ?? 0) >= 0, `${path} 的一队敌人须至少一只，间隔不为负`)
  need((sq.elites ?? 0) >= 0 && (sq.elites ?? 0) <= sq.count, `${path} 的精英数须在 0 到队伍人数之间`)
  need((sq.hpMul ?? 1) > 0, `${path} 的血量倍率须为正`)
  checkTraits(sq, where, path)
  const e = sq.escort
  need(e === undefined || (ENEMIES[e.enemy] !== undefined && !isBoss(e.enemy) && e.count >= 1 && (e.stats?.mul?.maxHp ?? 1) > 0), `${path} 的护卫须引用非头目的敌人、至少一只，血量倍率为正`)
  checkAt(sq.at, path)
}

/** 这一阶段可能出现的敌人种类，连同巢穴生出的与死后分裂出的；有按地图抽的就说不准，是 null */
const phaseKinds = (p: LegacyPhaseDef): Set<string> | null => {
  const out = new Set<string>()
  let open = false
  const kind = (k: EnemyKind): void => {
    const e = ENEMIES[k]
    if (e) for (const x of withNested(e)) out.add(x.kind)
  }
  const pool = (own: readonly MixEntry[] | undefined): void => {
    const rows = own ?? p.mix
    if (rows) for (const m of rows) kind(m.kind)
    else open = true
  }
  const group = (g: GroupTraits): void => (g.enemy ? kind(g.enemy) : pool(g.mix))
  for (const s of p.spawns) {
    if (s.kind === 'stream') group(s)
    else if (s.kind === 'batch' || s.kind === 'waves') {
      for (const sq of s.kind === 'batch' ? [s.squad] : s.squads) {
        group(sq)
        if (sq.escort) kind(sq.escort.enemy)
      }
    } else open = true
  }
  return open ? null : out
}

/** 队长贴着倒下的队员站时两人中心的距离：身体互相挤开，靠不得更近 */
const TOUCH = TEAM_BASELINE.member.radius * (TEAM_BASELINE.team.leaderSizeMul + TEAM_BASELINE.team.followerSizeMul)

/** 队员跟在队长身后时离队长中心最远的身体边缘：视野至少得罩住它 */
const SQUAD_REACH = FEEL.squad.fanDistance + TEAM_BASELINE.member.radius * TEAM_BASELINE.team.followerSizeMul

/** 我方规则：救援时长为正，救援范围大于队长贴着倒下队员的距离、小于队员跟在队长身后的距离（站着不动不会扶起来）；换队长的冷却为正；视野看得见跟在身后的队员 */
const checkRules = (r: FightRules | undefined, path: string): void => {
  need(r?.rescue === undefined || r.rescue.ms > 0, `${path} 的救援时长须为正`)
  need(r?.rescue === undefined || (r.rescue.radius > TOUCH && r.rescue.radius < FEEL.squad.fanDistance), `${path} 的救援范围须在 ${TOUCH} 到 ${FEEL.squad.fanDistance} 格之间`)
  need((r?.leader?.switchCdMs ?? 1) > 0, `${path} 的换队长冷却须为正`)
  need((r?.vision ?? Infinity) > SQUAD_REACH, `${path} 的视野须大于 ${SQUAD_REACH} 格，看得见跟在身后的队员`)
}

const RARITY_RANK: Record<ItemRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 }

/** 星级条件：次数不为负，用时为正，击杀至少一只；剩下几次起来的机会须在命数以内 */
const checkStar = (s: StarRule, lives: number | undefined, path: string): void => {
  if (s.kind === 'time') need(s.ms > 0, `${path} 的用时须为正`)
  else if (s.kind === 'kills') need(s.count >= 1, `${path} 的击杀数至少为 1`)
  else if (s.kind === 'lives') need(lives !== undefined && s.count >= 1 && s.count <= lives, `${path} 要剩下起来的机会，须有命数且不超过它`)
  else need(s.count >= 0, `${path} 的次数不为负`)
}

/**
 * 一个阶段：数值在范围内，结束规则都有着落——要打倒的头目得在这一阶段或这一场更早的阶段登场，悬赏目标与要数的那种敌人得在这一阶段出现，要清场就不能一直刷，一组一组来的后面几组要等场上清空，要全部达成的不能有到点就算达成的时限；只有最后一个阶段可以不结束。
 * 返回这一阶段有没有头目登场。
 */
const checkPhase = (p: LegacyPhaseDef, last: boolean, bossBefore: boolean, where: Where, path: string): boolean => {
  const at: Where = { ...where, mix: p.mix }
  const squads = p.spawns.flatMap((s) => (s.kind === 'batch' ? [s.squad] : s.kind === 'waves' ? s.squads : []))
  const endless = p.spawns.some(
    (s) => s.kind === 'knobs' || (s.kind === 'stream' && s.untilMs === undefined && s.total === undefined) || (s.kind === 'batch' && s.every !== undefined && s.times === undefined),
  )
  const boss = p.spawns.some((s) => s.kind === 'boss' || s.kind === 'knobs') || squads.some((sq) => isBoss(sq.enemy))
  if (p.mix) checkMix(p.mix, path)
  for (const s of p.spawns) {
    if (s.kind === 'stream') {
      need((s.intervalMul ?? 1) > 0 && (s.intervalMs ?? 1) > 0, `${path} 的连续刷怪间隔须为正`)
      need(s.intervalMs === undefined || s.intervalMul === undefined, `${path} 写了刷怪间隔就不用再写倍率`)
      need(s.ramp === undefined || (s.intervalMs !== undefined && s.ramp.toMs > 0 && s.ramp.overMs > 0), `${path} 的间隔变化须有起始间隔，目标间隔与时长为正`)
      need((s.fromMs ?? 0) >= 0 && (s.untilMs ?? Infinity) > (s.fromMs ?? 0), `${path} 的连续刷怪时段须从不早于这一阶段开始的时刻到更晚的时刻`)
      need(s.total === undefined || (Number.isInteger(s.total) && s.total >= 1), `${path} 的连续刷怪总数须是正整数`)
      need((s.cap ?? 1) >= 1, `${path} 的连续刷怪上限至少为 1`)
      need(!isBoss(s.enemy), `${path} 连续刷怪不能刷头目，头目按一队放出`)
      checkTraits(s, at, path)
      checkAt(s.at, path)
    } else if (s.kind === 'batch') {
      need(s.atMs >= 0, `${path} 的一队敌人登场时刻不为负`)
      need(s.every === undefined || s.every > 0, `${path} 一再放出的间隔须为正`)
      need(s.times === undefined || (Number.isInteger(s.times) && s.times >= 1 && (s.times === 1 || s.every !== undefined)), `${path} 放出的次数须是正整数，多于一次要写间隔`)
      checkSquad(s.squad, at, path)
    } else if (s.kind === 'waves') {
      need(s.atMs >= 0 && s.gapMs >= 0 && s.squads.length > 0, `${path} 的成组敌人须至少一组，时刻与间隔不为负`)
      need(s.squads.length === 1 || !endless, `${path} 一直在刷怪时场上不会清空，成组的敌人只能有一组`)
      s.squads.forEach((sq, i) => checkSquad(sq, at, `${path} 第 ${i + 1} 组`))
    } else if (s.kind === 'boss') {
      need(s.atMs >= 0, `${path} 的头目登场时刻不为负`)
    } else if (s.kind === 'carriers') {
      need(s.buff >= 0 && s.debuff >= 0 && s.atMs >= 0 && s.spanMs >= 0, `${path} 的带光圈敌人数与时刻不为负`)
    }
  }
  need(p.ends.filter((e) => e.kind === 'time').length <= 1, `${path} 最多一条时限`)
  need(p.ends.length > 0 || last, `${path} 不是最后一个阶段，须有结束规则`)
  need(p.ends.length === 0 || p.ends.some((e) => e.kind !== 'downs' && !(e.kind === 'time' && e.lose)), `${path} 有结束规则就得有达成条件`)
  need(p.need !== 'all' || !p.ends.some((e) => e.kind === 'time' && !e.lose), `${path} 要全部达成时，时限只能是到点就输的`)
  const kinds = phaseKinds(p)
  for (const e of p.ends) {
    if (e.kind === 'time') need(e.ms > 0, `${path} 的时限须为正`)
    if (e.kind === 'boss' || e.kind === 'bossHp') need(boss || bossBefore, `${path} 要打头目，须有头目在这一阶段或这一场更早的阶段登场`)
    if (e.kind === 'bossHp') need(e.below > 0 && e.below < 1, `${path} 头目血量的比例须在 (0, 1) 内`)
    if (e.kind === 'bounty') need(squads.some((sq) => sq.bounty), `${path} 要击倒悬赏目标，须有悬赏目标登场`)
    if (e.kind === 'cleared') need(!endless, `${path} 要清场，刷怪须有停下的时刻`)
    if (e.kind === 'hold') need(e.ms > 0 && e.radius > 0 && e.points.length > 0, `${path} 的据点须至少一处，时长与半径为正`)
    if (e.kind === 'kills' || e.kind === 'coins' || e.kind === 'downs') need(e.count >= 1, `${path} 的${e.kind}数至少为 1`)
    if (e.kind === 'kills' && e.enemy !== undefined) need(ENEMIES[e.enemy] !== undefined && (kinds === null || kinds.has(e.enemy)), `${path} 要击杀的${e.enemy}不在这一阶段出现`)
  }
  return boss
}

/** 一场战斗：各阶段按先后查，外加这一场的规则、地图、奖励与难度时钟 */
const checkFight = (f: FightDef, runMap: MapId | undefined, path: string): void => {
  const phases: readonly LegacyPhaseDef[] = f.phases === undefined ? [f] : f.phases
  const where: Where = { map: f.map ?? runMap, staged: f.phases !== undefined, mix: undefined }
  need(phases.length > 0, `${path} 至少要有一个阶段`)
  let boss = false
  phases.forEach((p, i) => {
    boss = checkPhase(p, i === phases.length - 1, boss, where, phases.length > 1 ? `${path} 第 ${i + 1} 阶段` : path) || boss
  })
  checkRules(f.rules, `${path}.rules`)
  need(f.map === undefined || MAPS[f.map] !== undefined, `${path} 引用了不存在的地图：${f.map}`)
  need((f.reward?.coins ?? 0) >= 0 && Number.isInteger(f.reward?.coins ?? 0), `${path} 的奖励金币须是非负整数`)
  need(f.clockSec === undefined || (Number.isFinite(f.clockSec) && f.clockSec >= 0), `${path} 的难度时钟不为负`)
}

/** 预设队伍：人数在满编以内，指定的不重复，随机的位置按最坏情况也挑得出人 */
const checkTeam = (t: TeamDef, path: string): void => {
  need(t.slots.length >= 1 && t.slots.length <= TEAM_BASELINE.team.maxSize, `${path} 的人数须在 1 到满编之间`)
  const fixed = t.slots.filter((s) => typeof s === 'string')
  const taken = new Set<string>(fixed)
  need(taken.size === fixed.length, `${path} 的指定角色不能重复`)
  need((t.level ?? 1) >= 1 && (t.level ?? 1) <= MAX_CHAR_LEVEL, `${path} 的等级下限须在 1 到 ${MAX_CHAR_LEVEL} 之间`)
  const picks = t.slots.length - fixed.length
  for (const s of t.slots) {
    if (typeof s === 'string') {
      need(CHARACTERS[s] !== undefined, `${path} 引用了不存在的角色：${s}`)
      continue
    }
    const pool = Object.entries<CharacterAuthoring>(CHARACTERS).filter(([id, c]) => !taken.has(id) && s.tags.every((tag) => c.tags.includes(tag)))
    need(pool.length >= picks, `${path} 的随机位置 ${s.tags.join('+')} 可挑的角色不够`)
  }
}

/** 难度曲线：刷怪间隔从起点收紧到为正的终点、收紧时长为正，敌人血量不随时间变少，人数系数为正，掉金币的几率下限在 [0, 1] 内、衰减时长为正 */
const checkCurve = (c: DifficultyCurve, path: string): void => {
  need(c.minIntervalMs > 0 && c.startIntervalMs >= c.minIntervalMs && c.rampSeconds > 0, `${path} 的刷怪间隔须从起点收紧到为正的终点，收紧时长为正`)
  need(c.hpGrowthPerMin >= 0, `${path} 的血量增长不为负`)
  need(c.teamFactorBase > 0 && c.teamFactorPerMember >= 0, `${path} 的人数系数须为正`)
  need(c.coinDropChanceMin >= 0 && c.coinDropChanceMin <= 1 && c.coinDropChanceHalfLifeSec > 0, `${path} 的掉金币几率下限须在 [0, 1] 内，衰减时长为正`)
}
checkCurve(DIFFICULTY.curve, 'difficulty.curve')

/** 轮次条件的每一项都是正整数，起点不晚于终点 */
const roundsOk = (g: Rounds): boolean => [g.from, g.to, g.every].every((n) => n === undefined || (Number.isInteger(n) && n >= 1)) && (g.from ?? 1) <= (g.to ?? Infinity)

/** 一段重复要查的轮数：有限的查全部轮次，一直重复的查到每一种轮次组合都出现过；轮数或轮次写错了就不展开 */
const roundsToCheck = (s: RepeatDef): number => {
  if (!roundsOf(s).every(roundsOk)) return 0
  if (s.times === undefined) return cycleOf(s)
  return Number.isInteger(s.times) && s.times >= 1 ? s.times : 0
}

/** 按轮重复：轮数是正整数，一直重复的只能是最后一步；轮次条件是正整数、起点不晚于终点、落在轮数以内；每一轮都得有一场战斗 */
const checkRepeat = (s: RepeatDef, last: boolean, path: string): void => {
  need(s.times === undefined || (Number.isInteger(s.times) && s.times >= 1), `${path} 的轮数须是正整数`)
  need(s.times !== undefined || last, `${path} 一直重复，只能是最后一步`)
  for (const g of roundsOf(s)) {
    need(roundsOk(g), `${path} 的轮次须是正整数，起点不晚于终点`)
    need(s.times === undefined || Math.max(g.from ?? 1, g.to ?? 1) <= s.times, `${path} 的轮次超出了 ${s.times} 轮`)
  }
  for (let k = 1; k <= roundsToCheck(s); k++) need(roundSteps(s, k).some((b) => b.kind === 'fight'), `${path} 第 ${k} 轮没有战斗`)
}

/** 一局要走的每一步和它在定义里的位置：重复的按轮展开；inRepeat 说它在不在重复里 */
const planned = (r: RunDef, id: string): { step: StepDef; path: string; inRepeat: boolean }[] =>
  r.steps.flatMap((s, i) => {
    const path = `runs.${id}.steps[${i}]`
    if (s.kind !== 'repeat') return [{ step: s, path, inRepeat: false }]
    return Array.from({ length: roundsToCheck(s) }, (_, k) => roundSteps(s, k + 1).map((step) => ({ step, path: `${path} 第 ${k + 1} 轮`, inRepeat: true }))).flat()
  })

for (const [id, r] of Object.entries<RunDef>(RUNS)) {
  const plan = planned(r, id)
  const steps = plan.map((p) => p.step)
  const fights = steps.flatMap((s) => (s.kind === 'fight' ? [s.fight] : []))
  const first = steps.findIndex((s) => s.kind === 'fight')
  need(first >= 0, `runs.${id} 至少要有一场战斗`)
  need(r.team !== undefined || steps.slice(0, first).some((s) => s.kind === 'recruit'), `runs.${id} 没有预设队伍，第一场战斗之前须有招募`)
  need(PACK.has(r.emoji), `runs.${id} 的 emoji 不在表情包里：${r.emoji}`)
  need(r.map === undefined || MAPS[r.map] !== undefined, `runs.${id} 引用了不存在的地图：${r.map}`)
  need(r.map === undefined || fights.every((f) => f.map === undefined), `runs.${id} 固定了地图，各场就不能再换地图`)
  const clocked = fights.map((f) => f.clockSec !== undefined)
  need(clocked.every((c) => c === clocked[0]), `runs.${id} 的难度时钟要么每场都定，要么都不定`)
  need(r.start === undefined || (r.start.wave >= 1 && r.start.sec >= 0), `runs.${id} 的开局进度须从第 1 波、第 0 秒起`)
  if (r.curve) checkCurve(r.curve, `runs.${id}.curve`)
  if (r.team && r.team !== 'knobs') checkTeam(r.team, `runs.${id}.team`)
  checkRules(r.rules, `runs.${id}.rules`)
  const lives = r.rules?.lives
  need(lives === undefined || (Number.isInteger(lives) && lives >= 1), `runs.${id}.rules.lives 须是正整数`)
  const rarity = r.rules?.shop?.rarity
  need(rarity === undefined || RARITY_RANK[rarity.min ?? 'common'] <= RARITY_RANK[rarity.max ?? 'legendary'], `runs.${id}.rules.shop 的稀有度下限不能高于上限`)
  const maxLevel = r.rules?.maxLevel
  const floor = r.team && r.team !== 'knobs' ? (r.team.level ?? 1) : 1
  need(maxLevel === undefined || (Number.isInteger(maxLevel) && maxLevel >= floor && maxLevel < MAX_CHAR_LEVEL), `runs.${id}.rules.maxLevel 须是整数，不低于队伍的等级下限、低于 ${MAX_CHAR_LEVEL}`)
  const t = r.teamLevel
  if (t) {
    need(t.base > 0 && t.growth >= 1, `runs.${id}.teamLevel 的底数须为正，增长不小于 1：越往后升级越难`)
    need(Number.isInteger(t.maxLevel) && t.maxLevel >= 2, `runs.${id}.teamLevel.maxLevel 须是不小于 2 的整数`)
    const picks: readonly LevelPick[] = t.picks ?? ['recruit', 'upgrade']
    need(picks.length > 0 && new Set(picks).size === picks.length, `runs.${id}.teamLevel.picks 不能为空，也不能重复`)
    // 每一次全队升级都得有得选：许招人时补满队伍的人数，加上许升级时每人还能升的级数，够用完升到满级的次数
    const size = TEAM_BASELINE.team.maxSize
    const free = Math.max(r.team && r.team !== 'knobs' ? r.team.slots.length : 0, ...steps.map((s) => (s.kind === 'recruit' ? s.upTo : 0)))
    const recruit = picks.includes('recruit')
    const room = (recruit ? size - free : 0) + (picks.includes('upgrade') ? (recruit ? size : free) * ((maxLevel ?? MAX_CHAR_LEVEL) - floor) : 0)
    need(room >= t.maxLevel - 1, `runs.${id} 靠全队升级，能选的只用得掉 ${room} 次，不够升到 ${t.maxLevel} 级的 ${t.maxLevel - 1} 次`)
  }
  if (fights.some((f) => f.phases !== undefined)) {
    need(fights.every((f) => f.phases !== undefined), `runs.${id} 的各场要么都按阶段写，要么都不按`)
    need(r.map === undefined && r.start === undefined && r.record === undefined, `runs.${id} 按阶段写的一局不固定地图、不给开局进度、不记最高分：地图与难度时钟写在每一场上`)
    need(plan.every((p) => p.inRepeat || p.step.kind !== 'shop' || p.step.tier !== undefined), `runs.${id} 按阶段写的一局，重复之外的每家商店都要写物价档位`)
  }
  need(r.stars === undefined || r.steps.every((s) => s.kind !== 'repeat' || s.times !== undefined), `runs.${id} 一直重复的一局赢不了，不能有星级`)
  r.stars?.forEach((s, i) => checkStar(s, lives, `runs.${id}.stars[${i}]`))
  const only = r.rules?.recruit?.tags
  if (only) {
    // 预设里随机的位置与招募都从这些角色里挑，按最坏情况也得够
    const upTo = Math.max(0, ...steps.map((s) => (s.kind === 'recruit' ? s.upTo : 0)))
    const fixed = new Set<string>(r.team && r.team !== 'knobs' ? r.team.slots.filter((s) => typeof s === 'string') : [])
    const pool = Object.entries<CharacterAuthoring>(CHARACTERS).filter(([cid, c]) => !fixed.has(cid) && only.every((t) => c.tags.includes(t)))
    need(only.length > 0 && upTo > 0, `runs.${id} 限定了招募就得有招募步骤与标签`)
    need(pool.length >= upTo - fixed.size, `runs.${id} 限定的招募标签可挑的角色不够`)
  }
  r.steps.forEach((s, i) => {
    if (s.kind === 'repeat') checkRepeat(s, i === r.steps.length - 1, `runs.${id}.steps[${i}]`)
  })
  plan.forEach(({ step: s, path }) => {
    if (s.kind === 'recruit') need(s.upTo >= 1 && s.upTo <= TEAM_BASELINE.team.maxSize, `${path} 招募人数须在 1 到满编之间`)
    if (s.kind === 'shop') need(s.tier === undefined || (Number.isInteger(s.tier) && s.tier >= 1), `${path} 商店的物价档位须是正整数`)
    if (s.kind === 'fight') checkFight(s.fight, r.map, path)
  })
}

const mutatorEmojis = new Map<string, string>()
for (const [id, m] of Object.entries<MutatorDef>(MUTATORS)) {
  need(PACK.has(m.emoji), `mutators.${id} 的 emoji 不在表情包里：${m.emoji}`)
  const dup = mutatorEmojis.get(m.emoji)
  need(dup === undefined, `mutators.${id} 与 mutators.${dup} 用了同一个 emoji`)
  mutatorEmojis.set(m.emoji, id)
  need(Number.isInteger(m.heat) && m.heat >= 1, `mutators.${id}.heat 须是正整数`)
  need(m.rules !== undefined || m.enemyMods !== undefined, `mutators.${id} 至少要改一样东西`)
  checkRules(m.rules, `mutators.${id}.rules`)
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
