import type { EnemySpec } from './config'
import { CAPTAINS, CHARACTERS, COIN, ENEMY_SPECS, UNIT, WEAPONS } from './config'
import { ITEMS } from './items'
import type { ItemSpec } from './items'
import { captainStatGroups, characterStatGroups, WEAPON_KIND_LABEL, weaponStatLines } from './stats'

// 图鉴：零维护成本地聚合各注册表——新增 entity 自动出现在图鉴里。
// 完整 emoji 列表的清单由构建期生成（public/emoji/<版本>/manifest.json），
// 已收录集合 = 各注册表用到的全部 emoji（语义层，与描边/预载清单无关）。

export interface WikiEntry {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  /** 详情面板的属性行（按组标题分段，空行分组） */
  readonly lines: readonly string[]
}

export interface WikiGroup {
  readonly icon: string
  readonly title: string
  readonly entries: readonly WikiEntry[]
}

function grid(px: number): string {
  return `${+(px / UNIT).toFixed(1)}格`
}

const ENEMY_BEHAVIOR_LABEL: Record<EnemySpec['behavior'], string> = {
  chase: '追击',
  wanderFire: '游荡射击',
  dash: '蓄力突刺',
  fleeFire: '逃跑冷枪',
  coinThief: '偷金币',
}

export function enemyStatLines(e: EnemySpec): string[] {
  const lines = [
    `生命 ${e.hp} · 移速 ${grid(e.speed)}/秒 · 接触伤害 ${e.damage}`,
    `行为 ${ENEMY_BEHAVIOR_LABEL[e.behavior]} · 经验 ${e.xp} · 金币 ${e.coins}`,
  ]
  if ('bullet' in e) lines.push(`子弹伤害 ${e.bullet.damage} · 弹速 ${grid(e.bullet.speed)}/秒`)
  if (e.behavior === 'dash') lines.push(`探测 ${grid(e.detectRange)} · 突刺 ${grid(e.dashDist)}`)
  if (e.behavior === 'chase' && e.poison) {
    lines.push(`死亡留毒 ${grid(e.poison.radius)} · 每 ${e.poison.tickMs / 1000} 秒 ${e.poison.damage} 伤`)
  }
  if (e.behavior === 'chase' && e.split) lines.push(`死亡分裂 ${e.split.count} 只${e.split.into.name}`)
  return lines
}

/** 属性组扁平化为详情行（组标题行 + 内容行） */
function flatten(groups: readonly { title: string; lines: readonly string[] }[]): string[] {
  return groups.flatMap((g) => [`◆ ${g.title}`, ...g.lines])
}

export function wikiGroups(): WikiGroup[] {
  return [
    {
      icon: '🤹',
      title: '角色',
      entries: Object.values(CHARACTERS).map((c) => ({
        emoji: c.emoji,
        name: c.name,
        desc: c.desc,
        lines: flatten(characterStatGroups(c)),
      })),
    },
    {
      icon: '😇',
      title: '队长',
      entries: Object.values(CAPTAINS).map((c) => ({
        emoji: c.emoji,
        name: c.name,
        desc: c.desc,
        lines: flatten(captainStatGroups(c)),
      })),
    },
    {
      icon: '🧟',
      title: '敌人',
      entries: ENEMY_SPECS.map((e) => ({
        emoji: e.emoji,
        name: e.name,
        desc: e.desc,
        lines: enemyStatLines(e),
      })),
    },
    {
      icon: '⚔️',
      title: '武器',
      entries: Object.values(WEAPONS).map((w) => ({
        emoji: w.icon,
        name: w.name,
        desc: `${WEAPON_KIND_LABEL[w.kind]}形态`,
        lines: weaponStatLines(w),
      })),
    },
    {
      icon: '🛡️',
      title: '道具',
      entries: Object.values<ItemSpec>(ITEMS).map((i) => ({
        emoji: i.emoji,
        name: i.name,
        desc: i.desc,
        lines: [
          `价格 ${i.price} 金币 · ${i.maxStacks === undefined ? '无限堆叠' : `上限 ${i.maxStacks} 件`}`,
          `池归属 ${i.pool === 'all' ? '通用' : i.pool === 'team' ? '队长' : WEAPON_KIND_LABEL[i.pool]}`,
        ],
      })),
    },
  ]
}

/** emoji → 图鉴条目反查（完整列表点击已收录项时展示类别与详情；重复归属取首个） */
export function wikiEntryByEmoji(): Map<string, { category: string; entry: WikiEntry }> {
  const map = new Map<string, { category: string; entry: WikiEntry }>()
  for (const g of wikiGroups()) {
    for (const e of g.entries) {
      if (!map.has(e.emoji)) map.set(e.emoji, { category: g.title, entry: e })
    }
  }
  return map
}

/** 已作为游戏实体登场的 emoji（语义集合，用于完整列表的「已收录」标记） */
export function usedEmojiSet(): Set<string> {
  const used = new Set<string>()
  for (const g of wikiGroups()) for (const e of g.entries) used.add(e.emoji)
  // 图鉴条目之外的战斗实体：持有物/弹体/金币/敌方子弹
  for (const c of Object.values(CHARACTERS)) {
    for (const w of c.weapons) {
      if ('held' in w && w.held) used.add(w.held.emoji)
      if (w.kind === 'projectile') used.add(w.projectile.emoji)
    }
  }
  for (const e of ENEMY_SPECS) if ('bullet' in e) used.add(e.bullet.emoji)
  used.add(COIN.emoji)
  return used
}
