import type { EnemyDef } from '../../../../legacy/types/enemies'

const MOSQUITO = {
  kind: 'mosquito',
  emoji: '1f99f',
  name: '蚊子',
  element: 'wood',
  desc: '飞在半空，跟人隔着 3 格左右，隔一阵俯冲 3 格扎人一口：扎中的中毒，自己还回 5% 生命',
  size: 1,
  radius: 0.36,
  span: [2, 3],
  hp: 64,
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
      damage: 12,
      fireSfx: 'whoosh',
      windup: { ms: 350, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 3, ms: 300, radius: 0.75 },
      onHit: [
        { kind: 'poison', damage: 3, tickMs: 600, durationMs: 3000 },
        { kind: 'to', who: { side: 'self' }, then: [{ kind: 'healRatio', ratio: 0.05 }] },
      ],
    },
  ],
} satisfies EnemyDef

export default MOSQUITO
