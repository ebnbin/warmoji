import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const FIRE = 0xff7043

const LANTERN = {
  kind: 'lantern',
  emoji: '1f3ee',
  name: '灯笼妖',
  element: 'fire',
  desc: '从寺墙翻进来的灯笼妖，飘在半空和人隔着四格：往人脚下丢火星，砸中的人烧起来，火星落地烧成一小片火，烧 2.5 秒，站在火里的都会着，着了的还会烧到贴着的队友，挤在一起最吃亏；泡在溪里湿着的人点不着；被打破时炸成一大圈火，烧 4 秒；本身是火，点不着，纸糊的身子不经打',
  size: 1.25,
  radius: 0.44,
  span: [2, 3],
  hp: 40,
  speed: 1.1,
  damage: 6,
  xp: 5,
  coins: 4,
  drive: { kind: 'standoff', standoffDist: 4 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3000,
      firstDelayMs: 1200,
      aim: 'nearest',
      range: 7,
      damage: 8,
      fireSfx: 'ignite',
      shape: { kind: 'drop', targets: 1, look: { emoji: '1f525', size: 0.8 }, fromAbove: 3, dropMs: 650, staggerMs: 0 },
      onHit: [{ kind: 'ground', def: patch(1.2, 2500, FIRE, undefined, 3, 500) }],
    },
  ],
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'ground', def: patch(2, 4000, FIRE, undefined, 3, 500) }] }],
} satisfies EnemyDef

export default LANTERN
