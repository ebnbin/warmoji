import type { EnemyDef } from '../../../../legacy/types/enemies'
import { zoneLook } from '../../../kit.ts'

const NAUSEOUS = {
  kind: 'nauseous',
  emoji: '1f922',
  name: '恶心菌',
  element: 'poison',
  desc: '本身是毒，不会中毒：慢吞吞地挪，身边始终罩着一团 1.8 格的毒气，待在气里每半秒挨一下、加一层毒，中着毒什么回复都不管用；毒气遇火爆燃',
  size: 1.35,
  radius: 0.5,
  hp: 80,
  speed: 1.3,
  damage: 10,
  xp: 3,
  coins: 2,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 0,
      aim: 'self',
      damage: 4,
      // 跟着身体的场每条能力只放得出一次，时长须为 0 常驻
      shape: { kind: 'zone', radius: 1.8, durationMs: 0, tickMs: 500, follow: true, visual: zoneLook(0xaed581) },
    },
  ],
} satisfies EnemyDef

export default NAUSEOUS
