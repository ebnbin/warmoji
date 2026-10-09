import type { AffixDef } from '../legacy/types/affixes'

/** 精英词缀表 */
export const AFFIXES = {
  swift: { name: '迅捷', icon: '1f407', desc: '移速快三成，出手快三成', stats: { mul: { moveSpeed: 1.3, cooldown: 0.77 } } },
  sturdy: { name: '坚韧', icon: '1f9f1', desc: '生命多三成，护甲加 5', stats: { mul: { maxHp: 1.3 }, add: { armor: 5 } } },
  vampiric: { name: '吸血', icon: '1f9db', desc: '打中人回这一下三成的血', stats: { add: { lifesteal: 0.3 } } },
  spiky: {
    name: '反伤',
    icon: '1f335',
    desc: '挨打时三成几率震伤身边一格半内的敌人',
    reactions: [{ on: 'hurt', to: 'self', chance: 0.3, effects: [{ kind: 'to', who: { side: 'foes', radius: 1.5 }, then: [{ kind: 'damage', amount: 8 }] }] }],
  },
  volatile: {
    name: '爆裂',
    icon: '1f4a5',
    desc: '死后炸伤两格内的敌人',
    reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'to', who: { side: 'foes', radius: 2 }, then: [{ kind: 'damage', amount: 25 }] }] }],
  },
  enraged: {
    name: '狂暴',
    icon: '1f621',
    desc: '生命第一次掉到一半时伤害多五成、移速快三成',
    reactions: [{ on: 'lowHp', ratio: 0.5, to: 'self', effects: [{ kind: 'buff', damageMul: 1.5, speedMul: 1.3 }] }],
  },
  splitting: { name: '分裂', icon: '1f9a0', desc: '死后裂成两只普通的同类', reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'split', count: 2 }] }] },
  frosty: {
    name: '冰霜',
    icon: '2744',
    desc: '碰到的人减速四成，持续两秒',
    reactions: [{ on: 'touch', to: 'other', effects: [{ kind: 'slow', factor: 0.6, durationMs: 2000 }] }],
  },
} satisfies Record<string, AffixDef>
