import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 🦫 河狸：边走边打下会射木刺的木桩；技能在前方筑起一道坝，挡住敌人和敌方弹体
const spike = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'nearest',
  range: 6,
  damage: 9,
  fireSfx: 'chip',
  shape: { kind: 'bolt', projectile: shot('1f962', 10, 0.42, 225), lifeMs: 1200 },
} satisfies AbilityDef

const barbed = { ...spike, knockback: 1.5, onHit: [{ kind: 'slow', factor: 0.75, durationMs: 1000 }] } satisfies AbilityDef

const stake = (ability: AbilityDef, maxAlive: number) =>
  ({
    trigger: 'auto',
    cooldownMs: 4200,
    aim: 'self',
    fireSfx: 'thud',
    shape: { kind: 'emplace', count: 1, maxAlive, lifeMs: 12000, look: { emoji: '1fab5', size: 0.9 }, ability },
  }) satisfies AbilityDef

const damBeaverStake = stake(spike, 2)
const damBeaverStake2 = stake(spike, 3)
const damBeaverStake3 = stake(barbed, 3)

const damBeaverDam = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'creak',
  shape: { kind: 'world' },
  onHit: [{ kind: 'barrier', shape: 'wall', length: 6, offset: 2, durationMs: 6000, bodies: 'foes', shots: true, color: 0x8d6e63 }],
} satisfies AbilityDef

export const abilities = { damBeaverStake, damBeaverStake2, damBeaverStake3, damBeaverDam } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9ab',
  name: '河狸',
  element: 'wood',
  desc: '勤快的河狸：边走边打下会射木刺的木桩，每根立 12 秒；技能在前方筑起一道长坝，敌人过不来、敌方的弹体也打不过来',
  role: 'summoner',
  tags: ['damage', 'summon'],
  body: { drag: 5, mass: 1.1 },
  stats: { moveSpeed: 5, maxStamina: 120, staminaRegen: 60, exertion: 1 },
  skill: { name: '筑坝', icon: '1f9f1', desc: '在摇杆方向 2 格处筑起一道 6 格长的坝，6 秒内挡住敌人和敌方的弹体', cdMs: 13_000, ability: 'damBeaverDam', aim: true },
  weapons: [],
  innate: [
    {
      name: '木桩',
      icon: '1fab5',
      base: 'damBeaverStake',
      upgrades: [
        { ability: 'damBeaverStake2', card: { icon: '1fa93', name: '多打几根', desc: '最多同时立三根木桩' } },
        { ability: 'damBeaverStake3', card: { icon: '1f335', name: '倒刺', desc: '木刺打中的敌人被击退，1 秒内移速 ×0.75' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
