import type { AbilityDef, Effect } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { shot } from '../../../kit.ts'

// 👼 星之使者：星辉治最伤的队友，星弹打敌人，两样轮着来；技能让倒下的队友全部站起来，全队回血并短暂无敌
const HEAL = { kind: 'heal', amount: 12 } as const
const SHIELD = { kind: 'shield', amount: 0, ratio: 0.06, ms: 3000 } as const
const MEND = { kind: 'mend', amount: 3, tickMs: 500, durationMs: 3000 } as const

const starShot = {
  trigger: 'manual',
  class: 'attack',
  aim: 'nearest',
  range: 6.5,
  damage: 13,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('2b50', 9, 0.42), lifeMs: 1400 },
} satisfies AbilityDef

// 两式都用 world 出手：没人受伤、射程里没敌人也算出了手，轮换才不会卡在哪一式
const glow = (then: readonly Effect[]) =>
  ({
    trigger: 'auto',
    cooldownMs: 1200,
    aim: 'self',
    fireSfx: 'chirp',
    shape: { kind: 'world' },
    onHit: [{ kind: 'to', who: { side: 'allies', radius: 5, filter: { kind: 'hpBelow', who: 'target', ratio: 1 }, sort: 'weakest', count: 1 }, then }],
  }) satisfies AbilityDef

const star = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'self',
  shape: { kind: 'world' },
  onHit: [{ kind: 'cast', ability: starShot }],
} satisfies AbilityDef

const starAngelGlow = { ...glow([HEAL]), cycle: [star] } satisfies AbilityDef
const starAngelGlow2 = { ...glow([HEAL, SHIELD]), cycle: [star] } satisfies AbilityDef
const starAngelGlow3 = { ...glow([HEAL, SHIELD, MEND]), cycle: [star] } satisfies AbilityDef

const starAngelDescent = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'revive',
  color: 0xfff59d,
  fxRadius: 1.5,
  shape: { kind: 'all', of: 'allies', downed: true },
  onHit: [{ kind: 'revive' }, { kind: 'healRatio', ratio: 0.3 }, { kind: 'invuln', ms: 1500 }],
} satisfies AbilityDef

export const abilities = { starAngelGlow, starAngelGlow2, starAngelGlow3, starAngelDescent } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { healing: 1.2 } }, { add: { maxHp: 20 }, mul: { healing: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f47c',
  name: '星之使者',
  desc: '从星空飞下来的小天使：星辉治 5 格内最伤的那个队友，星弹打 6.5 格内最近的敌人，两样轮着来；没人受伤或射程里没敌人时，轮到的那一下空过，轮换照走；技能让倒下的队友全部站起来，全队回血并短暂无敌',
  role: 'support',
  tags: ['support', 'ranged'],
  body: { drag: 5, mass: 0.6 },
  stats: { moveSpeed: 5.8, maxStamina: 85, staminaRegen: 85, exertion: 0.7 },
  skill: { name: '天使降临', icon: '1fabd', desc: '倒下的队友全部复活，全队回复生命上限 30% 的血并无敌 1.5 秒', cdMs: 18_000, ability: 'starAngelDescent' },
  weapons: [],
  innate: [
    {
      name: '星辉',
      icon: '2728',
      base: 'starAngelGlow',
      upgrades: [
        { ability: 'starAngelGlow2', card: { icon: '1f64f', name: '祝福', desc: '星辉治的那个队友再挂上生命 6% 的护盾 3 秒' } },
        { ability: 'starAngelGlow3', card: { icon: '1f4ab', name: '星环', desc: '星辉治的那个队友 3 秒里每半秒再回 3 点血' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
