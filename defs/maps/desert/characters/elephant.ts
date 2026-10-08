import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🐘 大象：淋水给最伤的队友冲一冲，水柱把敌人冲开，两样轮着来；技能撑起一圈反弹弹体的水幕
const mostHurt = { side: 'allies', radius: 4, filter: { kind: 'hpBelow', who: 'target', ratio: 1 }, sort: 'weakest', count: 1 } as const

const showerHeal = { kind: 'heal', amount: 12 } as const

const elephantShower = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'self',
  fireSfx: 'splash',
  shape: { kind: 'world' },
  onHit: [{ kind: 'to', who: mostHurt, then: [showerHeal] }],
} satisfies AbilityDef

const elephantShower2 = {
  ...elephantShower,
  onHit: [{ kind: 'to', who: mostHurt, then: [showerHeal, { kind: 'mend', amount: 3, tickMs: 500, durationMs: 2000 }] }],
} satisfies AbilityDef

const jet = {
  trigger: 'manual',
  class: 'attack',
  aim: 'nearest',
  range: 3,
  damage: 12,
  fireSfx: 'wash',
  color: 0x4fc3f7,
  shape: { kind: 'sector', radius: 3, arcDeg: 60, ms: 200 },
  onHit: [{ kind: 'shove', distance: 1.5, ms: 220 }],
} satisfies AbilityDef

const mudJet = { ...jet, onHit: [...jet.onHit, { kind: 'attune', element: 'water', ms: 4000 }] } satisfies AbilityDef

// 轮换只在这一式真放出去后才往下走，所以水柱套在总能出手的 world 里，身边没敌人就喷空
const elephantJet = { trigger: 'auto', cooldownMs: 1200, aim: 'self', shape: { kind: 'world' }, onHit: [{ kind: 'cast', ability: jet }] } satisfies AbilityDef

const elephantMudJet = { ...elephantJet, onHit: [{ kind: 'cast', ability: mudJet }] } satisfies AbilityDef

const elephantSpray = { ...elephantShower, cycle: [elephantJet] } satisfies AbilityDef

const elephantSpray2 = { ...elephantShower2, cycle: [elephantJet] } satisfies AbilityDef

const elephantSpray3 = { ...elephantShower2, cycle: [elephantMudJet] } satisfies AbilityDef

const elephantCurtain = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'splash',
  color: 0x4fc3f7,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies' },
  onHit: [
    { kind: 'mend', amount: 4, tickMs: 500, durationMs: 4000 },
    { kind: 'barrier', shape: 'ring', length: 2.5, durationMs: 5000, bodies: 'none', shots: true, reflect: true, follow: true, color: 0x4fc3f7 },
  ],
} satisfies AbilityDef

export const abilities = { elephantSpray, elephantSpray2, elephantSpray3, elephantCurtain } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { healing: 1.2 } }, { add: { maxHp: 20 }, mul: { healing: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f418',
  name: '大象',
  element: 'water',
  desc: '大象甩着长鼻子，两样轮着来：一下淋水，给 4 格内最伤的队友冲一冲；一下喷出水柱，把 3 格内的敌人冲开。没人受伤时那一下淋空，身边没敌人时那一下喷空，照样轮着来；技能撑起一圈跟着自己的水幕，弹回射来的东西，全队慢慢回血',
  role: 'support',
  tags: ['support', 'area'],
  body: { drag: 5.5, mass: 1.8 },
  stats: { moveSpeed: 4.4, maxStamina: 130, staminaRegen: 50, exertion: 1.1 },
  skill: { name: '水幕', icon: '1f30a', desc: '身周撑起一圈 2.5 格的水幕 5 秒，跟着自己走、把敌人射来的弹反弹回去；全队 4 秒里每半秒回 4 点血', cdMs: 15_000, ability: 'elephantCurtain' },
  weapons: [],
  innate: [
    {
      name: '喷水',
      icon: '1f418',
      base: 'elephantSpray',
      upgrades: [
        { ability: 'elephantSpray2', card: { icon: '1f6bf', name: '淋浴', desc: '淋水冲过的队友 2 秒里每半秒再回 3 点血' } },
        { ability: 'elephantSpray3', card: { icon: '1f6c1', name: '泥浴', desc: '被水柱冲到的敌人 4 秒内变成水元素' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
