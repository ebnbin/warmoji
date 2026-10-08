import type { AbilityDef } from '../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../src/types/characters'
import type { StatMods } from '../../../src/types/stats'
import { shot } from '../abilityKit.ts'

// 🦜 鹦鹉：学舌，借敌人的招来用
const parrotMimic = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 14,
  knockback: 1,
  shape: { kind: 'bolt', projectile: shot('1f3b5', 11), lifeMs: 1800 },
  onHit: [{ kind: 'steal', ms: 6000, cooldownMs: 1400 }],
} satisfies AbilityDef

const parrotMimic2 = { ...parrotMimic, onHit: [{ kind: 'steal', ms: 6000, cooldownMs: 1400 }, { kind: 'silence', durationMs: 2000 }] } satisfies AbilityDef

const parrotMimic3 = { ...parrotMimic2, repeat: { everyN: 3, count: 2, delayMs: 250, reaim: 'nearest' } } satisfies AbilityDef

const parrotChatter = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'zap',
  color: 0x81c784,
  damage: 20,
  shape: { kind: 'disc', radius: 4, at: 'self' },
  onHit: [{ kind: 'silence', durationMs: 3500 }, { kind: 'interrupt' }],
} satisfies AbilityDef

/** 这名角色的能力：主动技能与天生能力、武器的各档，按 id */
export const abilities = {
  parrotMimic,
  parrotMimic2,
  parrotMimic3,
  parrotChatter,
} satisfies Record<string, AbilityDef>

/** 2 级起每一级的属性加成 */
export const levels = [{ add: { maxHp: 15 }, mul: { cooldown: 0.88 } }, { add: { maxHp: 35 }, mul: { cooldown: 0.75 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f99c',
  name: '鹦鹉',
  desc: '学舌：被它打中的敌人，招式借给它用六秒',
  role: 'controller',
  tags: ['control', 'ranged'],
  body: { drag: 5, mass: 0.6 },
  stats: { moveSpeed: 6, maxStamina: 80, staminaRegen: 75, exertion: 0.8 },
  skill: { name: '喋喋不休', icon: '1f4ac', desc: '四格内的敌人被吵得沉默三秒半（放不出技能），正在蓄力的被打断', cdMs: 14_000, ability: 'parrotChatter' },
  weapons: [],
  innate: [
    {
      name: '学舌',
      icon: '1f3b5',
      base: 'parrotMimic',
      upgrades: [
        { ability: 'parrotMimic2', card: { icon: '1f910', name: '抢词', desc: '学舌时让对方沉默两秒' } },
        { ability: 'parrotMimic3', card: { icon: '1f501', name: '回声', desc: '每第三次学舌立刻朝另一个敌人再学一遍' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
