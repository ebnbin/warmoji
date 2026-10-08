import Phaser from 'phaser'

/** 一帧里预编着色器最多占几毫秒 */
const FRAME_BUDGET_MS = 4

/**
 * 一批里用到几张贴图，Phaser 就用几张贴图的那一版着色器，到第一次凑齐时才现编，编的那一帧会卡住：
 * 加载期间每画完一帧接着编，把 1 张到上限张的都编好，一帧编满几毫秒就留到下一帧；编过的留在渲染器里，之后的局一帧就过完
 */
export function warmQuadShaders(scene: Phaser.Scene): Promise<void> {
  const r = scene.renderer
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return Promise.resolve()
  const node = r.renderNodes.getNode('BatchHandlerQuad') as Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad | null
  if (!node) return Promise.resolve()
  return new Promise((resolve) => {
    let count = 1
    const done = (): void => {
      scene.game.events.off(Phaser.Core.Events.POST_RENDER, step)
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, done)
      resolve()
    }
    const step = (): void => {
      if (r.contextLost || node.instanceCount !== 0) return
      const t0 = performance.now()
      while (count <= r.maxTextures && performance.now() - t0 < FRAME_BUDGET_MS) {
        node.finalizeTextureCount(count)
        node.programManager.getCurrentProgramSuite()
        count++
      }
      if (count > r.maxTextures) done()
    }
    scene.game.events.on(Phaser.Core.Events.POST_RENDER, step)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, done)
  })
}

/** 等游戏再画完一帧：这一帧里头一回画的东西，着色器就在这一帧编好 */
export function nextRender(scene: Phaser.Scene): Promise<void> {
  return new Promise((resolve) => scene.game.events.once(Phaser.Core.Events.POST_RENDER, () => resolve()))
}
