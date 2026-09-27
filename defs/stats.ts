import type { StatDef } from '../src/types/stats'

export const STATS = {
  maxHp: { name: '生命上限', base: 0, min: 10, unit: 'count' },
  regen: { name: '生命回复', base: 0, min: 0, unit: 'perSec' },
  iframes: { name: '受击无敌', base: 0, min: 0, unit: 'ms' },
  revive: { name: '复活时间', base: 0, min: 1000, unit: 'ms' },
  taken: { name: '受到伤害', base: 1, min: 0, unit: 'ratio' },
  thorns: { name: '接触反伤', base: 0, min: 0, unit: 'count' },
  killHeal: { name: '击杀回复', base: 0, min: 0, unit: 'count' },
  healing: { name: '治疗效果', base: 1, min: 0, unit: 'ratio' },
  damage: { name: '伤害', base: 1, min: 0, unit: 'ratio' },
  crit: { name: '暴击率', base: 0, min: 0, max: 0.5, unit: 'chance' },
  cooldown: { name: '攻速', base: 1, min: 0.1, unit: 'rate' },
  knockback: { name: '击退', base: 1, min: 0, unit: 'ratio' },
  range: { name: '攻击范围', base: 1, min: 0.1, unit: 'ratio' },
  projSpeed: { name: '弹速', base: 1, min: 0.1, unit: 'ratio' },
  moveSpeed: { name: '移速', base: 0, min: 0, unit: 'gridPerSec' },
  scale: { name: '体型', base: 1, min: 0.05, unit: 'ratio' },
  magnet: { name: '拾取范围', base: 0, min: 0, unit: 'grid' },
  exertion: { name: '赶路耗体力', base: 1, min: 0, unit: 'ratio' },
} as const satisfies Record<string, StatDef>
