import { expect, test } from '@playwright/test'
import { clickCaptain, clickShopNext, completePromote, confirmCaptain, enterCaptain } from './helpers'

test.describe('队长选择', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('队长可选；神童自选满编 + 满豆 + 启动资金，直接从第 15 波开战', async ({ page }) => {
    await page.goto('/')
    await enterCaptain(page)

    const c = await page.evaluate(() => window.__warmoji!.captain!)
    expect(c.items.length).toBeGreaterThanOrEqual(5)
    for (const it of c.items) expect(it.x >= 0 && it.y >= 0).toBe(true)

    // 神童（测试直通车）：开局整编一次给足 5 个招募名额（自选阵容）→
    // 满员阵型首秀 → 自带启动资金先逛商店 → 直接开打第 15 波
    await clickCaptain(page, 'prodigy')
    await confirmCaptain(page)
    const p0 = await page.evaluate(() => window.__warmoji!.promote!)
    expect(p0.mode).toBe('recruit')
    await completePromote(page)
    await page.waitForFunction(() => window.__warmoji?.scene === 'shop' && !!window.__warmoji.shop)
    const shopCoins = await page.evaluate(() => window.__warmoji!.shop!.coins)
    expect(shopCoins).toBe(500)
    await clickShopNext(page)
    await page.waitForFunction(() => window.__warmoji?.alive === 5)
    const st = await page.evaluate(() => ({
      wave: window.__warmoji!.wave,
      beans: window.__warmoji!.skill?.beans,
    }))
    expect(st.wave).toBe(15)
    expect(st.beans).toBe(3)
  })
})
