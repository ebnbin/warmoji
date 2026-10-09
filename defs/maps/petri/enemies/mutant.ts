import type { EnemyDef } from '../../../../legacy/types/enemies'

const MUTANT = {
  kind: 'mutant',
  emoji: '1f9ec',
  name: '突变体',
  desc: '本身没有元素，追着人抓挠；每挨一下，火、水、雷、冰各有一成几率突变成那种元素 6 秒，免疫跟着变，抓人也带上它',
  size: 1.4,
  radius: 0.52,
  hp: 160,
  speed: 1.4,
  damage: 13,
  xp: 7,
  coins: 5,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2000,
      firstDelayMs: 600,
      aim: 'nearest',
      range: 2,
      damage: 17,
      fireSfx: 'whoosh',
      windup: { ms: 300, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'sector', radius: 2, arcDeg: 100, ms: 180 },
    },
  ],
  reactions: [
    { on: 'hurt', to: 'self', chance: 0.1, effects: [{ kind: 'attune', element: 'fire', ms: 6000 }] },
    { on: 'hurt', to: 'self', chance: 0.1, effects: [{ kind: 'attune', element: 'water', ms: 6000 }] },
    { on: 'hurt', to: 'self', chance: 0.1, effects: [{ kind: 'attune', element: 'thunder', ms: 6000 }] },
    { on: 'hurt', to: 'self', chance: 0.1, effects: [{ kind: 'attune', element: 'ice', ms: 6000 }] },
  ],
} satisfies EnemyDef

export default MUTANT
