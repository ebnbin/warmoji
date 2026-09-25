import type Phaser from 'phaser'
import type { DevProvider } from '../devtools'
import { CAPTAINS } from '../data/captains'
import { CHARACTERS } from '../data/characters'
import { MAPS } from '../data/maps'
import { currentRun, endRun } from '../run/state'
import { SceneKey } from '../scene/keys'
import { gotoScene } from './nav'

function runText(): string {
  const run = currentRun()
  if (!run) return '当前没有进行中的一局'
  const cards = Object.entries(run.teamCards).reduce((s, [, n]) => s + (n ?? 0), 0)
  return [
    `${CAPTAINS[run.captainId].name} · ${MAPS[run.mapId].name}${run.sandbox ? ' · 试炼场' : ''}`,
    `第 ${run.wave} 波 · 金币 ${run.coins} · 击杀 ${run.kills} · 等级 ${run.xp.level}（${run.xp.xp} xp）· 待抽卡 ${run.cardDraws}`,
    `队伍 ${run.roster.map((id) => CHARACTERS[id].name).join('、')}`,
    `队伍卡 ${cards} 张 · 技能冷却 ${Math.ceil(run.skillCdMs / 1000)} s · 累计战斗 ${Math.round(run.combatMs / 1000)} s`,
  ].join('\n')
}

/** 游戏级：构建信息与整局状态，与具体页面无关 */
export function appProvider(game: Phaser.Game): DevProvider {
  return {
    id: 'app',
    title: '应用',
    sections: [
      {
        id: 'app',
        title: '应用',
        items: () => [
          { kind: 'text', mono: true, read: () => `构建 ${__BUILD_HASH__} · ${__BUILD_TIME__}` },
          {
            kind: 'buttons',
            buttons: [
              {
                label: '回到主菜单',
                run: (): void => {
                  endRun()
                  gotoScene(game, SceneKey.Menu)
                },
              },
            ],
          },
        ],
      },
      {
        id: 'run',
        title: '对局',
        items: () => [
          { kind: 'text', mono: true, read: runText },
          {
            kind: 'buttons',
            buttons: [
              { label: '金币 +100', run: () => void (currentRun() && (currentRun()!.coins += 100)) },
              { label: '金币 +1000', run: () => void (currentRun() && (currentRun()!.coins += 1000)) },
              {
                label: '结束本局回主菜单',
                run: (): void => {
                  endRun()
                  gotoScene(game, SceneKey.Menu)
                },
              },
            ],
          },
        ],
      },
    ],
  }
}
