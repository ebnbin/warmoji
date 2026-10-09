import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring } from '../../../kit.ts'

// 🦌 鹿：鹿角把敌人挑上半空，隔几下甩到身后；技能一声长鸣，把一片敌人扔到别的敌人身上砸晕
const stagToss = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 1.9,
  damage: 12,
  fireSfx: 'thud',
  shape: { kind: 'segment', reach: 1.8, radius: 0.5, ms: 160 },
  onHit: [{ kind: 'knockup', durationMs: 400, height: 0.9 }],
} satisfies AbilityDef

const stagFling = {
  ...stagToss,
  fireSfx: 'whoosh',
  onHit: [{ kind: 'throw', to: 'behind', distance: 3, ms: 420, height: 1.2, onLand: [{ kind: 'stun', durationMs: 600 }] }],
} satisfies AbilityDef

const stagToss2 = { ...stagToss, cycle: [stagToss, stagFling] } satisfies AbilityDef

const stagVine = { ...stagToss, onHit: [{ kind: 'knockup', durationMs: 400, height: 0.9, onLand: [{ kind: 'root', durationMs: 600 }] }] } satisfies AbilityDef

const stagToss3 = { ...stagVine, cycle: [stagVine, stagFling] } satisfies AbilityDef

const stagCall = {
  trigger: 'manual',
  aim: 'nearest',
  range: 4.5,
  damage: 10,
  fireSfx: 'charge',
  color: 0x81c784,
  shape: { kind: 'sector', radius: 4, arcDeg: 120, ms: 260 },
  onHit: [
    {
      kind: 'throw',
      to: 'foe',
      distance: 4,
      ms: 480,
      height: 1.6,
      onLand: [
        { kind: 'damage', amount: 0, ratio: 1.8 },
        { kind: 'blast', radius: 1.2, ratio: 1.8, knockback: 1.5, ring: ring(0x81c784) },
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
  desc: '林间的雄鹿：鹿角把贴上来的敌人挑上半空，隔几下甩到身后；技能一声长鸣，把身前一片敌人扔到别的敌人身上砸晕',
  role: 'controller',
  tags: ['control', 'melee'],
  body: { drag: 4.8, mass: 1.2 },
  stats: { moveSpeed: 6.2, maxStamina: 110, staminaRegen: 70, exertion: 0.9 },
  skill: {
    name: '鹿鸣',
    icon: '1f4ef',
    desc: '身前 4 格 120° 里的敌人挨一下，各被扔向离它最近的另一个敌人（4 格内没有就扔到身后）；落地时连它带落点 1.2 格内的敌人都挨一下更重的，并眩晕 1 秒',
    cdMs: 12_000,
    ability: 'stagCall',
  },
  weapons: [],
  innate: [
    {
      name: '鹿角挑',
      icon: '1f98c',
      base: 'stagToss',
      upgrades: [
        { ability: 'stagToss2', card: { icon: '1f300', name: '甩头', desc: '每第三下把挑中的敌人甩到身后，落地眩晕 0.6 秒' } },
        { ability: 'stagToss3', card: { icon: '1f331', name: '藤蔓', desc: '挑上半空的敌人落地后被藤蔓缠住，定身 0.6 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
