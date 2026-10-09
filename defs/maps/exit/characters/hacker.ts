import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'

// 🧑‍💻 程序员：放出绕身转的爬虫程序，看见敌人就扑上去咬一口，带木马的让敌人更脆；技能入侵最近的几个敌人，让它们倒戈
const crawlers = (count: number) =>
  ({
    trigger: 'auto',
    cooldownMs: 2200,
    aim: 'self',
    damage: 8,
    knockback: 1,
    fireSfx: 'chip',
    shape: { kind: 'summon', count, minion: { look: { emoji: '1f4be', size: 0.5 }, speed: 8, orbit: { radius: 0.7, spinRadPerSec: 3 } }, lifeMs: 5000 },
  }) satisfies AbilityDef

const hackerCrawl = crawlers(3)

const hackerCrawl2 = crawlers(4)

const hackerCrawl3 = { ...hackerCrawl2, onHit: [{ kind: 'status', status: 'exposed', ms: 2000, value: 1.15 }] } satisfies AbilityDef

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
  element: 'dark',
  desc: '敲几行代码就放出绕身转的爬虫程序，看见敌人就扑上去咬一口；技能入侵最近的几个敌人，让它们调转矛头打同伴',
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
        { ability: 'hackerCrawl3', card: { icon: '1f40e', name: '木马', desc: '被爬虫咬中的敌人 2 秒内受到的伤害 ×1.15' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
