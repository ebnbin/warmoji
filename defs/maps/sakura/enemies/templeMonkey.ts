import type { EnemyDef } from '../../../../legacy/types/enemies'
import { shot } from '../../../kit.ts'

const TEMPLE_MONKEY = {
  kind: 'templeMonkey',
  emoji: '1f435',
  name: '寺猴',
  desc: '寺院里的猴子，身手灵活：绕着人保持三四格远，抛桃核砸人，冻住的一砸就碎；单体的出手三成被它躲开，范围的出手和身上的燃烧、中毒躲不开',
  size: 1.15,
  radius: 0.42,
  hp: 40,
  stats: { dodge: 0.3 },
  speed: 2.4,
  damage: 6,
  xp: 3,
  coins: 2,
  drive: { kind: 'standoff', standoffDist: 3.5 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2200,
      firstDelayMs: 900,
      aim: 'nearest',
      range: 5.5,
      damage: 8,
      fireSfx: 'whoosh',
      shape: { kind: 'bolt', projectile: { ...shot('1f351', 7, 0.45), flight: { kind: 'arc', peakM: 1.3 } }, lifeMs: 1200 },
    },
  ],
} satisfies EnemyDef

export default TEMPLE_MONKEY
