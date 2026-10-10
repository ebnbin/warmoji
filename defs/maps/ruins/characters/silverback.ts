import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🦍 银背猩猩：双拳捶开身前一片、把人捶飞，边打边吸血，每第四下捶胸怒吼吓退敌人；技能朝一个方向猛冲，连墙带人撞开
const silverbackSmash = {
  trigger: 'auto',
  cooldownMs: 900,
  aim: 'nearest',
  range: 1.9,
  damage: 22,
  knockback: 2,
  breach: 0.3,
  fireSfx: 'thud',
  shape: { kind: 'sector', radius: 1.8, arcDeg: 120, ms: 180 },
} satisfies AbilityDef

const silverbackRoar = {
  trigger: 'auto',
  cooldownMs: 900,
  aim: 'nearest',
  range: 3,
  fireSfx: 'rumble',
  color: 0x8d6e63,
  shape: { kind: 'disc', radius: 3, at: 'self' },
  onHit: [{ kind: 'fear', durationMs: 800 }],
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'buff', cooldownMul: 0.83, durationMs: 3000 }] }],
} satisfies AbilityDef

const silverbackSmash2 = { ...silverbackSmash, cycle: [silverbackSmash, silverbackSmash, silverbackRoar] } satisfies AbilityDef

const silverbackShove = {
  ...silverbackSmash,
  knockback: 0,
  breach: 0.8,
  onHit: [{ kind: 'shove', distance: 2, ms: 240, onWall: [{ kind: 'stun', durationMs: 1000 }] }],
} satisfies AbilityDef

const silverbackSmash3 = { ...silverbackShove, cycle: [silverbackShove, silverbackShove, silverbackRoar] } satisfies AbilityDef

const silverbackCharge = {
  trigger: 'manual',
  aim: 'stick',
  damage: 40,
  knockback: 5,
  breach: 2,
  fireSfx: 'charge',
  color: 0x8d6e63,
  shape: { kind: 'sprint', distance: 6, ms: 500, radius: 1 },
} satisfies AbilityDef

export const abilities = { silverbackSmash, silverbackSmash2, silverbackSmash3, silverbackCharge } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 25, lifesteal: 0.03 }, mul: { damage: 1.2 } }, { add: { maxHp: 55, lifesteal: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f98d',
  name: '银背猩猩',
  desc: '力大无穷的银背：双拳捶开身前一片，把人捶飞，残墙也捶得掉皮，冻住的一拳就碎、伤害翻倍；边打边吸血，中了毒就吸不回来；捶胸一声怒吼吓退身边的敌人；技能朝一个方向猛冲，连墙带人一起撞开',
  role: 'bruiser',
  tags: ['damage', 'melee'],
  body: { drag: 5, mass: 1.6 },
  stats: { moveSpeed: 5.4, maxStamina: 130, staminaRegen: 60, exertion: 1.1 },
  skill: { name: '金刚冲', icon: '1f4a5', desc: '朝摇杆方向猛冲 6 格，沿路撞飞敌人，挡路的矮墙一并撞开', cdMs: 10_000, ability: 'silverbackCharge', aim: true },
  weapons: [],
  innate: [
    {
      name: '捶击',
      icon: '1f44a',
      base: 'silverbackSmash',
      upgrades: [
        { ability: 'silverbackSmash2', card: { icon: '1f4e2', name: '捶胸', desc: '每第四下改成捶胸怒吼：3 格内的敌人恐惧 0.8 秒，自己 3 秒内出手冷却 ×0.83' } },
        { ability: 'silverbackSmash3', card: { icon: '1f9f1', name: '砸墙', desc: '捶击改成把敌人推出 2 格，撞上墙的眩晕 1 秒；捶得动残墙' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
