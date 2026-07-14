import { expect, test } from '@playwright/test'
import { startRun } from './helpers'

test('开局后自动战斗：出怪、飞刀击杀、计时推进、无控制台错误', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.goto('/')
  await startRun(page)

  // 先出现刷怪预告标记，随后敌人落地
  await page.waitForFunction(() => (window.__warmoji?.pending ?? 0) > 0, undefined, {
    timeout: 15_000,
  })
  await page.screenshot({ path: 'test-results/telegraph.png' })
  await page.waitForFunction(() => (window.__warmoji?.enemies ?? 0) > 0, undefined, {
    timeout: 15_000,
  })

  // 玩家不动，飞刀自动索敌应产生击杀
  await page.waitForFunction(() => (window.__warmoji?.kills ?? 0) >= 1, undefined, {
    timeout: 45_000,
  })

  // 等战场热闹些再截图
  await page.waitForFunction(() => (window.__warmoji?.elapsed ?? 0) > 8, undefined, {
    timeout: 45_000,
  })
  await page.screenshot({ path: 'test-results/gameplay.png' })

  const state = await page.evaluate(() => window.__warmoji)
  expect(state?.scene).toBe('arena')
  expect(state?.kills ?? 0).toBeGreaterThanOrEqual(1)
  expect(state?.hp ?? 0).toBeGreaterThan(0)

  // 暂停（ESC）：局内时间冻结；恢复后继续推进
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const t1 = await page.evaluate(() => window.__warmoji!.elapsed)
  await page.waitForTimeout(700)
  const t2 = await page.evaluate(() => window.__warmoji!.elapsed)
  expect(t2).toBe(t1)
  await page.keyboard.press('Escape')
  await page.waitForFunction((t) => (window.__warmoji?.elapsed ?? 0) > t, t2, {
    timeout: 10_000,
  })

  expect(errors).toEqual([])
})
