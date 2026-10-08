import type { AbilityDef, Effect } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🦹 幕后主使：冷冷一瞥让敌人迈不开腿，同一个敌人盯满三下就冻住，再挑拨它倒戈；技能在敌群里挑起内讧
const glare = (slow: number, then: readonly Effect[]) =>
  ({
    trigger: 'auto',
    cooldownMs: 1000,
    aim: 'nearest',
    range: 7,
    damage: 11,
    fireSfx: 'shoot',
    shape: { kind: 'bolt', projectile: shot('265f', 9, 0.42), lifeMs: 1100 },
    onHit: [{ kind: 'slow', factor: slow, durationMs: 1000 }, { kind: 'stack', max: 3, durationMs: 3000, then }],
  }) satisfies AbilityDef

const FREEZE = { kind: 'status', status: 'frozen', ms: 1000 } as const

const mastermindGlare = glare(0.75, [FREEZE])

const mastermindGlare2 = glare(0.6, [FREEZE])

const mastermindGlare3 = glare(0.6, [FREEZE, { kind: 'berserk', durationMs: FREEZE.ms + 1500 }])

const mastermindPlot = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  fireSfx: 'warp',
  color: 0xb39ddb,
  shape: { kind: 'disc', radius: 4, at: 'target' },
  onHit: [{ kind: 'berserk', durationMs: 3000 }, { kind: 'slow', factor: 0.7, durationMs: 3000 }],
} satisfies AbilityDef

export const abilities = { mastermindGlare, mastermindGlare2, mastermindGlare3, mastermindPlot } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.4, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9b9',
  name: '幕后主使',
  element: 'ice',
  desc: '从不露面的幕后主使，把敌人当棋子摆弄：冷冷一瞥让敌人迈不开腿，盯满三下就冻住；技能在敌群里挑起内讧',
  role: 'controller',
  tags: ['control', 'ranged'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5.4, maxStamina: 90, staminaRegen: 70, exertion: 0.9 },
  skill: { name: '幕后操纵', icon: '1f3ad', desc: '在最近的敌人那里挑起内讧：4 格内的敌人倒戈 3 秒、减速 30%', cdMs: 15_000, ability: 'mastermindPlot' },
  weapons: [],
  innate: [
    {
      name: '冷眼',
      icon: '1f9b9',
      base: 'mastermindGlare',
      upgrades: [
        { ability: 'mastermindGlare2', card: { icon: '1f976', name: '寒意', desc: '打中的敌人减速从 25% 加重到 40%' } },
        { ability: 'mastermindGlare3', card: { icon: '1f5e3', name: '挑拨', desc: '叠满三下冻住的敌人，解冻后再倒戈 1.5 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
