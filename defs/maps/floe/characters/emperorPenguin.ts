import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { ring, shot } from '../../../kit.ts'

// 🐣 企鹅宝宝：远远扔出冻得梆硬的鱼，打倒 25 个敌人就长成帝企鹅，这一局不再变回去；技能缩回蛋壳回血，破壳时震开周围
const emperorPenguinFish = {
  trigger: 'auto',
  cooldownMs: 550,
  aim: 'nearest',
  range: 7.5,
  damage: 14,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1f41f', 11, 0.45), lifeMs: 1100 },
} satisfies AbilityDef

// 同时散开的几发不按 repeat.ratio 打折
const emperorPenguinFish2 = { ...emperorPenguinFish, damage: 10, repeat: { count: 3, spreadDeg: 20 } } satisfies AbilityDef

const emperorPenguinFish3 = { ...emperorPenguinFish2, reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'grow', mul: 1.04, max: 1.35 }] }] } satisfies AbilityDef

// 长成帝企鹅后整套普攻换成这一招
const emperorFish = {
  trigger: 'auto',
  cooldownMs: 600,
  aim: 'nearest',
  range: 8,
  damage: 13,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: { ...shot('1f41f', 9, 0.5), flight: { kind: 'homing', degPerSec: 220 } }, lifeMs: 1500 },
  repeat: { count: 3, spreadDeg: 50 },
  onHit: [{ kind: 'stack', max: 3, durationMs: 3000, then: [{ kind: 'status', status: 'frozen', ms: 800 }] }],
} satisfies AbilityDef

const emperorPenguinShell = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  damage: 30,
  shape: { kind: 'world' },
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [
        { kind: 'stasis', durationMs: 2500 },
        { kind: 'healRatio', ratio: 0.35 },
        { kind: 'fuse', ms: 2500, then: [{ kind: 'blast', radius: 2.6, ratio: 1.5, knockback: 12, ring: ring(0xe1f5fe) }] },
      ],
    },
  ],
} satisfies AbilityDef

export const abilities = { emperorPenguinFish, emperorPenguinFish2, emperorPenguinFish3, emperorPenguinShell } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, projSpeed: 1.1 } }, { add: { crit: 0.08 }, mul: { damage: 1.45, projSpeed: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f423',
  name: '企鹅宝宝',
  element: 'water',
  desc: '刚破壳的企鹅宝宝，一摇一摆地远远扔出冻得梆硬的鱼；打倒 25 个敌人就长成帝企鹅，这一局都不再变回去，改扔三条追着敌人拐弯的冻鱼，同一个敌人 3 秒内挨满三条就冻住 0.8 秒；技能缩回蛋壳 2.5 秒回血，破壳时震开周围的敌人',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.5, mass: 0.7 },
  stats: { moveSpeed: 5.2, maxStamina: 100, staminaRegen: 70, exertion: 0.9 },
  skill: {
    name: '缩回蛋壳',
    icon: '1f95a',
    desc: '缩回蛋壳 2.5 秒：期间无敌、谁也选不中、自己也动不了，回 35% 的生命；破壳时 2.6 格内的敌人吃 45 点伤害并被远远震开',
    cdMs: 15_000,
    ability: 'emperorPenguinShell',
  },
  weapons: [],
  innate: [
    {
      name: '冰鱼',
      icon: '1f41f',
      base: 'emperorPenguinFish',
      upgrades: [
        { ability: 'emperorPenguinFish2', card: { icon: '1f420', name: '群射', desc: '一次扔出三条鱼，散开 20 度，每条 10 点伤害' } },
        { ability: 'emperorPenguinFish3', card: { icon: '1f35e', name: '贪吃', desc: '冰鱼每打死一个敌人，体型长大 4%，这一波都不消退，最多长到 1.35 倍' } },
      ],
    },
  ],
  resource: { kind: 'growth', max: 25, onKill: 1, keep: true, full: { effects: [{ kind: 'form', to: 0 }] } },
  forms: [
    {
      emoji: '1f427',
      name: '帝企鹅',
      stats: { mul: { scale: 1.15, moveSpeed: 1.1, exertion: 0.7 } },
      abilities: [emperorFish],
    },
  ],
} as const satisfies CharacterAuthoring
