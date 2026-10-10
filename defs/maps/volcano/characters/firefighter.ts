import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { patch } from '../../../kit.ts'

// 🧑‍🚒 消防员：喷淋给最伤的队友回血、水柱冲开敌人并浇透，两样轮着来；技能放下水幕，全队回血、挂上护盾、浑身湿透点不着火，敌方的弹体被弹回去
const hurt = { kind: 'hpBelow', who: 'target', ratio: 1 } as const

const firefighterSpray = {
  trigger: 'auto',
  cooldownMs: 1250,
  aim: 'self',
  fireSfx: 'splash',
  shape: { kind: 'world' },
  onHit: [{ kind: 'to', who: { side: 'allies', radius: 4, filter: hurt, sort: 'weakest', count: 1 }, then: [{ kind: 'heal', amount: 12 }] }],
} satisfies AbilityDef

const jet = {
  trigger: 'manual',
  class: 'attack',
  aim: 'nearest',
  range: 4.3,
  damage: 9,
  knockback: 1.5,
  color: 0x4fc3f7,
  fireSfx: 'wash',
  shape: { kind: 'segment', reach: 4, radius: 0.45, ms: 200, beam: true },
} satisfies AbilityDef

const firefighterJet = { trigger: 'auto', cooldownMs: 1250, aim: 'self', shape: { kind: 'world' }, onHit: [{ kind: 'cast', ability: jet }] } satisfies AbilityDef

const firefighterHose = { ...firefighterSpray, cycle: [firefighterJet] } satisfies AbilityDef

const firefighterSpray2 = {
  ...firefighterSpray,
  onHit: [
    ...firefighterSpray.onHit,
    { kind: 'to', who: { side: 'allies', radius: 4, filter: hurt }, then: [{ kind: 'shield', amount: 0, ratio: 0.06, ms: 3000 }, { kind: 'cleanse' }] },
  ],
} satisfies AbilityDef
const firefighterHose2 = { ...firefighterSpray2, cycle: [firefighterJet] } satisfies AbilityDef

const puddle = { kind: 'each', then: [{ kind: 'ground', def: patch(1.5, 5000, 0x4fc3f7, undefined, 0, 500) }] } as const
const firefighterJet3 = { ...firefighterJet, onHit: [{ kind: 'cast', ability: { ...jet, onHit: [puddle] } }] } satisfies AbilityDef
const firefighterHose3 = { ...firefighterSpray2, cycle: [firefighterJet3] } satisfies AbilityDef

const firefighterCurtain = {
  trigger: 'manual',
  aim: 'self',
  color: 0x4fc3f7,
  fxRadius: 1.25,
  fireSfx: 'wash',
  shape: { kind: 'all', of: 'allies' },
  onHit: [
    { kind: 'healRatio', ratio: 0.25 },
    { kind: 'shield', amount: 0, ratio: 0.15, ms: 4000 },
    { kind: 'status', status: 'wet', ms: 5000 },
  ],
  reactions: [
    {
      on: 'fire',
      to: 'self',
      effects: [{ kind: 'barrier', shape: 'ring', length: 2.5, durationMs: 4000, bodies: 'none', shots: true, reflect: true, follow: true, color: 0x4fc3f7 }],
    },
  ],
} satisfies AbilityDef

export const abilities = { firefighterHose, firefighterHose2, firefighterHose3, firefighterCurtain } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { healing: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { healing: 1.45, damage: 1.25 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f692',
  name: '消防员',
  element: 'water',
  desc: '扛着水带的消防员，浑身一直是湿的，点不着火，却一冰就冻、一电一片：喷淋与水柱轮着来，喷淋给身周 4 格内最伤的队友回血，水柱冲开前方一排敌人并浇透 5 秒，烧着的当场浇灭，没人受伤或没有敌人时那一下就落空；技能放下水幕，全队回血、挂上护盾、浑身湿透点不着火，敌方的弹体被弹回去',
  role: 'support',
  tags: ['support', 'ranged'],
  body: { drag: 5, mass: 1.2 },
  stats: { moveSpeed: 5.4, maxStamina: 130, staminaRegen: 65, exertion: 0.9 },
  skill: {
    name: '水幕',
    icon: '1f30a',
    desc: '全队回复 25% 的生命，挂上生命 15% 的护盾 4 秒，并浑身湿透 5 秒：点不着火，但一冰就冻、一电一片；身周立起一圈 2.5 格、跟着自己的水幕 4 秒，把敌方的弹体弹回去',
    cdMs: 16_000,
    ability: 'firefighterCurtain',
  },
  weapons: [],
  innate: [
    {
      name: '水枪',
      icon: '1f692',
      base: 'firefighterHose',
      upgrades: [
        { ability: 'firefighterHose2', card: { icon: '1f9ef', name: '灭火', desc: '喷淋还给身周 4 格内受伤的队友各挂一层生命 6% 的护盾 3 秒，扑灭身上的火，并解除控制、减速、寒冷与中毒' } },
        { ability: 'firefighterHose3', card: { icon: '1f4a6', name: '积水', desc: '水柱冲中的敌人脚下各积一滩 1.5 格的水 5 秒，站在里面的敌人一直是湿的' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
