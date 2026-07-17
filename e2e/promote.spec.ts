import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  clickCaptain,
  clickPromoteConfirm,
  clickPromoteItem,
  completePromote,
  confirmCaptain,
  enterCaptain,
} from './helpers'

async function cssPoint(page: Page, logical: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
}

function inBounds(r: { x: number; y: number; w: number; h: number }, vw: number, vh: number): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= vw && r.y + r.h <= vh
}

test.describe('开局整编（组建队伍）', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('返回可重选队长；指定招募后开战（默认队长 1 点直接进战斗，不进商店）', async ({ page }) => {
    await page.goto('/')
    await enterCaptain(page)
    await confirmCaptain(page)

    // 开局整编：1 点强制招募；网格与确认按钮都在最小可用区内
    let p = await page.evaluate(() => window.__warmoji!.promote!)
    expect(p.mode).toBe('recruit')
    expect(p.points).toBe(1)
    expect(p.items.length).toBeGreaterThanOrEqual(6)
    for (const it of p.items) expect(inBounds(it, 1280, 720)).toBe(true)
    expect(inBounds({ x: p.confirm.x - p.confirm.w / 2, y: p.confirm.y - p.confirm.h / 2, w: p.confirm.w, h: p.confirm.h }, 1280, 720)).toBe(true)
    await page.screenshot({ path: 'test-results/promote-initial.png' })

    // 开局可反悔：返回退回队长页（本局作废），再次确认点数重置
    await page
      .locator('#game canvas')
      .click({ position: await cssPoint(page, { x: p.back.x, y: p.back.y }) })
    await page.waitForFunction(() => window.__warmoji?.scene === 'captain')
    await confirmCaptain(page)
    p = await page.evaluate(() => window.__warmoji!.promote!)
    expect(p.points).toBe(1)

    // 指定招募法师 → 点数花完直接开战（firstWaveShop=false 不进商店）
    await clickPromoteItem(page, 'mage')
    await clickPromoteConfirm(page)
    await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
    const alive = await page.evaluate(() => window.__warmoji!.alive)
    expect(alive).toBe(1)
  })
})

test.describe('开局整编 竖屏', () => {
  test.use({ viewport: { width: 720, height: 1280 } })

  test('竖屏布局在最小可用区内；旋转保持模式与选中', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('warmoji.captain.v1', 'prodigy')
    })
    await page.goto('/')
    await enterCaptain(page)
    await clickCaptain(page, 'prodigy')
    await confirmCaptain(page)

    let p = await page.evaluate(() => window.__warmoji!.promote!)
    expect(p.mode).toBe('recruit')
    expect(p.points).toBe(15)
    for (const it of p.items) expect(inBounds(it, 720, 1280)).toBe(true)
    await clickPromoteItem(page, 'robot')
    await page.screenshot({ path: 'test-results/promote-portrait.png' })

    // 旋转到横屏：仍在整编页，模式与选中保持
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.waitForFunction(
      () => window.__warmoji?.scene === 'promote' && (window.__warmoji.viewW ?? 0) > (window.__warmoji.viewH ?? 0),
    )
    p = await page.evaluate(() => window.__warmoji!.promote!)
    expect(p.mode).toBe('recruit')
    expect(p.selected).toBe('robot')

    // 神童 15 点：招满 5 人（含机器人）+ 升 10 级 → 开局队形环节 → 第 10 波开战
    await clickPromoteConfirm(page)
    await page.waitForFunction(() => (window.__warmoji?.promote?.points ?? 0) === 14)
    await completePromote(page)
    await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
    const alive = await page.evaluate(() => window.__warmoji!.alive)
    expect(alive).toBe(5)
  })
})
