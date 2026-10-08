import type { EnemyDef } from '../../../../src/types/enemies'

const TENGU = {
  kind: 'tengu',
  emoji: '1f47a',
  name: '天狗',
  element: 'wood',
  desc: '从樱林飞出来的天狗，在半空里扇羽扇，把面前的人吹开 3 格，一不小心就被吹进溪里；隔一阵闪到人背后俯冲啄一口',
  size: 1.35,
  radius: 0.5,
  span: [2, 3],
  hp: 56,
  speed: 1.8,
  damage: 6,
  xp: 5,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3000,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 3,
      damage: 7,
      fireSfx: 'wash',
      color: 0x81c784,
      windup: { ms: 400, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'sector', radius: 3, arcDeg: 90, ms: 220 },
      onHit: [{ kind: 'shove', distance: 3, ms: 350 }],
    },
    {
      trigger: 'auto',
      cooldownMs: 5000,
      firstDelayMs: 2500,
      aim: 'nearest',
      range: 6,
      damage: 12,
      fireSfx: 'whoosh',
      windup: { ms: 400, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'blink', behindDist: 0.5, strikeMs: 250 },
    },
  ],
} satisfies EnemyDef

export default TENGU
