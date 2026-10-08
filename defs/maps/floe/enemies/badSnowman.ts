import type { EnemyDef } from '../../../../src/types/enemies'
import { patch, shot } from '../../../kit.ts'

const BAD_SNOWMAN = {
  kind: 'badSnowman',
  emoji: '2603',
  name: '坏雪人',
  element: 'ice',
  desc: '从雪堆里钻出来的坏雪人，挪得慢；看见人就停在四格开外扔雪球，砸中的人走不快；倒下时散成一片雪，踩进去也走不快',
  size: 1.4,
  radius: 0.52,
  hp: 100,
  speed: 1,
  damage: 9,
  xp: 3,
  coins: 2,
  drive: { kind: 'standoff', detectRange: 14, standoffDist: 4 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2600,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 6.5,
      damage: 12,
      fireSfx: 'shoot',
      shape: { kind: 'bolt', projectile: { ...shot('26aa', 7, 0.45), flight: { kind: 'arc', peakM: 1.4 } }, lifeMs: 1400 },
      onHit: [{ kind: 'slow', factor: 0.7, durationMs: 1000 }],
    },
  ],
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'ground', def: patch(1.5, 3000, 0xeceff1, [{ kind: 'slow', factor: 0.6, durationMs: 600 }]) }] }],
} satisfies EnemyDef

export default BAD_SNOWMAN
