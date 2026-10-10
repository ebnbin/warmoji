import type { EnemyDef } from '../../../../legacy/types/enemies'

const MOUTHLESS = {
  kind: 'mouthless',
  emoji: '1f636',
  name: '无嘴影',
  desc: '没有嘴的影子：出现 1.2 秒就潜进暗处，队伍瞄不到它；闪到人身后狠推一把又闪回原处，打中的被推出队形、1 秒放不了技能，出手就现形，1.2 秒没再出手又潜回去；显了形就好打，范围的照样打得着暗处的它',
  size: 1.25,
  radius: 0.46,
  hp: 100,
  speed: 1.7,
  damage: 10,
  xp: 6,
  coins: 4,
  drive: { kind: 'chase' },
  reactions: [{ on: 'idle', ms: 1200, to: 'self', effects: [{ kind: 'stealth' }] }],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3500,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 5,
      damage: 20,
      knockback: 2,
      fireSfx: 'whoosh',
      shape: { kind: 'blink', behindDist: 0.5, strikeMs: 250 },
      onHit: [{ kind: 'silence', durationMs: 1000 }],
    },
  ],
} satisfies EnemyDef

export default MOUTHLESS
