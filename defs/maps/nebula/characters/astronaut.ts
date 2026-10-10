import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🧑‍🚀 宇航员：推进拳一次两拳，是物理；每第三次出拳放一圈电磁脉冲，打断身边一圈敌人的出手；技能背着喷射背包跳进敌群，落地放电
const astronautPunch = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'nearest',
  range: 1.9,
  element: 'physical',
  damage: 11,
  knockback: 1,
  fireSfx: 'hit',
  shape: { kind: 'segment', reach: 1.8, radius: 0.45, ms: 140 },
  repeat: { count: 2, delayMs: 150 },
} satisfies AbilityDef

const astronautPunch2 = {
  ...astronautPunch,
  range: 3.3,
  shape: { kind: 'segment', reach: 1.8, radius: 0.45, ms: 200, lungeDist: 1.5 },
  repeat: { count: 2, delayMs: 200 },
} satisfies AbilityDef

const astronautPulse = {
  trigger: 'auto',
  cooldownMs: 800,
  aim: 'nearest',
  range: 2.4,
  damage: 24,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'disc', radius: 2.4, at: 'self' },
} satisfies AbilityDef

const astronautPunch3 = { ...astronautPunch2, cycle: [astronautPunch2, astronautPulse] } satisfies AbilityDef

const astronautJet = {
  trigger: 'manual',
  aim: 'stick',
  damage: 30,
  fireSfx: 'jump',
  color: 0xffd54f,
  shape: { kind: 'leap', distance: 5, ms: 500, height: 1.6, radius: 1.8 },
  onHit: [{ kind: 'knockup', durationMs: 600, height: 1 }],
} satisfies AbilityDef

export const abilities = { astronautPunch, astronautPunch2, astronautPunch3, astronautJet } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 20, lifesteal: 0.03 }, mul: { damage: 1.2 } }, { add: { maxHp: 45, lifesteal: 0.05 }, mul: { damage: 1.45 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f680',
  name: '宇航员',
  element: 'thunder',
  desc: '穿着宇航服的斗士，本身是雷，别处跳来的电流跳不到身上；靠吸血撑着，中了毒就回不了血：推进拳一次两拳，拳拳是物理，冻住的敌人挨一拳就碎；升级后每第三次出拳改成一圈电磁脉冲；背着喷射背包，随时跳进敌群落地放电，打断一圈敌人的出手、把它们掀上天',
  role: 'bruiser',
  tags: ['damage', 'melee', 'mobile'],
  body: { drag: 4.8, mass: 1.3 },
  stats: { moveSpeed: 5.6, maxStamina: 120, staminaRegen: 65, exertion: 1 },
  skill: { name: '喷射背包', icon: '1f392', desc: '朝摇杆方向喷射跳出 5 格，落地放电：1.8 格内的敌人各挨 30 点雷伤、出手被打断，并被击飞 0.6 秒；电流再从每个挨打的身上跳到身边的另一个敌人', cdMs: 9_000, ability: 'astronautJet', aim: true },
  weapons: [],
  innate: [
    {
      name: '推进拳',
      icon: '1f44a',
      base: 'astronautPunch',
      upgrades: [
        { ability: 'astronautPunch2', card: { icon: '1f680', name: '助推', desc: '出拳时往前一冲 1.5 格，拳头够得着 3.3 格远' } },
        { ability: 'astronautPunch3', card: { icon: '26a1', name: '电磁脉冲', desc: '每第三次出拳改成一圈电磁脉冲：身周 2.4 格内的敌人各挨 24 点雷伤、出手被打断，电流再跳到身边的另一个敌人' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
