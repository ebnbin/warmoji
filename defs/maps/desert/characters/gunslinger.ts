import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch, ring, shot } from '../../../kit.ts'

// 🤠 牛仔：一口气打空左轮，发发是燃烧弹，每匣最后一发在打中处炸开一团火把旁边的一起点着；技能甩出套索，把一条线上的敌人拴在身后拖着走
const bullet = shot('1f538', 14, 0.32)

const flareUp = { kind: 'blast', radius: 1.2, ratio: 1, knockback: 0, ring: ring(0xff7043) } as const

const gunslingerRevolver = {
  trigger: 'auto',
  cooldownMs: 350,
  aim: 'nearest',
  range: 7,
  damage: 11,
  fireSfx: 'shoot',
  held: { look: { emoji: '1f52b', size: 0.75, rotationOffsetDeg: 180 }, restOffset: 0.45, mountSide: 1, mountGap: 0.32 },
  shape: { kind: 'bolt', projectile: bullet, lifeMs: 600 },
  ammo: { count: 6, reloadMs: 1500, last: [flareUp] },
} satisfies AbilityDef

const gunslingerRevolver2 = {
  ...gunslingerRevolver,
  ammo: { ...gunslingerRevolver.ammo, last: [flareUp, { kind: 'ground', def: patch(1.2, 3000, 0xff7043, undefined, 4, 500) }] },
} satisfies AbilityDef

const gunslingerRevolver3 = { ...gunslingerRevolver2, repeat: { everyN: 3, count: 5, spreadDeg: 32, ratio: 0.6 } } satisfies AbilityDef

const gunslingerLasso = {
  trigger: 'manual',
  aim: 'nearest',
  range: 6.5,
  element: 'physical',
  damage: 20,
  fireSfx: 'whoosh',
  color: 0xa1887f,
  shape: { kind: 'segment', reach: 6.5, radius: 0.45, ms: 220, beam: true },
  onHit: [{ kind: 'drag', ms: 2500 }],
} satisfies AbilityDef

export const abilities = { gunslingerRevolver, gunslingerRevolver2, gunslingerRevolver3, gunslingerLasso } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { damage: 1.2 } }, { add: { crit: 0.08 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f920',
  name: '牛仔',
  element: 'fire',
  desc: '腰里别着左轮的牛仔，本身点不着：一匣 6 发一口气打完，发发都是燃烧弹，打中就点着，烧着的敌人还会烧到贴着的同伴；每匣最后一发在打中处炸开 1.2 格的火，旁边的敌人挨一下、一起点着；打空了得停 1.5 秒换弹；技能甩出套索，把一条线上的敌人拴在身后拖着走',
  role: 'ranged',
  tags: ['damage', 'control', 'ranged'],
  body: { drag: 4.5, mass: 1 },
  stats: { moveSpeed: 5.8, maxStamina: 100, staminaRegen: 70, exertion: 1 },
  skill: { name: '套索', icon: '1faa2', desc: '朝最近的敌人甩出 6.5 格长的套索，套中的敌人挨 20 点，被拴在身后拖行 2.5 秒，期间动弹不得', cdMs: 12_000, ability: 'gunslingerLasso' },
  weapons: [],
  innate: [
    {
      name: '左轮',
      icon: '1f52b',
      base: 'gunslingerRevolver',
      upgrades: [
        { ability: 'gunslingerRevolver2', card: { icon: '1f9e8', name: '火场', desc: '每匣最后一发炸开的地方再烧起 1.2 格的火 3 秒，每半秒烫一下，站在里面的一直被点着' } },
        { ability: 'gunslingerRevolver3', card: { icon: '1f32a', name: '左轮风暴', desc: '每第 3 发改成散开 32 度的 5 发，旁边 4 发六成伤害' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
