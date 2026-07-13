import { expect, test } from '@playwright/test'
import { clickCard, startRun } from './helpers'

async function menuState(page: import('@playwright/test').Page): Promise<WarmojiMenuDebug> {
  return page.evaluate(() => window.__warmoji!.menu!)
}

function inBounds(r: { x: number; y: number; w: number; h: number }, vw: number, vh: number): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= vw && r.y + r.h <= vh
}

test.describe('组队页 横屏 1280×720', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('默认满员；换人交互；出发进入战斗且上场 5 人', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__warmoji?.scene === 'menu' && !!window.__warmoji.menu)

    let m = await menuState(page)
    expect(m.cards.length).toBeGreaterThanOrEqual(6)
    expect(m.selected).toBe(m.size)
    expect(m.start.enabled).toBe(true)
    // 全部卡片与按钮位于最小可用空间内；横屏 3 列
    for (const c of m.cards) expect(inBounds(c, 1280, 720)).toBe(true)
    expect(new Set(m.cards.map((c) => c.x)).size).toBe(3)
    await page.screenshot({ path: 'test-results/select-landscape.png' })

    // 点掉一名已选 → 差一人，出发禁用
    const firstSelected = m.cards.find((c) => c.selected)!
    await clickCard(page, firstSelected.id)
    await page.waitForFunction((n) => window.__warmoji?.menu?.selected === n, m.size - 1)
    m = await menuState(page)
    expect(m.start.enabled).toBe(false)

    // 换上替补 → 满员恢复
    const benched = m.cards.find((c) => !c.selected)!
    await clickCard(page, benched.id)
    await page.waitForFunction((n) => window.__warmoji?.menu?.selected === n, m.size)
    m = await menuState(page)
    expect(m.start.enabled).toBe(true)
    expect(m.cards.find((c) => c.id === benched.id)!.selected).toBe(true)

    await startRun(page)
    await page.waitForFunction((n) => window.__warmoji?.alive === n, m.size)
  })
})

test.describe('组队页 竖屏 720×1280', () => {
  test.use({ viewport: { width: 720, height: 1280 } })

  test('2 列布局位于最小可用空间内，可直接出发', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.__warmoji?.scene === 'menu' && !!window.__warmoji.menu)

    const m = await menuState(page)
    for (const c of m.cards) expect(inBounds(c, 720, 1280)).toBe(true)
    expect(new Set(m.cards.map((c) => c.x)).size).toBe(2)
    expect(
      inBounds(
        { x: m.start.x - m.start.w / 2, y: m.start.y - m.start.h / 2, w: m.start.w, h: m.start.h },
        720,
        1280,
      ),
    ).toBe(true)
    await page.screenshot({ path: 'test-results/select-portrait.png' })

    await startRun(page)
  })
})

test.describe('组队页 多分辨率', () => {
  test.use({ viewport: { width: 1024, height: 720 } })

  test('矮宽/加长竖屏/宽屏下内容都在视口内且水平居中', async ({ page }) => {
    await page.goto('/')
    const sizes = [
      { w: 1024, h: 720 }, // 0.8x → 逻辑 1280×900
      { w: 720, h: 1600 }, // 竖屏加长 → 逻辑 720×1600
      { w: 2560, h: 1600 }, // 2x → 逻辑 1280×800
    ]
    for (const s of sizes) {
      await page.setViewportSize({ width: s.w, height: s.h })
      await page.waitForFunction(
        (css) => {
          const d = window.__warmoji
          if (!d?.menu) return false
          // 与 core/viewport computeViewport 同规则：宽 >= 高即横屏
          const fit =
            css.w >= css.h ? Math.min(css.w / 1280, css.h / 720) : Math.min(css.w / 720, css.h / 1280)
          return Math.abs(d.viewW - css.w / fit) < 1 && Math.abs(d.viewH - css.h / fit) < 1
        },
        s,
        { timeout: 5_000 },
      )
      const { m, vw, vh } = await page.evaluate(() => ({
        m: window.__warmoji!.menu!,
        vw: window.__warmoji!.viewW,
        vh: window.__warmoji!.viewH,
      }))
      for (const c of m.cards) expect(inBounds(c, vw, vh), `card ${c.id} @${s.w}x${s.h}`).toBe(true)
      const btn = { x: m.start.x - m.start.w / 2, y: m.start.y - m.start.h / 2, w: m.start.w, h: m.start.h }
      expect(inBounds(btn, vw, vh), `start @${s.w}x${s.h}`).toBe(true)
      // 卡片网格水平居中
      const leftGap = Math.min(...m.cards.map((c) => c.x))
      const rightGap = vw - Math.max(...m.cards.map((c) => c.x + c.w))
      expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(2)
    }
  })
})
