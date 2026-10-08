import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

const voltArc = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  fireSfx: 'zap',
  range: 5.5,
  damage: 20,
  knockback: 2.5,
  color: 0x40c4ff,
  shape: { kind: 'chain', hops: 2, hopRange: 2.2, decay: 0.75 },
} satisfies AbilityDef

const voltArc2 = { ...voltArc, shape: { ...voltArc.shape, hops: 4 } } satisfies AbilityDef

const voltArc3 = {
  ...voltArc2,
  onHit: [
    { kind: 'blast', radius: 0.9, ratio: 0.6, knockback: 1.5, ring: { color: 0x40c4ff, fillAlpha: 0.25, lineWidth: 3, lineAlpha: 0.9, durMs: 240 } },
  ],
} satisfies AbilityDef

const jellyNet = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'zap',
  color: 0x40c4ff,
  damage: 10,
  shape: { kind: 'disc', radius: 5, at: 'self' },
  onHit: [
    { kind: 'tether', ms: 2000, range: 6.5, onHold: [{ kind: 'stun', durationMs: 1500 }, { kind: 'damage', amount: 30 }], onBreak: [{ kind: 'slow', factor: 0.5, durationMs: 1500 }], color: 0x40c4ff },
  ],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  voltArc,
  voltArc2,
  voltArc3,
  jellyNet,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 20 }, mul: { damage: 1.25 } }, { add: { maxHp: 45 }, mul: { damage: 1.5 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1fabc',
  name: '水母',
  desc: '电弧在敌群间弹跳传导，敌人越密越疼',
  role: 'area',
  tags: ['damage', 'control', 'ranged', 'area'],
  body: { drag: 3, mass: 0.8 },
  stats: { moveSpeed: 4.5, maxStamina: 70, staminaRegen: 70, exertion: 0.7 },
  skill: { name: '电网', icon: '1f945', desc: '五格内的敌人都被电丝连住两秒：撑到最后没挣断的被电晕一秒半，跑出六格半就挣断、只被减速', cdMs: 12_000, ability: 'jellyNet' },
  weapons: [],
  innate: [
    {
      name: '感电触须',
      icon: '26a1',
      base: 'voltArc',
      upgrades: [
        { ability: 'voltArc2', card: { icon: '1f517', name: '超导传递', desc: '电弧额外弹跳数提升到 4 跳' } },
        { ability: 'voltArc3', card: { icon: '1f4a5', name: '过载爆裂', desc: '最后一跳落点爆出小范围电击，波及 60% 伤害' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
