import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🐈‍⬛ 黑猫：闪到敌人身后挠一爪，专挑残血的下手；猫有九命，每条命第一次倒下时都能缓过一口气
const catClaw = {
  trigger: 'auto',
  cooldownMs: 1400,
  aim: 'nearest',
  range: 5,
  damage: 27,
  fireSfx: 'whoosh',
  shape: { kind: 'blink', behindDist: 0.6, strikeMs: 250, execute: { hpRatio: 0.3, mul: 1.6 } },
} satisfies AbilityDef

const catClaw2 = {
  ...catClaw,
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'stealth', durationMs: 2000 }, { kind: 'refresh', what: 'this' }] }],
} satisfies AbilityDef

const catClaw3 = {
  ...catClaw2,
  onHit: [
    { kind: 'status', status: 'exposed', ms: 3000, value: 1.2 },
    { kind: 'poison', damage: 0, ratio: 0.1, tickMs: 500, durationMs: 3000 },
  ],
} satisfies AbilityDef

const catNight = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'snuff',
  shape: { kind: 'world' },
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [
        { kind: 'stealth', durationMs: 3000 },
        { kind: 'status', status: 'speed', ms: 3000, value: 1.4 },
        { kind: 'empower', hits: 3, then: [{ kind: 'damage', amount: 20 }, { kind: 'stun', durationMs: 400 }] },
      ],
    },
  ],
} satisfies AbilityDef

export const abilities = { catClaw, catClaw2, catClaw3, catNight } satisfies Record<string, AbilityDef>

export const levels = [{ add: { crit: 0.06 }, mul: { damage: 1.2 } }, { add: { crit: 0.12, dodge: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f408_200d_2b1b',
  name: '黑猫',
  desc: '黑夜里看不见的黑猫：闪到敌人身后挠一爪，对生命低于 30% 的多挠六成；猫有九命——每条命第一次生命归零时不倒下，回三成生命，1 秒内谁也打不到它',
  role: 'assassin',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4, mass: 0.5 },
  stats: { moveSpeed: 7.4, maxStamina: 85, staminaRegen: 95, exertion: 0.7 },
  reactions: [{ on: 'lethal', to: 'self', effects: [{ kind: 'healRatio', ratio: 0.3 }, { kind: 'untargetable', durationMs: 1000 }] }],
  skill: {
    name: '黑夜降临',
    icon: '1f30c',
    desc: '隐入夜色潜行 3 秒（出手即现形），移速 ×1.4 3 秒；接下来 3 次出手各多打 20 点并眩晕 0.4 秒',
    cdMs: 12_000,
    ability: 'catNight',
  },
  weapons: [],
  innate: [
    {
      name: '暗影爪',
      icon: '1f43e',
      base: 'catClaw',
      upgrades: [
        { ability: 'catClaw2', card: { icon: '1f303', name: '夜行', desc: '挠死敌人后潜行 2 秒，并且立刻可以再扑' } },
        { ability: 'catClaw3', card: { icon: '1fa78', name: '扑杀', desc: '打中的敌人 3 秒内受到的伤害 ×1.2，并流血 3 秒：每半秒掉这一爪一成的血' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
