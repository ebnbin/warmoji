import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🤶 圣诞奶奶：毛衣上一身静电，贴身碰她的敌人挨电；烤一炉姜饼绕着自己转，见了敌人就扑上去撞一下；种下一棵挂满彩灯的圣诞树，彩灯电最近的敌人，还给队友回血
const cookies = (count: number) => ({ kind: 'summon', count, minion: { look: { emoji: '1f36a', size: 0.5 }, speed: 7, orbit: { radius: 0.7, spinRadPerSec: 3 } }, lifeMs: 5000 }) as const

const mrsClausCookies = {
  trigger: 'auto',
  cooldownMs: 1800,
  aim: 'self',
  damage: 9,
  element: 'physical',
  fireSfx: 'chirp',
  shape: cookies(2),
} satisfies AbilityDef

const mrsClausCookies2 = { ...mrsClausCookies, shape: cookies(3) } satisfies AbilityDef

const mrsClausCookies3 = { ...mrsClausCookies2, damage: 7, element: 'thunder' } satisfies AbilityDef

// 装置的能力里不能写 cycle（装置退场只撤掉第一式）也不能用 cast（从主人身上出手），电与治只能并进一条总能出手的 world
const mrsClausTree = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'recruit',
  shape: {
    kind: 'emplace',
    count: 1,
    maxAlive: 1,
    lifeMs: 10000,
    look: { emoji: '1f384', size: 1.1 },
    ability: {
      trigger: 'auto',
      cooldownMs: 1200,
      aim: 'self',
      range: 6.5,
      damage: 10,
      fireSfx: 'zap',
      shape: { kind: 'world' },
      onHit: [
        { kind: 'to', who: { side: 'foes', radius: 6.5, sort: 'nearest', count: 1 }, then: [{ kind: 'damage', amount: 0, ratio: 1 }] },
        { kind: 'to', who: { side: 'allies', radius: 3, filter: { kind: 'hpBelow', who: 'target', ratio: 1 }, sort: 'weakest', count: 1 }, then: [{ kind: 'heal', amount: 8 }] },
      ],
    },
  },
} satisfies AbilityDef

export const abilities = { mrsClausCookies, mrsClausCookies2, mrsClausCookies3, mrsClausTree } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f936',
  name: '圣诞奶奶',
  element: 'thunder',
  desc: '烤了一炉姜饼的圣诞奶奶，本身是雷，电流传不到她身上；织的毛衣一身静电，贴身碰到她的敌人挨电 6 点、出手被打断，电流再跳给身边另一个敌人。姜饼绕着她转，看见敌人就扑上去撞一下；技能种下一棵挂满彩灯的圣诞树，彩灯一闪就电最近的敌人，同时给身边的队友回血',
  role: 'summoner',
  tags: ['damage', 'summon'],
  body: { drag: 5, mass: 0.8 },
  stats: { moveSpeed: 5.2, maxStamina: 100, staminaRegen: 65, exertion: 1 },
  reactions: [{ on: 'touched', to: 'other', effects: [{ kind: 'damage', amount: 6 }] }],
  skill: {
    name: '圣诞树',
    icon: '1f384',
    desc: '在身边立一棵挂满彩灯的圣诞树 10 秒：每 1.2 秒电一下 6.5 格内最近的敌人，10 点雷伤，打断它的出手，电流再跳给 2.5 格内另一个敌人吃一半，湿的连成一片一起挨；同时给树旁 3 格内最伤的队友回 8 点血；没有敌人就不电，没人受伤就不回',
    cdMs: 15_000,
    ability: 'mrsClausTree',
  },
  weapons: [],
  innate: [
    {
      name: '姜饼',
      icon: '1f36a',
      base: 'mrsClausCookies',
      upgrades: [
        { ability: 'mrsClausCookies2', card: { icon: '1f9c1', name: '再烤一炉', desc: '一次召出三块姜饼' } },
        { ability: 'mrsClausCookies3', card: { icon: '26a1', name: '静电姜饼', desc: '姜饼在毛衣上蹭满静电，撞上去改成 7 点雷伤：打断敌人的出手，电流再跳给身边另一个敌人吃一半' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
