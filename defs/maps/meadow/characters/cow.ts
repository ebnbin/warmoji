import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🐄 奶牛：顶开挡路的，第三下跺地震晕一圈；跺地时给身边的队友挂护盾
const cowButt = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  range: 1.9,
  damage: 18,
  knockback: 3,
  fireSfx: 'thud',
  shape: { kind: 'sector', radius: 1.8, arcDeg: 100, ms: 180 },
} satisfies AbilityDef

const cowStomp = {
  ...cowButt,
  damage: 14,
  knockback: 2,
  color: 0xa1887f,
  shape: { kind: 'disc', radius: 2.2, at: 'self' },
  onHit: [{ kind: 'stun', durationMs: 500 }],
} satisfies AbilityDef

const cowButt2 = { ...cowButt, cycle: [cowButt, cowStomp] } satisfies AbilityDef

const cowButt3 = {
  ...cowButt,
  cycle: [cowButt, { ...cowStomp, reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'to', who: { side: 'allies', radius: 3 }, then: [{ kind: 'shield', amount: 0, ratio: 0.06, ms: 4000 }] }] }] }],
} satisfies AbilityDef

const cowBellow = {
  trigger: 'manual',
  aim: 'self',
  damage: 10,
  fireSfx: 'rumble',
  color: 0x8d6e63,
  shape: { kind: 'disc', radius: 3.5, at: 'self' },
  onHit: [{ kind: 'taunt', durationMs: 3000 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'shield', amount: 0, ratio: 0.3, ms: 5000 }] }],
} satisfies AbilityDef

export const abilities = { cowButt, cowButt2, cowButt3, cowBellow } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 30, armor: 2 } }, { add: { maxHp: 70, armor: 4 }, mul: { damage: 1.3 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f404',
  name: '奶牛',
  element: 'earth',
  desc: '身板厚实，顶开挡路的家伙；跺地震晕一圈，一声长哞把敌人都招到自己身上',
  role: 'tank',
  tags: ['defense', 'melee'],
  body: { drag: 5.5, mass: 1.7 },
  stats: { moveSpeed: 4, maxStamina: 140, staminaRegen: 45, exertion: 1.2 },
  skill: { name: '牛气冲天', icon: '1f402', desc: '长哞一声：3.5 格内的敌人嘲讽 3 秒，自己挂上三成生命的护盾', cdMs: 12_000, ability: 'cowBellow' },
  weapons: [],
  innate: [
    {
      name: '顶撞',
      icon: '1f404',
      base: 'cowButt',
      upgrades: [
        { ability: 'cowButt2', card: { icon: '1f9b6', name: '铁蹄', desc: '每第三下改成跺地，震晕身边一圈 0.5 秒' } },
        { ability: 'cowButt3', card: { icon: '1f95b', name: '鲜奶', desc: '跺地时给 3 格内的队友各挂一层生命 6% 的护盾' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
