import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import { shot } from '../abilityKit.ts'

// 🐙 章鱼：墨汁里谁也看不清
const inkPuddle = { kind: 'ground', def: { radius: 1.4, durationMs: 3000, tickMs: 500, damage: 0, color: 0x37474f, fillAlpha: 0.3, lineAlpha: 0.5, enterMs: 200, effects: [{ kind: 'disarm', durationMs: 700 }] } } as const

const octoInk = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 18,
  knockback: 1,
  shape: { kind: 'bolt', projectile: shot('26ab', 10), lifeMs: 1800 },
  onHit: [{ kind: 'disarm', durationMs: 1600 }],
} satisfies AbilityDef

const octoInk2 = { ...octoInk, onHit: [{ kind: 'disarm', durationMs: 1600 }, inkPuddle] } satisfies AbilityDef

const octoInk3 = {
  ...octoInk,
  onHit: [{ kind: 'if', when: { kind: 'marked', who: 'target', mark: 'disarm' }, then: [{ kind: 'root', durationMs: 1000 }], else: [{ kind: 'disarm', durationMs: 1600 }] }, inkPuddle],
} satisfies AbilityDef

const octoMist = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'whoosh',
  color: 0x263238,
  shape: { kind: 'zone', radius: 3.5, durationMs: 5000, tickMs: 500, mist: true, visual: { color: 0x263238, fillAlpha: 0.35, lineAlpha: 0.7, lineWidth: 3, enterMs: 300 } },
  onHit: [{ kind: 'disarm', durationMs: 700 }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  octoInk,
  octoInk2,
  octoInk3,
  octoMist,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 25 }, mul: { damage: 1.2 } }, { add: { maxHp: 50 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f419',
  name: '章鱼',
  desc: '喷墨让敌人看不清；墨汁结界里的同伴只挨得到结界里的打',
  role: 'controller',
  tags: ['control', 'support', 'ranged'],
  body: { drag: 4.5, mass: 1 },
  stats: { moveSpeed: 5.56, maxStamina: 80, staminaRegen: 70, exertion: 1.2 },
  skill: { name: '墨汁结界', icon: '1f32b', desc: '以自己为心张开三格半墨云五秒：云里的同伴只会被同在云里出手的敌人打到，云里的敌人一阵阵被致盲', cdMs: 15_000, ability: 'octoMist' },
  weapons: [],
  innate: [
    {
      name: '喷墨',
      icon: '26ab',
      base: 'octoInk',
      upgrades: [
        { ability: 'octoInk2', card: { icon: '1f311', name: '墨坑', desc: '墨汁落处留一滩墨，站进去的敌人被致盲' } },
        { ability: 'octoInk3', card: { icon: '1f991', name: '缠绕', desc: '打中已被致盲的敌人改为缠住它一秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
