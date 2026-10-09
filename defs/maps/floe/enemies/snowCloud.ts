import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const SNOW_CLOUD = {
  kind: 'snowCloud',
  emoji: '1f328',
  name: '雪云精',
  element: 'ice',
  desc: '飘在高处的雪云精，看见九格内有人就隔着四格悬着；隔一阵往两名队员头上落雪团，落点结一片 3 秒的光冰，踩上去站不稳',
  size: 1.6,
  radius: 0.55,
  span: [2, 3],
  hp: 60,
  speed: 1,
  damage: 0,
  xp: 3,
  coins: 2,
  drive: { kind: 'standoff', standoffDist: 4 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3800,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 8,
      damage: 10,
      fireSfx: 'flutter',
      shape: { kind: 'drop', targets: 2, look: { emoji: '26aa', size: 0.8 }, fromAbove: 4, dropMs: 700, staggerMs: 300 },
      onHit: [{ kind: 'ground', def: { ...patch(1.2, 3000, 0xe1f5fe), traction: 0.3 } }],
    },
  ],
} satisfies EnemyDef

export default SNOW_CLOUD
