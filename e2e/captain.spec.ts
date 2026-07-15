import { expect, test } from '@playwright/test'
import { clickCaptain, completePromote, confirmCaptain, enterCaptain } from './helpers'

test.describe('队长选择', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('队长可选；神童开局 2 点 → 开局整编强制招募两次并上场', async ({ page }) => {
    await page.goto('/')
    await enterCaptain(page)

    const c = await page.evaluate(() => window.__warmoji!.captain!)
    expect(c.items.length).toBeGreaterThanOrEqual(5)
    for (const it of c.items) expect(it.x >= 0 && it.y >= 0).toBe(true)

    // 神童开局等级 2：确认后进开局整编，强制招募 2 次后直接开战（firstWaveShop=false）
    await clickCaptain(page, 'prodigy')
    await confirmCaptain(page)
    const p0 = await page.evaluate(() => window.__warmoji!.promote!)
    expect(p0.mode).toBe('recruit')
    expect(p0.points).toBe(2)
    await completePromote(page)
    await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
    await page.waitForFunction(() => window.__warmoji?.alive === 2)
  })
})
