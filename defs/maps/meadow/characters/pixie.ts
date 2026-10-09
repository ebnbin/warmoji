import type { AbilityDef, Effect } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring, shot } from '../../../kit.ts'

// 🧚 花仙子：花粉治最伤的队友，沾着露水的花瓣打敌人、溅湿一小片，两样轮着来；技能给全队挂上护盾，解掉控制和身上的毒与火
// 花粉与花瓣都用 world 出手，没人受伤或没有敌人时也照样轮下去
const pollen = (then: readonly Effect[]) =>
  ({
    trigger: 'auto',
    cooldownMs: 1300,
    aim: 'self',
    fireSfx: 'chirp',
    shape: { kind: 'world' },
    onHit: [{ kind: 'to', who: { side: 'allies', radius: 5, filter: { kind: 'hpBelow', who: 'target', ratio: 1 }, sort: 'weakest', count: 1 }, then }],
  }) satisfies AbilityDef

const pixiePetal = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'self',
  shape: { kind: 'world' },
  onHit: [
    {
      kind: 'cast',
      ability: {
        trigger: 'manual',
        class: 'attack',
        aim: 'nearest',
        range: 6,
        damage: 9,
        fireSfx: 'splash',
        shape: { kind: 'bolt', projectile: shot('1f338', 9, 0.42), lifeMs: 1400 },
        onHit: [{ kind: 'blast', radius: 1.2, ratio: 0.5, knockback: 0, ring: ring(0x42a5f5) }],
      },
    },
  ],
} satisfies AbilityDef

const HEAL = { kind: 'heal', amount: 12 } as const satisfies Effect
const MEND = { kind: 'mend', amount: 4, tickMs: 500, durationMs: 3000 } as const satisfies Effect
const GARLAND = { kind: 'shield', amount: 0, ratio: 0.08, ms: 3000 } as const satisfies Effect

const pixieDance = { ...pollen([HEAL]), cycle: [pixiePetal] } satisfies AbilityDef
const pixieDance2 = { ...pollen([{ ...HEAL, amount: 8 }, MEND]), cycle: [pixiePetal] } satisfies AbilityDef
const pixieDance3 = { ...pollen([{ ...HEAL, amount: 8 }, MEND, GARLAND]), cycle: [pixiePetal] } satisfies AbilityDef

const pixieBlessing = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  color: 0xf8bbd0,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies' },
  onHit: [{ kind: 'cleanse' }, { kind: 'shield', amount: 0, ratio: 0.25, ms: 6000 }],
} satisfies AbilityDef

export const abilities = { pixieDance, pixieDance2, pixieDance3, pixieBlessing } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { healing: 1.2 } }, { add: { maxHp: 20 }, mul: { healing: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9da',
  name: '花仙子',
  element: 'water',
  desc: '本身是水、浑身湿漉漉的花仙子，点不着火，却一冰就冻、一电一片：花粉治最伤的那个队友，沾着露水的花瓣打敌人，打中就溅开，把 1.2 格内的敌人都浇湿 5 秒，给队友的雷与冰铺路，两样轮着来；技能给全队挂上护盾，解掉控制和身上的毒与火',
  role: 'support',
  tags: ['support', 'ranged'],
  body: { drag: 5, mass: 0.5 },
  stats: { moveSpeed: 6, maxStamina: 80, staminaRegen: 85, exertion: 0.7 },
  skill: { name: '花之护佑', icon: '1f490', desc: '全队解除控制与减速，清掉身上的中毒、燃烧、寒冷与湿，挂上生命 25% 的护盾 6 秒', cdMs: 16_000, ability: 'pixieBlessing' },
  weapons: [],
  innate: [
    {
      name: '花粉与花瓣',
      icon: '1f338',
      base: 'pixieDance',
      upgrades: [
        { ability: 'pixieDance2', card: { icon: '1f49a', name: '回春', desc: '花粉改成先回 8 点血，再 3 秒里每半秒回 4 点' } },
        { ability: 'pixieDance3', card: { icon: '1f33a', name: '花环', desc: '花粉治的队友还挂上生命 8% 的护盾 3 秒；中了毒回不了血，护盾照样挂得上' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
