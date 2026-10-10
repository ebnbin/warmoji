import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 🧑‍🦯 盲琴师：弹出催眠的音符，同一个敌人听满三段就睡过去，叫醒它的那一下格外疼；贴身碰它的敌人常被琴声哄睡；技能一曲长眠，哄睡身边一圈
const bardNote = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  range: 6.5,
  damage: 10,
  fireSfx: 'chirp',
  shape: { kind: 'bolt', projectile: shot('1f3b5', 8, 0.42), lifeMs: 1100 },
  onHit: [{ kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'sleep', durationMs: 2000, wakeMul: 1.5 }] }],
} satisfies AbilityDef

const bardNote2 = { ...bardNote, shape: { ...bardNote.shape, pierce: 1 } } satisfies AbilityDef

const bardNote3 = { ...bardNote2, onHit: [{ kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'sleep', durationMs: 3000, wakeMul: 1.8 }] }] } satisfies AbilityDef

const bardRest = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'sonar',
  color: 0xb39ddb,
  shape: { kind: 'disc', radius: 4.5, at: 'self' },
  onHit: [{ kind: 'sleep', durationMs: 3000, wakeMul: 2 }],
} satisfies AbilityDef

export const abilities = { bardNote, bardNote2, bardNote3, bardRest } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.45, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f9af',
  name: '盲琴师',
  desc: '看不见路的琴师，琴声却认得每一个敌人：音符打中同一个敌人三次就让它睡过去 2 秒，叫醒它的那一下伤害 ×1.5，正好留给队友的重击；身上烧着、中着毒的挨一跳就醒，哄不住；没有护甲也躲不开，可贴身碰到它的敌人有三成五被琴声哄睡 1.5 秒；技能一曲长眠，哄睡身边一圈',
  role: 'controller',
  tags: ['control', 'ranged'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5, maxStamina: 100, staminaRegen: 65, exertion: 1 },
  reactions: [{ on: 'touched', to: 'other', chance: 0.35, effects: [{ kind: 'sleep', durationMs: 1500, wakeMul: 1.5 }] }],
  skill: { name: '长眠', icon: '1f6cc', desc: '弹一曲长眠：4.5 格内的敌人睡着 3 秒，叫醒它的那一下伤害 ×2', cdMs: 15_000, ability: 'bardRest' },
  weapons: [],
  innate: [
    {
      name: '催眠曲',
      icon: '1f3b5',
      base: 'bardNote',
      upgrades: [
        { ability: 'bardNote2', card: { icon: '1f3b6', name: '余音', desc: '音符能穿过一个敌人继续飞' } },
        { ability: 'bardNote3', card: { icon: '1f56f', name: '安魂曲', desc: '听满三段改成睡 3 秒，叫醒它的那一下伤害 ×1.8' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
