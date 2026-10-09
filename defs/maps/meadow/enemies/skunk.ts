import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const STINK = 0xaed581

const SKUNK = {
  kind: 'skunk',
  emoji: '1f9a8',
  name: '臭鼬',
  element: 'poison',
  desc: '本身是毒、不会中毒，碰到它的人叠一层中毒；挨打时有 35% 的时候尾巴一翘，放一团 1.5 格的毒臭气，留 3.5 秒；倒下时放一大团 2.4 格的，留 6 秒；臭气里的人每半秒掉血、叠一层中毒，中了毒什么回复都不管用；火打进臭气里，臭气就炸开',
  size: 1.2,
  radius: 0.45,
  span: [0, 1],
  hp: 42,
  speed: 1.5,
  damage: 5,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  reactions: [
    { on: 'hurt', to: 'self', chance: 0.35, effects: [{ kind: 'ground', def: patch(1.5, 3500, STINK, undefined, 2, 500) }] },
    { on: 'death', to: 'spot', effects: [{ kind: 'ground', def: patch(2.4, 6000, STINK, undefined, 3, 500) }] },
  ],
} satisfies EnemyDef

export default SKUNK
