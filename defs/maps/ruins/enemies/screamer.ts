import type { EnemyDef } from '../../../../src/types/enemies'

const SCREAMER = {
  kind: 'screamer',
  emoji: '1f631',
  name: '尖叫怨灵',
  element: 'dark',
  desc: '从墙里钻出来的怨灵，穿得过墙，飘在半空和人隔着三四格；每隔几秒闪烁着憋一口气，随即一声尖叫，身边 3.5 格的人挨一下并吓得逃开 1.2 秒',
  size: 1.2,
  radius: 0.45,
  span: [1, 2],
  hp: 70,
  speed: 1.5,
  damage: 7,
  xp: 6,
  coins: 4,
  traits: ['phases'],
  drive: { kind: 'standoff', standoffDist: 3.5 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 5000,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 4,
      damage: 9,
      fireSfx: 'sonar',
      color: 0x7e57c2,
      windup: { ms: 700, lockAt: 'start', telegraph: 'blink' },
      shape: { kind: 'disc', radius: 3.5, at: 'self' },
      onHit: [{ kind: 'fear', durationMs: 1200 }],
    },
  ],
} satisfies EnemyDef

export default SCREAMER
