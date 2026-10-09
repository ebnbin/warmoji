import type { EnemyDef } from '../../../../legacy/types/enemies'
import SHARD from './shard.ts'

const GEODELING = {
  kind: 'geodeling',
  emoji: '1f48e',
  name: '晶簇怪',
  element: 'earth',
  desc: '浑身长满晶簇，慢吞吞地往前挪；每隔 4 秒把晶簇朝前一竖，2 秒内正面 120 度来的攻击全被挡下，得绕到侧面打；生命第一次掉到 40% 时缩成一块晶石 2.5 秒，刀枪不入、选不中，回 35% 的生命；倒下时碎成 3 块碎晶',
  size: 1.3,
  radius: 0.5,
  hp: 110,
  stats: { armor: 6 },
  speed: 0.9,
  damage: 9,
  xp: 5,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4000,
      firstDelayMs: 1000,
      aim: 'self',
      fireSfx: 'clank',
      shape: { kind: 'world' },
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'frontGuard', arcDeg: 120, durationMs: 2000 }] }],
    },
  ],
  reactions: [
    { on: 'lowHp', ratio: 0.4, to: 'self', effects: [{ kind: 'stasis', durationMs: 2500 }, { kind: 'healRatio', ratio: 0.35 }] },
    { on: 'death', to: 'spot', effects: [{ kind: 'split', into: SHARD, count: 3 }] },
  ],
} satisfies EnemyDef

export default GEODELING
