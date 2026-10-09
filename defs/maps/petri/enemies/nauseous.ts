import type { EnemyDef } from '../../../../legacy/types/enemies'
import { zoneLook } from '../../../kit.ts'

const NAUSEOUS = {
  kind: 'nauseous',
  emoji: '1f922',
  name: '恶心菌',
  element: 'wood',
  desc: '慢吞吞地挪，身边始终罩着一团 1.8 格的恶心气：待在气里每半秒挨一下并中毒，出来了还要再难受 3 秒',
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
      onHit: [{ kind: 'poison', damage: 3, tickMs: 1000, durationMs: 3000 }],
    },
  ],
} satisfies EnemyDef

export default NAUSEOUS
