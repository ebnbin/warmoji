import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, shot } from '../../../kit.ts'

// 🦙 羊驼：一口一口地吐带毒的口水，口口叠一层毒，挨满三口的恶心得晕过去；技能冲前方一通乱吐，吓跑一片
const ACID = 0x9ccc65

const daze = { kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'stun', durationMs: 1000 }] } as const

const llamaSpit = {
  trigger: 'auto',
  cooldownMs: 900,
  aim: 'nearest',
  range: 6.5,
  damage: 8,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: shot('1f4a6', 9, 0.42), lifeMs: 900 },
  onHit: [daze],
} satisfies AbilityDef

const llamaSpit2 = { ...llamaSpit, repeat: { count: 2, delayMs: 200, ratio: 0.6 } } satisfies AbilityDef

const retch = { kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'stun', durationMs: 1000 }, { kind: 'ground', def: patch(1.2, 3000, ACID, undefined, 3, 500) }] } as const

const llamaSpit3 = { ...llamaSpit2, onHit: [retch] } satisfies AbilityDef

const llamaRage = {
  trigger: 'manual',
  aim: 'nearest',
  range: 4,
  damage: 10,
  fireSfx: 'bleat',
  color: ACID,
  shape: { kind: 'sector', radius: 4, arcDeg: 120, ms: 260 },
  onHit: [{ kind: 'fear', durationMs: 2000 }],
} satisfies AbilityDef

export const abilities = { llamaSpit, llamaSpit2, llamaSpit3, llamaRage } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.4, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f999',
  name: '羊驼',
  element: 'poison',
  desc: '羊驼一口一口地吐带毒的口水，本身不会中毒：每口叠一层毒，最多 5 层，中了毒什么回复都不管用；同一个敌人 3 秒内挨满三口就恶心得晕过去 1 秒；技能冲着前方一通乱吐，吓得一片敌人掉头就跑',
  role: 'controller',
  tags: ['control', 'ranged'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5.6, maxStamina: 110, staminaRegen: 65, exertion: 0.8 },
  skill: { name: '羊驼怒', icon: '1f624', desc: '冲着前方 4 格、120 度一通乱吐：被吐到的敌人挨 10 点、叠一层毒，吓得掉头就跑 2 秒', cdMs: 12_000, ability: 'llamaRage' },
  weapons: [],
  innate: [
    {
      name: '吐口水',
      icon: '1f999',
      base: 'llamaSpit',
      upgrades: [
        { ability: 'llamaSpit2', card: { icon: '1f4a6', name: '连吐', desc: '一次连吐两口，第二口六成伤害，也叠一层毒、也算一口' } },
        { ability: 'llamaSpit3', card: { icon: '1fae7', name: '反胃', desc: '挨满三口晕过去的敌人脚下再冒出一团 1.2 格的毒云 3 秒，每半秒蚀 3 点、叠一层毒；火打进去会炸开' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
