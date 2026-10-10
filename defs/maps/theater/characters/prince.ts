import type { AbilityDef, AbilityReaction, Cond } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🤴 王子：一身重甲；佩剑刺开挡路的，出手时护住身边最伤的队友；每第三下横扫一圈，把敌人都招到自己身上；喊一声连身上的火和毒一起甩掉

// 只有自己的圆心落在自己 0.1 格内
const notSelf = { kind: 'not', cond: { kind: 'within', who: 'target', radius: 0.1 } } satisfies Cond

const chivalry = [
  { on: 'fire', to: 'self', effects: [{ kind: 'to', who: { side: 'allies', radius: 3, filter: notSelf, sort: 'weakest', count: 1 }, then: [{ kind: 'shield', amount: 0, ratio: 0.05, ms: 2000 }] }] },
] satisfies AbilityReaction[]

const princeSword = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  range: 2.1,
  damage: 16,
  knockback: 1.5,
  fireSfx: 'clank',
  shape: { kind: 'segment', reach: 2, radius: 0.5, ms: 160 },
} satisfies AbilityDef

const princeSword2 = { ...princeSword, reactions: chivalry } satisfies AbilityDef

const princeSweep = {
  ...princeSword2,
  range: 2.6,
  damage: 20,
  knockback: 2,
  fireSfx: 'whoosh',
  shape: { kind: 'sector', radius: 2.6, arcDeg: 180, ms: 220 },
  onHit: [{ kind: 'taunt', durationMs: 2000 }],
} satisfies AbilityDef

const princeSword3 = { ...princeSword2, cycle: [princeSword2, princeSweep] } satisfies AbilityDef

const princeVow = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  color: 0xfff59d,
  shape: { kind: 'disc', radius: 5, at: 'self' },
  onHit: [{ kind: 'taunt', durationMs: 3000 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'invuln', ms: 1200 }, { kind: 'cleanse' }, { kind: 'guard', mul: 0.5, durationMs: 4000 }] }],
} satisfies AbilityDef

export const abilities = { princeSword, princeSword2, princeSword3, princeVow } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 30, armor: 2 }, mul: { damage: 1.1 } }, { add: { maxHp: 70, armor: 4 }, mul: { damage: 1.3 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f934',
  name: '王子',
  desc: '持剑的王子：佩剑刺开挡路的家伙，剑是物理，刺得退敌人、敲得碎冻住的；出手时顺手护住身边最伤的队友；横扫一圈把敌人都招到自己身上；一身重甲，刀剑砍上去不痛，烧和毒却不吃护甲，喊一声“为了公主”什么都挡得住，连身上的火和毒一起甩掉',
  role: 'tank',
  tags: ['defense', 'melee'],
  body: { drag: 5.5, mass: 1.6 },
  stats: { moveSpeed: 4.2, maxStamina: 140, staminaRegen: 45, exertion: 1.2 },
  skill: { name: '为了公主', icon: '1f478', desc: '1.2 秒内无敌，甩掉身上的燃烧、中毒、寒冷、湿与控制；5 格内的敌人嘲讽 3 秒，自己 4 秒内受到的伤害减半', cdMs: 13_000, ability: 'princeVow' },
  weapons: [],
  innate: [
    {
      name: '佩剑',
      icon: '1f5e1',
      base: 'princeSword',
      upgrades: [
        { ability: 'princeSword2', card: { icon: '1f6e1', name: '骑士精神', desc: '每次出手给 3 格内生命比例最低的队友挂上生命 5% 的护盾 2 秒' } },
        { ability: 'princeSword3', card: { icon: '1f451', name: '王者之风', desc: '每第三下改成 180 度横扫，扫中的敌人嘲讽 2 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
