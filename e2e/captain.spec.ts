import { expect, test } from '@playwright/test'
import { clickCaptain, clickStart, confirmCaptain, enterCaptain } from './helpers'

test.describe('队长选择', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('队长可选；神童开局 2 级 → 组队页选 2 名首发并上场', async ({ page }) => {
    await page.goto('/')
    await enterCaptain(page)

    const c = await page.evaluate(() => window.__warmoji!.captain!)
    expect(c.items.length).toBeGreaterThanOrEqual(5)
    for (const it of c.items) expect(it.x >= 0 && it.y >= 0).toBe(true)

    // 神童开局等级 2：首发 2 人（全新存档默认取花名册前 2），直接出发
    await clickCaptain(page, 'prodigy')
    await confirmCaptain(page)
    await page.waitForFunction(
      () => window.__warmoji?.select?.size === 2 && window.__warmoji.select.selected === 2,
    )
    await clickStart(page)
    await page.waitForFunction(() => window.__warmoji?.alive === 2)
  })
})
