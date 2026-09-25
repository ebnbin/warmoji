import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { ABILITIES } from '../defs/abilities.ts'
import { CHARACTERS } from '../defs/characters.ts'
import { WEAPONS } from '../defs/weapons.ts'
import { CAPTAINS } from '../defs/captains.ts'
import { ENEMIES } from '../defs/enemies.ts'
import { ITEMS } from '../defs/items.ts'
import { CARDS } from '../defs/cards.ts'
import { BATTLEFIELD } from '../defs/battlefield.ts'
import { SFX } from '../defs/sfx.ts'
import { TIMESTOP } from '../defs/timestop.ts'
import { MAP_DEFAULTS } from '../defs/mapdefaults.ts'
import { LEVEL_STATS } from '../defs/levels.ts'
import { MAPS } from '../defs/maps.ts'
import { PICKUPS } from '../defs/pickups.ts'
import { PROGRESSION } from '../defs/progression.ts'
import { DIFFICULTY } from '../defs/difficulty.ts'
import { AI } from '../defs/ai.ts'
import { TEAM_BASELINE } from '../defs/team.ts'
import { COMBAT } from '../defs/combat.ts'
import { FEEL } from '../defs/feel.ts'
import { ECONOMY } from '../defs/economy.ts'
import type { CharacterAuthoring } from '../src/types/characters'
import type { EnemyDef } from '../src/types/enemies'
import type { MapDef } from '../src/types/maps'
import type { WeaponSource } from '../src/types/weapons'

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

const weapons = WEAPONS as Record<string, WeaponSource>
for (const [id, c] of Object.entries<CharacterAuthoring>(CHARACTERS)) {
  for (const k of [0, 1]) {
    const tiers = [...c.weapons.map((w) => weapons[w]?.upgrades[k]), ...c.innate.map((i) => i.upgrades[k])]
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
  const lm = e.locomotion
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

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

mkdirSync('src/assets', { recursive: true })
const write = (name: string, data: unknown): void =>
  writeFileSync(`src/assets/${name}.json`, JSON.stringify(data, null, 1) + '\n')
write('abilities', ABILITIES)
write('weapons', WEAPONS)
write('characters', CHARACTERS)
write('levels', LEVEL_STATS)
write('captains', CAPTAINS)
write('enemies', { enemies: ENEMIES })
write('items', ITEMS)
write('cards', CARDS)
write('battlefield', BATTLEFIELD)
write('sfx', SFX)
write('timestop', TIMESTOP)
write('mapdefaults', MAP_DEFAULTS)
write('maps', MAPS)
write('pickups', PICKUPS)
write('progression', PROGRESSION)
write('difficulty', DIFFICULTY)
write('ai', AI)
write('team', TEAM_BASELINE)
write('combat', COMBAT)
write('feel', FEEL)
write('economy', ECONOMY)

// ordering.txt 与 twemoji.txt 逐行对应，只拷贝不改写
mkdirSync('src/assets/emoji', { recursive: true })
for (const name of ['ordering.txt', 'twemoji.txt']) {
  copyFileSync(`scripts/emoji/${name}`, `src/assets/emoji/${name}`)
}
