import type { EnemyDef } from '../../../src/types/enemies'

const GARGOYLE = {
  kind: 'gargoyle',
  drive: { kind: 'chase' },
  emoji: '1f5ff',
  name: '石像鬼',
  desc: '沉重的石像守卫，血厚、免疫击退；血掉到四成时石化两秒半——刀枪不入、原地回血三成半，要么一口气打穿它，要么等它醒来再打',
  size: 1.6,
  radius: 0.62,
  span: [0, 3],
  hp: 130,
  stats: { armor: 6 },
  speed: 0.85,
  damage: 12,
  xp: 8,
  coins: 6,
  traits: ['anchored'],
  reactions: [{ on: 'lowHp', ratio: 0.4, to: 'self', effects: [{ kind: 'stasis', durationMs: 2500 }, { kind: 'healRatio', ratio: 0.35 }] }],
} satisfies EnemyDef

export default GARGOYLE
