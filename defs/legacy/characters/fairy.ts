import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

const sparkleBolt = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 10,
  knockback: 2,
  shape: {
    kind: 'bolt',
    projectile: { look: { emoji: '2728', size: 0.5, rotationOffsetDeg: 0 }, radius: 0.17, speed: 11 },
    lifeMs: 2000,
  },
  onHit: [{ kind: 'morph', durationMs: 2500, morphEmoji: '1f411' }],
} satisfies AbilityDef

const sheepParty = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'boom',
  color: 0xf48fb1,
  shape: { kind: 'disc', radius: 3, at: 'self' },
  onHit: [{ kind: 'morph', durationMs: 3000, morphEmoji: '1f411' }],
} satisfies AbilityDef

const sparkleBolt2 = {
  ...sparkleBolt,
  shape: { ...sparkleBolt.shape, pierce: 1 },
  onHit: [{ kind: 'morph', durationMs: 4000, morphEmoji: '1f411' }],
} satisfies AbilityDef

const sparkleBolt3 = {
  ...sparkleBolt2,
  onHit: [{ kind: 'morph', durationMs: 4000, morphEmoji: '1f411', vulnMul: 1.4 }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  sparkleBolt,
  sparkleBolt2,
  sparkleBolt3,
  sheepParty,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 20 }, mul: { cooldown: 0.85 } }, { add: { maxHp: 45 }, mul: { cooldown: 0.72 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9da',
  name: '仙子',
  desc: '魔尘弹把敌人整个变成一只无能力的绵羊——暂时失去攻击、被动与亡语，只保留血量，一段时间后恢复；同一敌人变羊有冷却',
  role: 'controller',
  tags: ['control', 'ranged'],
  body: { drag: 5, mass: 0.5 },
  stats: { moveSpeed: 6.4, maxStamina: 70, staminaRegen: 85, exertion: 0.6 },
  skill: { name: '变形派对', icon: '1f411', desc: '三格内的敌人全部变成绵羊三秒', cdMs: 16_000, ability: 'sheepParty' },
  weapons: [],
  innate: [
    {
      name: '魔尘弹',
      icon: '1fa84',
      base: 'sparkleBolt',
      upgrades: [
        { ability: 'sparkleBolt2', card: { icon: '1f411', name: '持久变形', desc: '变形时长延长到 4 秒，魔尘弹可贯穿 1 名敌人' } },
        { ability: 'sparkleBolt3', card: { icon: '1f494', name: '脆弱诅咒', desc: '被变形的敌人受到的所有伤害提高 40%' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
