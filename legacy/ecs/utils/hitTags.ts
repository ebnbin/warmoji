import type { AbilityDef } from '../../types/abilityDefs'

/** 一下伤害的标签：出手方式（近战、远程）与形态（范围、持续、召唤），决定吃出手方哪些伤害属性、承受方能否闪避与护甲减免 */
export const HIT = { melee: 1, ranged: 2, area: 4, dot: 8, summon: 16 } as const

/** 出手方式占的位：一下伤害至多一种 */
export const DELIVERY = HIT.melee | HIT.ranged

/** 能力的出手方式：定义里写了按定义，否则按形状；全场、领域、装置与施放不算近战也不算远程 */
export function deliveryOf(def: AbilityDef | undefined): number {
  if (!def) return 0
  if (def.delivery) return HIT[def.delivery]
  const s = def.shape
  switch (s.kind) {
    case 'bolt':
    case 'chain':
    case 'flyer':
    case 'drop':
      return HIT.ranged
    case 'segment':
      return s.beam ? HIT.ranged : HIT.melee
    case 'disc':
      return s.at === 'target' ? HIT.ranged : HIT.melee
    case 'sector':
    case 'blink':
    case 'sprint':
    case 'leap':
    case 'summon':
      return HIT.melee
    case 'all':
    case 'zone':
    case 'emplace':
    case 'world':
      return 0
  }
}

/** 这一下最终的标签：出手处给了出手方式就替换来源的，持续伤害不算近战也不算远程 */
export function hitTags(src: number, extra: number, tick: boolean): number {
  const t = (extra & DELIVERY ? src & ~DELIVERY : src) | extra
  return tick ? (t & ~DELIVERY) | HIT.dot : t
}
