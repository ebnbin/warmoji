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

const roster: readonly CharacterDef[] = Object.values(CHARACTERS)

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
    ...Object.values(FIELD_PICKUPS).map((p) => p.emoji),
    '2795',
    '1f480',
    // 💰 金袋投掷物、🫘 能量豆
    '1f4b0',
    '1fad8',
    ...new Set(
      Object.values<MapDef>(MAPS).flatMap((m) => [...m.decor.emojis, ...(m.drift ?? [])]),
    ),
  ],
  enemy: [...new Set([...ENEMY_DEFS.map((e) => e.emoji), ...morphEmojis(), ...armedBodyEmojis()])],
  enemyProjectile: [...new Set([...armedShotEmojis(), ...deathShotEmojis()])],
  elite: [
    ...new Set([...ENEMY_DEFS.map((e) => e.emoji), ...BOSSES.map((e) => e.emoji), ...morphEmojis(), ...armedBodyEmojis()]),
  ],
}

/** 图集里不描边的贴图：💥 爆裂、⚠ 刷怪预告、🪐 天体横扫 */
export const PLAIN_EMOJIS: readonly string[] = ['1f4a5', SPAWN.markEmoji, '1fa90']

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

function armedShotEmojis(): string[] {
  return [...ENEMY_DEFS, ...BOSSES].flatMap((e) =>
    (e.abilities ?? []).flatMap((w) =>
      w.kind === 'projectile' || w.kind === 'turret' ? [w.projectile.emoji] : [],
    ),
  )
}

function deathShotEmojis(): string[] {
  return [...ENEMY_DEFS, ...BOSSES].flatMap((e) =>
    (e.onDeath ?? []).flatMap((fx) => (fx.kind === 'spawnProjectile' ? [fx.projectile.emoji] : [])),
  )
}

function morphEmojis(): string[] {
  return roster.flatMap((c) =>
    baseLoadout(c).flatMap((w) =>
      w.kind === 'projectile' && w.onHit
        ? w.onHit.flatMap((e) => (e.kind === 'morph' ? [e.morphEmoji] : []))
        : [],
    ),
  )
}

// 不在此清单的 emoji 按需加载（ensureEmoji）
export const PRELOAD_EMOJIS: readonly string[] = [
  ...Object.values(OUTLINED_EMOJIS).flat(),
  ...roster.flatMap((c) => c.carriers.map((cr) => cr.icon)),
  ...Object.values<{ emoji: string }>(ITEMS).map((i) => i.emoji),
  ...Object.values(CARDS).map((c) => c.emoji),
  ...Object.values(MAPS).map((m) => m.emoji),
  // 🗺 🕹 地图详情组图标
  '1f5fa',
  '1f579',
  // 🪐 天体横扫（arcade 侧用无描边版）
  '1fa90',
  ...SETTING_DEFS.map((d) => d.icon),
  SPAWN.markEmoji,
  // 属性面板组图标
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
  // 🧪 Studio 入口
  '1f9ea',
  // 📊 性能基准入口
  '1f4ca',
  // Studio 内部图标：同步渲染，须预载
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
