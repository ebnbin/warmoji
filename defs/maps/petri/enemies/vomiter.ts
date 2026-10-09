import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

// 扇形的命中效果落在吐的人脚下，黏液得吐完再接这一下以目标为心的才落到人脚下
const splat = {
  trigger: 'manual',
  aim: 'nearest',
  range: 3.5,
  shape: { kind: 'disc', radius: 1.5, at: 'target' },
  onHit: [{ kind: 'ground', def: patch(1.5, 4000, 0xc5e1a5, [{ kind: 'slow', factor: 0.5, durationMs: 600 }]) }],
} satisfies AbilityDef

const VOMITER = {
  kind: 'vomiter',
  emoji: '1f92e',
  name: '呕吐菌',
  desc: '慢吞吞地挪，憋一下朝身前吐一大口，吐中的挨一下；吐完最近那人的脚下摊开一滩 1.5 格的黏液，4 秒内踩上去的人走得慢一半',
  size: 1.45,
  radius: 0.54,
  hp: 150,
  speed: 1.2,
  damage: 11,
  xp: 6,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3600,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 3,
      damage: 14,
      fireSfx: 'gurgle',
      windup: { ms: 500, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sector', radius: 3, arcDeg: 70, ms: 220 },
      combo: [splat],
    },
  ],
} satisfies EnemyDef

export default VOMITER
