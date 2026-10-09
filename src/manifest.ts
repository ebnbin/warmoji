import { CHARACTERS, ROSTER_IDS, TEAM } from './data/characters'
import type { CharacterDef, CharacterId } from './types/characters'
import type { OutlineKind } from './emoji/svg'
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

type Sides = Record<Side, Seen>

function walkEffects(seen: Sides, list: readonly Effect[] | undefined, side: Side): void {
  for (const fx of list ?? []) {
    switch (fx.kind) {
      case 'morph':
        seen[OTHER[side]].body.add(fx.morphEmoji)
        break
      case 'spawnProjectile':
        seen[side].shot.add(fx.projectile.look.emoji)
        break
      case 'summon':
        if (fx.of === 'victim') seen[side].raises = true
        else if ('unit' in fx.of) walkNpc(seen, fx.of.unit, side)
        break
      case 'steal':
        seen[side].steals = true
        break
      default:
        break
    }
    for (const sub of childEffects(fx)) walkEffects(seen, sub, side)
  }
}

function walkAbility(seen: Sides, a: AbilityDef, side: Side): void {
  const s = seen[side]
  if (s.abilities.has(a)) return
  s.abilities.add(a)
  const sh = a.shape
  if (a.held) s.body.add(a.held.look.emoji)
  if (a.anchor) s.body.add(a.anchor.look.emoji)
  if (sh.kind === 'bolt') s.shot.add(sh.projectile.look.emoji)
  if (sh.kind === 'emplace') s.body.add(sh.look.emoji)
  if (sh.kind === 'summon') s.body.add(sh.minion.look.emoji)
  if (sh.kind === 'drop') s.body.add(sh.look.emoji)
  for (const c of childAbilities(a)) walkAbility(seen, c, side)
  for (const list of abilityEffects(a)) walkEffects(seen, list, side)
}

function walkRules(seen: Sides, r: BodyRules | undefined, side: Side): void {
  if (!r) return
  for (const list of [r.onHurt, r.onTouched, r.onTouch, r.onKill, r.onAnchorLost, r.onLethal, ...(r.onLowHp ?? []).map((l) => l.effects), r.onIdle?.effects, r.resource?.full?.effects]) walkEffects(seen, list, side)
}

function walkNpc(seen: Sides, def: NpcDef, side: Side): void {
  const s = seen[side]
  if (s.npcs.has(def)) return
  s.npcs.add(def)
  s.body.add(def.emoji)
  for (const a of def.abilities ?? []) walkAbility(seen, a, side)
  for (const ph of def.phases ?? []) {
    for (const a of ph.abilities ?? []) walkAbility(seen, a, side)
    walkEffects(seen, ph.effects, side)
  }
  for (const f of def.forms ?? []) {
    if (f.emoji) s.body.add(f.emoji)
    for (const a of f.abilities ?? []) walkAbility(seen, a, side)
  }
  if (def.mount?.emoji) s.body.add(def.mount.emoji)
  if (def.grow) walkNpc(seen, def.grow.into, side)
  if (def.spawner) walkNpc(seen, def.spawner.into, side)
  const rules = rulesOf(def)
  walkRules(seen, rules, side)
  for (const fx of rules.onDeath ?? []) {
    if (fx.kind === 'decoy') continue
    if (fx.kind !== 'split') walkEffects(seen, [fx], side)
    else if (fx.into) walkNpc(seen, fx.into, side)
  }
}

function walkCharacter(seen: Sides, c: CharacterDef): void {
  const s = seen.team
  s.body.add(c.emoji)
  s.body.add(c.skill.icon)
  for (const cr of c.carriers) for (const t of cr.tiers) walkAbility(seen, t, 'team')
  walkAbility(seen, c.skill.ability, 'team')
  for (const f of c.forms ?? []) {
    if (f.emoji) s.body.add(f.emoji)
    for (const a of f.abilities ?? []) walkAbility(seen, a, 'team')
  }
  walkRules(seen, rulesOf(c), 'team')
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

/** 战斗图集要收的变体：按描边分组的 emoji 与不描边的 */
export interface BattleSprites {
  readonly outlined: Record<OutlineKind, readonly string[]>
  readonly plain: readonly string[]
}

/** 这一局在这张图上可能画出来的：队伍连同还能招来的角色、这张图与这一局在这张图上的各场里的敌人（精英带上词缀）、拾取物、状态与词缀的图标、这张图的布景 */
export function battleSprites(run: RunState): BattleSprites {
  const seen: Sides = {
    team: { body: new Set(), shot: new Set(), abilities: new Set(), npcs: new Set(), steals: false, raises: false },
    enemy: { body: new Set(), shot: new Set(), abilities: new Set(), npcs: new Set(), steals: false, raises: false },
  }
  const team = new Set<CharacterId>([...run.roster, ...(run.roster.length < TEAM.maxSize ? ROSTER_IDS : [])])
  for (const id of team) walkCharacter(seen, CHARACTERS[id])
  const foes = new Set<EnemyDef>(mapEnemyRoster(run.mapId))
  for (const f of plannedFights(run)) if (f.map === run.mapId) for (const k of fightEnemies(f)) foes.add(ENEMIES[k])
  for (const e of foes) {
    walkNpc(seen, e, 'enemy')
    if (e.role !== 'boss') walkNpc(seen, withAffixes(e, Object.values(AFFIXES)), 'enemy')
  }
  // 夺来的能力与拉起来的亡者换了阵营：再按新阵营走一遍，走到不再增加为止
  for (let changed = true; changed; ) {
    changed = false
    for (const side of ['team', 'enemy'] as const) {
      const s = seen[side]
      const o = seen[OTHER[side]]
      const before = s.abilities.size + s.npcs.size
      if (s.steals) for (const a of [...o.abilities]) walkAbility(seen, a, side)
      if (s.raises) for (const n of [...o.npcs]) walkNpc(seen, n, side)
      if (s.abilities.size + s.npcs.size !== before) changed = true
    }
  }
  return {
    outlined: {
      player: [
        ...new Set([
          ...seen.team.body,
          ...seen.team.shot,
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
        ]),
      ],
      enemy: [...seen.enemy.body],
      enemyProjectile: [...seen.enemy.shot],
      elite: [...seen.enemy.body],
    },
    plain: ['1f4a5', SPAWN.markEmoji],
  }
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
