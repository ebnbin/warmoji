import { expect, test } from '@playwright/test'

// 浮冰：全局打滑（不跟手/刹不住）+ 四周水域落水掉血 + 相机永远跟随。
// 用调试探针确定性地校验"打滑手感"：推一段会加速滑动，松手后仍继续滑行（刹不住），
// 不依赖游戏时钟推进（软渲染容器里时钟偏慢）。
test('浮冰图：进入方形浮冰、打滑加速 + 松手仍滑行（刹不住）、运转无报错', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto('/')
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu')
  await page.evaluate(() => window.__labTeam!(['juggler'], 'ice'))
  await page.waitForFunction(() => window.__warmoji?.mapId === 'ice')
  await page.waitForTimeout(1200)

  type IceScene = {
    center: { x: number; y: number }
    constrainTeam(p: { x: number; y: number }): { x: number; y: number }
  }
  type Game = { scene: { getScene(k: string): IceScene } }

  const slide = await page.evaluate(() => {
    const s = (window.__game as unknown as Game).scene.getScene('arenaIce')
    // 满推向右若干帧：位移应逐帧变大（加速起步，非瞬时满速）
    const steps: number[] = []
    for (let i = 0; i < 24; i++) {
      const before = s.center.x
      const n = s.constrainTeam({ x: s.center.x + 400, y: s.center.y })
      s.center.x = n.x
      s.center.y = n.y
      steps.push(s.center.x - before)
    }
    const pushed = steps.reduce((a, b) => a + b, 0)
    const accelerated = steps[5]! > steps[0]! // 第 6 帧步长 > 第 1 帧（在加速）
    // 松手（输入=当前位置，无位移意图）若干帧：仍应继续向右滑行（刹不住）
    const beforeCoast = s.center.x
    let coastFrames = 0
    for (let i = 0; i < 24; i++) {
      const before = s.center.x
      const n = s.constrainTeam({ x: s.center.x, y: s.center.y })
      s.center.x = n.x
      s.center.y = n.y
      if (s.center.x - before > 0.01) coastFrames++
    }
    return { pushed, accelerated, coast: s.center.x - beforeCoast, coastFrames }
  })

  // 推的时候在动
  expect(slide.pushed).toBeGreaterThan(0)
  // 是"加速起步"而非瞬时满速（打滑=不跟手）
  expect(slide.accelerated).toBe(true)
  // 松手后仍在向右滑行（刹不住），且滑了不止一帧
  expect(slide.coast).toBeGreaterThan(0)
  expect(slide.coastFrames).toBeGreaterThan(1)

  expect(errors).toEqual([])
})
