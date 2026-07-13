import { expect, test } from '@playwright/test'

test('压测模式：敌人数突破常规上限、血量拉满、FPS 指标可读、无报错', async ({ page }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('/')
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu')
  await page.locator('#game canvas').click()
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')

  // 右下角 🔧 常驻按钮打开性能面板
  await page.locator('#game canvas').click({ position: { x: 1256, y: 682 } })
  await page.waitForTimeout(400)

  await page.evaluate(() => window.__setStress!(true))

  // 压测下刷怪 62/s、全队 300 刀/s，短时间内击杀吞吐应远超常规节奏
  await page.waitForFunction(() => (window.__warmoji?.kills ?? 0) > 300, undefined, {
    timeout: 100_000,
  })

  const s = await page.evaluate(() => window.__warmoji!)
  expect(s.hp).toBeGreaterThan(100_000)
  expect(s.fps).toBeGreaterThan(0)
  await page.screenshot({ path: 'test-results/stress.png' })

  expect(errors).toEqual([])
})
