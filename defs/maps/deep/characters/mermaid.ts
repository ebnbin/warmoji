import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../src/types/characters'
import type { StatMods } from '../../../../src/types/stats'
import { shot } from '../../../kit.ts'

// 🧜 人鱼：一段歌给最伤的队友回血，一颗珍珠打敌人，两样轮着来；技能把倒下的队友都唱醒
const HURT = { kind: 'hpBelow', who: 'target', ratio: 1 } as const

// 轮换只在这一式放出去后才往下走，所以歌声与珍珠都写成总能放出去的 world，各自落空也照样轮着来
const song = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'self',
  fireSfx: 'chirp',
  shape: { kind: 'world' },
  onHit: [{ kind: 'to', who: { side: 'allies', radius: 4.5, filter: HURT, sort: 'weakest', count: 1 }, then: [{ kind: 'heal', amount: 10 }] }],
} satisfies AbilityDef

const pearlShot = {
  trigger: 'manual',
  class: 'attack',
  aim: 'nearest',
  range: 6,
  damage: 12,
  fireSfx: 'plip',
  shape: { kind: 'bolt', projectile: shot('26aa', 9, 0.4), lifeMs: 900 },
} satisfies AbilityDef

const pearl = { trigger: 'auto', cooldownMs: 1000, aim: 'self', shape: { kind: 'world' }, onHit: [{ kind: 'cast', ability: pearlShot }] } satisfies AbilityDef

const mermaidSong = { ...song, cycle: [pearl] } satisfies AbilityDef

const song2 = {
  ...song,
  onHit: [...song.onHit, { kind: 'to', who: { side: 'allies', radius: 4.5, filter: HURT }, then: [{ kind: 'mend', amount: 3, tickMs: 500, durationMs: 3000 }] }],
} satisfies AbilityDef
const mermaidSong2 = { ...song2, cycle: [pearl] } satisfies AbilityDef

const pearl3 = { ...pearl, onHit: [{ kind: 'cast', ability: { ...pearlShot, onHit: [{ kind: 'disarm', durationMs: 800 }] } }] } satisfies AbilityDef
const mermaidSong3 = { ...song2, cycle: [pearl3] } satisfies AbilityDef

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
  element: 'light',
  desc: '人鱼轮着来：唱一段歌给 4.5 格内最伤的队友回 10 点血，再朝 6 格内最近的敌人弹一颗珍珠；没人受伤时歌声落空，没有敌人时珍珠落空，两样照样轮着来；技能把倒下的队友都唱醒，全队回血',
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
        { ability: 'mermaidSong3', card: { icon: '1f48e', name: '珠光', desc: '珍珠打中的敌人致盲 0.8 秒' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
