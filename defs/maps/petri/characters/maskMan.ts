import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, shot } from '../../../kit.ts'

// 😷 口罩人：喷出一团团冷雾让敌人走不快，同一个敌人挨满三团就冻住；技能在敌人那儿拉一圈隔离带把它们关起来
const MIST = 0x80deea
const chill = { kind: 'slow', factor: 0.75, durationMs: 1000 } as const
const freezeOnThird = (ms: number) => ({ kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'status', status: 'frozen', ms }] }) as const

const maskManMist = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  range: 6.5,
  damage: 10,
  fireSfx: 'gust',
  shape: { kind: 'bolt', projectile: shot('1f32b', 9, 0.5), lifeMs: 1500 },
  onHit: [chill, freezeOnThird(1000)],
} satisfies AbilityDef

const maskManMist2 = { ...maskManMist, onHit: [chill, freezeOnThird(1500)] } satisfies AbilityDef

const maskManMist3 = { ...maskManMist2, damage: 7, repeat: { count: 2, spreadDeg: 15 } } satisfies AbilityDef

const maskManLockdown = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  fireSfx: 'clank',
  color: MIST,
  shape: { kind: 'disc', radius: 2.5, at: 'target' },
  onHit: [
    { kind: 'barrier', shape: 'ring', length: 2.5, durationMs: 4000, bodies: 'foes', shots: false, color: MIST },
    { kind: 'ground', def: { ...patch(2.5, 4000, MIST, [{ kind: 'slow', factor: 0.6, durationMs: 600 }]), tickMs: 500 } },
  ],
} satisfies AbilityDef

export const abilities = { maskManMist, maskManMist2, maskManMist3, maskManLockdown } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.45, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f637',
  name: '口罩人',
  element: 'ice',
  desc: '捂着口罩喷出一团团冷雾，挨到的走不快，同一个敌人挨满三团就冻住；技能在最近的敌人那儿拉起一圈隔离带，把圈里的敌人关在里面',
  role: 'controller',
  tags: ['control', 'ranged'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5.6, maxStamina: 100, staminaRegen: 75, exertion: 0.9 },
  skill: { name: '封控', icon: '1f6a7', desc: '以最近的敌人为心拉起一圈 2.5 格的隔离带，4 秒内敌人出不去也进不来，圈里的敌人减速 40%', cdMs: 13_000, ability: 'maskManLockdown' },
  weapons: [],
  innate: [
    {
      name: '冷雾',
      icon: '1f32b',
      base: 'maskManMist',
      upgrades: [
        { ability: 'maskManMist2', card: { icon: '1f9ca', name: '冷链', desc: '挨满三团时冻结改成 1.5 秒' } },
        { ability: 'maskManMist3', card: { icon: '1f9f4', name: '消杀', desc: '一次喷出两团，散开 15 度，每团七成伤害' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
