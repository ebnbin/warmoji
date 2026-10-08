import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🐬 海豚：发出能穿过敌人的声波，打中的藏不住身形；技能跃出浪头砸进敌群
const dolphinSonar = {
  trigger: 'auto',
  cooldownMs: 550,
  aim: 'nearest',
  range: 7.5,
  damage: 13,
  fireSfx: 'sonar',
  shape: { kind: 'bolt', projectile: shot('3030', 11, 0.5), lifeMs: 800, pierce: 2 },
  onHit: [{ kind: 'reveal', durationMs: 3000 }],
} satisfies AbilityDef

const dolphinSonar2 = {
  ...dolphinSonar,
  onHit: [...dolphinSonar.onHit, { kind: 'status', status: 'exposed', ms: 3000, value: 1.15 }],
} satisfies AbilityDef

const dolphinSonar3 = { ...dolphinSonar2, repeat: { count: 2, spreadDeg: 12 } } satisfies AbilityDef

const dolphinLeap = {
  trigger: 'manual',
  aim: 'stick',
  damage: 32,
  knockback: 3,
  fireSfx: 'splash',
  color: 0x4fc3f7,
  shape: { kind: 'leap', distance: 5, ms: 450, height: 1.2, radius: 1.6 },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'status', status: 'speed', ms: 2500, value: 1.3 }] }],
} satisfies AbilityDef

export const abilities = { dolphinSonar, dolphinSonar2, dolphinSonar3, dolphinLeap } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, projSpeed: 1.1 } }, { add: { crit: 0.08 }, mul: { damage: 1.45, projSpeed: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f42c',
  name: '海豚',
  element: 'water',
  desc: '机灵的海豚：远远发出一道道声波，能穿过两个敌人，打中的 3 秒内隐匿与潜行都不管用；技能跃出浪头砸进敌群',
  role: 'ranged',
  tags: ['damage', 'ranged', 'mobile'],
  body: { drag: 4.5, mass: 0.9 },
  stats: { moveSpeed: 6.4, maxStamina: 120, staminaRegen: 70, exertion: 0.85 },
  skill: { name: '跃浪', icon: '1f30a', desc: '朝摇杆方向跃出 5 格，落地砸中 1.6 格内的敌人并震退；起跳后 2.5 秒内移速 ×1.3', cdMs: 10_000, ability: 'dolphinLeap', aim: true },
  weapons: [],
  innate: [
    {
      name: '声呐',
      icon: '1f42c',
      base: 'dolphinSonar',
      upgrades: [
        { ability: 'dolphinSonar2', card: { icon: '1f4e1', name: '回声定位', desc: '打中的敌人 3 秒内受到的伤害 ×1.15' } },
        { ability: 'dolphinSonar3', card: { icon: '1f3b6', name: '双频', desc: '一次发出两道声波，散开 12 度' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
