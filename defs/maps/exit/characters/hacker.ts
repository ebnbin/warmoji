import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🧑‍💻 程序员：放出绕身转的爬虫程序，看见敌人就一头撞上去，撞得开人、撞得碎冻住的；防火墙每轮挡下一下；技能入侵最近的几个敌人，让它们倒戈
const crawlers = (count: number) =>
  ({
    trigger: 'auto',
    cooldownMs: 2200,
    aim: 'self',
    damage: 8,
    knockback: 1.5,
    fireSfx: 'chip',
    shape: { kind: 'summon', count, minion: { look: { emoji: '1f4be', size: 0.5 }, speed: 8, orbit: { radius: 0.7, spinRadPerSec: 3 } }, lifeMs: 5000 },
  }) satisfies AbilityDef

const hackerCrawl = crawlers(3)

const hackerCrawl2 = crawlers(4)

const hackerCrawl3 = { ...hackerCrawl2, reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'spellShield', count: 1, durationMs: 2200 }] }] } satisfies AbilityDef

const hackerHijack = {
  trigger: 'manual',
  aim: 'nearest',
  range: 6,
  fireSfx: 'zap',
  shape: { kind: 'world' },
  onHit: [{ kind: 'to', who: { side: 'foes', radius: 6, sort: 'nearest', count: 3 }, then: [{ kind: 'berserk', durationMs: 4000 }] }],
} satisfies AbilityDef

export const abilities = { hackerCrawl, hackerCrawl2, hackerCrawl3, hackerHijack } satisfies Record<string, AbilityDef>

export const levels = [{ mul: { summonDamage: 1.2, damage: 1.1 } }, { add: { maxHp: 20 }, mul: { summonDamage: 1.45, damage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f9d1_200d_1f4bb',
  name: '程序员',
  desc: '敲几行代码就放出绕身转的爬虫程序，看见敌人就一头撞上去，把它撞开，冻住的一撞就碎；本人身板薄，学会防火墙之后每轮挡得下一下；技能入侵最近的几个敌人，让它们调转矛头打同伴',
  role: 'summoner',
  tags: ['damage', 'control', 'summon'],
  body: { drag: 5, mass: 0.9 },
  stats: { moveSpeed: 5.2, maxStamina: 90, staminaRegen: 65, exertion: 0.9 },
  skill: { name: '入侵', icon: '1f513', desc: '入侵 6 格内最近的 3 个敌人，让它们倒戈 4 秒，转头去打同伴', cdMs: 14_000, ability: 'hackerHijack' },
  weapons: [],
  innate: [
    {
      name: '爬虫程序',
      icon: '1f4be',
      base: 'hackerCrawl',
      upgrades: [
        { ability: 'hackerCrawl2', card: { icon: '1f500', name: '并发', desc: '一次放出 4 个爬虫' } },
        { ability: 'hackerCrawl3', card: { icon: '1f9f1', name: '防火墙', desc: '每放一轮爬虫，自己立起一道防火墙：2.2 秒内挡下挨的下一下；燃烧、中毒这类持续伤害挡不住' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
