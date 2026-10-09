import type { EnemyDef } from '../../../../legacy/types/enemies'

const CAVE_BAT = {
  kind: 'caveBat',
  emoji: '1f987',
  name: '洞蝠',
  desc: '成群倒挂在洞顶，一受惊就扑下来追着人飞；飞得乱，单发的攻击两成扑空，范围与持续伤害躲不开；碰到人就吸一口血，回自己 5% 的生命，中了毒就吸不回来',
  size: 1.1,
  radius: 0.4,
  span: [2, 3],
  hp: 40,
  stats: { dodge: 0.2 },
  speed: 2.6,
  damage: 8,
  xp: 2,
  coins: 1,
  drive: { kind: 'chase' },
  reactions: [{ on: 'touch', to: 'other', effects: [{ kind: 'to', who: { side: 'self' }, then: [{ kind: 'healRatio', ratio: 0.05 }] }] }],
} satisfies EnemyDef

export default CAVE_BAT
