import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const PORCUPINE_FISH = {
  kind: 'porcupineFish',
  emoji: '1f421',
  name: '刺豚',
  desc: '飘在半空慢慢靠过来。挨打就鼓成刺球，常把贴在身边的人扎一下；3 秒内连挨三下鼓到 1.6 倍，3 秒没挨打才瘪回去；死后留下一团毒',
  size: 1.2,
  radius: 0.44,
  span: [1, 2],
  hp: 70,
  stats: { thorns: 6 },
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
    { on: 'hurt', to: 'self', chance: 0.5, effects: [{ kind: 'to', who: { side: 'foes', radius: 1.4 }, then: [{ kind: 'damage', amount: 6 }] }] },
    { on: 'death', to: 'spot', effects: [{ kind: 'ground', def: patch(1.6, 3000, 0x9575cd, [{ kind: 'poison', damage: 3, tickMs: 500, durationMs: 1500 }]) }] },
  ],
} satisfies EnemyDef

export default PORCUPINE_FISH
