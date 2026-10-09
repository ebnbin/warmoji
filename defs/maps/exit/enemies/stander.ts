import type { EnemyDef } from '../../../../legacy/types/enemies'

const STANDER = {
  kind: 'stander',
  emoji: '1f9cd',
  name: '站立者',
  desc: '直挺挺地站着：有人走近到 4 格内它就一动不动，一离远就飞快地挪近；贴到 1.6 格内时顿一下，猛地朝身边一圈出手',
  size: 1.4,
  radius: 0.5,
  hp: 110,
  speed: 2.8,
  damage: 10,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  drives: [{ if: { kind: 'within', who: 'target', radius: 4 }, drive: { kind: 'stay' } }],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2000,
      firstDelayMs: 500,
      aim: 'nearest',
      range: 1.6,
      damage: 16,
      knockback: 1.5,
      fireSfx: 'whoosh',
      color: 0x7e57c2,
      windup: { ms: 300, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'disc', radius: 1.5, at: 'self' },
    },
  ],
} satisfies EnemyDef

export default STANDER
