import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🐘 大象：绕身转的水罐给附近最伤的队友浇水，长鼻子喷出水柱冲开敌人，两样轮着来；技能给全队裹上一层挡三下的泥
const jar = { emoji: '1f3fa', size: 0.7 } as const

const mostHurt = { side: 'allies', radius: 4, filter: { kind: 'hpBelow', who: 'target', ratio: 1 }, sort: 'weakest', count: 1 } as const

const elephantPour = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'self',
  fireSfx: 'splash',
  shape: { kind: 'world' },
  anchor: { look: jar, mode: 'orbit', distance: 1.6 },
  onHit: [{ kind: 'to', who: mostHurt, then: [{ kind: 'heal', amount: 12 }] }],
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

// 轮换只在这一式真放出去后才往下走，所以水柱套在总能出手的 world 里，身边没敌人就喷空
const elephantJet = { trigger: 'auto', cooldownMs: 1200, aim: 'self', shape: { kind: 'world' }, onHit: [{ kind: 'cast', ability: jet }] } satisfies AbilityDef

const elephantSpray = { ...elephantPour, cycle: [elephantJet] } satisfies AbilityDef

const elephantSpray2 = { ...elephantPour, anchor: { look: jar, mode: 'trail', distance: 0 }, cycle: [elephantJet] } satisfies AbilityDef

const elephantSpray3 = { ...elephantPour, anchor: { look: jar, mode: 'ally', distance: 1 }, cycle: [elephantJet] } satisfies AbilityDef

const elephantMud = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'splash',
  color: 0x8d6e63,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies' },
  onHit: [
    { kind: 'spellShield', count: 3, durationMs: 6000 },
    { kind: 'mend', amount: 4, tickMs: 500, durationMs: 4000 },
  ],
} satisfies AbilityDef

export const abilities = { elephantSpray, elephantSpray2, elephantSpray3, elephantMud } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { healing: 1.2 } }, { add: { maxHp: 20 }, mul: { healing: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f418',
  name: '大象',
  element: 'water',
  desc: '带着一只水罐的大象，两样轮着来：绕着身子转的水罐给 4 格内最伤的队友浇 12 点水，长鼻子喷出水柱把 3 格内的敌人冲开；没人受伤时那一下浇空，身边没敌人时那一下喷空，照样轮着来；技能给全队裹上一层泥，挡下接下来 3 次命中，再慢慢回血',
  role: 'support',
  tags: ['support', 'area'],
  body: { drag: 5.5, mass: 1.8 },
  stats: { moveSpeed: 4.4, maxStamina: 130, staminaRegen: 50, exertion: 1.1 },
  skill: { name: '泥浴', icon: '1f6c1', desc: '全队裹上一层泥 6 秒，每人挡下接下来 3 次命中；4 秒里每半秒回 4 点血', cdMs: 16_000, ability: 'elephantMud' },
  weapons: [],
  innate: [
    {
      name: '水罐',
      icon: '1f3fa',
      base: 'elephantSpray',
      upgrades: [
        { ability: 'elephantSpray2', card: { icon: '1f463', name: '落罐', desc: '水罐改为落在 1.5 秒前走过的地方，给那一带 4 格内最伤的队友浇水' } },
        { ability: 'elephantSpray3', card: { icon: '1f91d', name: '贴身照料', desc: '水罐改为贴着血量最低的队友，给它身边 4 格内最伤的队友浇水，离自己多远都浇得到' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
