import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import { shot } from '../abilityKit.ts'

// 🐈 灵猫：影子，同时在两个地方出手
const catPaw = {
  trigger: 'auto',
  cooldownMs: 750,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 14,
  knockback: 1.5,
  mirror: true,
  shape: { kind: 'bolt', projectile: shot('1f43e', 12), lifeMs: 1500 },
} satisfies AbilityDef

const catBind = { kind: 'stack', max: 2, durationMs: 800, then: [{ kind: 'root', durationMs: 1200 }] } as const

const catPaw2 = { ...catPaw, onHit: [catBind] } satisfies AbilityDef

const catPaw3 = {
  ...catPaw,
  onHit: [catBind],
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'shadow', lifeMs: 3000, max: 3, dash: 0, taunt: { radius: 2.5, ms: 1500 } }] }],
} satisfies AbilityDef

const catShade = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  shape: { kind: 'world' },
  onHit: [{ kind: 'shadow', lifeMs: 5000, max: 2, dash: 4 }],
  recast: { windowMs: 4000, ability: { trigger: 'manual', aim: 'self', fireSfx: 'whoosh', shape: { kind: 'world' }, onHit: [{ kind: 'shadowSwap' }] } },
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  catPaw,
  catPaw2,
  catPaw3,
  catShade,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.25 } }, { add: { maxHp: 25 }, mul: { damage: 1.55 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f408',
  name: '灵猫',
  desc: '放出影子，猫爪镖从本体和影子上同时飞出',
  role: 'ranged',
  tags: ['damage', 'ranged', 'mobile'],
  body: { drag: 4.5, mass: 0.6 },
  stats: { moveSpeed: 7.33, maxStamina: 70, staminaRegen: 90, exertion: 0.9 },
  skill: { name: '影子替身', icon: '1f311', desc: '朝指定方向四格外留下一个影子五秒（最多两个），猫爪镖也从影子上飞出；四秒内再按一次与最新的影子换位', cdMs: 10_000, ability: 'catShade', aim: true },
  weapons: [],
  innate: [
    {
      name: '猫爪镖',
      icon: '1f43e',
      base: 'catPaw',
      upgrades: [
        { ability: 'catPaw2', card: { icon: '26d3', name: '影缚', desc: '零点八秒内同一敌人被两枚猫爪镖命中就定身' } },
        { ability: 'catPaw3', card: { icon: '1f5e3', name: '影嘲', desc: '猫爪镖打死敌人时在身边留下一个嘲讽周围敌人的影子' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
