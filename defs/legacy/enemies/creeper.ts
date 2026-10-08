import type { EnemyDef } from '../../../src/types/enemies'

const CREEPER = {
  kind: 'creeper',
  emoji: '1f4a3',
  name: '自爆怪',
  desc: '径直扑向玩家，贴身后定身蓄力随即原地引爆，蓄力前击杀可拆弹',
  size: 1.3,
  radius: 0.5,
  span: [0, 1],
  hp: 55,
  speed: 1.6,
  damage: 6,
  xp: 6,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 0,
      firstDelayMs: 0,
      aim: 'nearest',
      range: 2.6,
      windup: { ms: 800, lockAt: 'start', telegraph: 'blink' },
      damage: 32,
      color: 0xff5252,
      fireSfx: 'boom',
      shape: { kind: 'disc', radius: 3.8, at: 'self' },
      breach: 1.2,
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'vanish' }] }],
    },
  ],
} satisfies EnemyDef

export default CREEPER
