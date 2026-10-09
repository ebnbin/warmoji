import type { ElementRules } from '../legacy/types/elements'

/**
 * 元素与克制：六种基础元素两两相克，每种克两种、被两种克、和剩下的一种两不相干；光与暗互相克制。
 * 带元素的一下打在身上附着那种元素，附着着一种时被另一种打中可能起反应
 */
export const ELEMENTS = {
  mul: { strong: 1.5, weak: 0.7, same: 0.6 },
  auraMs: 4000,
  list: {
    fire: { name: '火', icon: '1f525', color: 0xff7043, beats: ['wood', 'ice'], aura: 'auraFire' },
    water: { name: '水', icon: '1f4a7', color: 0x42a5f5, beats: ['fire', 'earth'], aura: 'auraWater' },
    ice: { name: '冰', icon: '2744', color: 0x80deea, beats: ['water', 'wood'], aura: 'auraIce' },
    thunder: { name: '雷', icon: '1f329', color: 0xffd54f, beats: ['water', 'ice'], aura: 'auraThunder' },
    earth: { name: '土', icon: '1faa8', color: 0xa1887f, beats: ['thunder', 'fire'], aura: 'auraEarth' },
    wood: { name: '木', icon: '1f33f', color: 0x81c784, beats: ['earth', 'thunder'], aura: 'auraWood' },
    light: { name: '光', icon: '2728', color: 0xfff59d, beats: ['dark'], aura: 'auraLight' },
    dark: { name: '暗', icon: '1f311', color: 0x7e57c2, beats: ['light'], aura: 'auraDark' },
  },
  reactions: {
    vaporize: { name: '蒸发', desc: '这一下伤害 ×1.75', of: ['fire', 'water'], mul: 1.75, color: 0xe0f7fa },
    melt: { name: '融化', desc: '这一下伤害 ×1.5', of: ['fire', 'ice'], mul: 1.5, color: 0xffccbc },
    overload: {
      name: '超载',
      desc: '在被打中处炸开，周围 1.6 格内的敌人吃这一下八成的伤害并被炸开',
      of: ['fire', 'thunder'],
      effects: [{ kind: 'blast', radius: 1.6, ratio: 0.8, knockback: 3, ring: { color: 0xff8a65, fillAlpha: 0.3, lineWidth: 4, lineAlpha: 0.9, durMs: 260 } }],
      color: 0xff8a65,
    },
    burn: { name: '燃烧', desc: '烧 4 秒，每半秒掉这一下一成二的血', of: ['fire', 'wood'], effects: [{ kind: 'poison', damage: 0, ratio: 0.12, tickMs: 500, durationMs: 4000 }], color: 0xff7043 },
    freeze: { name: '冻结', desc: '冻住 1.5 秒', of: ['water', 'ice'], effects: [{ kind: 'status', status: 'frozen', ms: 1500 }], color: 0x81d4fa },
    electrocharge: {
      name: '感电',
      desc: '电流窜到身边：被打中的连同 2.5 格内最近的两个敌人各吃这一下一半的伤害',
      of: ['water', 'thunder'],
      effects: [{ kind: 'to', who: { side: 'foes', radius: 2.5, sort: 'nearest', count: 3 }, then: [{ kind: 'damage', amount: 0, ratio: 0.5 }] }],
      color: 0xfff176,
    },
    mire: {
      name: '泥沼',
      desc: '陷进泥里 3 秒：移速减半，冲刺、跳跃、闪现都用不了',
      of: ['water', 'earth'],
      effects: [
        { kind: 'slow', factor: 0.5, durationMs: 3000 },
        { kind: 'grounded', durationMs: 3000 },
      ],
      color: 0x8d6e63,
    },
    bloom: { name: '滋生', desc: '出手的一方回复上限 4% 的生命', of: ['water', 'wood'], effects: [{ kind: 'to', who: { side: 'self' }, then: [{ kind: 'healRatio', ratio: 0.04 }] }], color: 0xa5d6a7 },
    superconduct: { name: '超导', desc: '5 秒内受到的伤害 ×1.3', of: ['ice', 'thunder'], effects: [{ kind: 'status', status: 'exposed', ms: 5000, value: 1.3 }], color: 0xb39ddb },
    permafrost: { name: '冻土', desc: '冻在地上 2 秒，走不了但还能出手', of: ['ice', 'earth'], effects: [{ kind: 'root', durationMs: 2000 }], color: 0xb0bec5 },
    magnetize: { name: '磁暴', desc: '麻痹 0.8 秒', of: ['thunder', 'earth'], effects: [{ kind: 'stun', durationMs: 800 }], color: 0xffe082 },
    annihilate: { name: '湮灭', desc: '这一下伤害 ×2', of: ['light', 'dark'], mul: 2, color: 0xede7f6 },
  },
} as const satisfies ElementRules
