import type { EnemyDef } from '../../../../legacy/types/enemies'

const SHARD = {
  kind: 'shard',
  emoji: '1f539',
  name: '碎晶',
  desc: '晶簇怪碎开的小晶块，贴着地面蹦过来扎人；个子矮，平射的子弹容易从它头上飞过去',
  size: 0.7,
  radius: 0.26,
  span: [0, 0],
  hp: 16,
  speed: 2.2,
  damage: 6,
  xp: 1,
  coins: 0,
  drive: { kind: 'chase' },
} satisfies EnemyDef

export default SHARD
