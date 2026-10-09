import type { EnemyDef } from '../../../../legacy/types/enemies'

const CRACK_GRIN = {
  kind: 'crackGrin',
  emoji: '1f62c',
  name: '冰缝怪',
  element: 'water',
  desc: '从新冰缝里冒出来的冰缝怪，不怕冰水、在海里照样游；咬住一名队员就拖着往后退 1.5 秒，被拖着的动弹不得',
  size: 1.2,
  radius: 0.46,
  hp: 140,
  speed: 1.4,
  damage: 9,
  xp: 7,
  coins: 5,
  traits: ['swims', 'coldproof'],
  drive: { kind: 'chase' },
  drives: [{ if: { kind: 'all', of: [{ kind: 'marked', who: 'target', mark: 'stun' }, { kind: 'within', who: 'target', radius: 1 }] }, drive: { kind: 'flee', range: 6 } }],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 6000,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 1.6,
      damage: 12,
      fireSfx: 'gulp',
      windup: { ms: 400, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'segment', reach: 1.5, radius: 0.45, ms: 200 },
      onHit: [{ kind: 'drag', ms: 1500 }],
    },
  ],
} satisfies EnemyDef

export default CRACK_GRIN
