import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring, shot } from '../../../kit.ts'

// 🧜 人鱼：本身是水；一段歌给最伤的队友回血，一颗水珠泼湿一小片敌人，两样轮着来；技能把倒下的队友都唱醒
const HURT = { kind: 'hpBelow', who: 'target', ratio: 1 } as const
const WEAKEST = { side: 'allies', radius: 4.5, filter: HURT, sort: 'weakest', count: 1 } as const

// 轮换只在这一式放出去后才往下走，所以歌声与水珠都写成总能放出去的 world，各自落空也照样轮着来
const song = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'self',
  fireSfx: 'chirp',
  shape: { kind: 'world' },
  onHit: [{ kind: 'to', who: WEAKEST, then: [{ kind: 'heal', amount: 10 }] }],
} satisfies AbilityDef

const dropShot = {
  trigger: 'manual',
  class: 'attack',
  aim: 'nearest',
  range: 6,
  damage: 9,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: shot('1f4a7', 9, 0.4), lifeMs: 900 },
  onHit: [{ kind: 'blast', radius: 1.2, ratio: 0.5, knockback: 0, ring: ring(0x42a5f5) }],
} satisfies AbilityDef

const drop = { trigger: 'auto', cooldownMs: 1000, aim: 'self', shape: { kind: 'world' }, onHit: [{ kind: 'cast', ability: dropShot }] } satisfies AbilityDef

const mermaidSong = { ...song, cycle: [drop] } satisfies AbilityDef

const tide = { kind: 'to', who: { side: 'allies', radius: 4.5, filter: HURT }, then: [{ kind: 'mend', amount: 3, tickMs: 500, durationMs: 3000 }] } as const

const song2 = { ...song, onHit: [...song.onHit, tide] } satisfies AbilityDef
const mermaidSong2 = { ...song2, cycle: [drop] } satisfies AbilityDef

const song3 = { ...song2, onHit: [{ kind: 'to', who: WEAKEST, then: [{ kind: 'heal', amount: 10 }, { kind: 'cleanse' }] }, tide] } satisfies AbilityDef
const mermaidSong3 = { ...song3, cycle: [drop] } satisfies AbilityDef

const mermaidRevive = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'revive',
  color: 0xfff59d,
  fxRadius: 1.25,
  shape: { kind: 'all', of: 'allies', downed: true },
  onHit: [{ kind: 'revive' }, { kind: 'healRatio', ratio: 0.35 }],
} satisfies AbilityDef

export const abilities = { mermaidSong, mermaidSong2, mermaidSong3, mermaidRevive } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { healing: 1.2 } }, { add: { maxHp: 20 }, mul: { healing: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9dc',
  name: '人鱼',
  element: 'water',
  desc: '人鱼本身是水、一直是湿的，轮着来：唱一段歌给 4.5 格内最伤的队友回 10 点血，再朝 6 格内最近的敌人弹一颗水珠，打中 9 点，炸开把 1.2 格内别的敌人各打一半，一片都泼湿，给队友的雷与冰铺路；没人受伤时歌声落空，没有敌人时水珠落空，两样照样轮着来；技能把倒下的队友都唱醒，全队回血',
  role: 'support',
  tags: ['support', 'ranged'],
  body: { drag: 5, mass: 0.6 },
  stats: { moveSpeed: 6, maxStamina: 100, staminaRegen: 80, exertion: 0.75 },
  skill: { name: '海妖复苏', icon: '1f3b5', desc: '倒下的队友全部复活，全队回复 35% 生命', cdMs: 18_000, ability: 'mermaidRevive' },
  weapons: [],
  innate: [
    {
      name: '人鱼之歌',
      icon: '1f9dc',
      base: 'mermaidSong',
      upgrades: [
        { ability: 'mermaidSong2', card: { icon: '1f319', name: '潮汐', desc: '歌声还让 4.5 格内受伤的队友 3 秒里每半秒回 3 点血' } },
        { ability: 'mermaidSong3', card: { icon: '1f30a', name: '清流', desc: '歌声治的那名队友，身上的控制、减速和燃烧、寒冷、中毒、湿一并冲掉' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
