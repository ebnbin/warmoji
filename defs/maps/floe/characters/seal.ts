import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🦭 海豹：鳍拍一次连拍两下，打中攒怒气，攒满了一记顶球把敌人顶上天；技能肚皮贴地怒滑出去，之后几秒打不倒
const HEADBUTT = { at: 100, spend: 100, damageMul: 2, onHit: [{ kind: 'knockup', durationMs: 600, height: 1.2 }] } as const

const sealSlap = {
  trigger: 'auto',
  cooldownMs: 850,
  aim: 'nearest',
  range: 1.8,
  damage: 12,
  knockback: 1.5,
  fireSfx: 'thud',
  shape: { kind: 'segment', reach: 1.7, radius: 0.5, ms: 200 },
  // 前扑期间出手的判定点跟着画面往前挪，第二下要等这一下挥完再出
  repeat: { count: 2, delayMs: 250 },
  boost: HEADBUTT,
} satisfies AbilityDef

const sealSlap2 = { ...sealSlap, range: 2.8, shape: { ...sealSlap.shape, reach: 0.7, lungeDist: 2 } } satisfies AbilityDef

const sealSlap3 = {
  ...sealSlap2,
  boost: { ...HEADBUTT, onHit: [...HEADBUTT.onHit, { kind: 'shove', distance: 2, ms: 220, onWall: [{ kind: 'stun', durationMs: 1000 }] }] },
  reactions: [{ on: 'kill', to: 'self', effects: [{ kind: 'gain', amount: 35 }] }],
} satisfies AbilityDef

const sealBellySlide = {
  trigger: 'manual',
  aim: 'stick',
  damage: 36,
  knockback: 5,
  fireSfx: 'whoosh',
  shape: { kind: 'sprint', distance: 7, ms: 500, radius: 1 },
  reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'undying', durationMs: 4000 }, { kind: 'gain', amount: 100 }, { kind: 'buff', speedMul: 1.25, durationMs: 4000 }] }],
} satisfies AbilityDef

export const abilities = { sealSlap, sealSlap2, sealSlap3, sealBellySlide } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 25, armor: 1 }, mul: { damage: 1.2 } }, { add: { maxHp: 55, armor: 2 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9ad',
  name: '海豹',
  element: 'water',
  traits: ['swims', 'coldproof'],
  desc: '冰上滑得动、海里游得快，不怕冰水：鳍拍一次连拍两下，每拍中一下攒 7 点怒气（停手 2.5 秒后每秒掉 15 点），攒满 100 点下一记就是顶球，伤害翻倍并把敌人顶上天 0.6 秒；技能肚皮贴地怒滑出去撞飞一路的敌人，怒气立刻攒满，之后 4 秒怎么打都不倒、跑得更快',
  role: 'bruiser',
  tags: ['damage', 'defense', 'melee', 'mobile'],
  body: { drag: 4.5, mass: 1.3 },
  stats: { moveSpeed: 5.2, maxStamina: 120, staminaRegen: 60, exertion: 1 },
  skill: {
    name: '怒滑',
    icon: '1f4a2',
    desc: '朝摇杆方向肚皮贴地滑出 7 格，沿路撞到的敌人吃 36 点伤害并被撞飞；怒气立刻攒满，之后 4 秒内生命不低于 1、移速 ×1.25',
    cdMs: 16_000,
    ability: 'sealBellySlide',
    aim: true,
  },
  weapons: [],
  innate: [
    {
      name: '鳍拍',
      icon: '1f9ad',
      base: 'sealSlap',
      upgrades: [
        { ability: 'sealSlap2', card: { icon: '26f8', name: '冰上滑', desc: '鳍拍时身子往前一扑，拍得到的距离从 1.7 格加长到 2.7 格，第二下追得上被拍开的敌人' } },
        { ability: 'sealSlap3', card: { icon: '1f4a5', name: '撞冰', desc: '满怒的顶球还把敌人顶开 2 格，撞上墙的晕 1 秒；鳍拍打死敌人回 35 点怒气' } },
      ],
    },
  ],
  resource: { kind: 'fury', max: 100, onHit: 7, decay: 15, decayDelayMs: 2500 },
} as const satisfies CharacterAuthoring
