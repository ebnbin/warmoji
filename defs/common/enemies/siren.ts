import type { EnemyDef } from '../../../src/types/enemies'

const SIREN = {
  kind: 'siren',
  drive: { kind: 'standoff', detectRange: 8, standoffDist: 5 },
  emoji: '1f441',
  name: '迷魂眼',
  desc: '远远地盯着队伍放出迷魂光，被光球打中的队员被魅惑，不由自主地朝它走去',
  size: 1.3,
  radius: 0.48,
  span: [1, 2],
  hp: 50,
  speed: 1.6,
  damage: 5,
  xp: 6,
  coins: 4,
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3400,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 8,
      shape: { kind: 'bolt', projectile: { look: { emoji: '1f7e3', size: 0.45, rotationOffsetDeg: 0 }, radius: 0.16, speed: 5 }, lifeMs: 3000 },
      onHit: [{ kind: 'charm', durationMs: 1200 }],
    },
  ],
} satisfies EnemyDef

export default SIREN
