import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🦡 獾：钻地扑到敌人背后狠咬一口，专咬残血的；技能横下心来，什么控制都不吃
const badgerAmbush = {
  trigger: 'auto',
  cooldownMs: 1400,
  aim: 'nearest',
  range: 4.5,
  damage: 28,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.8, strikeMs: 250, execute: { hpRatio: 0.3, mul: 1.5 } },
} satisfies AbilityDef

const badgerAmbush2 = { ...badgerAmbush, onHit: [{ kind: 'poison', damage: 0, ratio: 0.15, tickMs: 500, durationMs: 3000 }] } satisfies AbilityDef

const badgerAmbush3 = {
  ...badgerAmbush2,
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'refresh', what: 'this' }, { kind: 'untargetable', durationMs: 500 }] }],
} satisfies AbilityDef

const badgerFury = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'rumble',
  shape: { kind: 'world' },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'cleanse' }, { kind: 'unstoppable', durationMs: 4000 }, { kind: 'buff', damageMul: 1.4, durationMs: 4000 }] }],
} satisfies AbilityDef

export const abilities = { badgerAmbush, badgerAmbush2, badgerAmbush3, badgerFury } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9a1',
  name: '獾',
  element: 'dark',
  desc: '凶悍的獾：钻地扑到 4.5 格内的敌人背后狠咬一口再钻回来，对生命不到三成的下嘴重一半；技能一横心，什么控制都不吃',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4.2, mass: 0.9 },
  stats: { moveSpeed: 7, maxStamina: 90, staminaRegen: 90, exertion: 0.8 },
  skill: { name: '蜜獾不怕', icon: '1f36f', desc: '解除身上的控制与减速，4 秒内霸体、伤害 ×1.4', cdMs: 14_000, ability: 'badgerFury' },
  weapons: [],
  innate: [
    {
      name: '挖地突袭',
      icon: '26cf',
      base: 'badgerAmbush',
      upgrades: [
        { ability: 'badgerAmbush2', card: { icon: '1fa78', name: '撕咬', desc: '咬中的敌人流血 3 秒，每半秒掉这一口一成五的血' } },
        { ability: 'badgerAmbush3', card: { icon: '1f573', name: '打洞', desc: '咬死敌人立刻可以再扑，并 0.5 秒内谁也选不中' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
