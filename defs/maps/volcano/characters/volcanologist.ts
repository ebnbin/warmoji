import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring } from '../../../kit.ts'

// 🧑‍🔬 火山学家：往敌人身上扎带定时器的引雷针，到点引下一道雷劈开一圈，打断蓄力、电流再往身边跳；技能沿原路撤回 3 秒前的位置
const timer = { kind: 'fuse', ms: 2500, then: [{ kind: 'blast', radius: 1.6, ratio: 2.6, knockback: 0, ring: ring(0xffd54f) }] } as const

const volcanologistSample = {
  trigger: 'auto',
  cooldownMs: 1800,
  aim: 'nearest',
  range: 7,
  damage: 7,
  fireSfx: 'shoot',
  shape: { kind: 'drop', targets: 1, look: { emoji: '23f2', size: 0.6 }, fromAbove: 3, dropMs: 500, staggerMs: 0 },
  onHit: [timer],
} satisfies AbilityDef

const volcanologistSample2 = {
  ...volcanologistSample,
  onHit: [{ kind: 'if', when: { kind: 'marked', who: 'target', mark: 'fuse' }, then: [{ kind: 'detonate', mark: 'fuse' }], else: [timer] }],
} satisfies AbilityDef

const volcanologistSample3 = {
  ...volcanologistSample,
  onHit: [{ kind: 'if', when: { kind: 'marked', who: 'target', mark: 'fuse' }, then: [{ kind: 'detonate', mark: 'fuse' }], else: [{ ...timer, jump: true }] }],
} satisfies AbilityDef

const volcanologistRetreat = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'whoosh',
  shape: { kind: 'world' },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'rewind', ms: 3000 }, { kind: 'cleanse' }] }],
} satisfies AbilityDef

export const abilities = { volcanologistSample, volcanologistSample2, volcanologistSample3, volcanologistRetreat } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2, areaDamage: 1.1 } }, { add: { maxHp: 25 }, mul: { damage: 1.45, areaDamage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f52c',
  name: '火山学家',
  element: 'thunder',
  desc: '扛着仪器上山的火山学家，不受传导，挨了打就撤：把带定时器的引雷针扎到最近的敌人身上，扎中先电一下，2.5 秒后引下一道雷劈在 1.6 格内；挨雷的蓄着的力被打断，电流还跳到身边另一个敌人身上，湿的连成一片一起挨；技能紧急撤离，沿原路闪回 3 秒前的位置，生命取那时与现在的较高者',
  role: 'area',
  tags: ['damage', 'area', 'ranged'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5.4, maxStamina: 100, staminaRegen: 65, exertion: 1 },
  skill: {
    name: '紧急撤离',
    icon: '23ea',
    desc: '沿直线闪回 3 秒前的位置，途中无敌，生命取那时与现在的较高者，并解除控制、减速与身上的燃烧、寒冷、湿和中毒',
    cdMs: 12_000,
    ability: 'volcanologistRetreat',
  },
  weapons: [],
  innate: [
    {
      name: '引雷针',
      icon: '23f2',
      base: 'volcanologistSample',
      upgrades: [
        { ability: 'volcanologistSample2', card: { icon: '1f4a5', name: '遥控引雷', desc: '再扎中身上挂着引雷针的敌人，立刻引雷' } },
        { ability: 'volcanologistSample3', card: { icon: '1f9e8', name: '接力引信', desc: '挂着引雷针的敌人先死了，引雷针跳到最近的敌人身上接着计时' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
