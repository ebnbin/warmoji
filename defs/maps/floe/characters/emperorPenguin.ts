import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, ring, shot } from '../../../kit.ts'

// 🐣 企鹅宝宝：远远扔出放臭了的鱼，打中一下叠一层毒，打倒 25 个敌人就长成帝企鹅；技能缩回蛋壳回血，破壳时臭蛋味炸开，留下一片毒云
const emperorPenguinFish = {
  trigger: 'auto',
  cooldownMs: 550,
  aim: 'nearest',
  range: 7.5,
  damage: 11,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1f41f', 11, 0.45), lifeMs: 1100 },
} satisfies AbilityDef

// 同时散开的几发不按 repeat.ratio 打折
const emperorPenguinFish2 = { ...emperorPenguinFish, damage: 8, repeat: { count: 3, spreadDeg: 20 } } satisfies AbilityDef

const emperorPenguinFish3 = { ...emperorPenguinFish2, reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'grow', mul: 1.04, max: 1.35 }] }] } satisfies AbilityDef

// 长成帝企鹅后整套普攻换成这一招
const emperorFish = {
  trigger: 'auto',
  cooldownMs: 600,
  aim: 'nearest',
  range: 8,
  damage: 10,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: { ...shot('1f41f', 9, 0.5), flight: { kind: 'homing', degPerSec: 220 } }, lifeMs: 1500 },
  repeat: { count: 3, spreadDeg: 50 },
} satisfies AbilityDef

const emperorPenguinShell = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  damage: 24,
  shape: { kind: 'world' },
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [
        { kind: 'stasis', durationMs: 2500 },
        { kind: 'healRatio', ratio: 0.35 },
        {
          kind: 'fuse',
          ms: 2500,
          then: [
            { kind: 'blast', radius: 2.6, ratio: 1.5, knockback: 3, ring: ring(0xc5e1a5) },
            { kind: 'ground', def: patch(3, 4000, 0x9ccc65, undefined, 4, 1000) },
          ],
        },
      ],
    },
  ],
} satisfies AbilityDef

export const abilities = { emperorPenguinFish, emperorPenguinFish2, emperorPenguinFish3, emperorPenguinShell } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2, projSpeed: 1.1 } }, { add: { crit: 0.08 }, mul: { damage: 1.45, projSpeed: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f423',
  name: '企鹅宝宝',
  element: 'poison',
  traits: ['swims'],
  desc: '刚破壳的企鹅宝宝，吃惯了臭鱼，本身是毒的、不会中毒，会游泳：一摇一摆地远远扔出放臭了的鱼，打中一下中一层毒，最多叠五层，中了毒的什么回复都不管用；打倒 25 个敌人就长成帝企鹅，这一局都不再变回去，改扔三条追着敌人拐弯的臭鱼；技能缩回蛋壳 2.5 秒回血，破壳时臭蛋味炸开，原地留下一片毒云',
  role: 'ranged',
  tags: ['damage', 'ranged'],
  body: { drag: 4.5, mass: 0.7 },
  stats: { moveSpeed: 5.2, maxStamina: 100, staminaRegen: 70, exertion: 0.9 },
  skill: {
    name: '缩回蛋壳',
    icon: '1f95a',
    desc: '缩回蛋壳 2.5 秒：期间无敌、谁也选不中、自己也动不了，回 35% 的生命；破壳时 2.6 格内的敌人吃 36 点伤害、中一层毒，原地留下 3 格的毒云 4 秒，云里的敌人每秒掉 4 点血、再中一层毒',
    cdMs: 15_000,
    ability: 'emperorPenguinShell',
  },
  weapons: [],
  innate: [
    {
      name: '臭鱼',
      icon: '1f41f',
      base: 'emperorPenguinFish',
      upgrades: [
        { ability: 'emperorPenguinFish2', card: { icon: '1f420', name: '群射', desc: '一次扔出三条臭鱼，散开 20 度，每条 8 点伤害，各叠一层毒' } },
        { ability: 'emperorPenguinFish3', card: { icon: '1f35e', name: '贪吃', desc: '臭鱼每打死一个敌人，体型长大 4%，这一波都不消退，最多长到 1.35 倍' } },
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
