import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, shot } from '../../../kit.ts'

// 🐰 玉兔：捣药给最伤的队友回血，再扔月饼砸敌人，两样轮着来；技能给全队挂护盾，并在脚下铺开广寒宫
const POUND = { side: 'allies', radius: 4.5, filter: { kind: 'hpBelow', who: 'target', ratio: 1 }, sort: 'weakest', count: 1 } as const

const rabbitPound = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'self',
  shape: { kind: 'world' },
  onHit: [{ kind: 'to', who: POUND, then: [{ kind: 'heal', amount: 11 }] }],
} satisfies AbilityDef

const cakeShot = {
  trigger: 'manual',
  class: 'attack',
  aim: 'nearest',
  range: 6.5,
  damage: 10,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: shot('1f96e', 9, 0.45), lifeMs: 1200 },
} satisfies AbilityDef

const rabbitCake = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'self',
  shape: { kind: 'world' },
  onHit: [{ kind: 'cast', ability: cakeShot }],
} satisfies AbilityDef

const rabbitDance = { ...rabbitPound, cycle: [rabbitCake] } satisfies AbilityDef

const rabbitPound2 = {
  ...rabbitPound,
  onHit: [{ kind: 'to', who: POUND, then: [{ kind: 'heal', amount: 11 }, { kind: 'mend', amount: 3, tickMs: 500, durationMs: 3000 }] }],
} satisfies AbilityDef
const rabbitDance2 = { ...rabbitPound2, cycle: [rabbitCake] } satisfies AbilityDef

const cakeShot3 = {
  ...cakeShot,
  shape: { ...cakeShot.shape, projectile: { ...cakeShot.shape.projectile, split: { count: 3, spreadDeg: 60, ratio: 0.5 } } },
} satisfies AbilityDef
const rabbitCake3 = { ...rabbitCake, onHit: [{ kind: 'cast', ability: cakeShot3 }] } satisfies AbilityDef
const rabbitDance3 = { ...rabbitPound2, cycle: [rabbitCake3] } satisfies AbilityDef

const rabbitPalace = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  color: 0xfff9c4,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies' },
  onHit: [
    { kind: 'shield', amount: 0, ratio: 0.15, ms: 4000 },
    { kind: 'ground', def: { ...patch(4, 6000, 0xfff9c4, [{ kind: 'heal', amount: 4 }], 0, 500), who: 'allies' } },
  ],
} satisfies AbilityDef

export const abilities = { rabbitDance, rabbitDance2, rabbitDance3, rabbitPalace } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { healing: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { healing: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f430',
  name: '玉兔',
  desc: '从月亮上下来过中秋的玉兔：捣药给 4.5 格内最伤的队友回 11 点血，再朝 6.5 格内最近的敌人扔月饼，两样轮着来，轮到的那样没有对象就空过一次；技能给全队挂上护盾，并在脚下铺开一片回血的广寒宫',
  role: 'support',
  tags: ['support', 'ranged'],
  body: { drag: 4.5, mass: 0.6 },
  stats: { moveSpeed: 6.2, maxStamina: 90, staminaRegen: 85, exertion: 0.8 },
  skill: {
    name: '广寒宫',
    icon: '1f3ef',
    desc: '全队挂上生命 15% 的护盾 4 秒；脚下铺开 4 格的广寒宫 6 秒，站在里面的队友每半秒回 4 点血',
    cdMs: 15_000,
    ability: 'rabbitPalace',
  },
  weapons: [],
  innate: [
    {
      name: '捣药与月饼',
      icon: '1f96e',
      base: 'rabbitDance',
      upgrades: [
        { ability: 'rabbitDance2', card: { icon: '1f315', name: '月华', desc: '捣药治的那名队友还挂上回春：3 秒里每半秒回 3 点' } },
        { ability: 'rabbitDance3', card: { icon: '1f52a', name: '掰月饼', desc: '月饼砸中敌人或飞到头时裂成三块继续飞，每块打五成伤害' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
