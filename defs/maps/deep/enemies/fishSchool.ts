import type { EnemyDef } from '../../../../legacy/types/enemies'

const FISH_SCHOOL = {
  kind: 'fishSchool',
  emoji: '1f41f',
  name: '鱼群',
  element: 'water',
  desc: '成群的小鱼，本身是水、一直是湿的：游到离队伍三格远的地方停住，隔三秒左右猛地冲进来撞一下，撞到的人浇湿，撞完又退回去；一群鱼散得开，单发的出手三成打空，范围的躲不开；湿身子一电一片、一冰就冻',
  size: 0.9,
  radius: 0.34,
  span: [0, 1],
  hp: 34,
  stats: { dodge: 0.3 },
  speed: 2.4,
  damage: 6,
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
      damage: 7,
      knockback: 1,
      fireSfx: 'whoosh',
      windup: { ms: 300, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 3, ms: 320, radius: 0.7 },
    },
  ],
} satisfies EnemyDef

export default FISH_SCHOOL
