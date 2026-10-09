import type Phaser from 'phaser'
import { registerGameTab } from '../devtools'
import { audioTab } from './audio'
import { emojiTab } from './emoji'
import { pagesTab } from './pages'
import { runTab } from './run'
import { tapesTab } from './tapes'
import { viewportTab } from './viewport'

/** 游戏层：作用于这款游戏的全局系统，在哪个页面都有意义 */
export function registerGameDevTabs(game: Phaser.Game): void {
  for (const tab of [pagesTab(game), runTab(), tapesTab(game), viewportTab(), audioTab(), emojiTab(game)]) registerGameTab(tab)
}
