import { expect, test } from '@playwright/test'
import { startRun } from './helpers'

test.describe('竖屏 720×1600：1x，保底 720×1280 上下各扩 160', () => {
  test.use({ viewport: { width: 720, height: 1600 } })

  test('逻辑可视区 720×1600，竖屏可正常游玩', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(String(err)))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/')
    await page.waitForFunction(() => window.__warmoji?.scene === 'menu')
    let v = await page.evaluate(() => window.__warmoji!)
    expect(v.viewW).toBeCloseTo(720, 0)
    expect(v.viewH).toBeCloseTo(1600, 0)
    await page.screenshot({ path: 'test-results/portrait-menu.png' })

    await startRun(page)
    await page.waitForFunction(() => (window.__warmoji?.enemies ?? 0) > 0, undefined, {
      timeout: 30_000,
    })
    await page.waitForFunction(() => (window.__warmoji?.elapsed ?? 0) > 5, undefined, {
      timeout: 30_000,
    })
    await page.screenshot({ path: 'test-results/portrait-arena.png' })

    v = await page.evaluate(() => window.__warmoji!)
    expect(v.viewW).toBeCloseTo(720, 0)
    expect(v.viewH).toBeCloseTo(1600, 0)
    expect(errors).toEqual([])
  })
})

test.describe('宽屏 2560×1600：2x，逻辑 1280×800', () => {
  test.use({ viewport: { width: 2560, height: 1600 } })

  test('逻辑可视区 1280×800', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__warmoji?.scene === 'menu')
    const v = await page.evaluate(() => window.__warmoji!)
    expect(v.viewW).toBeCloseTo(1280, 0)
    expect(v.viewH).toBeCloseTo(800, 0)
    await page.screenshot({ path: 'test-results/wide-menu.png' })
  })
})

test.describe('矮宽 1024×720：0.8x，逻辑 1280×900', () => {
  test.use({ viewport: { width: 1024, height: 720 } })

  test('逻辑可视区 1280×900，运行中改变窗口尺寸实时适配', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__warmoji?.scene === 'menu')
    const v = await page.evaluate(() => window.__warmoji!)
    expect(v.viewW).toBeCloseTo(1280, 0)
    expect(v.viewH).toBeCloseTo(900, 0)

    // 横屏拉成竖屏，等 resize 防抖后应重算为 720×1600
    await page.setViewportSize({ width: 720, height: 1600 })
    await page.waitForFunction(
      () => Math.abs((window.__warmoji?.viewW ?? 0) - 720) < 1 && Math.abs((window.__warmoji?.viewH ?? 0) - 1600) < 1,
      undefined,
      { timeout: 5_000 },
    )
  })
})
