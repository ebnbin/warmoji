import { CAPTAINS } from './data/captains'
import { CHARACTERS, baseLoadout } from './data/characters'
import type { CaptainDef } from './types/captains'
import type { CharacterDef } from './types/characters'
import type { OutlineKind } from './emoji/svg'
import { BOSSES, ENEMY_DEFS, SPAWN } from './data/enemies'
import { PICKUPS } from './data/pickups'
import { FIELD_PICKUPS } from './data/battlefield'
import { CARDS } from './data/cards'
import { ITEMS } from './data/items'
import { MAPS } from './data/maps'
import type { MapDef } from './types/maps'
import { SETTING_DEFS } from './save/settings'

// 启动预载清单：独立于 config——它聚合 items/maps/settings 等下游模块，
// 放 config 里会形成「config ⇄ items」的顶层求值环（items 侧引用 abilities
// 的能力文案，abilities 又依赖 config）。此处是唯一的聚合点。

const roster: readonly CharacterDef[] = Object.values(CHARACTERS)

// 描边变体按阵营分组预载：玩家侧黑、敌人紫、敌方子弹红
export const OUTLINED_EMOJIS: Record<OutlineKind, readonly string[]> = {
  player: [
    ...roster.map((c) => c.emoji),
    ...Object.values<CaptainDef>(CAPTAINS).map((c) => c.emoji),
    ...roster.flatMap((c) =>
      baseLoadout(c).flatMap((w) => [
        ...('held' in w && w.held ? [w.held.emoji] : []),
        ...(w.kind === 'projectile' || w.kind === 'turret' ? [w.projectile.emoji] : []),
        ...(w.kind === 'turret' ? [w.turret.emoji] : []),
        ...(w.kind === 'summon' ? [w.minion.emoji] : []),
      ]),
    ),
    ...Object.values(PICKUPS).map((p) => p.emoji),
    // 战场拾取（地面待拾实体 + HUD 激活效果图标，皆玩家侧黑描边）
    ...Object.values(FIELD_PICKUPS).map((p) => p.emoji),
    '2795',
    '1f480',
    // 财迷「天降横财」的金袋投掷物 + HUD 能量豆
    '1f4b0',
    '1fad8',
    // 地图地面装饰 + 河流水面漂浮物：与玩家侧同款黑描边（低透明度贴地/浮水）
    ...new Set(
      Object.values<MapDef>(MAPS).flatMap((m) => [...m.decor.emojis, ...(m.drift ?? [])]),
    ),
  ],
  // 敌方阵营含变形替身（仙子魔尘的绵羊顶替原形象，沿用同阵营描边）
  enemy: [...new Set([...ENEMY_DEFS.map((e) => e.emoji), ...morphEmojis(), ...armedBodyEmojis()])],
  enemyProjectile: [...new Set([...armedShotEmojis(), ...deathShotEmojis()])],
  // 精英变体（含 Boss）：金边；持械精英的能力视觉同沾金边
  elite: [
    ...new Set([...ENEMY_DEFS.map((e) => e.emoji), ...BOSSES.map((e) => e.emoji), ...morphEmojis(), ...armedBodyEmojis()]),
  ],
}

/** 持械敌人的能力视觉（持有物/塔体/召唤物/点名坠物）：随敌人本体阵营描边 */
function armedBodyEmojis(): string[] {
  return [...ENEMY_DEFS, ...BOSSES].flatMap((e) =>
    (e.abilities ?? []).flatMap((w) => [
      ...('held' in w && w.held ? [w.held.emoji] : []),
      ...(w.kind === 'turret' ? [w.turret.emoji] : []),
      ...(w.kind === 'summon' ? [w.minion.emoji] : []),
      ...(w.kind === 'strike' ? [w.drop.emoji] : []),
    ]),
  )
}

/** 持械敌人的弹体：入敌弹组，红描边 */
function armedShotEmojis(): string[] {
  return [...ENEMY_DEFS, ...BOSSES].flatMap((e) =>
    (e.abilities ?? []).flatMap((w) =>
      w.kind === 'projectile' || w.kind === 'turret' ? [w.projectile.emoji] : [],
    ),
  )
}

/** 亡语冷枪的弹体（onDeath 的 spawnProjectile）：同样入敌弹组，红描边——
 * 与持械弹分开收集，否则外星怪等死亡冷枪的弹体贴图漏预载（现形为缺失贴图） */
function deathShotEmojis(): string[] {
  return [...ENEMY_DEFS, ...BOSSES].flatMap((e) =>
    (e.onDeath ?? []).flatMap((fx) => (fx.kind === 'spawnProjectile' ? [fx.projectile.emoji] : [])),
  )
}

/** 全部魔尘变形替身形象（从角色配装的 onHit 效果聚合） */
function morphEmojis(): string[] {
  return roster.flatMap((c) =>
    baseLoadout(c).flatMap((w) =>
      w.kind === 'projectile' && w.onHit
        ? w.onHit.flatMap((e) => (e.kind === 'morph' ? [e.morphEmoji] : []))
        : [],
    ),
  )
}

// 启动时预载的 emoji（含 UI 图标）；其余全集按需加载（ui/emoji.ts ensureEmoji）
export const PRELOAD_EMOJIS: readonly string[] = [
  ...Object.values(OUTLINED_EMOJIS).flat(),
  // 属性面板的能力/基础组图标 + 商店道具图标
  ...roster.flatMap((c) => c.carriers.map((cr) => cr.icon)),
  ...Object.values<{ emoji: string }>(ITEMS).map((i) => i.emoji),
  // 团队升级卡图标（升级抽卡页 CardScene 无描边渲染）
  ...Object.values(CARDS).map((c) => c.emoji),
  // 地图图标（选择页素体）+ 地图详情组图标（主题 🗺 / 玩法 🕹）；装饰描边变体在 OUTLINED_EMOJIS.player
  ...Object.values(MAPS).map((m) => m.emoji),
  '1f5fa',
  '1f579',
  // 深空图天体横扫的球体（无描边贴图，SpaceScene 直接 emojiImage 渲染）
  '1fa90',
  ...SETTING_DEFS.map((d) => d.icon),
  SPAWN.markEmoji,
  // 属性面板「专属升级」组图标
  '2b50',
  '2699',
  '1f4d6',
  '1f310',
  '2795',
  '2b06',
  '2694',
  // 命定卡池：盖牌 + 已入队角标
  '2753',
  '1f396',
  '1f3c6',
  '26a1',
  '1f45f',
  '2764',
  '1f527',
  '2705',
  '23f8',
  '1f451',
  // 主菜单 Emoji Studio 入口图标（studio 页内素材按需加载）
  '1f9ea',
  // Studio 内部 UI 图标（tab / clip / 媒体控制 / 眼睛开关）——同步渲染需预载
  '1f3ac', // 🎬 配方
  '1f9e9', // 🧩 模板
  '1f52c', // 🔬 解剖
  '1f9d8', // 🧘 待机
  '23ee', // ⏮ 上一帧
  '25b6', // ▶ 播放
  '23ed', // ⏭ 下一帧
  '1f441', // 👁 可见
  '1f648', // 🙈 隐藏
]
