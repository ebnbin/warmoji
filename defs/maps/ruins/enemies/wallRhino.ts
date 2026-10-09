import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'

const mudSplash = {
  trigger: 'manual',
  aim: 'self',
  damage: 6,
  fireSfx: 'splash',
  color: 0x42a5f5,
  shape: { kind: 'disc', radius: 2, at: 'self' },
} satisfies AbilityDef

const WALL_RHINO = {
  kind: 'wallRhino',
  emoji: '1f98f',
  name: '破墙犀',
  element: 'water',
  desc: '驮着骑手的犀牛，刚在泥塘里打过滚，本身是水，一直是湿的：挨冰当场冻住，挨电连上身边湿的；看见人就低头蓄力，笔直冲出 7 格，冲过人也停不下来，挡路的墙一路撞穿，撞上的人被顶飞，这一撞是物理；冲到头甩一身泥水，身边 2 格的人挨一下、浇湿 5 秒，碰到它也蹭一身湿；冲完要喘口气，侧面躲得开。犀牛先替骑手扛下 100 点伤害，扛满就倒下，骑手跳下来，一身泥水照样是湿的，抡着棒子追着人打，一扫就是身前 120°',
  size: 1.8,
  radius: 0.68,
  hp: 90,
  stats: { armor: 6 },
  speed: 1.1,
  damage: 10,
  xp: 8,
  coins: 5,
  drive: { kind: 'chase' },
  mount: { hp: 100, form: 0 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 5000,
      firstDelayMs: 2000,
      aim: 'nearest',
      range: 7,
      element: 'physical',
      damage: 16,
      knockback: 5,
      breach: 10,
      fireSfx: 'charge',
      windup: { ms: 600, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 7, ms: 800, radius: 1 },
      combo: [mudSplash],
    },
  ],
  forms: [
    {
      emoji: '1f47a',
      name: '落鞍骑手',
      span: [0, 2],
      stats: { mul: { moveSpeed: 1.2 } },
      abilities: [
        {
          trigger: 'auto',
          cooldownMs: 1400,
          firstDelayMs: 400,
          aim: 'nearest',
          range: 1.9,
          element: 'physical',
          damage: 12,
          knockback: 4,
          fireSfx: 'whoosh',
          windup: { ms: 300, lockAt: 'start', telegraph: 'shake' },
          shape: { kind: 'sector', radius: 1.8, arcDeg: 120, ms: 220 },
        },
      ],
    },
  ],
} satisfies EnemyDef

export default WALL_RHINO
