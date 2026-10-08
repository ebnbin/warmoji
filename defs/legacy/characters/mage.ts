import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

const arcaneBlast = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'nearest',
  fireSfx: 'boom',
  range: 6,
  damage: 22,
  knockback: 12,
  color: 0x9575cd,
  shape: { kind: 'disc', radius: 1.3, at: 'target' },
} satisfies AbilityDef

const arcaneBlast2 = {
  ...arcaneBlast,
  onHit: [
    { kind: 'ground', def: { radius: 1.4, durationMs: 3000, tickMs: 400, damage: 3, color: 0xff7043, fillAlpha: 0.18, lineAlpha: 0.55, enterMs: 200 } },
  ],
} satisfies AbilityDef

const arcaneBlast3 = {
  ...arcaneBlast2,
  repeat: { count: 2, delayMs: 250, ratio: 0.75, reaim: 'random' },
} satisfies AbilityDef

const mageGate = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  shape: { kind: 'world' },
  onHit: [{ kind: 'warp', distance: 6, allies: true }, { kind: 'to', who: { side: 'foes', radius: 2.5 }, then: [{ kind: 'slow', factor: 0.4, durationMs: 1500 }] }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  arcaneBlast,
  arcaneBlast2,
  arcaneBlast3,
  mageGate,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.3 } }, { add: { maxHp: 25 }, mul: { damage: 1.65 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d9',
  name: '法师',
  desc: '在远处敌人脚下引爆奥术轰炸',
  role: 'area',
  tags: ['damage', 'ranged', 'area', 'mobile'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5, maxStamina: 80, staminaRegen: 60, exertion: 1.1 },
  skill: { name: '传送阵', icon: '1f300', desc: '全队随法师朝指定方向瞬移六格，原地炸开一圈减速，把追兵甩在身后', cdMs: 14_000, ability: 'mageGate', aim: true },
  weapons: [],
  innate: [
    {
      name: '奥术轰炸',
      icon: '1f4a5',
      base: 'arcaneBlast',
      upgrades: [
        { ability: 'arcaneBlast2', card: { icon: '1f525', name: '余烬秘火', desc: '轰炸在爆心留下灼烧地面，3 秒内持续烧伤敌人' } },
        { ability: 'arcaneBlast3', card: { icon: '2728', name: '连锁轰炸', desc: '轰炸后 0.25 秒向随机敌人追加一次 75% 伤害的轰炸' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
