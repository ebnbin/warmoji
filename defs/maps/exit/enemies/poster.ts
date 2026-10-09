import type { EnemyDef } from '../../../../legacy/types/enemies'
import TRASH_FLY from './trashFly.ts'

const POSTER = {
  kind: 'poster',
  emoji: '1f642',
  name: '微笑海报',
  desc: '贴在墙上的笑脸海报，推不动也不会走，一直盯着队长：队长一进 7 格就被它的视线拴住，3 秒内没跑出 7 格就被看穿，4 秒内显形、受到的伤害 ×1.3；海报后头的墙缝里每 4 秒飞出 2 只绿头蝇绕着它转，最多 6 只，不撕掉海报就一直飞出来',
  size: 1.5,
  radius: 0.55,
  hp: 150,
  stats: { armor: 4 },
  speed: 0,
  damage: 0,
  xp: 6,
  coins: 4,
  traits: ['anchored'],
  drive: { kind: 'stay' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4000,
      firstDelayMs: 800,
      aim: 'nearest',
      range: 7,
      requires: { kind: 'leader', who: 'target' },
      fireSfx: 'sonar',
      shape: { kind: 'world' },
      onHit: [
        {
          kind: 'to',
          who: { side: 'foes', radius: 7, filter: { kind: 'leader', who: 'target' } },
          then: [{ kind: 'tether', ms: 3000, range: 7, onHold: [{ kind: 'status', status: 'exposed', ms: 4000, value: 1.3 }, { kind: 'reveal', durationMs: 4000 }], color: 0xfff59d }],
        },
      ],
    },
  ],
  spawner: { into: TRASH_FLY, intervalMs: 4000, count: 2, maxAlive: 6, firstDelayMs: 2000 },
} satisfies EnemyDef

export default POSTER
