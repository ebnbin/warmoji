import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, shot } from '../../../kit.ts'

// 🐢 寺龟：守着北方冬水的老龟，抛出结霜的睡莲叶让敌人发冷，落处起一团寒雾；背壳结着冰，近身打它的反被冻；玄武时全队爬上龟背，自己霸体硬扛
const templeTurtleLotus = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'nearest',
  range: 7,
  damage: 12,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1fab7', 9), lifeMs: 1000 },
} satisfies AbilityDef

const FOG = patch(1.5, 2500, 0xb3e5fc, undefined, 0, 1000)

const templeTurtleLotus2 = { ...templeTurtleLotus, onHit: [{ kind: 'ground', def: FOG }] } satisfies AbilityDef

const templeTurtleLotus3 = {
  ...templeTurtleLotus,
  onHit: [
    { kind: 'ground', def: FOG },
    { kind: 'if', when: { kind: 'marked', who: 'target', mark: 'frozen' }, then: [{ kind: 'sleep', durationMs: 3000, wakeMul: 1.5 }] },
  ],
} satisfies AbilityDef

const templeTurtleXuanwu = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'wash',
  color: 0x4fc3f7,
  shape: { kind: 'all', of: 'allies' },
  onHit: [{ kind: 'attach', ms: 4000 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'unstoppable', durationMs: 4000 }, { kind: 'shield', amount: 0, ratio: 0.25, ms: 4000 }] }],
} satisfies AbilityDef

export const abilities = { templeTurtleLotus, templeTurtleLotus2, templeTurtleLotus3, templeTurtleXuanwu } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 30, armor: 2 }, mul: { damage: 1.15 } }, { add: { maxHp: 70, armor: 4 }, mul: { damage: 1.35 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f422',
  name: '寺龟',
  element: 'ice',
  desc: '寺院池子里的老龟，冬天池面结冰也冻不住它，走得慢、背壳硬：抛出结霜的睡莲叶，打中的敌人冷一层，冷满三层冻住，冻住的挨一下物理就碎；背壳结着冰，近身打它的挨 3 点反伤、冷一层；会游泳，溪水冲不走；本身是冰，冻不住；护甲厚，怕的是燃烧、中毒这类不吃护甲的伤害；技能玄武让全队爬上龟背 4 秒，队友谁也选不中却照常出手，自己霸体、挂上生命 25% 的护盾',
  role: 'tank',
  tags: ['defense', 'control', 'ranged'],
  body: { drag: 5.5, mass: 1.8 },
  stats: { moveSpeed: 3.9, maxStamina: 150, staminaRegen: 42, exertion: 1.25, thorns: 3 },
  traits: ['swims'],
  skill: {
    name: '玄武',
    icon: '1f6e1',
    desc: '4 秒内全体队友贴在龟背上，谁也选不中，照常出手；自己霸体 4 秒，并挂上生命 25% 的护盾 4 秒',
    cdMs: 16_000,
    ability: 'templeTurtleXuanwu',
  },
  weapons: [],
  innate: [
    {
      name: '霜莲',
      icon: '1fab7',
      base: 'templeTurtleLotus',
      upgrades: [
        { ability: 'templeTurtleLotus2', card: { icon: '1f32b', name: '寒雾', desc: '睡莲叶落处起一团 1.5 格的寒雾，留 2.5 秒，雾里的敌人每秒冷一层' } },
        { ability: 'templeTurtleLotus3', card: { icon: '1f6cc', name: '冬眠', desc: '睡莲叶打中冻住的敌人（包括这一片刚冻住的），让它冬眠 3 秒：冰化了还睡着，叫醒的那一下伤害 ×1.5' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
