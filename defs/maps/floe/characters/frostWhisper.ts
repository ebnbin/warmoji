import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import type { WeaponSource } from '../../../../legacy/types/weapons'
import { ring, shot, zoneLook } from '../../../kit.ts'

// 🥶 霜语者：身周的寒气隔一阵让敌人冷一层，寒语打中也冷一层，冷满三层就冻成冰块；绝对零度冻住时间，站着不动时全场近乎凝固
const frostWhisperChill = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  range: 6.5,
  damage: 10,
  fireSfx: 'tink',
  shape: { kind: 'bolt', projectile: shot('1f300', 9, 0.4), lifeMs: 1300 },
} satisfies AbilityDef

const frostWhisperChill2 = {
  ...frostWhisperChill,
  onHit: [{ kind: 'if', when: { kind: 'marked', who: 'target', mark: 'frozen' }, then: [{ kind: 'blast', radius: 1.5, ratio: 0.6, knockback: 0, ring: ring(0x81d4fa) }] }],
} satisfies AbilityDef

const frostWhisperChill3 = { ...frostWhisperChill2, shape: { ...frostWhisperChill2.shape, pierce: 2 } } satisfies AbilityDef

const frostWhisperBreath = {
  trigger: 'auto',
  cooldownMs: 0,
  aim: 'self',
  color: 0x81d4fa,
  shape: { kind: 'zone', radius: 3, durationMs: 0, tickMs: 1500, follow: true, visual: { ...zoneLook(0x81d4fa), fillAlpha: 0.08, lineAlpha: 0.35, lineWidth: 2, enterMs: 0 } },
} satisfies AbilityDef

const frostWhisperZero = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'shatter',
  color: 0x81d4fa,
  shape: { kind: 'world' },
  onHit: [{ kind: 'timeStop', durationMs: 5000 }],
} satisfies AbilityDef

export const abilities = { frostWhisperChill, frostWhisperChill2, frostWhisperChill3, frostWhisperBreath, frostWhisperZero } satisfies Record<string, AbilityDef>

// 寒气没有升级档，升级卡都在寒语上
export const weapons = {
  frostWhisperAura: { name: '寒气', emoji: '2744', base: 'frostWhisperBreath', upgrades: [] },
} as const satisfies Record<string, WeaponSource>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.45, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f976',
  name: '霜语者',
  element: 'ice',
  desc: '说话都冒寒气的霜语者，本身是冰，冻不住、不怕冰水：身周 3 格一直冒着寒气，里面的敌人每 1.5 秒冷一层；低声一句寒语打过去，打中的也冷一层，冷满三层就冻成冰块 1.5 秒，冻住的挨一下物理就碎；湿了的敌人一句寒语就冻住。技能绝对零度冻住时间 5 秒，站着不动时全场近乎凝固',
  role: 'controller',
  tags: ['control', 'ranged', 'area'],
  body: { drag: 5, mass: 0.7 },
  stats: { moveSpeed: 5.6, maxStamina: 90, staminaRegen: 75, exertion: 0.9 },
  skill: {
    name: '绝对零度',
    icon: '23f3',
    desc: '冻住时间 5 秒：你站着不动时全场近乎凝固，走起来时间才跟着走；这 5 秒也跟着全场的时间走，站着不动就几乎不减',
    cdMs: 18_000,
    ability: 'frostWhisperZero',
  },
  weapons: ['frostWhisperAura'],
  innate: [
    {
      name: '寒语',
      icon: '1f300',
      base: 'frostWhisperChill',
      upgrades: [
        { ability: 'frostWhisperChill2', card: { icon: '1f9ca', name: '冰裂', desc: '寒语打在冻住的敌人身上就炸开，1.5 格内的敌人吃六成伤害，没冻住的各冷一层' } },
        { ability: 'frostWhisperChill3', card: { icon: '1f4ac', name: '低语', desc: '寒语打中后不停，穿过去最多再打中两个敌人' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
