import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  clickCaptain,
  clickPromoteConfirm,
  clickPromoteItem,
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

    // 开局整编：首发名额强制招募——随机候选 5 选 1，未选满前确认不可用
    let p = await page.evaluate(() => window.__warmoji!.promote!)
    expect(p.mode).toBe('recruit')
    expect(p.due).toBe(1)
    expect(p.items).toHaveLength(5)
    expect(p.confirm.enabled).toBe(false)
    for (const it of p.items) expect(inBounds(it, 1280, 720)).toBe(true)
    expect(inBounds({ x: p.confirm.x - p.confirm.w / 2, y: p.confirm.y - p.confirm.h / 2, w: p.confirm.w, h: p.confirm.h }, 1280, 720)).toBe(true)
    await page.screenshot({ path: 'test-results/promote-initial.png' })

    // 开局可反悔：返回退回队长页（本局作废），再次确认名额重置
    await page
      .locator('#game canvas')
      .click({ position: await cssPoint(page, { x: p.back.x, y: p.back.y }) })
    await page.waitForFunction(() => window.__warmoji?.scene === 'captain')
    await confirmCaptain(page)
    p = await page.evaluate(() => window.__warmoji!.promote!)
    expect(p.mode).toBe('recruit')
    expect(p.items).toHaveLength(5)

    // 从随机候选里点第一位入空位 → 确认开战（firstWaveShop=false 不进商店）
    const recruitId = p.items[0]!.id
    await clickPromoteItem(page, recruitId)
    await page.waitForFunction(
      (id) => (window.__warmoji?.promote?.picked ?? []).includes(id),
      recruitId,
    )
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
      localStorage.setItem('warmoji.captain.v1', 'angel')
    })
    await page.goto('/')
    await enterCaptain(page)
    await clickCaptain(page, 'angel')
    await confirmCaptain(page)

    let p = await page.evaluate(() => window.__warmoji!.promote!)
    expect(p.mode).toBe('recruit')
    for (const it of p.items) expect(inBounds(it, 720, 1280)).toBe(true)
    // 点第二位候选入空位（避开默认详情展示位，验证选中态本身）
    const pickId = p.items[1]!.id
    await clickPromoteItem(page, pickId)
    await page.waitForFunction(
      (id) => (window.__warmoji?.promote?.picked ?? []).includes(id),
      pickId,
    )
    await page.screenshot({ path: 'test-results/promote-portrait.png' })

    // 旋转到横屏：仍在整编页，模式/已选/候选池都保持（池子同种子重抽必相同）
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.waitForFunction(
      () => window.__warmoji?.scene === 'promote' && (window.__warmoji.viewW ?? 0) > (window.__warmoji.viewH ?? 0),
    )
    p = await page.evaluate(() => window.__warmoji!.promote!)
    expect(p.mode).toBe('recruit')
    expect(p.selected).toBe(pickId)
    expect(p.picked).toEqual([pickId])

    // 名额已点满 → 确认直接开战
    await clickPromoteConfirm(page)
    await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
    const alive = await page.evaluate(() => window.__warmoji!.alive)
    expect(alive).toBe(1)
  })
})
