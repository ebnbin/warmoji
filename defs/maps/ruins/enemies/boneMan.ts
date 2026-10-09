import type { EnemyDef } from '../../../../legacy/types/enemies'

const BONE_MAN = {
  kind: 'boneMan',
  emoji: '1f480',
  name: '骷髅兵',
  desc: '从墓碑底下爬出来的骷髅兵，骨头一碰就散，摇摇晃晃地追着人打',
  size: 1.1,
  radius: 0.42,
  hp: 24,
  speed: 1.6,
  damage: 7,
  xp: 1,
  coins: 0,
  drive: { kind: 'chase' },
} satisfies EnemyDef

export default BONE_MAN
