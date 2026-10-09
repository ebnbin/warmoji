import type { EnemyDef } from '../../../../legacy/types/enemies'

const MOAI = {
  kind: 'moai',
  emoji: '1f5ff',
  name: '石像',
  desc: '立在院子里一动不动的石像，推不动，远远盯着人瞪出一道目光；有人走进 5 格它就醒过来慢慢追，人走远了又立住不动；跺一脚震晕身边的人',
  size: 1.7,
  radius: 0.6,
  hp: 200,
  stats: { armor: 10 },
  speed: 0.8,
  damage: 9,
  xp: 8,
  coins: 6,
  traits: ['anchored'],
  drive: { kind: 'stay' },
  drives: [{ if: { kind: 'within', who: 'target', radius: 5 }, drive: { kind: 'chase' } }],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3000,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 2.2,
      damage: 14,
      fireSfx: 'thud',
      color: 0xa1887f,
      windup: { ms: 450, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'disc', radius: 2, at: 'self' },
      onHit: [{ kind: 'stun', durationMs: 500 }],
    },
    {
      trigger: 'auto',
      cooldownMs: 4000,
      firstDelayMs: 2000,
      aim: 'nearest',
      range: 6,
      damage: 12,
      fireSfx: 'zap',
      color: 0xffcc80,
      windup: { ms: 500, lockAt: 'end', telegraph: 'blink' },
      shape: { kind: 'segment', reach: 6, radius: 0.4, ms: 220, beam: true },
    },
  ],
} satisfies EnemyDef

export default MOAI
