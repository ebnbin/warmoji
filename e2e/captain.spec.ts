import { expect, test } from '@playwright/test'
import { clickCaptain, completePromote, confirmCaptain, enterCaptain } from './helpers'

test.describe('队长选择', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('队长可选；神童开局 15 点 → 招满 5 人 + 升级，直接从第 10 波开战', async ({ page }) => {
    await page.goto('/')
    await enterCaptain(page)

    const c = await page.evaluate(() => window.__warmoji!.captain!)
    expect(c.items.length).toBeGreaterThanOrEqual(5)
    for (const it of c.items) expect(it.x >= 0 && it.y >= 0).toBe(true)

    // 神童（测试直通车）开局等级 15：招满 5 人 + 升 10 级 → 队形环节 → 跳到第 10 波
    await clickCaptain(page, 'prodigy')
    await confirmCaptain(page)
    const p0 = await page.evaluate(() => window.__warmoji!.promote!)
    expect(p0.mode).toBe('recruit')
    expect(p0.points).toBe(15)
    await completePromote(page)
    await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
    await page.waitForFunction(() => window.__warmoji?.alive === 5)
    const wave = await page.evaluate(() => window.__warmoji!.wave)
    expect(wave).toBe(10)
  })
})
