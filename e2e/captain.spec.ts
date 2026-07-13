import { expect, test } from '@playwright/test'
import { clickCaptain, clickStart, confirmCaptain, enterCaptain } from './helpers'

test.describe('队长选择', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('三个队长可选；招募队长把编制扩到 6 人并上场', async ({ page }) => {
    await page.goto('/')
    await enterCaptain(page)

    const c = await page.evaluate(() => window.__warmoji!.captain!)
    expect(c.items.length).toBeGreaterThanOrEqual(3)
    for (const it of c.items) expect(it.x >= 0 && it.y >= 0).toBe(true)

    // 选招募队长（编制 6）：全新存档默认阵容自动填满 6 人，直接出发
    await clickCaptain(page, 'party')
    await confirmCaptain(page)
    await page.waitForFunction(
      () => window.__warmoji?.select?.size === 6 && window.__warmoji.select.selected === 6,
    )
    await clickStart(page)
    await page.waitForFunction(() => window.__warmoji?.alive === 6)
  })
})
