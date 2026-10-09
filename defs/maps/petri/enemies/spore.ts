import type { EnemyDef } from '../../../../legacy/types/enemies'

const SPORE = {
  kind: 'spore',
  emoji: '1f7e2',
  name: '孢子',
  desc: '霉菌和超级细菌放出来的孢子，又小又矮，贴着琼脂滚过来，碰到人就让人中毒',
  size: 0.6,
  radius: 0.22,
  span: [0, 0],
  hp: 14,
  speed: 1.8,
  damage: 8,
  xp: 0,
  coins: 0,
  drive: { kind: 'chase' },
  reactions: [{ on: 'touch', to: 'other', effects: [{ kind: 'poison', damage: 2, tickMs: 500, durationMs: 2000 }] }],
} satisfies EnemyDef

export default SPORE
