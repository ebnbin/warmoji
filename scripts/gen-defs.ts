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
import type { CharacterAuthoring } from '../src/types/characters'
import type { EnemyDef, EnemyKind } from '../src/types/enemies'
import type { ItemDef } from '../src/types/items'
import type { MapDef } from '../src/types/maps'
import type { FightDef, RunDef, SpawnAt, Squad, TeamDef } from '../src/types/runs'

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

/** 地面费力、场内费力和身体的费力倍率，出现在哪都不能为负 */
const noNegativeExertion = (v: unknown, path: string): void => {
  if (typeof v !== 'object' || v === null) return
  for (const [k, x] of Object.entries(v)) {
    if (k === 'exertion' || k === 'exertionMul') need(typeof x === 'number' && x >= 0, `${path}.${k} 不能为负`)
    else noNegativeExertion(x, `${path}.${k}`)
  }
}
noNegativeExertion({ maps: MAPS, enemies: ENEMIES, abilities: ABILITIES, weapons: WEAPONS, characters: CHARACTERS }, 'defs')

need(STAMINA.slowFrom > 0 && STAMINA.slowFrom <= 1, 'stamina.slowFrom 须在 (0, 1] 内')
need(STAMINA.floor > 0 && STAMINA.floor < 1, 'stamina.floor 须在 (0, 1) 内')
need(STAMINA.restDelayMs >= 0 && STAMINA.rampMs > 0 && STAMINA.regen > 0, 'stamina 的恢复参数须为正')

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

/** 一队敌人：数量、精英、间隔与血量倍率在范围内，指定的敌人存在，换走法须指定敌人 */
const checkSquad = (sq: Squad, path: string): void => {
  need(sq.count >= 1 && (sq.spreadMs ?? 0) >= 0, `${path} 的一队敌人须至少一只，间隔不为负`)
  need((sq.elites ?? 0) >= 0 && (sq.elites ?? 0) <= sq.count, `${path} 的精英数须在 0 到队伍人数之间`)
  need(inUnit(sq.eliteChance), `${path} 的精英几率须在 [0, 1] 内`)
  need((sq.hpMul ?? 1) > 0, `${path} 的血量倍率须为正`)
  need(sq.enemy === undefined || ENEMIES[sq.enemy] !== undefined, `${path} 引用了不存在的敌人：${sq.enemy}`)
  need(sq.drive === undefined || sq.enemy !== undefined, `${path} 换走法须指定敌人`)
  checkAt(sq.at, path)
}

const isBoss = (kind: EnemyKind | undefined): boolean => kind !== undefined && ENEMIES[kind]?.role === 'boss'

/** 一场战斗的规则：数值在范围内，结束规则都有着落——要打倒的头目、悬赏目标得登场，要清场就不能一直刷，一组一组来的后面几组要等场上清空 */
const checkFight = (f: FightDef, path: string): void => {
  const squads = f.spawns.flatMap((s) => (s.kind === 'batch' ? [s.squad] : s.kind === 'waves' ? s.squads : []))
  const endless = f.spawns.some((s) => s.kind === 'knobs' || (s.kind === 'stream' && s.untilMs === undefined))
  for (const m of f.mix ?? []) need(ENEMIES[m.kind] !== undefined && !isBoss(m.kind) && m.weight > 0, `${path} 的配比须引用非头目的敌人、权重为正：${m.kind}`)
  need(f.mix === undefined || f.mix.length > 0, `${path} 的配比不能为空`)
  for (const s of f.spawns) {
    if (s.kind === 'stream') {
      need((s.intervalMul ?? 1) > 0 && (s.intervalMs ?? 1) > 0, `${path} 的连续刷怪间隔须为正`)
      need(inUnit(s.eliteChance), `${path} 的精英几率须在 [0, 1] 内`)
      need((s.fromMs ?? 0) >= 0 && (s.untilMs ?? Infinity) > (s.fromMs ?? 0), `${path} 的连续刷怪时段须从不早于开打的时刻到更晚的时刻`)
      need((s.cap ?? 1) >= 1, `${path} 的连续刷怪上限至少为 1`)
      checkAt(s.at, path)
    } else if (s.kind === 'batch') {
      need(s.atMs >= 0, `${path} 的一队敌人登场时刻不为负`)
      checkSquad(s.squad, path)
    } else if (s.kind === 'waves') {
      need(s.atMs >= 0 && s.gapMs >= 0 && s.squads.length > 0, `${path} 的成组敌人须至少一组，时刻与间隔不为负`)
      need(s.squads.length === 1 || !endless, `${path} 一直在刷怪时场上不会清空，成组的敌人只能有一组`)
      s.squads.forEach((sq, i) => checkSquad(sq, `${path} 第 ${i + 1} 组`))
    } else if (s.kind === 'boss') {
      need(s.atMs >= 0, `${path} 的头目登场时刻不为负`)
    } else if (s.kind === 'carriers') {
      need(s.buff >= 0 && s.debuff >= 0 && s.atMs >= 0 && s.spanMs >= 0, `${path} 的带光圈敌人数与时刻不为负`)
    }
  }
  need(f.ends.filter((e) => e.kind === 'time').length <= 1, `${path} 最多一条时限`)
  need(f.ends.length === 0 || f.ends.some((e) => e.kind !== 'downs' && !(e.kind === 'time' && e.lose)), `${path} 有结束规则就得有获胜条件`)
  for (const e of f.ends) {
    if (e.kind === 'time') need(e.ms > 0, `${path} 的时限须为正`)
    if (e.kind === 'boss') {
      const boss = f.spawns.some((s) => s.kind === 'boss' || s.kind === 'knobs') || squads.some((sq) => isBoss(sq.enemy))
      need(boss, `${path} 要打倒头目，须有头目登场`)
    }
    if (e.kind === 'bounty') need(squads.some((sq) => sq.bounty), `${path} 要击倒悬赏目标，须有悬赏目标登场`)
    if (e.kind === 'cleared') need(!endless, `${path} 要清场，连续刷怪须有停下的时刻`)
    if (e.kind === 'hold') need(e.ms > 0 && e.radius > 0 && e.points.length > 0, `${path} 的据点须至少一处，时长与半径为正`)
    if (e.kind === 'kills' || e.kind === 'coins' || e.kind === 'downs') need(e.count >= 1, `${path} 的${e.kind}数至少为 1`)
  }
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

for (const [id, r] of Object.entries<RunDef>(RUNS)) {
  const first = r.steps.findIndex((s) => s.kind === 'fight')
  need(first >= 0, `runs.${id} 至少要有一场战斗`)
  need(r.team !== undefined || r.steps.slice(0, first).some((s) => s.kind === 'recruit'), `runs.${id} 没有预设队伍，第一场战斗之前须有招募`)
  need(PACK.has(r.emoji), `runs.${id} 的 emoji 不在表情包里：${r.emoji}`)
  need(r.map === undefined || MAPS[r.map] !== undefined, `runs.${id} 引用了不存在的地图：${r.map}`)
  need(r.start === undefined || (r.start.wave >= 1 && r.start.sec >= 0), `runs.${id} 的开局进度须从第 1 波、第 0 秒起`)
  if (r.team && r.team !== 'knobs') checkTeam(r.team, `runs.${id}.team`)
  r.steps.forEach((s, i) => {
    if (s.kind === 'recruit') need(s.upTo >= 1 && s.upTo <= TEAM_BASELINE.team.maxSize, `runs.${id}.steps[${i}] 招募人数须在 1 到满编之间`)
    if (s.kind === 'fight') checkFight(s.fight, `runs.${id}.steps[${i}]`)
  })
}

const itemEmojis = new Map<string, string>()
for (const [id, i] of Object.entries<ItemDef>(ITEMS)) {
  need(PACK.has(i.emoji), `items.${id} 的 emoji 不在表情包里：${i.emoji}`)
  const dup = itemEmojis.get(i.emoji)
  need(dup === undefined, `items.${id} 与 items.${dup} 用了同一个 emoji`)
  itemEmojis.set(i.emoji, id)
  need(i.maxStacks === undefined || i.maxStacks >= 1, `items.${id}.maxStacks 至少为 1`)
}

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
