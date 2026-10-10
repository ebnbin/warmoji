import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 👮 警卫：两下警棍接一记重砸，砸得开人、砸得动残墙，砸中的定在原地，同一个敌人挨满四下警棍就被铐住；技能举着防暴盾冲锋，撞晕一路的敌人，正面来的都挡下
const officerJab = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  range: 1.8,
  damage: 14,
  fireSfx: 'thud',
  shape: { kind: 'segment', reach: 1.7, radius: 0.45, ms: 140 },
  // 叠层按效果对象分开计数，两下警棍得出自同一式才叠得到一起，所以用重复而不拆成轮流的两式
  repeat: { count: 2, delayMs: 300, reaim: 'nearest' },
} satisfies AbilityDef

const officerSlam = {
  trigger: 'auto',
  cooldownMs: 1050,
  aim: 'nearest',
  range: 2.1,
  damage: 22,
  knockback: 3.5,
  breach: 0.4,
  fireSfx: 'thud',
  shape: { kind: 'sector', radius: 2, arcDeg: 140, ms: 200 },
} satisfies AbilityDef

const officerBaton = { ...officerJab, cycle: [officerSlam] } satisfies AbilityDef

const officerSlam2 = { ...officerSlam, onHit: [{ kind: 'root', durationMs: 1000 }] } satisfies AbilityDef

const officerBaton2 = { ...officerJab, cycle: [officerSlam2] } satisfies AbilityDef

const officerBaton3 = {
  ...officerJab,
  onHit: [{ kind: 'stack', max: 4, durationMs: 4000, then: [{ kind: 'stun', durationMs: 1200 }] }],
  cycle: [officerSlam2],
} satisfies AbilityDef

const officerCharge = {
  trigger: 'manual',
  aim: 'stick',
  damage: 34,
  knockback: 4,
  breach: 1.5,
  fireSfx: 'whoosh',
  color: 0x42a5f5,
  shape: { kind: 'sprint', distance: 5, ms: 420, radius: 1 },
  onHit: [{ kind: 'stun', durationMs: 800 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'frontGuard', arcDeg: 120, durationMs: 2500 }] }],
} satisfies AbilityDef

export const abilities = { officerBaton, officerBaton2, officerBaton3, officerCharge } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 20, armor: 1 }, mul: { damage: 1.2 } }, { add: { maxHp: 45, armor: 2 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f46e',
  name: '警卫',
  desc: '训练有素的警卫：两下警棍接一记重砸，砸得开人、砸得动残墙，把闹事的按住铐走；技能举着防暴盾冲锋，撞晕一路的敌人，冲完还举着盾挡正面；绕到背后打、或者燃烧中毒这类持续伤害，盾挡不住',
  role: 'bruiser',
  tags: ['damage', 'control', 'melee'],
  body: { drag: 5, mass: 1.3 },
  stats: { moveSpeed: 5.8, maxStamina: 130, staminaRegen: 65, exertion: 0.95 },
  skill: {
    name: '冲锋',
    icon: '1f6a8',
    desc: '举起防暴盾朝摇杆方向冲出 5 格，沿路撞开敌人并眩晕 0.8 秒，挡路的矮墙一并撞开；起冲后 2.5 秒内挡下正面 120 度内来的命中',
    cdMs: 9_000,
    ability: 'officerCharge',
    aim: true,
  },
  weapons: [],
  innate: [
    {
      name: '警棍连击',
      icon: '1f46e',
      base: 'officerBaton',
      upgrades: [
        { ability: 'officerBaton2', card: { icon: '26d3', name: '制服', desc: '重砸打中的敌人定身 1 秒' } },
        { ability: 'officerBaton3', card: { icon: '1f517', name: '手铐', desc: '警棍每打中一下叠一层，同一个敌人叠满 4 层眩晕 1.2 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
