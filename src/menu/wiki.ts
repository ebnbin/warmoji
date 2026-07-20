import { CAPTAINS } from '../captains/registry'
import { CHARACTERS, baseLoadout } from '../characters/registry'
import type { CharacterId } from '../characters/registry'
import { ENEMY_DEFS } from '../enemies/registry'
import type { EnemyDef } from '../enemies/registry'
import { PICKUPS } from '../pickups/registry'
import { WEAPONS } from '../weapons/registry'
import { ITEMS, RARITIES } from '../items/registry'
import type { ItemDef } from '../items/registry'
import { captainStatGroups, characterStatGroups, ABILITY_KIND_LABEL, abilityStatLines } from './stats'

// 图鉴：零维护成本地聚合各注册表——新增 entity 自动出现在图鉴里。
// 完整 emoji 列表来自打包索引（构建资产，PreloadScene 已预加载），
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

function grid(units: number): string {
  return `${+units.toFixed(1)}格`
}

const LOCOMOTION_LABEL: Record<EnemyDef['locomotion']['kind'], string> = {
  chase: '追击',
  wander: '游荡',
  static: '原地不动',
  dash: '蓄力突刺',
  flee: '逃跑',
  coinThief: '偷金币',
}

export function enemyStatLines(e: EnemyDef): string[] {
  const lines = [
    `生命 ${e.hp} · 移速 ${grid(e.speed)}/秒 · 接触伤害 ${e.damage}`,
    `行为 ${LOCOMOTION_LABEL[e.locomotion.kind]}${(e.abilities ?? []).some((w) => w.kind === 'projectile' && !(w.volley && w.volley.spreadDeg >= 360)) ? '放枪' : ''} · 经验 ${e.xp} · 金币 ${e.coins}`,
  ]
  for (const w of e.abilities ?? []) {
    if (w.kind === 'projectile') lines.push(`子弹伤害 ${w.damage} · 弹速 ${grid(w.projectile.speed)}/秒`)
  }
  const lm = e.locomotion
  if (lm.kind === 'dash' && lm.detectRange !== undefined && lm.dashDist !== undefined) {
    lines.push(`探测 ${grid(lm.detectRange)} · 突刺 ${grid(lm.dashDist)}`)
  }
  for (const fx of e.onDeath ?? []) {
    if (fx.kind === 'ground') lines.push(`死亡留毒 ${grid(fx.def.radius)} · 每 ${fx.def.tickMs / 1000} 秒 ${fx.def.damage} 伤`)
    if (fx.kind === 'split') lines.push(`死亡分裂 ${fx.count} 只${fx.into.name}`)
  }
  for (const fx of e.onContact ?? []) {
    if (fx.kind === 'attackSlow') {
      lines.push(`接触附黏：命中队员攻击冷却 ×${fx.mul}，持续 ${fx.durationMs / 1000} 秒`)
    }
  }
  if (e.spawner) {
    lines.push(`巢穴：每 ${e.spawner.intervalMs / 1000} 秒生成 ${e.spawner.count} 只${e.spawner.into.name}`)
  }
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
      // 图鉴按素体视角展示（升级卡解锁状态见商店/属性面板）
      entries: (Object.keys(CHARACTERS) as CharacterId[]).map((id) => ({
        emoji: CHARACTERS[id].emoji,
        name: CHARACTERS[id].name,
        desc: CHARACTERS[id].desc,
        lines: flatten(characterStatGroups(id)),
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
      entries: ENEMY_DEFS.map((e) => ({
        emoji: e.emoji,
        name: e.name,
        desc: e.desc,
        lines: enemyStatLines(e),
      })),
    },
    {
      icon: '🗡️',
      title: '武器',
      // 武器 = 包装能力的实体载体（有手持视觉，被角色持有）；抽象能力不进图鉴，
      // 徒手能力在角色详情里看
      entries: Object.values(WEAPONS).map((w) => ({
        emoji: w.emoji,
        name: w.name,
        desc: `${ABILITY_KIND_LABEL[w.base.kind]} · 升级：${w.upgrades.map((u) => u.card.name).join(' → ')}`,
        lines: abilityStatLines(w.base),
      })),
    },
    {
      icon: '🛡️',
      title: '道具',
      entries: Object.values<ItemDef>(ITEMS).map((i) => ({
        emoji: i.emoji,
        name: i.name,
        desc: i.desc,
        lines: [
          `${RARITIES[i.rarity].label} · 价格 ${i.price} 金币 · ${i.maxStacks === undefined ? '无限堆叠' : `上限 ${i.maxStacks} 件`}`,
          `池归属 ${
            i.pool === 'all'
              ? '通用'
              : i.pool === 'team'
                ? '队长'
                : i.pool === 'upgrade'
                  ? `${i.forCharacter ? CHARACTERS[i.forCharacter].name : ''}专属升级卡`
                  : ABILITY_KIND_LABEL[i.pool]
          }`,
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
  // 图鉴条目之外的战斗实体：载体图标（武器/徒手能力，角色详情展示）+ 持有物/弹体
  for (const c of Object.values(CHARACTERS)) {
    for (const carrier of c.carriers) used.add(carrier.icon)
    for (const w of baseLoadout(c)) {
      if ('held' in w && w.held) used.add(w.held.emoji)
      if (w.kind === 'projectile') used.add(w.projectile.emoji)
    }
  }
  for (const e of ENEMY_DEFS)
    for (const w of e.abilities ?? []) if (w.kind === 'projectile') used.add(w.projectile.emoji)
  used.add(PICKUPS.coin.emoji)
  return used
}
