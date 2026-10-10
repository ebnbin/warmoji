import type { AbilityDef, Effect } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, shot } from '../../../kit.ts'

// 🦹 幕后主使：冷冷一瞥让敌人冷一层，盯满三下就冻住，和在脚边丢惊喜盒轮着来，盒子弹开那一下是实打实的，冻住的挨了就碎；技能在敌群里泼一盆冷水、挑起内讧
const glare = (onHit: readonly Effect[]) =>
  ({
    trigger: 'auto',
    cooldownMs: 900,
    aim: 'nearest',
    range: 7,
    damage: 10,
    fireSfx: 'shoot',
    shape: { kind: 'bolt', projectile: shot('265f', 9, 0.42), lifeMs: 1100 },
    onHit,
  }) satisfies AbilityDef

// 盒子打物理，它放出的笑气才不会每跳叠一层寒冷
const box = (effects: readonly Effect[]) =>
  ({
    trigger: 'auto',
    cooldownMs: 600,
    aim: 'self',
    element: 'physical',
    fireSfx: 'recruit',
    shape: { kind: 'world' },
    onHit: [{ kind: 'ground', def: { ...patch(1, 9000, 0xff80ab, effects, 20, 0), trap: true } }],
  }) satisfies AbilityDef

const scheme = (onHit: readonly Effect[], effects: readonly Effect[]) => ({ ...glare(onHit), cycle: [box(effects)] }) satisfies AbilityDef

const FEAR = { kind: 'fear', durationMs: 1500 } as const
const LAUGHING_GAS = { kind: 'ground', def: patch(1.8, 2500, 0xce93d8, [{ kind: 'berserk', durationMs: 700 }], 0, 500) } as const
const STARE = { kind: 'if', when: { kind: 'marked', who: 'target', mark: 'frozen' }, then: [{ kind: 'berserk', durationMs: 3000 }] } as const

const mastermindGlare = scheme([], [FEAR])

const mastermindGlare2 = scheme([], [FEAR, LAUGHING_GAS])

const mastermindGlare3 = scheme([STARE], [FEAR, LAUGHING_GAS])

const mastermindPlot = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  damage: 12,
  fireSfx: 'warp',
  color: 0xb39ddb,
  shape: { kind: 'disc', radius: 4, at: 'target' },
  onHit: [{ kind: 'berserk', durationMs: 3000 }],
} satisfies AbilityDef

export const abilities = { mastermindGlare, mastermindGlare2, mastermindGlare3, mastermindPlot } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.4, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9b9',
  name: '幕后主使',
  element: 'ice',
  desc: '从不露面的幕后主使，把敌人当棋子摆弄：冷冷一瞥让敌人冷一层，盯满 3 下就冻住，湿的一瞥就冻；和在脚边丢惊喜盒轮着来：惊喜盒留在原地 9 秒，敌人踩上才弹开，挨一下实打实的，冻住的当场敲碎，1 格内的敌人吓得逃开 1.5 秒；本身冻不住，身子薄，被贴身全靠惊喜盒吓开；技能在敌群里挑起内讧',
  role: 'controller',
  tags: ['control', 'ranged', 'area'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5.4, maxStamina: 90, staminaRegen: 70, exertion: 0.9 },
  skill: { name: '幕后操纵', icon: '1f3ad', desc: '在最近的敌人那里挑起内讧：4 格内的敌人各挨一下冷的、冷一层（湿的当场冻住），倒戈 3 秒', cdMs: 15_000, ability: 'mastermindPlot' },
  weapons: [],
  innate: [
    {
      name: '冷眼',
      icon: '1f9b9',
      base: 'mastermindGlare',
      upgrades: [
        { ability: 'mastermindGlare2', card: { icon: '1f606', name: '笑气', desc: '惊喜盒弹开后留下一团 1.8 格的笑气 2.5 秒，待在里面的敌人倒戈' } },
        { ability: 'mastermindGlare3', card: { icon: '1f5e3', name: '挑拨', desc: '冷眼打中冻住的敌人，它倒戈 3 秒：冻着动不了，化开后转头去打同伴' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
