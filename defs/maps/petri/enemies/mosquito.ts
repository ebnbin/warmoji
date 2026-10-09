import type { EnemyDef } from '../../../../legacy/types/enemies'

const MOSQUITO = {
  kind: 'mosquito',
  emoji: '1f99f',
  name: '蚊子',
  desc: '飞在半空，飘忽不定：冲它一个来的出手有四分之一扑空，范围的躲不开；跟人隔着 3 格左右，隔一阵俯冲 3 格扎人一口，扎中了吸回 10% 生命，中着毒就吸不回来',
  size: 1,
  radius: 0.36,
  span: [2, 3],
  hp: 60,
  stats: { dodge: 0.25 },
  speed: 2.4,
  damage: 10,
  xp: 3,
  coins: 2,
  drive: { kind: 'standoff', standoffDist: 3 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3200,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 3.5,
      damage: 15,
      fireSfx: 'whoosh',
      windup: { ms: 350, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 3, ms: 300, radius: 0.75 },
      onHit: [{ kind: 'to', who: { side: 'self' }, then: [{ kind: 'healRatio', ratio: 0.1 }] }],
    },
  ],
} satisfies EnemyDef

export default MOSQUITO
