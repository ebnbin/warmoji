import type { EnemyDef } from '../../../src/types/enemies'

const TREE = {
  kind: 'tree',
  drive: { kind: 'stay' },
  emoji: '1f578',
  name: '蛛网',
  desc: '蛛卵孵出的小蛛结成的网，朝附近的人甩出蛛丝缠住；织网蛛母能瞬移到它身边',
  size: 1.9,
  radius: 0.7,
  hp: 160,
  speed: 0,
  damage: 0,
  xp: 3,
  coins: 2,
  traits: ['anchored'],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3500,
      firstDelayMs: 1200,
      aim: 'nearest',
      range: 6,
      windup: { ms: 700, lockAt: 'start', telegraph: 'blink' },
      color: 0xeeeeee,
      shape: { kind: 'disc', radius: 1.1, at: 'target' },
      onHit: [{ kind: 'root', durationMs: 1500 }],
    },
  ],
} satisfies EnemyDef

export default TREE
