import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { ElementId } from '../../../../src/types/elements'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🤹 杂耍艺人：火、冰、雷三把飞刀轮着掷，一个人就打得出元素反应；技能一口气甩出三圈飞刀
const knife = (element: ElementId) =>
  ({
    trigger: 'auto',
    cooldownMs: 500,
    aim: 'nearest',
    range: 7,
    damage: 13,
    element,
    fireSfx: 'shoot',
    shape: { kind: 'bolt', projectile: shot('1f5e1', 12, 0.45, -135), lifeMs: 750 },
  }) satisfies AbilityDef

const juggled = (element: ElementId) => ({ ...knife(element), repeat: { count: 2, spreadDeg: 15 } }) satisfies AbilityDef

const pierced = (element: ElementId) => ({ ...juggled(element), shape: { ...knife(element).shape, pierce: 1 } }) satisfies AbilityDef

const trio = (make: (element: ElementId) => AbilityDef) => ({ ...make('fire'), cycle: [make('ice'), make('thunder')] }) satisfies AbilityDef

const tricksterKnives = trio(knife)
const tricksterKnives2 = trio(juggled)
const tricksterKnives3 = trio(pierced)

const ring = (element: ElementId, speed: number) =>
  ({
    trigger: 'manual',
    aim: 'self',
    damage: 12,
    element,
    fireSfx: 'whoosh',
    shape: { kind: 'bolt', projectile: shot('1f5e1', speed, 0.45, -135), lifeMs: Math.round(6500 / speed) },
    repeat: { count: 8, spreadDeg: 360 },
  }) satisfies AbilityDef

const tricksterStorm = {
  trigger: 'manual',
  aim: 'self',
  shape: { kind: 'world' },
  onHit: [
    { kind: 'cast', ability: ring('fire', 9) },
    { kind: 'cast', ability: ring('ice', 11) },
    { kind: 'cast', ability: ring('thunder', 13) },
  ],
} satisfies AbilityDef

export const abilities = { tricksterKnives, tricksterKnives2, tricksterKnives3, tricksterStorm } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, projSpeed: 1.1 } }, { add: { crit: 0.08 }, mul: { damage: 1.45, projSpeed: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f939',
  name: '杂耍艺人',
  desc: '手上总抛着三把飞刀的杂耍艺人：火刀、冰刀、雷刀轮着掷，一个人就打得出元素反应；技能一口气向四面八方甩出三圈飞刀',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.5, mass: 0.8 },
  stats: { moveSpeed: 6, maxStamina: 100, staminaRegen: 75, exertion: 0.8 },
  skill: { name: '漫天飞刀', icon: '1f3aa', desc: '向四面八方一口气甩出火、冰、雷三圈飞刀，每圈 8 把', cdMs: 12_000, ability: 'tricksterStorm' },
  weapons: [],
  innate: [
    {
      name: '三色飞刀',
      icon: '1f939',
      base: 'tricksterKnives',
      upgrades: [
        { ability: 'tricksterKnives2', card: { icon: '1f64c', name: '抛接', desc: '每次一手掷出两把，散开 15 度' } },
        { ability: 'tricksterKnives3', card: { icon: '1f3f9', name: '穿心', desc: '飞刀穿过一个敌人，还能再打中后面的一个' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
