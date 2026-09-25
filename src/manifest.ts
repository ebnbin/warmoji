import { CAPTAINS } from './data/captains'
import { CHARACTERS } from './data/characters'
import type { CaptainDef } from './types/captains'
import type { CharacterDef } from './types/characters'
import type { OutlineKind } from './emoji/svg'
import type { AbilityDef } from './types/abilityDefs'
import { BOSSES, ENEMY_DEFS, SPAWN } from './data/enemies'
import { PICKUPS } from './data/pickups'
import { FIELD_PICKUPS } from './data/battlefield'
import { ITEMS } from './data/items'
import { MAPS } from './data/maps'
import type { MapDef } from './types/maps'
import { SETTING_DEFS } from './save/settings'

const roster: readonly CharacterDef[] = Object.values(CHARACTERS)

const teamAbilities: readonly AbilityDef[] = [
  ...roster.flatMap((c) => c.carriers.flatMap((cr) => cr.tiers)),
  ...Object.values<CaptainDef>(CAPTAINS).flatMap((c) => c.skill.abilities),
]

function abilityBodyEmojis(w: AbilityDef): string[] {
  return [
    ...('held' in w && w.held ? [w.held.emoji] : []),
    ...(w.kind === 'turret' ? [w.turret.emoji] : []),
    ...(w.kind === 'summon' ? [w.minion.emoji] : []),
    ...(w.kind === 'strike' ? [w.drop.emoji] : []),
  ]
}

function abilityShotEmojis(w: AbilityDef): string[] {
  return w.kind === 'projectile' || w.kind === 'turret' ? [w.projectile.emoji] : []
}

export const OUTLINED_EMOJIS: Record<OutlineKind, readonly string[]> = {
  player: [
    ...roster.map((c) => c.emoji),
    ...Object.values<CaptainDef>(CAPTAINS).map((c) => c.emoji),
    ...teamAbilities.flatMap((w) => [...abilityBodyEmojis(w), ...abilityShotEmojis(w)]),
    ...Object.values(PICKUPS).map((p) => p.emoji),
    ...FIELD_PICKUPS.map((p) => p.emoji),
    '2795',
    '1f480',
    '1fad8',
    ...new Set(
      Object.values<MapDef>(MAPS).flatMap((m) => [...m.decor.emojis, ...(m.drift ?? [])]),
    ),
  ],
  enemy: [...new Set([...ENEMY_DEFS.map((e) => e.emoji), ...morphEmojis(), ...armedBodyEmojis()])],
  enemyProjectile: [...new Set([...armedShotEmojis(), ...deathShotEmojis()])],
  elite: [
    ...new Set([...ENEMY_DEFS.map((e) => e.emoji), ...BOSSES.map((e) => e.emoji), ...morphEmojis(), ...armedBodyEmojis()]),
  ],
}

export const PLAIN_EMOJIS: readonly string[] = ['1f4a5', SPAWN.markEmoji, '1fa90']

function armedBodyEmojis(): string[] {
  return [...ENEMY_DEFS, ...BOSSES].flatMap((e) => (e.abilities ?? []).flatMap(abilityBodyEmojis))
}

function armedShotEmojis(): string[] {
  return [...ENEMY_DEFS, ...BOSSES].flatMap((e) => (e.abilities ?? []).flatMap(abilityShotEmojis))
}

function deathShotEmojis(): string[] {
  return [...ENEMY_DEFS, ...BOSSES].flatMap((e) =>
    (e.onDeath ?? []).flatMap((fx) => (fx.kind === 'spawnProjectile' ? [fx.projectile.emoji] : [])),
  )
}

function morphEmojis(): string[] {
  return teamAbilities.flatMap((w) =>
    'onHit' in w && w.onHit ? w.onHit.flatMap((e) => (e.kind === 'morph' ? [e.morphEmoji] : [])) : [],
  )
}

export const PRELOAD_EMOJIS: readonly string[] = [
  ...Object.values(OUTLINED_EMOJIS).flat(),
  ...roster.flatMap((c) => c.carriers.map((cr) => cr.icon)),
  ...Object.values<{ emoji: string }>(ITEMS).map((i) => i.emoji),
  ...Object.values(MAPS).map((m) => m.emoji),
  '1f5fa',
  '1f579',
  ...SETTING_DEFS.map((d) => d.icon),
  '2b50',
  '2699',
  '1f4d6',
  '1f310',
  '2795',
  '2b06',
  '2694',
  '2753',
  '1f396',
  '1f3c6',
  '26a1',
  '1f45f',
  '2764',
  '2705',
  '23f8',
  '1f451',
  '1f9ea',
  '1f3ac',
  '1f9e9',
  '1f52c',
  '1f9d8',
  '23ee',
  '25b6',
  '23ed',
  '1f441',
  '1f648',
]
