import type { AbilityDef, Effect } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, shot } from '../../../kit.ts'

// 🦹 幕后主使：冷冷一瞥让敌人迈不开腿，盯满三下就冻住，和在脚边丢惊喜盒轮着来；技能在敌群里挑起内讧
const glare = (then: readonly Effect[]) =>
  ({
    trigger: 'auto',
    cooldownMs: 900,
    aim: 'nearest',
    range: 7,
    damage: 13,
    fireSfx: 'shoot',
    shape: { kind: 'bolt', projectile: shot('265f', 9, 0.42), lifeMs: 1100 },
    onHit: [{ kind: 'slow', factor: 0.75, durationMs: 1000 }, { kind: 'stack', max: 3, durationMs: 3000, then }],
  }) satisfies AbilityDef

const box = (effects: readonly Effect[]) =>
  ({
    trigger: 'auto',
    cooldownMs: 600,
    aim: 'self',
    fireSfx: 'recruit',
    shape: { kind: 'world' },
    onHit: [{ kind: 'ground', def: { ...patch(1, 9000, 0xff80ab, effects, 20, 0), trap: true } }],
  }) satisfies AbilityDef

const scheme = (then: readonly Effect[], effects: readonly Effect[]) => ({ ...glare(then), cycle: [box(effects)] }) satisfies AbilityDef

const FREEZE = { kind: 'status', status: 'frozen', ms: 1000 } as const
const FEAR = { kind: 'fear', durationMs: 1500 } as const
const LAUGHING_GAS = { kind: 'ground', def: patch(1.8, 2500, 0xce93d8, [{ kind: 'berserk', durationMs: 700 }], 0, 500) } as const

const mastermindGlare = scheme([FREEZE], [FEAR])

const mastermindGlare2 = scheme([FREEZE], [FEAR, LAUGHING_GAS])

const mastermindGlare3 = scheme([FREEZE, { kind: 'berserk', durationMs: FREEZE.ms + 1500 }], [FEAR, LAUGHING_GAS])

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
  desc: '从不露面的幕后主使，把敌人当棋子摆弄：冷冷一瞥让敌人减速 25% 1 秒，盯满 3 下就冻住 1 秒，和在脚边丢惊喜盒轮着来：惊喜盒留在原地 9 秒，敌人踩上才弹开，1 格内的敌人吓得逃开 1.5 秒；技能在敌群里挑起内讧',
  role: 'controller',
  tags: ['control', 'ranged', 'area'],
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
        { ability: 'mastermindGlare2', card: { icon: '1f606', name: '笑气', desc: '惊喜盒弹开后留下一团 1.8 格的笑气 2.5 秒，待在里面的敌人倒戈' } },
        { ability: 'mastermindGlare3', card: { icon: '1f5e3', name: '挑拨', desc: '叠满 3 下冻住的敌人，解冻后再倒戈 1.5 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
