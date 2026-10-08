import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🐲 晶龙崽：一次两爪地挠，鳞片在出手时结成护盾，第三下换成一口晶息；技能朝摇杆方向吐出一道晶石吐息
const wyrmClaw = {
  trigger: 'auto',
  cooldownMs: 900,
  aim: 'nearest',
  range: 1.9,
  damage: 13,
  fireSfx: 'whoosh',
  shape: { kind: 'segment', reach: 1.8, radius: 0.6, ms: 140 },
  repeat: { count: 2, delayMs: 150 },
} satisfies AbilityDef

const SCALES = [{ on: 'fire', to: 'self', effects: [{ kind: 'shield', amount: 0, ratio: 0.03, ms: 2000 }] }] as const

const wyrmClaw2 = { ...wyrmClaw, reactions: SCALES } satisfies AbilityDef

const wyrmBreath = {
  trigger: 'auto',
  cooldownMs: 900,
  aim: 'nearest',
  range: 3,
  damage: 22,
  fireSfx: 'gust',
  color: 0xb39ddb,
  shape: { kind: 'sector', radius: 3, arcDeg: 60, ms: 220 },
  onHit: [{ kind: 'root', durationMs: 600 }],
  reactions: SCALES,
} satisfies AbilityDef

const wyrmClaw3 = { ...wyrmClaw2, cycle: [wyrmClaw2, wyrmBreath] } satisfies AbilityDef

const wyrmBlast = {
  trigger: 'manual',
  aim: 'stick',
  damage: 40,
  knockback: 2,
  fireSfx: 'shatter',
  color: 0xb39ddb,
  shape: { kind: 'segment', reach: 6, radius: 0.8, ms: 260, beam: true },
  onHit: [{ kind: 'root', durationMs: 1000 }],
} satisfies AbilityDef

export const abilities = { wyrmClaw, wyrmClaw2, wyrmClaw3, wyrmBlast } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 20 }, mul: { damage: 1.2 } }, { add: { maxHp: 45, armor: 2 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f432',
  name: '晶龙崽',
  element: 'earth',
  desc: '刚从晶蛋里破壳的小龙：一次两爪地挠，鳞片越打越硬；朝一个方向吐出晶石吐息，把一排敌人钉在原地',
  role: 'bruiser',
  tags: ['damage', 'melee'],
  body: { drag: 4.8, mass: 1.3 },
  stats: { moveSpeed: 5.4, maxStamina: 120, staminaRegen: 60, exertion: 1 },
  skill: { name: '晶石吐息', icon: '1f32c', desc: '朝摇杆方向吐出一道 6 格长的晶石吐息，打中的挨 40 点、被推开并定身 1 秒', cdMs: 10_000, ability: 'wyrmBlast', aim: true },
  weapons: [],
  innate: [
    {
      name: '晶爪',
      icon: '1f432',
      base: 'wyrmClaw',
      upgrades: [
        { ability: 'wyrmClaw2', card: { icon: '1f48e', name: '晶鳞', desc: '每次出手给自己挂一层生命 3% 的护盾 2 秒' } },
        { ability: 'wyrmClaw3', card: { icon: '1f409', name: '龙息', desc: '每第三下改成一口 3 格、60 度的晶息，打中的挨 22 点并定身 0.6 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
