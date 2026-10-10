import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const SNAIL = {
  kind: 'snail',
  emoji: '1f40c',
  name: '蜗牛',
  element: 'water',
  desc: '慢吞吞地爬，壳很硬，刀砍的打折扣；爬过的地方留下一道湿黏液，踩上去走不动、浑身湿透，碰到它也湿透；本身湿漉漉的，一电一片、一冰就冻',
  size: 1.2,
  radius: 0.46,
  span: [0, 0],
  hp: 80,
  stats: { armor: 6 },
  speed: 0.55,
  damage: 5,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 900,
      firstDelayMs: 0,
      aim: 'self',
      shape: { kind: 'world' },
      onHit: [{ kind: 'ground', def: patch(0.7, 4500, 0x90caf9, [{ kind: 'slow', factor: 0.5, durationMs: 600 }]) }],
    },
  ],
} satisfies EnemyDef

export default SNAIL
