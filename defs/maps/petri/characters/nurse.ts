import type { AbilityDef, Effect } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🧑‍⚕️ 医护：给伤得最重的队友打一针，再朝敌人甩一支飞针，两样轮着来；技能给全队急救，倒下的当场站起来
const heal = { kind: 'heal', amount: 13, scope: 'lowest' } as const
const prescription = { kind: 'heal', amount: 13, scope: 'all', ratio: 0.6 } as const

const needle = {
  trigger: 'manual',
  class: 'attack',
  aim: 'nearest',
  range: 6.5,
  damage: 12,
  fireSfx: 'tink',
  shape: { kind: 'bolt', projectile: shot('1f489', 11, 0.48, 135), lifeMs: 1400 },
} satisfies AbilityDef

const jab = (onHit: readonly Effect[]) =>
  ({
    trigger: 'manual',
    class: 'attack',
    aim: 'self',
    fireSfx: 'chirp',
    shape: { kind: 'disc', radius: 5, at: 'self', of: 'hurt' },
    onHit,
  }) satisfies AbilityDef

// 轮流的两式都得总放得出去、没有对象就空过，否则会卡在其中一式：打针与飞针各套一层 cast
const toss = (ability: Extract<AbilityDef, { readonly trigger: 'manual' }>) =>
  ({ trigger: 'auto', cooldownMs: 1150, aim: 'self', shape: { kind: 'world' }, onHit: [{ kind: 'cast', ability }] }) satisfies AbilityDef

const nurseKit = { ...toss(jab([heal])), cycle: [toss(needle)] } satisfies AbilityDef
const nurseKit2 = { ...toss(jab([prescription])), cycle: [toss(needle)] } satisfies AbilityDef
const nurseKit3 = { ...toss(jab([{ kind: 'reviveCut', ms: 2000 }, prescription])), cycle: [toss(needle)] } satisfies AbilityDef

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
  desc: '打针和飞针轮着来：一针扎给 5 格内伤得最重的队友，回 13 点血，一针甩向最近的敌人，没人受伤或没有敌人时那一下就空过；技能给全队急救，倒下的当场站起来',
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
        { ability: 'nurseKit2', card: { icon: '1f97c', name: '群体处方', desc: '打针改成给 5 格内每个受伤的队友都扎一针，各回 8 点血（一针的 60%）' } },
        { ability: 'nurseKit3', card: { icon: '26a1', name: '电击起搏', desc: '每打一针，倒下的队友里还要等得最久的那个少等 2 秒，不论远近' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
