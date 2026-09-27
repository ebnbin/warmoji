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
import type { CharacterAuthoring } from '../src/types/characters'
import type { EnemyDef } from '../src/types/enemies'
import type { ItemDef } from '../src/types/items'
import type { MapDef } from '../src/types/maps'
import type { FightDef, RunDef } from '../src/types/runs'

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

need(
  PROGRESSION.loopFrom >= 1 && PROGRESSION.loopFrom <= PROGRESSION.waveDurationsSec.length,
  'progression.loopFrom 须在 1 到总波数之间',
)

/** 一场战斗的规则：数值在范围内，头目倒下才结束的战斗得有头目登场 */
const checkFight = (f: FightDef, path: string): void => {
  for (const s of f.spawns) {
    if (s.kind === 'stream') {
      need((s.intervalMul ?? 1) > 0, `${path} 的连续刷怪间隔倍率须为正`)
      need((s.eliteChance ?? 0) >= 0 && (s.eliteChance ?? 0) <= 1, `${path} 的精英几率须在 [0, 1] 内`)
    } else if (s.kind === 'batch') {
      need(s.atMs >= 0 && s.squad.count >= 1 && (s.squad.spreadMs ?? 0) >= 0, `${path} 的一队敌人须至少一只，时刻与间隔不为负`)
      need((s.squad.elites ?? 0) >= 0 && (s.squad.elites ?? 0) <= s.squad.count, `${path} 的精英数须在 0 到队伍人数之间`)
    } else if (s.kind === 'carriers') {
      need(s.buff >= 0 && s.debuff >= 0 && s.atMs >= 0 && s.spanMs >= 0, `${path} 的带光圈敌人数与时刻不为负`)
    }
  }
  for (const e of f.ends) {
    if (e.kind === 'time') need(e.ms > 0, `${path} 的时限须为正`)
    if (e.kind === 'boss') need(f.spawns.some((s) => s.kind === 'boss' || s.kind === 'knobs'), `${path} 要打倒头目，须有头目登场`)
  }
}

for (const [id, r] of Object.entries<RunDef>(RUNS)) {
  const first = r.steps.findIndex((s) => s.kind === 'fight')
  need(first >= 0, `runs.${id} 至少要有一场战斗`)
  need(r.team !== undefined || r.steps.slice(0, first).some((s) => s.kind === 'recruit'), `runs.${id} 没有预设队伍，第一场战斗之前须有招募`)
  r.steps.forEach((s, i) => {
    if (s.kind === 'recruit') need(s.upTo >= 1 && s.upTo <= TEAM_BASELINE.team.maxSize, `runs.${id}.steps[${i}] 招募人数须在 1 到满编之间`)
    if (s.kind === 'fight') checkFight(s.fight, `runs.${id}.steps[${i}]`)
  })
}

const PACK = new Set(readFileSync('scripts/emoji/ordering.txt', 'utf8').split(/\s+/))
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
