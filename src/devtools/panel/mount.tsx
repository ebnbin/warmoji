import type Phaser from 'phaser'
import { createRoot } from 'react-dom/client'
import { registerEngineTabs } from '../builtins'
import { App } from './app'
import './panel.css'

/** 引擎层页签随面板一起按需加载 */
export function mountPanel(game: Phaser.Game, host: HTMLElement): void {
  registerEngineTabs(game)
  createRoot(host).render(<App game={game} />)
}
