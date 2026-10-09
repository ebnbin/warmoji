import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 🧘 僧人：诵经让身边受伤的队友慢慢回血，念珠打敌人，两样轮着来；技能敲响金钟，震散全队身上的火、毒、寒气与湿，先无敌再减伤
const HURT = { side: 'allies', radius: 4, filter: { kind: 'hpBelow', who: 'target', ratio: 1 } } as const
const NEAR = { side: 'allies', radius: 4 } as const
const MEND = { kind: 'mend', amount: 3, tickMs: 500, durationMs: 3000 } as const
const CALM = { kind: 'to', who: NEAR, then: [{ kind: 'cleanse' }] } as const

// 轮流出手只在这一式真放出去后才换下一式，所以诵经与念珠都用 world 起手：没人受伤、身边没敌人也照样轮转
const chant = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'self',
  shape: { kind: 'world' },
  onHit: [{ kind: 'to', who: HURT, then: [MEND] }],
} satisfies AbilityDef

// 先净化再回春：解了毒，这一轮的回血才回得上
const chant2 = { ...chant, onHit: [CALM, ...chant.onHit] } satisfies AbilityDef

const chant3 = { ...chant, onHit: [CALM, { kind: 'to', who: HURT, then: [MEND, { kind: 'shield', amount: 0, ratio: 0.06, ms: 3000 }] }] } satisfies AbilityDef

const beadThrow = {
  trigger: 'manual',
  class: 'attack',
  aim: 'nearest',
  range: 6.5,
  damage: 10,
  knockback: 1,
  fireSfx: 'tink',
  shape: { kind: 'bolt', projectile: shot('1f4ff', 9, 0.45), lifeMs: 1300 },
  repeat: { count: 2, spreadDeg: 14 },
} satisfies AbilityDef

const beads = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'self',
  shape: { kind: 'world' },
  onHit: [{ kind: 'cast', ability: beadThrow }],
} satisfies AbilityDef

const monkPrayer = { ...chant, cycle: [beads] } satisfies AbilityDef
const monkPrayer2 = { ...chant2, cycle: [beads] } satisfies AbilityDef
const monkPrayer3 = { ...chant3, cycle: [beads] } satisfies AbilityDef

const monkBell = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'clank',
  color: 0xffd54f,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies' },
  onHit: [
    { kind: 'cleanse' },
    { kind: 'invuln', ms: 1500 },
    { kind: 'guard', mul: 0.6, durationMs: 5500 },
  ],
} satisfies AbilityDef

export const abilities = { monkPrayer, monkPrayer2, monkPrayer3, monkBell } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { healing: 1.2 } }, { add: { maxHp: 20 }, mul: { healing: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d8',
  name: '僧人',
  desc: '寺里的僧人：诵经让 4 格内受伤的队友 3 秒里每半秒回 3 点血，中了毒的回不上；弹出两颗念珠打 6.5 格内最近的敌人，打得敌人一退，冻住的一打就碎；两样轮着来，附近没敌人时这一轮念珠落空、诵经照常；自己没护甲，靠金钟保全队：技能敲响金钟，震散全队身上的燃烧、中毒、寒冷与湿，冻住的也敲醒，先无敌一阵再减伤',
  role: 'support',
  tags: ['support', 'ranged'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5.4, maxStamina: 110, staminaRegen: 80, exertion: 0.8 },
  skill: { name: '金钟罩', icon: '1f514', desc: '解除全队身上的控制、减速、燃烧、中毒、寒冷与湿；全队无敌 1.5 秒，之后 4 秒受到的伤害 ×0.6', cdMs: 18_000, ability: 'monkBell' },
  weapons: [],
  innate: [
    {
      name: '诵经与念珠',
      icon: '1f4ff',
      base: 'monkPrayer',
      upgrades: [
        { ability: 'monkPrayer2', card: { icon: '1f375', name: '静心', desc: '诵经时先解除 4 格内队友身上的控制、减速、燃烧、中毒、寒冷与湿，再给受伤的回血' } },
        { ability: 'monkPrayer3', card: { icon: '1fab7', name: '金身', desc: '诵经回血的队友再挂一层生命 6% 的护盾 3 秒，中了毒也挡得住伤害' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
