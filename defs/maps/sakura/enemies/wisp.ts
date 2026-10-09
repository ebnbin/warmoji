import type { EnemyDef } from '../../../../legacy/types/enemies'

const WISP = {
  kind: 'wisp',
  emoji: '1f47b',
  name: '游魂',
  element: 'ice',
  desc: '从樱林里慢慢飘出来的游魂，浑身阴冷，穿得过墙、飘得过溪：贴上谁就让谁冷一层，冷满三层冻住，冻住的再挨一下物理就碎；泡在溪里湿着的人被它一贴当场冻住；隔一阵就虚化 1.2 秒，这时什么都打不中它，身上烧着的火却照烧；本身是冰，冻不住，生命薄，一点就着',
  size: 1.2,
  radius: 0.44,
  span: [1, 2],
  hp: 32,
  speed: 1.4,
  damage: 5,
  xp: 3,
  coins: 2,
  traits: ['phases'],
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 6000,
      firstDelayMs: 2500,
      aim: 'self',
      fireSfx: 'warp',
      shape: { kind: 'world' },
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'untargetable', durationMs: 1200 }] }],
    },
  ],
} satisfies EnemyDef

export default WISP
