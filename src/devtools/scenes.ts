import Phaser from 'phaser'
import type { DevItem } from './types'

const STATUS: Readonly<Record<number, string>> = {
  [Phaser.Scenes.INIT]: '初始化',
  [Phaser.Scenes.START]: '启动',
  [Phaser.Scenes.LOADING]: '加载',
  [Phaser.Scenes.CREATING]: '创建',
  [Phaser.Scenes.RUNNING]: '运行',
  [Phaser.Scenes.PAUSED]: '暂停',
  [Phaser.Scenes.SLEEPING]: '休眠',
}

export function sceneStatus(s: Phaser.Scene): string {
  return STATUS[s.sys.settings.status] ?? '停止'
}

export function scenesText(game: Phaser.Game): string {
  return game.scene
    .getScenes(false)
    .map((s) => `${s.scene.key.padEnd(12)} ${sceneStatus(s).padEnd(3)} ${s.children.length}`)
    .join('\n')
}

export function sceneItems(game: Phaser.Game, devKey: string): DevItem[] {
  const m = game.scene
  const items: DevItem[] = [{ kind: 'text', mono: true, read: () => scenesText(game) }]
  for (const s of m.getScenes(false)) {
    const key = s.scene.key
    if (key === devKey) continue
    const st = s.sys.settings.status
    const restart = { label: '重启', run: (): void => void m.stop(key).start(key) }
    const stop = { label: '停止', run: (): void => void m.stop(key) }
    const buttons =
      st === Phaser.Scenes.RUNNING
        ? [{ label: '暂停', run: (): void => void m.pause(key) }, { label: '睡眠', run: (): void => void m.sleep(key) }, restart, stop]
        : st === Phaser.Scenes.PAUSED
          ? [{ label: '继续', run: (): void => void m.resume(key) }, restart, stop]
          : st === Phaser.Scenes.SLEEPING
            ? [{ label: '唤醒', run: (): void => void m.wake(key) }, stop]
            : [{ label: '启动', run: (): void => void m.start(key) }]
    items.push({ kind: 'buttons', label: `${key} · ${sceneStatus(s)}`, buttons })
  }
  return items
}
