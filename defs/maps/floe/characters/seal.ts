import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'

// 🦭 海豹：鳍拍一次连拍两下，第三下把敌人顶上天；肚皮贴地一滑，撞飞一路的敌人
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
} satisfies AbilityDef

const sealSlap2 = { ...sealSlap, range: 2.8, shape: { ...sealSlap.shape, reach: 0.7, lungeDist: 2 } } satisfies AbilityDef

const sealHeadbutt = {
  trigger: 'auto',
  cooldownMs: 850,
  aim: 'nearest',
  range: 2.8,
  damage: 18,
  fireSfx: 'thud',
  shape: { kind: 'segment', reach: 0.7, radius: 0.5, ms: 200, lungeDist: 2 },
  onHit: [{ kind: 'knockup', durationMs: 600, height: 1.2 }],
} satisfies AbilityDef

const sealSlap3 = { ...sealSlap2, cycle: [sealSlap2, sealHeadbutt] } satisfies AbilityDef

const sealBellySlide = {
  trigger: 'manual',
  aim: 'stick',
  damage: 36,
  knockback: 5,
  fireSfx: 'whoosh',
  shape: { kind: 'sprint', distance: 7, ms: 500, radius: 1 },
} satisfies AbilityDef

export const abilities = { sealSlap, sealSlap2, sealSlap3, sealBellySlide } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 25, armor: 1 }, mul: { damage: 1.2 } }, { add: { maxHp: 55, armor: 2 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9ad',
  name: '海豹',
  element: 'water',
  traits: ['swims', 'coldproof'],
  desc: '冰上滑得动、海里游得快，不怕冰水：鳍拍一次连拍两下，把贴上来的拍开；技能肚皮贴地滑出去，一路撞飞敌人',
  role: 'bruiser',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4.5, mass: 1.3 },
  stats: { moveSpeed: 5.2, maxStamina: 120, staminaRegen: 60, exertion: 1 },
  skill: { name: '腹滑', icon: '1f6f7', desc: '朝摇杆方向肚皮贴地滑出 7 格，沿路撞到的敌人吃 36 点伤害并被撞飞', cdMs: 9_000, ability: 'sealBellySlide', aim: true },
  weapons: [],
  innate: [
    {
      name: '鳍拍',
      icon: '1f9ad',
      base: 'sealSlap',
      upgrades: [
        { ability: 'sealSlap2', card: { icon: '26f8', name: '冰上滑', desc: '鳍拍时身子往前一扑，拍得到的距离从 1.7 格加长到 2.7 格，第二下追得上被拍开的敌人' } },
        { ability: 'sealSlap3', card: { icon: '26bd', name: '顶球', desc: '每第三下改成顶球：18 点伤害，把敌人顶上天 0.6 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
