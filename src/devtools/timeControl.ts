import Phaser from 'phaser'

export const TIME_SCALES: readonly number[] = [0, 0.1, 0.25, 0.5, 1, 2, 4]

let game: Phaser.Game | undefined
let devKey = ''
let scale = 1
let driving = false
let rafId = 0
let fakeTime = 0
let lastReal = 0
const pausedByUs = new Set<Phaser.Scene>()

export function installTimeControl(g: Phaser.Game, devSceneKey: string): void {
  game = g
  devKey = devSceneKey
}

export function timeScale(): number {
  return scale
}

export function pausedSceneCount(): number {
  return pausedByUs.size
}

function resumeAll(): void {
  for (const s of pausedByUs) if (s.sys.isPaused()) s.sys.resume()
  pausedByUs.clear()
}

/** 暂停靠逐 scene 暂停实现：引擎循环照常，覆盖层与渲染都活着；业务 scene 每次 resume 只跑一帧就被再次暂停 */
export function enforceTimeControl(): void {
  if (!game || scale !== 0) return
  for (const s of game.scene.getScenes(true)) {
    if (s.scene.key === devKey) continue
    s.sys.pause()
    pausedByUs.add(s)
  }
}

export function stepOneFrame(): void {
  if (scale !== 0) return
  for (const s of pausedByUs) if (s.sys.isPaused()) s.sys.resume()
}

/** 慢放与快进靠合成时钟驱动 TimeStep：慢放缩小 delta，快进一帧内多次 step */
function startDriving(): void {
  const g = game
  if (!g || driving) return
  const loop = g.loop
  loop.sleep()
  fakeTime = loop.lastTime
  lastReal = performance.now()
  driving = true
  const tick = (): void => {
    if (!driving) return
    const now = performance.now()
    const real = now - lastReal
    lastReal = now
    if (scale >= 1) {
      const n = Math.max(1, Math.round(scale))
      for (let i = 0; i < n; i++) {
        fakeTime += real
        loop.step(fakeTime)
      }
    } else {
      fakeTime += real * scale
      loop.step(fakeTime)
    }
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}

function stopDriving(): void {
  const g = game
  if (!g || !driving) return
  driving = false
  cancelAnimationFrame(rafId)
  g.loop.lastTime = performance.now()
  g.loop.wake(true)
}

export function setTimeScale(next: number): void {
  if (!game || !TIME_SCALES.includes(next)) return
  scale = next
  stopDriving()
  if (next === 1 || next === 0) {
    if (next === 1) resumeAll()
    return
  }
  resumeAll()
  startDriving()
}

export function timeText(): string {
  const g = game
  if (!g) return ''
  const mode = scale === 0 ? '已暂停' : scale === 1 ? '正常' : driving ? `合成时钟 ×${scale}` : `×${scale}`
  return [
    `模式 ${mode} · 已暂停 scene ${pausedByUs.size}`,
    `引擎帧 ${g.loop.frame} · 引擎时间 ${(g.loop.time / 1000).toFixed(1)} s · 本帧 delta ${g.loop.delta.toFixed(1)} ms`,
    `Phaser.Scenes 暂停会停掉该 scene 的 update、计时器与补间，渲染照常`,
  ].join('\n')
}
