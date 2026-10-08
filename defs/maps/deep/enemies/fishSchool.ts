import type { EnemyDef } from '../../../../src/types/enemies'

const FISH_SCHOOL = {
  kind: 'fishSchool',
  emoji: '1f41f',
  name: '鱼群',
  element: 'water',
  desc: '成群的小鱼游到离队伍三格远的地方停住，隔三秒左右猛地冲进来撞一下，撞完又退回去',
  size: 0.9,
  radius: 0.34,
  span: [0, 1],
  hp: 40,
  speed: 2.4,
  damage: 7,
  xp: 2,
  coins: 1,
  drive: { kind: 'standoff', standoffDist: 3 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3000,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 3.5,
      damage: 9,
      knockback: 1,
      fireSfx: 'whoosh',
      windup: { ms: 300, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 3, ms: 320, radius: 0.7 },
    },
  ],
} satisfies EnemyDef

export default FISH_SCHOOL
