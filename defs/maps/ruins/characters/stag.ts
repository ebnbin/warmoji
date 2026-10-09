import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring } from '../../../kit.ts'

// 🦌 鹿：挂霜的鹿角把敌人挑上半空，一下冰一下物理轮着来，冰的叠寒冷，冻住的下一挑就碎；技能一声长鸣，把一片敌人冻成冰坨扔到别的敌人身上砸晕
const stagHorn = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 1.9,
  element: 'physical',
  damage: 12,
  fireSfx: 'thud',
  shape: { kind: 'segment', reach: 1.8, radius: 0.5, ms: 160 },
  onHit: [{ kind: 'knockup', durationMs: 400, height: 0.9 }],
} satisfies AbilityDef

const stagRime = { ...stagHorn, element: 'ice', damage: 10, fireSfx: 'whoosh', color: 0x80deea } satisfies AbilityDef

const stagFling = {
  ...stagHorn,
  fireSfx: 'whoosh',
  onHit: [{ kind: 'throw', to: 'behind', distance: 3, ms: 420, height: 1.2, onLand: [{ kind: 'stun', durationMs: 600 }] }],
} satisfies AbilityDef

const stagSweep = { ...stagRime, shape: { kind: 'sector', radius: 1.9, arcDeg: 110, ms: 180 } } satisfies AbilityDef

const stagToss = { ...stagRime, cycle: [stagHorn] } satisfies AbilityDef

const stagToss2 = { ...stagRime, cycle: [stagHorn, stagRime, stagFling] } satisfies AbilityDef

const stagToss3 = { ...stagSweep, cycle: [stagHorn, stagSweep, stagFling] } satisfies AbilityDef

const stagCall = {
  trigger: 'manual',
  aim: 'nearest',
  range: 4.5,
  element: 'ice',
  damage: 8,
  fireSfx: 'charge',
  color: 0x80deea,
  shape: { kind: 'sector', radius: 4, arcDeg: 120, ms: 260 },
  onHit: [
    {
      kind: 'throw',
      to: 'foe',
      distance: 4,
      ms: 480,
      height: 1.6,
      onLand: [
        { kind: 'damage', amount: 0, ratio: 1.5 },
        { kind: 'blast', radius: 1.2, ratio: 1.5, knockback: 0, ring: ring(0x80deea) },
        { kind: 'to', who: { side: 'foes', radius: 1.2 }, then: [{ kind: 'stun', durationMs: 1000 }] },
      ],
    },
  ],
} satisfies AbilityDef

export const abilities = { stagToss, stagToss2, stagToss3, stagCall } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.4, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f98c',
  name: '鹿',
  element: 'ice',
  desc: '霜降时节林间的雄鹿，鹿角挂着霜，本身是冰，冻不住也不怕冷：鹿角把贴上来的敌人挑上半空，一下带冰、一下物理轮着来，带冰的叠一层寒冷，叠满三层冻住，冻住的再挨物理那一挑就碎、伤害翻倍，湿了的一挑就冻；技能一声长鸣，把身前一片敌人冻成冰坨扔到别的敌人身上砸晕',
  role: 'controller',
  tags: ['control', 'melee'],
  body: { drag: 4.8, mass: 1.2 },
  stats: { moveSpeed: 6.2, maxStamina: 110, staminaRegen: 70, exertion: 0.9 },
  skill: {
    name: '鹿鸣',
    icon: '1f4ef',
    desc: '身前 4 格 120° 里的敌人挨一下冰，各被扔向离它最近的另一个敌人（4 格内没有就扔到身后）；落地时连它带落点 1.2 格内的敌人都再挨一下更重的冰、眩晕 1 秒，被扔的那个连挨三下冰，当场冻住',
    cdMs: 12_000,
    ability: 'stagCall',
  },
  weapons: [],
  innate: [
    {
      name: '霜角挑',
      icon: '1f98c',
      base: 'stagToss',
      upgrades: [
        { ability: 'stagToss2', card: { icon: '1f300', name: '甩头', desc: '每第四下改成把挑中的敌人甩到身后 3 格，落地眩晕 0.6 秒；这一下是物理，冻住的照样碎' } },
        { ability: 'stagToss3', card: { icon: '2744', name: '霜角', desc: '带冰的那一挑改成扫开身前 1.9 格 110° 的一片，一下给一片敌人叠寒冷' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
