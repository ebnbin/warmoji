import type { EnemyDef } from '../../../../src/types/enemies'

const ROACH = {
  kind: 'roach',
  emoji: '1fab3',
  name: '蟑螂',
  element: 'dark',
  desc: '又矮又快，贴着琼脂乱窜；打不死的小强——生命见底时不倒，撑着回到一半，再爬 2.5 秒才流光倒下',
  size: 1,
  radius: 0.38,
  span: [0, 0],
  hp: 64,
  speed: 2.6,
  damage: 10,
  xp: 3,
  coins: 1,
  drive: { kind: 'chase' },
  reactions: [{ on: 'lethal', to: 'self', effects: [{ kind: 'undead', ms: 2500, hpRatio: 0.5 }] }],
} satisfies EnemyDef

export default ROACH
