import type { EnemyDef } from '../../../../src/types/enemies'

const STORM_CLOUD = {
  kind: 'stormCloud',
  emoji: '26c8',
  name: '雷雨云',
  element: 'thunder',
  desc: '开阔的草甸上没处躲：雷雨云飘在半空、离队伍四格远远跟着，隔一阵往队员脚下劈雷，劈中的麻一下',
  size: 1.6,
  radius: 0.55,
  span: [2, 3],
  hp: 45,
  speed: 0.9,
  damage: 0,
  xp: 5,
  coins: 3,
  drive: { kind: 'standoff', detectRange: 14, standoffDist: 4 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3800,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 8,
      damage: 12,
      fireSfx: 'zap',
      shape: { kind: 'drop', targets: 2, look: { emoji: '26a1', size: 0.9 }, fromAbove: 4, dropMs: 700, staggerMs: 300 },
      onHit: [{ kind: 'stun', durationMs: 400 }],
    },
  ],
} satisfies EnemyDef

export default STORM_CLOUD
