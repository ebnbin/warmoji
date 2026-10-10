import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, shot } from '../../../kit.ts'

// 🤹 杂耍艺人：本身是毒；淬毒的飞刀连着掷，一刀一层毒，每三手抛一只毒药瓶摔出毒云；技能让全场敌人跟着蹦迪，同时甩出两圈毒飞刀
const knife = {
  trigger: 'auto',
  cooldownMs: 500,
  aim: 'nearest',
  range: 7,
  damage: 10,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1f5e1', 12, 0.45, -135), lifeMs: 750 },
} satisfies AbilityDef

const juggled = { ...knife, repeat: { count: 2, spreadDeg: 15 } } satisfies AbilityDef

const pierced = { ...juggled, shape: { ...knife.shape, pierce: 1 } } satisfies AbilityDef

const vial = {
  trigger: 'auto',
  cooldownMs: 500,
  aim: 'nearest',
  range: 7,
  damage: 6,
  fireSfx: 'whoosh',
  shape: { kind: 'bolt', projectile: { ...shot('1f9ea', 7, 0.5), flight: { kind: 'arc', peakM: 1.4 } }, lifeMs: 1200 },
  onHit: [{ kind: 'ground', def: patch(1.5, 3000, 0x9ccc65, undefined, 3, 500) }],
} satisfies AbilityDef

const tricksterKnives = { ...knife, cycle: [knife, knife, vial] } satisfies AbilityDef
const tricksterKnives2 = { ...juggled, cycle: [juggled, juggled, vial] } satisfies AbilityDef
const tricksterKnives3 = { ...pierced, cycle: [pierced, pierced, vial] } satisfies AbilityDef

const ring = (speed: number) =>
  ({
    trigger: 'manual',
    aim: 'self',
    damage: 10,
    fireSfx: 'whoosh',
    shape: { kind: 'bolt', projectile: shot('1f5e1', speed, 0.45, -135), lifeMs: Math.round(6500 / speed) },
    repeat: { count: 8, spreadDeg: 360 },
  }) satisfies AbilityDef

const dance = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'chirp',
  shape: { kind: 'all', of: 'foes' },
  onHit: [{ kind: 'if', when: { kind: 'boss', who: 'target' }, then: [{ kind: 'stun', durationMs: 500 }], else: [{ kind: 'stun', durationMs: 2000 }] }],
} satisfies AbilityDef

const tricksterStorm = {
  trigger: 'manual',
  aim: 'self',
  shape: { kind: 'world' },
  onHit: [
    { kind: 'cast', ability: dance },
    { kind: 'cast', ability: ring(9) },
    { kind: 'cast', ability: ring(12) },
  ],
} satisfies AbilityDef

export const abilities = { tricksterKnives, tricksterKnives2, tricksterKnives3, tricksterStorm } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, projSpeed: 1.1 } }, { add: { crit: 0.08 }, mul: { damage: 1.45, projSpeed: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f939',
  name: '杂耍艺人',
  element: 'poison',
  desc: '手上总抛着飞刀的杂耍艺人，本身是毒、毒不倒：淬了毒的飞刀连着掷，一刀叠一层毒，最多五层；每掷三手就抛一只毒药瓶，摔出一团 1.5 格的毒云，留 3 秒，云里的敌人一层层中毒、回不了血，火打进去就炸；技能让全场的敌人跟着蹦迪 2 秒、动弹不得（头目只蹦 0.5 秒），同时向四面八方甩出两圈毒飞刀',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.5, mass: 0.8 },
  stats: { moveSpeed: 6, maxStamina: 100, staminaRegen: 75, exertion: 0.8 },
  skill: { name: '满堂彩', icon: '1f57a', desc: '全场的敌人跟着蹦迪 2 秒，失去行动，头目只蹦 0.5 秒；同时向四面八方甩出两圈毒飞刀，每圈 8 把', cdMs: 15_000, ability: 'tricksterStorm' },
  weapons: [],
  innate: [
    {
      name: '毒飞刀',
      icon: '1f939',
      base: 'tricksterKnives',
      upgrades: [
        { ability: 'tricksterKnives2', card: { icon: '1f64c', name: '抛接', desc: '每次一手掷出两把，散开 15 度' } },
        { ability: 'tricksterKnives3', card: { icon: '1f3f9', name: '穿心', desc: '飞刀穿过一个敌人，还能再打中后面的一个' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
