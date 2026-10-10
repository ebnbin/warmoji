import type { AffixDef } from '../legacy/types/affixes'

/** 精英词缀表：每个词缀都要看得出来，带在身上的样子写在 look 里，或者本身就看得见（个头、元素、挨打或死时的反应） */
export const AFFIXES = {
  swift: { name: '迅捷', icon: '1f407', desc: '移速快三成，出手快三成；跑起来脚下一路扬尘', stats: { mul: { moveSpeed: 1.3, cooldown: 0.77 } }, look: { emit: { puff: 'dust', everyMs: 90, count: 2, from: 'feet' } } },
  sturdy: { name: '坚韧', icon: '1f9f1', desc: '个头大两成，生命多三成，护甲加 5', stats: { mul: { maxHp: 1.3, scale: 1.2 }, add: { armor: 5 } } },
  vampiric: { name: '吸血', icon: '1f9db', desc: '打中人回这一下三成的血；身上一直冒血珠，中了毒就吸不回来', stats: { add: { lifesteal: 0.3 } }, look: { emit: { puff: 'blood', everyMs: 220, count: 1, from: 'body' } } },
  spiky: {
    name: '反伤',
    icon: '1f335',
    desc: '身上长着一圈尖刺：挨打时三成几率震伤身边一格半内的敌人',
    reactions: [{ on: 'hurt', to: 'self', chance: 0.3, effects: [{ kind: 'to', who: { side: 'foes', radius: 1.5 }, then: [{ kind: 'damage', amount: 8 }] }] }],
    look: { wrap: { cell: 'spikes', color: 0xbdbdbd, alpha: 0.95, scale: 1.45, behind: true } },
  },
  volatile: {
    name: '爆裂',
    icon: '1f4a5',
    desc: '头上一直冒火星，死后炸伤两格内的敌人',
    reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'to', who: { side: 'foes', radius: 2 }, then: [{ kind: 'damage', amount: 25 }] }] }],
    look: { emit: { puff: 'fuse', everyMs: 120, count: 2, from: 'head' } },
  },
  enraged: {
    name: '狂暴',
    icon: '1f621',
    desc: '生命第一次掉到一半时移速快三成、出手快三成，跑起来脚下扬尘',
    reactions: [{ on: 'lowHp', ratio: 0.5, to: 'self', effects: [{ kind: 'buff', speedMul: 1.3, cooldownMul: 0.77 }] }],
  },
  splitting: { name: '分裂', icon: '1f9a0', desc: '死后裂成两只普通的同类', reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'split', count: 2 }] }] },
  frosty: { name: '冰霜', icon: '2744', desc: '本身变成冰：出手带冰、冻不住，身上冒寒气', element: 'ice' },
} satisfies Record<string, AffixDef>
