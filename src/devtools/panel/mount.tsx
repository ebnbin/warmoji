import type Phaser from 'phaser'
import { createRoot } from 'react-dom/client'
import { registerBuiltins } from '../sections'
import { App } from './app'
import './panel.css'

/** 引擎内置的页签随面板一起按需加载 */
export function mountPanel(game: Phaser.Game, host: HTMLElement): void {
  registerBuiltins(game)
  createRoot(host).render(<App game={game} />)
}
