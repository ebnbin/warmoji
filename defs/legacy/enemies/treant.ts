import type { EnemyDef } from '../../../src/types/enemies'
import SAPLING from './sapling.ts'

const FOREST_BOSS = {
  kind: 'treant',
  role: 'boss',
  emoji: '1f577',
  name: '蛛后',
  desc: '一路产下六秒后结成蛛网的蛛卵，瞬移到离你最近的蛛网旁把周围的人缠住，毒液扇幕封走位；击退免疫',
  size: 3.4,
  radius: 1.1,
  span: [0, 6],
  hp: 4875,
  stats: { armor: 5, exertion: 0 },
  speed: 1.0,
  damage: 20,
  xp: 60,
  coins: 60,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3200,
      firstDelayMs: 2000,
      aim: 'nearest',
      damage: 8,
      shape: { kind: 'bolt', projectile: { look: { emoji: '1f7e2', size: 0.42, rotationOffsetDeg: 0 }, radius: 0.15, speed: 2.4 }, lifeMs: 6000 },
      repeat: { count: 7, spreadDeg: 160 },
    },
    {
      trigger: 'auto',
      class: 'skill',
      cooldownMs: 7000,
      firstDelayMs: 2500,
      aim: 'self',
      fireSfx: 'recruit',
      shape: { kind: 'world' },
      onHit: [{ kind: 'summon', of: { unit: SAPLING, spread: 5 }, count: 3 }],
    },
    {
      trigger: 'auto',
      class: 'skill',
      cooldownMs: 9000,
      firstDelayMs: 9000,
      aim: 'self',
      windup: { ms: 600, lockAt: 'start', telegraph: 'blink' },
      fireSfx: 'whoosh',
      shape: { kind: 'world' },
      onHit: [{ kind: 'teleport', of: 'tree', then: [{ kind: 'to', who: { side: 'foes', radius: 2.8 }, then: [{ kind: 'root', durationMs: 1400 }, { kind: 'damage', amount: 14 }] }] }],
    },
  ],
} satisfies EnemyDef

export default FOREST_BOSS
