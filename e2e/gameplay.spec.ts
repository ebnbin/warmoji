import { expect, test } from '@playwright/test'

test('开局后自动战斗：出怪、飞刀击杀、计时推进、无控制台错误', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.goto('/')
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu')

  await page.locator('#game canvas').click()
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')

  // 敌人开始刷新
  await page.waitForFunction(() => (window.__warmoji?.enemies ?? 0) > 0, undefined, {
    timeout: 10_000,
  })

  // 玩家不动，飞刀自动索敌应产生击杀
  await page.waitForFunction(() => (window.__warmoji?.kills ?? 0) >= 1, undefined, {
    timeout: 20_000,
  })

  // 计时正常推进；等到战场热闹一点再截图
  await page.waitForFunction(() => (window.__warmoji?.elapsed ?? 0) > 8, undefined, {
    timeout: 20_000,
  })
  await page.screenshot({ path: 'test-results/gameplay.png' })

  const state = await page.evaluate(() => window.__warmoji)
  expect(state?.scene).toBe('arena')
  expect(state?.kills ?? 0).toBeGreaterThanOrEqual(1)
  expect(state?.hp ?? 0).toBeGreaterThan(0)

  expect(errors).toEqual([])
})
