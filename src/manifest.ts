import { CHARACTERS, ROSTER_IDS, TEAM } from './data/characters'
import type { CharacterDef, CharacterId } from './types/characters'
import type { AbilityDef, Effect } from './types/abilityDefs'
import type { BodyRules, EnemyDef, EnemyKind, NpcDef } from './types/enemies'
import { ENEMIES, SPAWN } from './data/enemies'
import { PICKUPS } from './data/pickups'
import { FIELD_PICKUPS } from './data/battlefield'
import { abilityEffects, childAbilities, childEffects } from './data/abilities'
import { MAPS, mapEnemyRoster } from './data/maps'
import type { FightDef } from './types/runs'
import { plannedFights } from './run/flow'
import type { RunState } from './run/state'
import { SETTING_DEFS } from './save/settings'
import { TAGS } from './data/tags'
import { rulesOf, withAffixes } from './data/reactions'
import { AFFIXES } from './data/affixes'
import { STATUSES } from './data/statuses'

/** 场上可能画出来的 emoji，与走过的能力和身体：夺来的能力与拉起的亡者不换图，走一遍就收全了 */
interface Seen {
  readonly ids: Set<string>
  readonly abilities: Set<AbilityDef>
  readonly npcs: Set<NpcDef>
}

function walkEffects(seen: Seen, list: readonly Effect[] | undefined): void {
  for (const fx of list ?? []) {
    switch (fx.kind) {
      case 'morph':
        seen.ids.add(fx.morphEmoji)
        break
      case 'spawnProjectile':
        seen.ids.add(fx.projectile.look.emoji)
        break
      case 'summon':
        if (fx.of !== 'victim' && 'unit' in fx.of) walkNpc(seen, fx.of.unit)
        break
      default:
        break
    }
    for (const sub of childEffects(fx)) walkEffects(seen, sub)
  }
}

function walkAbility(seen: Seen, a: AbilityDef): void {
  if (seen.abilities.has(a)) return
  seen.abilities.add(a)
  const sh = a.shape
  if (a.held) seen.ids.add(a.held.look.emoji)
  if (a.anchor) seen.ids.add(a.anchor.look.emoji)
  if (sh.kind === 'bolt') seen.ids.add(sh.projectile.look.emoji)
  if (sh.kind === 'emplace') seen.ids.add(sh.look.emoji)
  if (sh.kind === 'summon') seen.ids.add(sh.minion.look.emoji)
  if (sh.kind === 'drop') seen.ids.add(sh.look.emoji)
  for (const c of childAbilities(a)) walkAbility(seen, c)
  for (const list of abilityEffects(a)) walkEffects(seen, list)
}

function walkRules(seen: Seen, r: BodyRules | undefined): void {
  if (!r) return
  for (const list of [r.onHurt, r.onTouched, r.onTouch, r.onKill, r.onAnchorLost, r.onLethal, ...(r.onLowHp ?? []).map((l) => l.effects), r.onIdle?.effects, r.resource?.full?.effects]) walkEffects(seen, list)
}

function walkNpc(seen: Seen, def: NpcDef): void {
  if (seen.npcs.has(def)) return
  seen.npcs.add(def)
  seen.ids.add(def.emoji)
  for (const a of def.abilities ?? []) walkAbility(seen, a)
  for (const ph of def.phases ?? []) {
    for (const a of ph.abilities ?? []) walkAbility(seen, a)
    walkEffects(seen, ph.effects)
  }
  for (const f of def.forms ?? []) {
    if (f.emoji) seen.ids.add(f.emoji)
    for (const a of f.abilities ?? []) walkAbility(seen, a)
  }
  if (def.mount?.emoji) seen.ids.add(def.mount.emoji)
  if (def.grow) walkNpc(seen, def.grow.into)
  if (def.spawner) walkNpc(seen, def.spawner.into)
  const rules = rulesOf(def)
  walkRules(seen, rules)
  for (const fx of rules.onDeath ?? []) {
    if (fx.kind === 'decoy') continue
    if (fx.kind !== 'split') walkEffects(seen, [fx])
    else if (fx.into) walkNpc(seen, fx.into)
  }
}

function walkCharacter(seen: Seen, c: CharacterDef): void {
  seen.ids.add(c.emoji)
  seen.ids.add(c.skill.icon)
  for (const cr of c.carriers) for (const t of cr.tiers) walkAbility(seen, t)
  walkAbility(seen, c.skill.ability)
  for (const f of c.forms ?? []) {
    if (f.emoji) seen.ids.add(f.emoji)
    for (const a of f.abilities ?? []) walkAbility(seen, a)
  }
  walkRules(seen, rulesOf(c))
}

/** 一场战斗里写到的敌人：配比里的、指定的与护卫 */
function fightEnemies(fight: FightDef): EnemyKind[] {
  const out: EnemyKind[] = []
  const scan = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(scan)
    else if (v !== null && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (typeof o.enemy === 'string' && o.enemy in ENEMIES) out.push(o.enemy as EnemyKind)
      if ('weight' in o && typeof o.kind === 'string' && o.kind in ENEMIES) out.push(o.kind as EnemyKind)
      for (const x of Object.values(o)) scan(x)
    }
  }
  scan(fight)
  return out
}

/** 这一局在这张图上可能画出来的 emoji：队伍连同还能招来的角色、这张图与这一局在这张图上的各场里的敌人（精英带上词缀）、拾取物、状态与词缀的图标、这张图的布景 */
export function battleSprites(run: RunState): readonly string[] {
  const seen: Seen = { ids: new Set(), abilities: new Set(), npcs: new Set() }
  const team = new Set<CharacterId>([...run.roster, ...(run.roster.length < TEAM.maxSize ? ROSTER_IDS : [])])
  for (const id of team) walkCharacter(seen, CHARACTERS[id])
  const foes = new Set<EnemyDef>(mapEnemyRoster(run.mapId))
  for (const f of plannedFights(run)) if (f.map === run.mapId) for (const k of fightEnemies(f)) foes.add(ENEMIES[k])
  for (const e of foes) {
    walkNpc(seen, e)
    if (e.role !== 'boss') walkNpc(seen, withAffixes(e, Object.values(AFFIXES)))
  }
  return [
    ...new Set([
      ...seen.ids,
      ...Object.values(PICKUPS).map((p) => p.emoji),
      ...FIELD_PICKUPS.map((p) => p.emoji),
      '2795',
      '1f480',
      '1f6ab',
      '1f4a6',
      '1fad8',
      ...Object.values(STATUSES).flatMap((s) => (s.icon ? [s.icon.emoji] : [])),
      ...Object.values(AFFIXES).map((a) => a.icon),
      ...MAPS[run.mapId].decor.emojis,
      '1f4a5',
      SPAWN.markEmoji,
    ]),
  ]
}

/** 启动时就载好的界面图标；单位、道具这些显示时再载 */
export const PRELOAD_EMOJIS: readonly string[] = [
  '1f9ed',
  ...Object.values(MAPS).map((m) => m.emoji),
  '1f5fa',
  '1f579',
  ...SETTING_DEFS.map((d) => d.icon),
  ...Object.values(TAGS).map((t) => t.icon),
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
  '25b6',
  '1f441',
  '1f648',
  '1f4ca',
  '1f392',
  '1f3c1',
  '2696',
  '2728',
  '1f4e6',
  '1f3ae',
  '1f6d2',
  '1f504',
]
