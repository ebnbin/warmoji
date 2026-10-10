import type { EnemyDef } from '../../../../legacy/types/enemies'
import { zoneLook } from '../../../kit.ts'

const DOOR_CORAL = {
  kind: 'doorCoral',
  emoji: '1fab8',
  name: '附门珊瑚',
  element: 'thunder',
  desc: '不理队伍，慢慢爬向潜艇门口；身周 1.6 格罩着一团浑水，在里面每走一格多耗 3 点气；身边 1.4 格的人每 2 秒被刺胞电一下，挨电的被打断，电流再跳给身边另一个，挤在门口湿着的连成一片一起挨；停着 2 秒没动就长大一圈，最多长到两倍；护甲厚但推得动，把它从门口打开；本身是雷，队伍的电流不往它身上跳',
  size: 1.4,
  radius: 0.52,
  span: [0, 1],
  hp: 150,
  stats: { armor: 8 },
  speed: 0.8,
  damage: 6,
  xp: 7,
  coins: 5,
  drive: { kind: 'march', mark: 'door' },
  abilities: [
    // 跟随的场每条能力只放得出一次，所以写成常驻（时长 0）
    {
      trigger: 'auto',
      cooldownMs: 0,
      firstDelayMs: 0,
      aim: 'self',
      shape: { kind: 'zone', radius: 1.6, durationMs: 0, follow: true, exertion: 3, visual: zoneLook(0xff8a80) },
    },
    {
      trigger: 'auto',
      cooldownMs: 2000,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 1.4,
      damage: 7,
      fireSfx: 'zap',
      color: 0xfff176,
      shape: { kind: 'disc', radius: 1.4, at: 'self' },
    },
  ],
  reactions: [{ on: 'idle', ms: 2000, still: true, to: 'self', effects: [{ kind: 'grow', mul: 1.2, max: 2 }] }],
} satisfies EnemyDef

export default DOOR_CORAL
