import type { EnemyDef } from '../../../../legacy/types/enemies'

const SPIDER_WEB = {
  kind: 'spiderWeb',
  emoji: '1f578',
  name: '蜘蛛网',
  element: 'dark',
  desc: '蛛后的卵在草里结成的网，原地不动：每 3.5 秒朝 6 格内最近的人甩出蛛丝，落点 1.1 格内的人定身 1.5 秒；蛛后能瞬移到它身边',
  size: 1.9,
  radius: 0.7,
  hp: 160,
  speed: 0,
  damage: 0,
  xp: 3,
  coins: 2,
  traits: ['anchored'],
  drive: { kind: 'stay' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3500,
      firstDelayMs: 1200,
      aim: 'nearest',
      range: 6,
      fireSfx: 'flutter',
      color: 0xeeeeee,
      windup: { ms: 700, lockAt: 'start', telegraph: 'blink' },
      shape: { kind: 'disc', radius: 1.1, at: 'target' },
      onHit: [{ kind: 'root', durationMs: 1500 }],
    },
  ],
} satisfies EnemyDef

export default SPIDER_WEB
