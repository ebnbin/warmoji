import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { patch } from '../../../kit.ts'

// 🐙 章鱼：伸出长长的触手把敌人拽到跟前；技能落下一团墨，墨阵里的敌人走不动也打不出手
const PULL = { kind: 'pull', speed: 10, gap: 1 } as const

const inkOctopusArm = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  range: 3.1,
  damage: 12,
  fireSfx: 'whoosh',
  shape: { kind: 'segment', reach: 3, radius: 0.5, ms: 180 },
  onHit: [PULL],
} satisfies AbilityDef

const inkOctopusArm2 = { ...inkOctopusArm, onHit: [PULL, { kind: 'root', durationMs: 1000 }] } satisfies AbilityDef

const inkOctopusArm3 = { ...inkOctopusArm2, repeat: { count: 2, delayMs: 200, reaim: 'nearest' } } satisfies AbilityDef

const inkOctopusInk = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  damage: 12,
  fireSfx: 'gurgle',
  shape: { kind: 'drop', targets: 1, look: { emoji: '26ab', size: 1.1 }, fromAbove: 3, dropMs: 500, staggerMs: 0 },
  onHit: [{ kind: 'ground', def: patch(3.2, 4000, 0x263238, [{ kind: 'root', durationMs: 600 }, { kind: 'disarm', durationMs: 600 }], 0, 500) }],
} satisfies AbilityDef

export const abilities = { inkOctopusArm, inkOctopusArm2, inkOctopusArm3, inkOctopusInk } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, skillCooldown: 0.92 } }, { add: { maxHp: 15 }, mul: { damage: 1.4, skillCooldown: 0.85 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f419',
  name: '章鱼',
  element: 'dark',
  desc: '八条腕足的章鱼：伸出 3 格长的触手，把打中的敌人拽到跟前；技能在敌人头上落一团墨，墨阵里的敌人走不动也打不出手',
  role: 'controller',
  tags: ['control', 'melee'],
  body: { drag: 5, mass: 0.8 },
  stats: { moveSpeed: 5.4, maxStamina: 95, staminaRegen: 75, exertion: 0.9 },
  skill: { name: '墨阵', icon: '26ab', desc: '在最近的敌人头上落一团墨，地上留下 3.2 格的墨阵 4 秒：里面的敌人每半秒定身 0.6 秒、致盲 0.6 秒', cdMs: 13_000, ability: 'inkOctopusInk' },
  weapons: [],
  innate: [
    {
      name: '八爪',
      icon: '1f419',
      base: 'inkOctopusArm',
      upgrades: [
        { ability: 'inkOctopusArm2', card: { icon: '1f9f2', name: '吸盘', desc: '拽过来的敌人定身 1 秒' } },
        { ability: 'inkOctopusArm3', card: { icon: '1f590', name: '多腕', desc: '一次甩出两条触手，第二条重新抓最近的敌人' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
