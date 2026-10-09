import type { EnemyDef } from '../../../../legacy/types/enemies'

const SPORE = {
  kind: 'spore',
  emoji: '1f7e2',
  name: '孢子',
  element: 'poison',
  desc: '霉菌和超级细菌放出来的孢子，本身是毒：又小又矮，贴着琼脂滚过来，碰到人就让人中一层毒，一群滚过来毒叠得飞快',
  size: 0.6,
  radius: 0.22,
  span: [0, 0],
  hp: 14,
  speed: 1.8,
  damage: 6,
  xp: 0,
  coins: 0,
  drive: { kind: 'chase' },
} satisfies EnemyDef

export default SPORE
