import { expect, test } from '@playwright/test'

test('压测模式：敌人数突破常规上限、血量拉满、FPS 指标可读、无报错', async ({ page }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('/?dev=1')
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu')
  await page.locator('#game canvas').click()
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')

  await page.evaluate(() => window.__setStress!(true))

  // 常规同屏上限 120，压测模式下应显著突破
  await page.waitForFunction(() => (window.__warmoji?.enemies ?? 0) > 140, undefined, {
    timeout: 100_000,
  })

  const s = await page.evaluate(() => window.__warmoji!)
  expect(s.hp).toBeGreaterThan(100_000)
  expect(s.fps).toBeGreaterThan(0)
  await page.screenshot({ path: 'test-results/stress.png' })

  expect(errors).toEqual([])
})
