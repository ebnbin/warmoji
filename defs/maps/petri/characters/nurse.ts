import type { AbilityDef, Effect } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🧑‍⚕️ 医护：给伤得最重的队友打一针，再朝敌人甩一支飞针，两样轮着来；技能给全队急救，倒下的当场站起来
const heal = { kind: 'heal', amount: 13 } as const
const vaccine = [heal, { kind: 'cleanse' }, { kind: 'shield', amount: 0, ratio: 0.05, ms: 3000 }] as const

const needle = {
  trigger: 'manual',
  class: 'attack',
  aim: 'nearest',
  range: 6.5,
  damage: 12,
  fireSfx: 'tink',
  shape: { kind: 'bolt', projectile: shot('1f489', 11, 0.48, 135), lifeMs: 1400 },
} satisfies AbilityDef

const sleepNeedle = { ...needle, onHit: [{ kind: 'sleep', durationMs: 1500, wakeMul: 1.3 }] } satisfies AbilityDef

// 轮流的两式都得总放得出去、没有对象就空过，否则会卡在其中一式：打针挑人，飞针套一层 cast
const toss = (ability: Extract<AbilityDef, { readonly trigger: 'manual' }>) =>
  ({ trigger: 'auto', cooldownMs: 1150, aim: 'self', shape: { kind: 'world' }, onHit: [{ kind: 'cast', ability }] }) satisfies AbilityDef

const jab = (then: readonly Effect[]) =>
  ({
    trigger: 'auto',
    cooldownMs: 1150,
    aim: 'self',
    fireSfx: 'chirp',
    shape: { kind: 'world' },
    onHit: [{ kind: 'to', who: { side: 'allies', radius: 5, filter: { kind: 'hpBelow', who: 'target', ratio: 1 }, sort: 'weakest', count: 1 }, then }],
  }) satisfies AbilityDef

const nurseKit = { ...jab([heal]), cycle: [toss(needle)] } satisfies AbilityDef
const nurseKit2 = { ...jab(vaccine), cycle: [toss(needle)] } satisfies AbilityDef
const nurseKit3 = { ...jab(vaccine), cycle: [toss(sleepNeedle)] } satisfies AbilityDef

const nurseFirstAid = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'revive',
  color: 0xa5d6a7,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies', downed: true },
  onHit: [{ kind: 'revive' }, { kind: 'healRatio', ratio: 0.3 }, { kind: 'mend', amount: 4, tickMs: 500, durationMs: 4000 }],
} satisfies AbilityDef

export const abilities = { nurseKit, nurseKit2, nurseKit3, nurseFirstAid } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { healing: 1.2 } }, { add: { maxHp: 20 }, mul: { healing: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_2695_fe0f',
  name: '医护',
  element: 'light',
  desc: '打针和飞针轮着来：一针扎给 5 格内伤得最重的队友，一针甩向最近的敌人，没人受伤或没有敌人时那一下就空过；技能给全队急救，倒下的当场站起来',
  role: 'support',
  tags: ['support', 'ranged'],
  body: { drag: 5, mass: 0.7 },
  stats: { moveSpeed: 5.8, maxStamina: 90, staminaRegen: 85, exertion: 0.8 },
  skill: { name: '急救', icon: '1f691', desc: '倒下的队友当场站起来，其余队友回 30% 生命；全队再在 4 秒里每半秒回 4 点血', cdMs: 18_000, ability: 'nurseFirstAid' },
  weapons: [],
  innate: [
    {
      name: '针剂',
      icon: '1f489',
      base: 'nurseKit',
      upgrades: [
        { ability: 'nurseKit2', card: { icon: '1fa79', name: '疫苗', desc: '打针时顺带解掉控制与减速，再挂上生命 5% 的护盾 3 秒' } },
        { ability: 'nurseKit3', card: { icon: '1f4a4', name: '麻醉针', desc: '飞针打中的敌人睡 1.5 秒，挨打才醒，醒的那一下伤害 ×1.3' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
