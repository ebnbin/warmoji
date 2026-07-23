import { expect, test } from '@playwright/test'

// 深空：无限世界 + 天体横扫 + 黑洞禁锢场。用调试探针确定性地校验两套机制，
// 不依赖游戏时钟推进（软渲染容器里时钟偏慢）。
test('太空图：进入无限深空、天体横扫可触发、黑洞禁锢场困住队伍、运转无报错', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto('/')
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu')
  await page.evaluate(() => window.__labTeam!(['juggler'], 'space'))
  await page.waitForFunction(() => window.__warmoji?.mapId === 'space')
  await page.waitForTimeout(1200)

  type SpaceScene = {
    nextMeteorAt: number
    elapsedMs: number
    meteor?: { phase: string }
    fieldCx: number
    fieldCy: number
    fieldR: number
    center: { x: number; y: number }
    onFinalWaveSetup(): void
    constrainTeam(p: { x: number; y: number }): { x: number; y: number }
  }
  type Game = { scene: { getScene(k: string): SpaceScene } }

  // 天体横扫：强制触发 → 很快进入预警（不必等它划完）
  await page.evaluate(() => {
    const s = (window.__game as unknown as Game).scene.getScene('arenaSpace')
    s.nextMeteorAt = s.elapsedMs
  })
  await page.waitForFunction(
    () => {
      const s = (window.__game as unknown as Game).scene.getScene('arenaSpace')
      return !!s.meteor && (s.meteor.phase === 'warn' || s.meteor.phase === 'travel')
    },
    undefined,
    { timeout: 15_000 },
  )

  // 黑洞禁锢场：张开后，队伍一路朝外猛冲也困在半径内（每步向外分量被百分比衰减，累积逼近 R）
  const confine = await page.evaluate(() => {
    const s = (window.__game as unknown as Game).scene.getScene('arenaSpace')
    s.onFinalWaveSetup()
    for (let i = 0; i < 300; i++) {
      const next = s.constrainTeam({ x: s.center.x + 120, y: s.center.y })
      s.center.x = next.x
      s.center.y = next.y
    }
    return { dist: Math.hypot(s.center.x - s.fieldCx, s.center.y - s.fieldCy), R: s.fieldR }
  })
  // 冲不出禁锢半径（顶到边缘就再也出不去）
  expect(confine.dist).toBeLessThanOrEqual(confine.R * 1.02)
  // 但确实一路挤到了边缘（不是原地没动）
  expect(confine.dist).toBeGreaterThan(confine.R * 0.85)

  expect(errors).toEqual([])
})
