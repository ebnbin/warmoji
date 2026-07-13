import { expect, test } from '@playwright/test'

test('25×25 地图：出生居中、相机跟随、边缘钳制到 margin', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('/')
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu')
  await page.locator('#game canvas').click()
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')

  // 出生在地图中心（1600×1600 的中点）
  const spawn = await page.evaluate(() => window.__warmoji!)
  expect(spawn.playerX).toBeCloseTo(800, 0)
  expect(spawn.playerY).toBeCloseTo(800, 0)

  // 向右移动途中相机跟随玩家保持居中
  await page.keyboard.down('KeyD')
  await page.waitForFunction(
    () => {
      const d = window.__warmoji!
      return d.playerX > 1100 && Math.abs(d.camX - d.playerX) < 32
    },
    undefined,
    { timeout: 10_000 },
  )

  // 到达右缘：相机被钳制在 地图+margin 内，玩家偏离屏幕中心
  await page.waitForFunction(() => (window.__warmoji?.playerX ?? 0) > 1500, undefined, {
    timeout: 10_000,
  })
  await page.keyboard.up('KeyD')
  await page.waitForTimeout(300)

  const edge = await page.evaluate(() => window.__warmoji!)
  // 1280×720 视口下 camX 上限 = 1600 + 128 - 640 = 1088
  expect(edge.camX).toBeLessThanOrEqual(1089)
  expect(edge.playerX - edge.camX).toBeGreaterThan(300)
  await page.screenshot({ path: 'test-results/map-edge.png' })

  expect(errors).toEqual([])
})
