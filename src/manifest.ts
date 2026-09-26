import { CHARACTERS } from './data/characters'
import type { CharacterDef } from './types/characters'
import type { OutlineKind } from './emoji/svg'
import type { AbilityDef, Effect } from './types/abilityDefs'
import type { BodyRules, NpcDef } from './types/enemies'
import { BOSSES, ENEMY_DEFS, SPAWN } from './data/enemies'
import { PICKUPS } from './data/pickups'
import { FIELD_PICKUPS } from './data/battlefield'
import { ITEMS } from './data/items'
import { MAPS } from './data/maps'
import type { MapDef } from './types/maps'
import { SETTING_DEFS } from './save/settings'

const roster: readonly CharacterDef[] = Object.values(CHARACTERS)

type Side = 'team' | 'enemy'

const OTHER: Record<Side, Side> = { team: 'enemy', enemy: 'team' }

/** 一个阵营在场上可能画出来的东西：身体、弹体；会夺取与会拉起亡者的阵营还要带上对面的能力与身体 */
interface Seen {
  readonly body: Set<string>
  readonly shot: Set<string>
  readonly abilities: Set<AbilityDef>
  readonly npcs: Set<NpcDef>
  steals: boolean
  raises: boolean
}

const seen: Record<Side, Seen> = {
  team: { body: new Set(), shot: new Set(), abilities: new Set(), npcs: new Set(), steals: false, raises: false },
  enemy: { body: new Set(), shot: new Set(), abilities: new Set(), npcs: new Set(), steals: false, raises: false },
}

function walkEffects(list: readonly Effect[] | undefined, side: Side): void {
  for (const fx of list ?? []) {
    switch (fx.kind) {
      case 'morph':
        seen[OTHER[side]].body.add(fx.morphEmoji)
        break
      case 'spawnProjectile':
        seen[side].shot.add(fx.projectile.emoji)
        walkEffects(fx.onHit, side)
        break
      case 'spawn':
        walkNpc(fx.def, side)
        break
      case 'steal':
        seen[side].steals = true
        break
      case 'raise':
        seen[side].raises = true
        break
      case 'if':
        walkEffects(fx.then, side)
        walkEffects(fx.else, side)
        break
      case 'stack':
      case 'fuse':
      case 'store':
      case 'deathMark':
      case 'empower':
      case 'caster':
      case 'area':
      case 'parry':
        walkEffects(fx.then, side)
        break
      case 'teleport':
        walkEffects(fx.then, side)
        break
      case 'form':
        walkEffects(fx.onEnd, side)
        break
      case 'clone':
        walkEffects(fx.onDeath, side)
        break
      case 'shove':
        walkEffects(fx.onWall, side)
        break
      case 'throw':
        walkEffects(fx.onLand, side)
        break
      case 'ground':
        walkEffects(fx.def.effects, side)
        walkEffects(fx.def.onExpire, side)
        walkEffects(fx.def.dwell?.effects, side)
        break
      case 'barrier':
        walkEffects(fx.onCross, side)
        break
      case 'tether':
        walkEffects(fx.onHold, side)
        walkEffects(fx.onBreak, side)
        break
      default:
        break
    }
  }
}

function walkAbility(a: AbilityDef, side: Side): void {
  const s = seen[side]
  if (s.abilities.has(a)) return
  s.abilities.add(a)
  const sh = a.shape
  if (a.held) s.body.add(a.held.emoji)
  if (a.anchor) s.body.add(a.anchor.emoji)
  if (sh.kind === 'bolt') s.shot.add(sh.projectile.emoji)
  if (sh.kind === 'emplace') {
    s.body.add(sh.turret.emoji)
    walkAbility(sh.ability, side)
  }
  if (sh.kind === 'summon') s.body.add(sh.minion.emoji)
  if (sh.kind === 'drop') s.body.add(sh.emoji)
  if (sh.kind === 'zone') {
    walkEffects(sh.pulse?.onHit, side)
    walkEffects(sh.onExpire, side)
    walkEffects(sh.dwell?.effects, side)
  }
  if (a.recast) walkAbility(a.recast.ability, side)
  for (const c of a.cycle ?? []) walkAbility(c, side)
  walkEffects(a.onHit, side)
  walkEffects(a.onSelf, side)
  walkEffects(a.onKill, side)
  walkEffects(a.boost?.onHit, side)
  walkEffects(a.ammo?.last, side)
}

function walkRules(r: BodyRules | undefined, side: Side): void {
  if (!r) return
  for (const list of [r.onHurt, r.onTouched, r.onTouch, r.onKill, r.onAnchorLost, r.onLethal, r.onLowHp?.effects, r.onIdle?.effects, r.resource?.full?.effects]) walkEffects(list, side)
}

function walkNpc(def: NpcDef, side: Side): void {
  const s = seen[side]
  if (s.npcs.has(def)) return
  s.npcs.add(def)
  s.body.add(def.emoji)
  for (const a of def.abilities ?? []) walkAbility(a, side)
  for (const f of def.forms ?? []) {
    if (f.emoji) s.body.add(f.emoji)
    for (const a of f.abilities ?? []) walkAbility(a, side)
  }
  if (def.mount?.emoji) s.body.add(def.mount.emoji)
  if (def.grow) walkNpc(def.grow.into, side)
  if (def.spawner) walkNpc(def.spawner.into, side)
  walkRules(def, side)
  for (const fx of def.onDeath ?? []) {
    if (fx.kind === 'split') walkNpc(fx.into, side)
    else if (fx.kind !== 'decoy') walkEffects([fx], side)
  }
}

for (const c of roster) {
  const s = seen.team
  s.body.add(c.emoji)
  s.body.add(c.skill.icon)
  for (const cr of c.carriers) for (const t of cr.tiers) walkAbility(t, 'team')
  walkAbility(c.skill.ability, 'team')
  for (const f of c.forms ?? []) {
    if (f.emoji) s.body.add(f.emoji)
    for (const a of f.abilities ?? []) walkAbility(a, 'team')
  }
  walkRules({ ...c.rules, resource: c.resource }, 'team')
}
for (const e of [...ENEMY_DEFS, ...BOSSES]) walkNpc(e, 'enemy')

// 夺来的能力与拉起来的亡者换了阵营：再按新阵营走一遍，走到不再增加为止
for (let changed = true; changed; ) {
  changed = false
  for (const side of ['team', 'enemy'] as const) {
    const s = seen[side]
    const o = seen[OTHER[side]]
    const before = s.abilities.size + s.npcs.size
    if (s.steals) for (const a of [...o.abilities]) walkAbility(a, side)
    if (s.raises) for (const n of [...o.npcs]) walkNpc(n, side)
    if (s.abilities.size + s.npcs.size !== before) changed = true
  }
}

export const OUTLINED_EMOJIS: Record<OutlineKind, readonly string[]> = {
  player: [
    ...new Set([
      ...seen.team.body,
      ...seen.team.shot,
      ...Object.values(PICKUPS).map((p) => p.emoji),
      ...FIELD_PICKUPS.map((p) => p.emoji),
      '2795',
      '1f480',
      '1fad8',
      ...Object.values<MapDef>(MAPS).flatMap((m) => [...m.decor.emojis, ...(m.drift ?? [])]),
    ]),
  ],
  enemy: [...seen.enemy.body],
  enemyProjectile: [...seen.enemy.shot],
  elite: [...seen.enemy.body],
}

export const PLAIN_EMOJIS: readonly string[] = ['1f4a5', SPAWN.markEmoji, '1fa90']

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
