import { keysOf } from '../util/record'
import type { CharacterDef, CharacterTag, DutyTag, StyleTag } from '../types/characters'
import type { Tone } from '../ui/theme'

interface TagDef {
  readonly name: string
  readonly icon: string
  readonly tone: Tone
  readonly desc: string
}

const DUTY: Readonly<Record<DutyTag, TagDef>> = {
  damage: { name: '输出', icon: '2694', tone: 'bad', desc: '队伍的主要伤害来源' },
  defense: { name: '防御', icon: '1f9f1', tone: 'info', desc: '耐打，替队友扛伤害' },
  support: { name: '辅助', icon: '1f91d', tone: 'good', desc: '治疗、护盾与增益' },
  control: { name: '控制', icon: '1f4ab', tone: 'epic', desc: '让敌人动不了或打不了' },
}

const STYLE: Readonly<Record<StyleTag, TagDef>> = {
  melee: { name: '近战', icon: '1f44a', tone: 'steel', desc: '贴身出手' },
  ranged: { name: '远程', icon: '1f3f9', tone: 'steel', desc: '隔着距离出手' },
  area: { name: '范围', icon: '1f4a5', tone: 'steel', desc: '一下打到一片敌人' },
  summon: { name: '召唤', icon: '1f41d', tone: 'steel', desc: '招出随从、炮塔或替身' },
  mobile: { name: '机动', icon: '1f4a8', tone: 'steel', desc: '带冲刺、跳跃或传送' },
}

/** 标签按这个顺序排：先职责后打法 */
export const TAGS: Readonly<Record<CharacterTag, TagDef>> = { ...DUTY, ...STYLE }

export const TAG_IDS: readonly CharacterTag[] = keysOf(TAGS)

export const DUTY_TAGS: readonly DutyTag[] = keysOf(DUTY)

/** 角色的标签按标签表的顺序排 */
export function tagsOf(def: CharacterDef): CharacterTag[] {
  return TAG_IDS.filter((t) => def.tags.includes(t))
}
