import type { EnemyDef } from '../../../../legacy/types/enemies'

const BONE_MAN = {
  kind: 'boneMan',
  emoji: '1f480',
  name: '骷髅兵',
  desc: '从墓碑底下爬出来的骷髅兵，摇摇晃晃地追着人打；头一回被打倒时不死，散成一地骨头晕 2 秒，再拼回四成生命爬起来；中了毒就拼不回血，只剩 1 点',
  size: 1.1,
  radius: 0.42,
  hp: 20,
  speed: 1.6,
  damage: 7,
  xp: 1,
  coins: 0,
  drive: { kind: 'chase' },
  reactions: [{ on: 'lethal', to: 'self', effects: [{ kind: 'stun', durationMs: 2000 }, { kind: 'healRatio', ratio: 0.4 }] }],
} satisfies EnemyDef

export default BONE_MAN
