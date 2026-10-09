import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🐕‍🦺 搜救犬：浑身湿透，药包叼给伤得最重的队友，吠叫时甩出一身水把身前的敌人浇湿，两样轮着来；技能把倒下的队友全都救起来
// 药包与吠叫都从总能放出去的 world 出手，免得没人受伤或身边没敌人时轮换卡住
const hurtAlly = { side: 'allies', radius: 5, filter: { kind: 'hpBelow', who: 'target', ratio: 1 }, sort: 'weakest', count: 1 } as const

const rescueDogKit = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'self',
  fireSfx: 'chirp',
  shape: { kind: 'world' },
  onHit: [{ kind: 'to', who: hurtAlly, then: [{ kind: 'heal', amount: 12 }] }],
} satisfies AbilityDef

const bark = {
  trigger: 'manual',
  class: 'attack',
  aim: 'nearest',
  range: 2.4,
  damage: 8,
  fireSfx: 'bleat',
  color: 0x42a5f5,
  shape: { kind: 'sector', radius: 2.2, arcDeg: 110, ms: 160 },
} satisfies AbilityDef

const rescueDogBark = { trigger: 'auto', cooldownMs: 1200, aim: 'self', shape: { kind: 'world' }, onHit: [{ kind: 'cast', ability: bark }] } satisfies AbilityDef

const rescueDogGrowl = { ...rescueDogBark, onHit: [{ kind: 'cast', ability: { ...bark, onHit: [{ kind: 'fear', durationMs: 800 }] } }] } satisfies AbilityDef

const rescueDogCare = { ...rescueDogKit, cycle: [rescueDogBark] } satisfies AbilityDef

const rescueDogKit2 = { ...rescueDogKit, onHit: [{ kind: 'to', who: hurtAlly, then: [{ kind: 'cleanse' }, { kind: 'heal', amount: 12 }] }] } satisfies AbilityDef

const rescueDogCare2 = { ...rescueDogKit2, cycle: [rescueDogBark] } satisfies AbilityDef

const rescueDogCare3 = { ...rescueDogKit2, cycle: [rescueDogGrowl] } satisfies AbilityDef

const rescueDogSearch = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'revive',
  color: 0x42a5f5,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies', downed: true },
  onHit: [{ kind: 'revive' }, { kind: 'healRatio', ratio: 0.3 }, { kind: 'shield', amount: 0, ratio: 0.1, ms: 4000 }],
} satisfies AbilityDef

export const abilities = { rescueDogCare, rescueDogCare2, rescueDogCare3, rescueDogSearch } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { healing: 1.2 } }, { add: { maxHp: 20 }, mul: { healing: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f415_200d_1f9ba',
  name: '搜救犬',
  element: 'water',
  desc: '训练有素的搜救犬，本身是水，浑身湿透：点不着火，却一冰就冻、挨电连上身边湿的。药包和吠叫轮着来，药包叼给 5 格内伤得最重的队友，吠叫时甩出一身水，身前 2.2 格的敌人挨一下、浇湿 5 秒，湿了的一冰就冻、一电一片；没人受伤或身边没敌人时那一下落空，照样轮到下一样；技能把倒下的队友全都救起来',
  role: 'support',
  tags: ['support', 'melee'],
  body: { drag: 4.5, mass: 0.9 },
  stats: { moveSpeed: 6.4, maxStamina: 110, staminaRegen: 80, exertion: 0.8 },
  skill: { name: '搜救', icon: '1f198', desc: '倒下的队友立刻救起，全队回复三成生命，并挂上生命一成的护盾 4 秒', cdMs: 18_000, ability: 'rescueDogSearch' },
  weapons: [],
  innate: [
    {
      name: '叼药包与吠叫',
      icon: '1fa79',
      base: 'rescueDogCare',
      upgrades: [
        { ability: 'rescueDogCare2', card: { icon: '26d1', name: '急救', desc: '接药包的队友先解除控制、减速与燃烧、中毒、寒冷、湿，再上药，中了毒的也补得上' } },
        { ability: 'rescueDogCare3', card: { icon: '1f6a8', name: '警犬', desc: '吠叫让身前的敌人恐惧 0.8 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
