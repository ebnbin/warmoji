import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🦅 苍鹰：远远射出穿透的翎羽，每第四轮换成连锁闪电；技能从天上劈下一串雷
const hawkFeather = {
  trigger: 'auto',
  cooldownMs: 520,
  aim: 'nearest',
  range: 7,
  damage: 13,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1fab6', 12, 0.45, 45), lifeMs: 1200, pierce: 1 },
} satisfies AbilityDef

const hawkFeather2 = { ...hawkFeather, repeat: { count: 3, spreadDeg: 24, ratio: 0.7 } } satisfies AbilityDef

const hawkBolt = {
  ...hawkFeather,
  damage: 24,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'chain', hops: 3, hopRange: 3, decay: 0.7 },
} satisfies AbilityDef

const hawkFeather3 = { ...hawkFeather2, cycle: [hawkFeather2, hawkBolt] } satisfies AbilityDef

const hawkStrike = {
  trigger: 'manual',
  aim: 'nearest',
  range: 9,
  damage: 40,
  fireSfx: 'zap',
  shape: { kind: 'drop', targets: 4, look: { emoji: '26a1', size: 1 }, fromAbove: 4, dropMs: 450, staggerMs: 120 },
  onHit: [{ kind: 'stun', durationMs: 500 }],
} satisfies AbilityDef

export const abilities = { hawkFeather, hawkFeather2, hawkFeather3, hawkStrike } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, projSpeed: 1.1 } }, { add: { crit: 0.08 }, mul: { damage: 1.5, projSpeed: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f985',
  name: '苍鹰',
  element: 'thunder',
  desc: '在高处盘旋的苍鹰：远远射出穿透的翎羽，每隔几轮换成一道连锁闪电；俯冲时从天上劈下一串雷',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.5, mass: 0.8 },
  stats: { moveSpeed: 6.2, maxStamina: 100, staminaRegen: 75, exertion: 0.8 },
  skill: { name: '雷霆俯冲', icon: '1f329', desc: '在最近的四个敌人头上各劈一道雷，劈中的麻 0.5 秒', cdMs: 11_000, ability: 'hawkStrike' },
  weapons: [],
  innate: [
    {
      name: '翎羽',
      icon: '1fab6',
      base: 'hawkFeather',
      upgrades: [
        { ability: 'hawkFeather2', card: { icon: '1f343', name: '散羽', desc: '一次射出三根，每根七成伤害' } },
        { ability: 'hawkFeather3', card: { icon: '26a1', name: '雷翎', desc: '每第三轮换成一道在敌人间连跳三次的闪电' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
