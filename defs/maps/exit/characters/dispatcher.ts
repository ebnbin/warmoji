import type { AbilityDef, Effect } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { COMBAT } from '../../../combat.ts'

// 🧑‍🦼 调度员：广播里调度与喷淋轮着喊，调度给伤得最重的队友回血，喷淋往最近的敌人头上洒水、浇湿一片，没有对象的那一句就空过；技能把全队一起转移出去
const dispatcherSprinkle = {
  trigger: 'manual',
  class: 'attack',
  aim: 'nearest',
  range: 6.5,
  damage: 5,
  fireSfx: 'splash',
  color: 0x42a5f5,
  shape: { kind: 'disc', radius: 1.6, at: 'target' },
} satisfies AbilityDef

const dispatcherSprinkler = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'self',
  shape: { kind: 'world' },
  onHit: [{ kind: 'cast', ability: dispatcherSprinkle }],
} satisfies AbilityDef

const HEAL = { kind: 'heal', amount: 11 } as const
const GREEN_LIGHT = { kind: 'status', status: 'speed', ms: 2000, value: 1.2 } as const
const BACKUP = { kind: 'mend', amount: 3, tickMs: 500, durationMs: 3000 } as const

const dispatch = (then: readonly Effect[]) =>
  ({
    trigger: 'auto',
    cooldownMs: 1300,
    aim: 'self',
    fireSfx: 'chirp',
    shape: { kind: 'world' },
    onHit: [{ kind: 'to', who: { side: 'allies', radius: 4.5, filter: { kind: 'hpBelow', who: 'target', ratio: 1 }, sort: 'weakest', count: 1 }, then }],
    cycle: [dispatcherSprinkler],
  }) satisfies AbilityDef

const dispatcherBroadcast = dispatch([HEAL])

const dispatcherBroadcast2 = dispatch([HEAL, GREEN_LIGHT])

const dispatcherBroadcast3 = dispatch([HEAL, GREEN_LIGHT, BACKUP])

const dispatcherEvacuate = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'warp',
  color: 0xfff59d,
  shape: { kind: 'world' },
  onHit: [
    { kind: 'to', who: { side: 'allies', radius: 20 }, then: [{ kind: 'shield', amount: 0, ratio: 0.2, ms: COMBAT.transitMs.teleport + 4000 }] },
    { kind: 'warp', distance: 6, allies: true },
  ],
} satisfies AbilityDef

export const abilities = { dispatcherBroadcast, dispatcherBroadcast2, dispatcherBroadcast3, dispatcherEvacuate } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { healing: 1.2 } }, { add: { maxHp: 20 }, mul: { healing: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f9bc',
  name: '调度员',
  element: 'water',
  desc: '坐着电动轮椅守在调度台前，广播里调度与喷淋轮着喊：调度给 4.5 格内伤得最重的队友回血，喷淋往 6.5 格内最近的敌人头上洒水，1.6 格内的敌人各挨一下、浇湿 5 秒，好让队友的雷和冰一打一片；没人可治或没敌人可浇时那一句就空过；身上总是湿的：点不着，可挨冰当场冻住，挨电会连着身边湿的一起挨；技能把全队一起转移出去',
  role: 'support',
  tags: ['support', 'mobile'],
  body: { drag: 5, mass: 1 },
  stats: { moveSpeed: 5.6, maxStamina: 85, staminaRegen: 80, exertion: 0.7 },
  skill: { name: '全员转移', icon: '1f68c', desc: '全队跟着调度员朝摇杆方向隐身穿行 6 格，落地各挂一层生命 20% 的护盾 4 秒', cdMs: 15_000, ability: 'dispatcherEvacuate', aim: true },
  weapons: [],
  innate: [
    {
      name: '广播',
      icon: '1f4fb',
      base: 'dispatcherBroadcast',
      upgrades: [
        { ability: 'dispatcherBroadcast2', card: { icon: '1f6a6', name: '绿灯', desc: '调度治到的队友 2 秒内移速 ×1.2' } },
        { ability: 'dispatcherBroadcast3', card: { icon: '1fa79', name: '保障', desc: '调度治到的队友再在 3 秒里每半秒回 3 点血' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
