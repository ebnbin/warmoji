import type { EnemyDef } from '../../../../src/types/enemies'

const CURSED_DOLL = {
  kind: 'cursedDoll',
  emoji: '1f38e',
  name: '诅咒人偶',
  element: 'dark',
  desc: '从寺墙后面挪出来的诅咒人偶，走得很慢：隔一阵对 6 格内最近的人下咒，中咒的 4 秒内挨打更疼、2 秒内走不快；它每挨一下，2.5 格内离它最近的人也跟着疼一下；被打碎时把身边 3 格内的人都咒一遍',
  size: 1.2,
  radius: 0.44,
  hp: 62,
  speed: 0.8,
  damage: 6,
  xp: 5,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4500,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 6,
      fireSfx: 'creak',
      color: 0x7e57c2,
      windup: { ms: 600, lockAt: 'end', telegraph: 'blink' },
      shape: { kind: 'disc', radius: 0.8, at: 'target' },
      onHit: [
        { kind: 'status', status: 'exposed', ms: 4000, value: 1.25 },
        { kind: 'slow', factor: 0.75, durationMs: 2000 },
      ],
    },
  ],
  reactions: [
    { on: 'hurt', to: 'self', effects: [{ kind: 'to', who: { side: 'foes', radius: 2.5, sort: 'nearest', count: 1 }, then: [{ kind: 'damage', amount: 4 }] }] },
    { on: 'death', to: 'spot', effects: [{ kind: 'to', who: { side: 'foes', radius: 3 }, then: [{ kind: 'status', status: 'exposed', ms: 3000, value: 1.15 }] }] },
  ],
} satisfies EnemyDef

export default CURSED_DOLL
