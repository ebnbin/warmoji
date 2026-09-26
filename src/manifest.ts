import { CHARACTERS } from './data/characters'
import type { CharacterDef } from './types/characters'
import type { OutlineKind } from './emoji/svg'
import type { AbilityDef, Effect } from './types/abilityDefs'
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
  ...roster.map((c) => c.skill.ability),
]

/** 能力画在场上的身体：持械、装置、召唤物、坠物 */
function abilityBodyEmojis(w: AbilityDef): string[] {
  const s = w.shape
  return [
    ...(w.held ? [w.held.emoji] : []),
    ...(s.kind === 'emplace' ? [s.turret.emoji, ...abilityBodyEmojis(s.ability)] : []),
    ...(s.kind === 'summon' ? [s.minion.emoji] : []),
    ...(s.kind === 'drop' ? [s.emoji] : []),
  ]
}

/** 能力射出的弹体 */
function abilityShotEmojis(w: AbilityDef): string[] {
  const s = w.shape
  return s.kind === 'bolt' ? [s.projectile.emoji] : s.kind === 'emplace' ? abilityShotEmojis(s.ability) : []
}

function effectEmojis(effects: readonly Effect[] | undefined): { morph: string[]; shot: string[] } {
  const morph: string[] = []
  const shot: string[] = []
  for (const e of effects ?? []) {
    if (e.kind === 'morph') morph.push(e.morphEmoji)
    if (e.kind === 'spawnProjectile') shot.push(e.projectile.emoji)
  }
  return { morph, shot }
}

export const OUTLINED_EMOJIS: Record<OutlineKind, readonly string[]> = {
  player: [
    ...roster.map((c) => c.emoji),
    ...roster.map((c) => c.skill.icon),
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
  return [...ENEMY_DEFS, ...BOSSES].flatMap((e) => effectEmojis(e.onDeath?.filter((fx) => fx.kind !== 'split' && fx.kind !== 'decoy') as readonly Effect[] | undefined).shot)
}

function morphEmojis(): string[] {
  return teamAbilities.flatMap((w) => [...effectEmojis(w.onHit).morph, ...effectEmojis(w.onSelf).morph])
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
