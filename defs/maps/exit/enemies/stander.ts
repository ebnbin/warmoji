import type { EnemyDef } from '../../../../legacy/types/enemies'

const STANDER = {
  kind: 'stander',
  emoji: '1f9cd',
  name: '站立者',
  element: 'ice',
  desc: '浑身冒着寒气，直挺挺地站着：有人走近到 4 格内它就一动不动，一离远就飞快地挪近；贴到 1.6 格内时抖上 0.5 秒，朝身边 1.5 格喷一圈寒气，挨着的冷一层，湿的当场冻住；抖的时候一打断就喷不出来；本身冻不住',
  size: 1.4,
  radius: 0.5,
  hp: 110,
  speed: 2.8,
  damage: 0,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  drives: [{ if: { kind: 'within', who: 'target', radius: 4 }, drive: { kind: 'stay' } }],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2400,
      firstDelayMs: 500,
      aim: 'nearest',
      range: 1.6,
      damage: 12,
      fireSfx: 'gust',
      color: 0x80deea,
      windup: { ms: 500, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'disc', radius: 1.5, at: 'self' },
    },
  ],
} satisfies EnemyDef

export default STANDER
