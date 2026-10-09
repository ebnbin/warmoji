import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { CharacterAuthoring } from '../../../../legacy/types/characters'
import type { StatMods } from '../../../../legacy/types/stats'
import { ring, shot } from '../../../kit.ts'

// 👷 爆破工：把雷管抛到敌人身上炸开一片；技能朝一个方向扔出一大捆炸药，能把墙炸出缺口
const demolisherStick = {
  trigger: 'auto',
  cooldownMs: 1400,
  aim: 'nearest',
  range: 6.5,
  damage: 20,
  knockback: 2,
  fireSfx: 'shoot',
  shape: { kind: 'drop', targets: 1, look: { emoji: '1f9e8', size: 0.5 }, fromAbove: 2.5, dropMs: 450, staggerMs: 0 },
  onHit: [{ kind: 'blast', radius: 1.5, ratio: 1, knockback: 2, breach: 0.5, ring: ring(0xff7043) }],
} satisfies AbilityDef

const demolisherStick2 = { ...demolisherStick, onHit: [{ kind: 'blast', radius: 2, ratio: 1, knockback: 2, breach: 0.5, ring: ring(0xff7043) }] } satisfies AbilityDef

const demolisherStick3 = {
  ...demolisherStick2,
  onHit: [
    ...demolisherStick2.onHit,
    { kind: 'to', who: { side: 'foes', radius: 2 }, then: [{ kind: 'fuse', ms: 1500, then: [{ kind: 'blast', radius: 1.4, ratio: 0.8, knockback: 1, ring: ring(0xffb74d) }] }] },
  ],
} satisfies AbilityDef

const demolisherCharge = {
  trigger: 'manual',
  aim: 'stick',
  damage: 60,
  knockback: 4,
  breach: 4,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1f9e8', 8, 0.8), lifeMs: 750 },
  onHit: [{ kind: 'blast', radius: 3, ratio: 1, knockback: 4, breach: 4, ring: ring(0xff5722) }],
} satisfies AbilityDef

export const abilities = { demolisherStick, demolisherStick2, demolisherStick3, demolisherCharge } satisfies Record<string, AbilityDef>

export const levels = [{ add: { maxHp: 10 }, mul: { damage: 1.2, areaDamage: 1.1 } }, { add: { maxHp: 25 }, mul: { damage: 1.45, areaDamage: 1.2 } }] as const satisfies readonly StatMods[]

export default {
  emoji: '1f477',
  name: '爆破工',
  element: 'fire',
  desc: '扛着一箱雷管的爆破工：把雷管抛到最近的敌人身上炸开一片，连墙皮也崩掉一点；技能朝一个方向扔出一大捆炸药，碰上敌人炸开一大片，撞上墙把墙炸出缺口',
  role: 'area',
  tags: ['damage', 'area', 'ranged'],
  body: { drag: 5, mass: 1.2 },
  stats: { moveSpeed: 5, maxStamina: 110, staminaRegen: 60, exertion: 1 },
  skill: {
    name: '爆破',
    icon: '1f4a5',
    desc: '朝摇杆方向扔出一大捆炸药，飞出 6 格：碰上敌人就炸开 3 格，把人炸飞；撞上高墙就把墙炸出一个大洞',
    cdMs: 12_000,
    ability: 'demolisherCharge',
    aim: true,
  },
  weapons: [],
  innate: [
    {
      name: '雷管',
      icon: '1f9e8',
      base: 'demolisherStick',
      upgrades: [
        { ability: 'demolisherStick2', card: { icon: '1f9ed', name: '定向爆破', desc: '炸开的范围从 1.5 格扩到 2 格' } },
        { ability: 'demolisherStick3', card: { icon: '23f2', name: '延时引信', desc: '被炸到的敌人再挂 1.5 秒引信，到点在它身上再炸开 1.4 格，八成伤害' } },
      ],
    },
  ],
} as const satisfies CharacterAuthoring
