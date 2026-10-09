import type { EnemyDef } from '../../../../legacy/types/enemies'
import { ring } from '../../../kit.ts'

const PORCUPINE_FISH = {
  kind: 'porcupineFish',
  emoji: '1f421',
  name: '刺豚',
  desc: '飘在半空慢慢靠过来，浑身是刺：近身打它的反被扎 8 点。挨打就鼓成刺球，常把贴在身边的人扎一下、弹开；3 秒内连挨三下鼓到 1.6 倍，3 秒没挨打才瘪回去；死时炸开一圈刺，1.8 格内的人挨 12 点、被弹开，最好远远打',
  size: 1.2,
  radius: 0.44,
  span: [1, 2],
  hp: 70,
  stats: { thorns: 8 },
  speed: 1,
  damage: 7,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  reactions: [
    {
      on: 'hurt',
      to: 'self',
      effects: [
        { kind: 'grow', mul: 1.25, ms: 3000 },
        { kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'grow', mul: 1.6, ms: 3000 }] },
      ],
    },
    { on: 'hurt', to: 'self', chance: 0.5, effects: [{ kind: 'blast', radius: 1.4, amount: 6, knockback: 1.5 }] },
    { on: 'death', to: 'spot', effects: [{ kind: 'blast', radius: 1.8, amount: 12, knockback: 2.5, ring: ring(0xffe082) }] },
  ],
} satisfies EnemyDef

export default PORCUPINE_FISH
