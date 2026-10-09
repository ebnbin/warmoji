import type { EnemyDef } from '../../../../legacy/types/enemies'

const CROW = {
  kind: 'crow',
  emoji: '1f426_200d_2b1b',
  name: '乌鸦',
  desc: '悬在半空，和人隔着三四格，隔一阵俯冲下来啄人的眼睛，啄中的致盲 1 秒，打不出普通攻击',
  size: 1.1,
  radius: 0.42,
  span: [2, 3],
  hp: 44,
  speed: 2.2,
  damage: 7,
  xp: 4,
  coins: 2,
  drive: { kind: 'standoff', standoffDist: 3.5 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3200,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 4.5,
      damage: 10,
      fireSfx: 'flutter',
      windup: { ms: 350, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 4, ms: 380, radius: 0.8 },
      onHit: [{ kind: 'disarm', durationMs: 1000 }],
    },
  ],
} satisfies EnemyDef

export default CROW
