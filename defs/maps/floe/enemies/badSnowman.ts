import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch, shot } from '../../../kit.ts'

const BAD_SNOWMAN = {
  kind: 'badSnowman',
  emoji: '2603',
  name: '坏雪人',
  element: 'ice',
  desc: '从雪堆里钻出来的坏雪人，本身是冰，冻不住、推下海也冻不死，挪得慢：看见人就停在四格开外扔雪球，砸中的冷一层，冷满三层就冻住；倒下时散成一片雪，站在里面每秒冷一层',
  size: 1.4,
  radius: 0.52,
  hp: 100,
  speed: 1,
  damage: 9,
  xp: 3,
  coins: 2,
  drive: { kind: 'standoff', standoffDist: 4 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2600,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 6.5,
      damage: 10,
      fireSfx: 'shoot',
      shape: { kind: 'bolt', projectile: { ...shot('26aa', 7, 0.45), flight: { kind: 'arc', peakM: 1.4 } }, lifeMs: 1400 },
    },
  ],
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'ground', def: patch(1.5, 3000, 0xeceff1, undefined, 0, 1000) }] }],
} satisfies EnemyDef

export default BAD_SNOWMAN
