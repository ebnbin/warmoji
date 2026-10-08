import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🧚 花仙子：花粉治最伤的队友，花瓣打敌人，两样轮着来；技能给全队挂上护盾并解掉控制
const pixiePollen = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'self',
  fireSfx: 'chirp',
  shape: { kind: 'disc', radius: 5, at: 'self', of: 'hurt' },
  onHit: [{ kind: 'heal', amount: 12, scope: 'lowest' }],
} satisfies AbilityDef

const pixiePetal = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'nearest',
  range: 6,
  damage: 10,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1f338', 9, 0.42), lifeMs: 1400 },
} satisfies AbilityDef

const pixieDance = { ...pixiePollen, cycle: [pixiePetal] } satisfies AbilityDef

const pixiePollen2 = { ...pixiePollen, onHit: [{ kind: 'heal', amount: 8, scope: 'lowest' }, { kind: 'mend', amount: 4, tickMs: 500, durationMs: 3000 }] } satisfies AbilityDef
const pixieDance2 = { ...pixiePollen2, cycle: [pixiePetal] } satisfies AbilityDef

const pixiePollen3 = { ...pixiePollen2, onHit: [...pixiePollen2.onHit, { kind: 'shield', amount: 0, ratio: 0.08, ms: 3000 }] } satisfies AbilityDef
const pixieDance3 = { ...pixiePollen3, cycle: [pixiePetal] } satisfies AbilityDef

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
  element: 'light',
  desc: '花粉治最伤的那个队友，花瓣打敌人，两样轮着来；技能给全队挂上护盾并解掉控制',
  role: 'support',
  tags: ['support', 'ranged'],
  body: { drag: 5, mass: 0.5 },
  stats: { moveSpeed: 6, maxStamina: 80, staminaRegen: 85, exertion: 0.7 },
  skill: { name: '花之护佑', icon: '1f490', desc: '全队解除控制与减速，挂上生命 25% 的护盾 6 秒', cdMs: 16_000, ability: 'pixieBlessing' },
  weapons: [],
  innate: [
    {
      name: '花粉与花瓣',
      icon: '1f338',
      base: 'pixieDance',
      upgrades: [
        { ability: 'pixieDance2', card: { icon: '1f49a', name: '回春', desc: '花粉改成先回 8 点血，再 3 秒里每半秒回 4 点' } },
        { ability: 'pixieDance3', card: { icon: '1f33a', name: '花环', desc: '花粉治的队友还挂上生命 8% 的护盾 3 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
