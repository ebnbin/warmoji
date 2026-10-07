import type Phaser from 'phaser'
import type { DevProvider, DevSection } from '../devtools'
import { CHARACTERS } from '../data/characters'
import { MAPS } from '../data/maps'
import { fightCount } from '../data/runs'
import { currentRun, endRun, runDef, stepsOf } from '../run/state'
import { SceneKey } from '../scene/keys'
import { gotoScene } from './nav'

function runText(): string {
  const run = currentRun()
  if (!run) return '当前没有进行中的一局'
  return [
    `${MAPS[run.mapId].name} · ${runDef(run).name} · 第 ${run.step + 1}${Number.isFinite(fightCount(runDef(run))) ? `/${stepsOf(run).length}` : ''} 步`,
    `金币 ${run.coins} · 击杀 ${run.kills} · 等级 ${run.xp.level}（${run.xp.xp} xp）`,
    `队伍 ${run.roster.map((id) => CHARACTERS[id].name).join('、')} · 队长 ${CHARACTERS[run.leaderId].name}`,
    `累计战斗 ${Math.round(run.combatMs / 1000)} s`,
  ].join('\n')
}

/** 游戏级：一局的状态与页面直跳，与当前停在哪一页无关 */
function runSections(game: Phaser.Game): DevSection[] {
  return [
    {
      id: 'status',
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
    {
      id: 'pages',
      title: '页面',
      items: () => [
        {
          kind: 'buttons',
          buttons: [
            { label: '图鉴', run: () => gotoScene(game, SceneKey.Wiki) },
            { label: 'Studio', run: () => gotoScene(game, SceneKey.Studio) },
            { label: '设置页', run: () => gotoScene(game, SceneKey.Settings) },
          ],
        },
      ],
    },
  ]
}

export function runProvider(game: Phaser.Game): DevProvider {
  return { id: 'run', title: '对局', sections: runSections(game) }
}
