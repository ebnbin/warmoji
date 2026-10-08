import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

// 🤺 剑客：第三下挑飞，只对空中的敌人追斩
const fencerThrust = {
  trigger: 'auto',
  cooldownMs: 650,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 2.6,
  damage: 20,
  knockback: 3,
  shape: { kind: 'segment', reach: 2.4, radius: 0.45, ms: 160, lungeDist: 0.5 },
} satisfies AbilityDef

const fencerGale = {
  ...fencerThrust,
  range: 5,
  damage: 18,
  knockback: 0,
  color: 0xb3e5fc,
  shape: { kind: 'segment', reach: 5, radius: 0.6, ms: 220, beam: true },
  onHit: [{ kind: 'knockup', durationMs: 750, height: 1.3 }],
} satisfies AbilityDef

const galeWall = { kind: 'barrier', shape: 'wall', length: 3, offset: 1.5, durationMs: 2000, bodies: 'none', shots: true, color: 0xb3e5fc } as const

const fencerCombo = { ...fencerThrust, cycle: [fencerThrust, fencerGale] } satisfies AbilityDef

const fencerCombo2 = { ...fencerThrust, cycle: [fencerThrust, { ...fencerGale, reactions: [{ on: 'fire', to: 'self', effects: [galeWall] }] }] } satisfies AbilityDef

const fencerCombo3 = {
  ...fencerThrust,
  cycle: [fencerThrust, { ...fencerGale, reactions: [{ on: 'fire', to: 'self', effects: [galeWall] }], onHit: [{ kind: 'knockup', durationMs: 750, height: 1.3, onLand: [{ kind: 'stun', durationMs: 700 }] }] }],
} satisfies AbilityDef

const fencerLastBreath = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  requires: { kind: 'airborne', who: 'target' },
  fireSfx: 'whoosh',
  damage: 55,
  shape: { kind: 'blink', behindDist: 0.5, strikeMs: 450 },
  onHit: [{ kind: 'knockup', durationMs: 700, height: 1.6 }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  fencerCombo,
  fencerCombo2,
  fencerCombo3,
  fencerLastBreath,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { crit: 0.05 }, mul: { damage: 1.25 } }, { add: { crit: 0.12, maxHp: 20 }, mul: { damage: 1.55 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f93a',
  name: '剑客',
  desc: '刺两剑卷一道旋风把敌人挑上天，再追着空中的敌人斩',
  role: 'assassin',
  tags: ['damage', 'control', 'melee', 'mobile'],
  body: { drag: 4.5, mass: 0.9 },
  stats: { moveSpeed: 7.11, maxStamina: 100, staminaRegen: 80, exertion: 0.9 },
  skill: { name: '追风斩', icon: '1f32a', desc: '只能对空中的敌人出手：瞬身到八格内一个被挑飞的敌人身后重斩，再把它挑高', cdMs: 8_000, ability: 'fencerLastBreath' },
  weapons: [],
  innate: [
    {
      name: '疾风刺',
      icon: '2694',
      base: 'fencerCombo',
      upgrades: [
        { ability: 'fencerCombo2', card: { icon: '1f32c', name: '断风', desc: '旋风过处立起两秒风墙，吞掉敌方弹体' } },
        { ability: 'fencerCombo3', card: { icon: '26a1', name: '落地惊雷', desc: '被旋风挑飞的敌人落地时眩晕' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
