import type { EnemyDef } from '../../../../legacy/types/enemies'

const SAND_LOCUST = {
  kind: 'sandLocust',
  emoji: '1f997',
  name: '沙蝗',
  desc: '一蹦一蹦地扑过来，每一跳 2 格，落下时砸中脚边的人；身子脆，一打就散',
  size: 0.95,
  radius: 0.34,
  span: [0, 1],
  hp: 30,
  speed: 2.8,
  damage: 6,
  xp: 3,
  coins: 2,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 1500,
      firstDelayMs: 400,
      aim: 'nearest',
      range: 5,
      damage: 8,
      fireSfx: 'jump',
      shape: { kind: 'leap', distance: 2, ms: 320, height: 0.8, radius: 0.6 },
    },
  ],
} satisfies EnemyDef

export default SAND_LOCUST
