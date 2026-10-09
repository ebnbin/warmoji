import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 🦙 羊驼：一口一口地吐口水，挨满三口的敌人恶心得晕过去；技能冲前方发火，吓跑一片
const daze = { kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'stun', durationMs: 1000 }] } as const

const llamaSpit = {
  trigger: 'auto',
  cooldownMs: 900,
  aim: 'nearest',
  range: 6.5,
  damage: 10,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: shot('1f4a6', 9, 0.42), lifeMs: 900 },
  onHit: [daze],
} satisfies AbilityDef

const llamaSpit2 = { ...llamaSpit, onHit: [{ kind: 'slow', factor: 0.7, durationMs: 1000 }, daze] } satisfies AbilityDef

const llamaSpit3 = { ...llamaSpit2, repeat: { count: 2, delayMs: 200, ratio: 0.6 } } satisfies AbilityDef

const llamaRage = {
  trigger: 'manual',
  aim: 'nearest',
  range: 4,
  fireSfx: 'bleat',
  color: 0xff8a65,
  shape: { kind: 'sector', radius: 4, arcDeg: 120, ms: 260 },
  onHit: [
    { kind: 'fear', durationMs: 2000 },
    { kind: 'slow', factor: 0.7, durationMs: 2000 },
  ],
} satisfies AbilityDef

export const abilities = { llamaSpit, llamaSpit2, llamaSpit3, llamaRage } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.4, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f999',
  name: '羊驼',
  element: 'earth',
  desc: '羊驼一口一口地吐口水，同一个敌人 3 秒内挨满三口就恶心得晕过去 1 秒；技能冲着前方一通发火，吓得一片敌人掉头就跑',
  role: 'controller',
  tags: ['control', 'ranged'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5.6, maxStamina: 110, staminaRegen: 65, exertion: 0.8 },
  skill: { name: '羊驼怒', icon: '1f624', desc: '冲着前方 4 格、120 度一通发火：被吼到的敌人吓得掉头就跑 2 秒，跑也跑不快', cdMs: 12_000, ability: 'llamaRage' },
  weapons: [],
  innate: [
    {
      name: '吐口水',
      icon: '1f999',
      base: 'llamaSpit',
      upgrades: [
        { ability: 'llamaSpit2', card: { icon: '1fae7', name: '黏痰', desc: '被吐中的敌人减速 30% 1 秒' } },
        { ability: 'llamaSpit3', card: { icon: '1f4a6', name: '连吐', desc: '一次连吐两口，第二口六成伤害' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
