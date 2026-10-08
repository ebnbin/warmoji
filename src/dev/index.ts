import type Phaser from 'phaser'
import { registerGameTab } from '../devtools'
import { audioTab } from './audio'
import { emojiTab } from './emoji'
import { pagesTab } from './pages'
import { runTab } from './run'
import { settingsTab } from './settings'
import { tuningTab } from './tuning'
import { viewportTab } from './viewport'

/** 游戏层：这款游戏的能力，与当前在哪个 scene 无关 */
export function registerGameDevTabs(game: Phaser.Game): void {
  for (const tab of [runTab(), pagesTab(game), viewportTab(), tuningTab(), settingsTab(), audioTab(), emojiTab(game)]) registerGameTab(tab)
}
