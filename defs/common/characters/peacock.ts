import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'

// 🦚 孔雀：羽毛射出去落在地上，再一齐收回来
const feather = {
  trigger: 'auto',
  cooldownMs: 280,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 9,
  knockback: 0.5,
  shape: { kind: 'bolt', projectile: { look: { emoji: '1fab6', size: 0.5, rotationOffsetDeg: 45 }, radius: 0.16, speed: 14, linger: 5000 }, lifeMs: 420, pierce: 1 },
} satisfies AbilityDef

const featherRecall = { trigger: 'auto', cooldownMs: 280, aim: 'self', fireSfx: 'whoosh', shape: { kind: 'world' }, onHit: [{ kind: 'recall', speed: 20 }] } satisfies AbilityDef

const featherPin = { kind: 'stack', max: 3, durationMs: 1500, then: [{ kind: 'root', durationMs: 1500 }] } as const

const feather2 = { ...feather, onHit: [featherPin] } satisfies AbilityDef

const feather3 = { ...feather, onHit: [featherPin, { kind: 'pull', speed: 8, gap: 1 }] } satisfies AbilityDef

const peacockPlumes = { ...feather, cycle: [feather, feather, feather, featherRecall] } satisfies AbilityDef

const peacockPlumes2 = { ...feather2, cycle: [feather2, feather2, feather2, featherRecall] } satisfies AbilityDef

const peacockPlumes3 = { ...feather3, cycle: [feather3, feather3, feather3, featherRecall] } satisfies AbilityDef

const peacockFan = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  shape: { kind: 'world' },
  onHit: [{ kind: 'barrier', shape: 'wall', length: 4.5, offset: 1.6, durationMs: 3500, bodies: 'none', shots: true, color: 0x26a69a }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  peacockPlumes,
  peacockPlumes2,
  peacockPlumes3,
  peacockFan,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 15 }, mul: { damage: 1.2 } }, { add: { maxHp: 35 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f99a',
  name: '孔雀',
  desc: '翎羽射出去落在地上，每射四根就把满地羽毛一齐收回，沿途再扎一遍',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 5, mass: 0.8 },
  stats: { moveSpeed: 5.8, maxStamina: 90, staminaRegen: 60, exertion: 1.1 },
  skill: { name: '开屏', icon: '1faad', desc: '朝指定方向展开一道四格半的羽屏三秒半，吞掉敌方弹体', cdMs: 12_000, ability: 'peacockFan', aim: true },
  weapons: [],
  innate: [
    {
      name: '翎羽',
      icon: '1fab6',
      base: 'peacockPlumes',
      upgrades: [
        { ability: 'peacockPlumes2', card: { icon: '1f4cc', name: '钉羽', desc: '一秒半内被三根羽毛扎中的敌人定身' } },
        { ability: 'peacockPlumes3', card: { icon: '1faa4', name: '回羽钩', desc: '羽毛扎中的敌人被拽向孔雀' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
