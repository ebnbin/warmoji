import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'

const lightning = {
  trigger: 'manual',
  aim: 'nearest',
  range: 9,
  damage: 11,
  fireSfx: 'zap',
  shape: { kind: 'drop', targets: 2, look: { emoji: '26a1', size: 0.9 }, fromAbove: 4, dropMs: 600, staggerMs: 250 },
} satisfies AbilityDef

const STORM_CLOUD = {
  kind: 'stormCloud',
  emoji: '26c8',
  name: '雷雨云',
  element: 'thunder',
  desc: '开阔的草甸上没处躲：雷雨云飘在半空、离队伍四格远远跟着，本身不受传导；隔一阵蓄力半秒，往最近那人身边 2 格下一阵急雨，淋到的挨 3 点、浑身湿透 5 秒，紧跟着往两名队员头上劈雷，劈中的出手被打断，电再跳到身边另一人，湿的连成一片一起挨',
  size: 1.6,
  radius: 0.55,
  span: [2, 3],
  hp: 45,
  speed: 0.9,
  damage: 0,
  xp: 5,
  coins: 3,
  drive: { kind: 'standoff', standoffDist: 4 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4500,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 8,
      damage: 3,
      element: 'water',
      fireSfx: 'wash',
      color: 0x42a5f5,
      windup: { ms: 500, lockAt: 'start', telegraph: 'blink' },
      shape: { kind: 'disc', radius: 2, at: 'target' },
      combo: [lightning],
    },
  ],
} satisfies EnemyDef

export default STORM_CLOUD
