import { CAPTAINS, CHARACTERS } from '../characters/registry'
import type { CaptainSpec, CharacterSpec } from '../characters/registry'
import type { OutlineKind } from '../emoji/svg'
import { BOSS, ENEMY_SPECS, SPAWN } from '../enemies/registry'
import { CHEST } from '../run/chest'
import { COIN } from '../items/registry'
import { ITEMS } from '../items/registry'
import { MAPS } from '../maps/registry'
import type { MapSpec } from '../maps/registry'
import { SETTING_DEFS } from '../run/settings'

// 启动预载清单：独立于 config——它聚合 items/maps/settings 等下游模块，
// 放 config 里会形成「config ⇄ items」的顶层求值环（items 侧引用 abilities
// 的能力文案，abilities 又依赖 config）。此处是唯一的聚合点。

const roster: readonly CharacterSpec[] = Object.values(CHARACTERS)

// 描边变体按阵营分组预载：玩家侧黑、敌人紫、敌方子弹红
export const OUTLINED_EMOJIS: Record<OutlineKind, readonly string[]> = {
  player: [
    ...roster.map((c) => c.emoji),
    ...Object.values<CaptainSpec>(CAPTAINS).map((c) => c.emoji),
    ...roster.flatMap((c) =>
      c.weapons.flatMap((w) => [
        ...('held' in w && w.held ? [w.held.emoji] : []),
        ...(w.kind === 'projectile' || w.kind === 'turret' ? [w.projectile.emoji] : []),
        ...(w.kind === 'turret' ? [w.turret.emoji] : []),
        ...(w.kind === 'summon' ? [w.minion.emoji] : []),
      ]),
    ),
    COIN.emoji,
    CHEST.emoji,
    '➕',
    '💀',
    // 财迷「天降横财」的金袋投掷物 + HUD 能量豆
    '💰',
    '🫘',
    // 地图地面装饰 + 河流水面漂浮物：与玩家侧同款黑描边（低透明度贴地/浮水）
    ...new Set(
      Object.values<MapSpec>(MAPS).flatMap((m) => [...m.decor.emojis, ...(m.drift ?? [])]),
    ),
  ],
  // 敌方阵营含变形替身（仙子魔尘的绵羊顶替原形象，沿用同阵营描边）
  enemy: [...new Set([...ENEMY_SPECS.map((e) => e.emoji), ...morphEmojis(), ...armedBodyEmojis()])],
  enemyShot: [...new Set(armedShotEmojis())],
  // 精英变体（含 Boss）：金边；持械精英的武器视觉同沾金边
  elite: [
    ...new Set([...ENEMY_SPECS.map((e) => e.emoji), ...morphEmojis(), ...armedBodyEmojis()]),
    BOSS.emoji,
  ],
}

/** 持械敌人的武器视觉（持有物/塔体/召唤物）：随敌人本体阵营描边 */
function armedBodyEmojis(): string[] {
  return [...ENEMY_SPECS, BOSS].flatMap((e) =>
    (e.weapons ?? []).flatMap((w) => [
      ...('held' in w && w.held ? [w.held.emoji] : []),
      ...(w.kind === 'turret' ? [w.turret.emoji] : []),
      ...(w.kind === 'summon' ? [w.minion.emoji] : []),
    ]),
  )
}

/** 持械敌人的弹体：入敌弹组，红描边 */
function armedShotEmojis(): string[] {
  return [...ENEMY_SPECS, BOSS].flatMap((e) =>
    (e.weapons ?? []).flatMap((w) =>
      w.kind === 'projectile' || w.kind === 'turret' ? [w.projectile.emoji] : [],
    ),
  )
}

/** 全部魔尘变形替身形象（从角色配装聚合） */
function morphEmojis(): string[] {
  return roster.flatMap((c) =>
    c.weapons.flatMap((w) => (w.kind === 'projectile' && w.hex ? [w.hex.morphEmoji] : [])),
  )
}

// 启动时预载的 emoji（含 UI 图标）；其余全集按需加载（ui/emoji.ts ensureEmoji）
export const PRELOAD_EMOJIS: readonly string[] = [
  ...Object.values(OUTLINED_EMOJIS).flat(),
  // 属性面板的武器/基础组图标 + 商店道具图标
  ...roster.flatMap((c) => c.weapons.map((w) => w.icon)),
  ...Object.values<{ emoji: string }>(ITEMS).map((i) => i.emoji),
  // 地图图标（选择页素体）+ 地图详情组图标；装饰的描边变体在 OUTLINED_EMOJIS.player
  ...Object.values(MAPS).map((m) => m.emoji),
  '🗺️',
  '🚧',
  ...SETTING_DEFS.map((d) => d.icon),
  SPAWN.markEmoji,
  // 属性面板「特殊能力」组图标
  '⭐',
  '⚙️',
  '📖',
  '🌐',
  '➕',
  '⬆️',
  '⚔️',
  // 命定卡池：盖牌 + 已入队角标
  '❓',
  '🎖️',
  '🏆',
  '⚡',
  '👟',
  '❤️',
  '🔧',
  '✅',
  '⏸️',
  '👑',
  // 主菜单 Emoji Studio 入口图标（studio 页内素材按需加载）
  '🧪',
]
