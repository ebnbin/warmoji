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

mkdirSync('src/assets/emoji', { recursive: true })
for (const name of ['ordering.txt', 'twemoji.txt']) {
  copyFileSync(`scripts/emoji/${name}`, `src/assets/emoji/${name}`)
}
