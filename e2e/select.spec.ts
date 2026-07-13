import { expect, test } from '@playwright/test'
import { clickItem, clickStart, clickToggle, enterSelect } from './helpers'

async function selectState(page: import('@playwright/test').Page): Promise<WarmojiSelectDebug> {
  return page.evaluate(() => window.__warmoji!.select!)
}

function inBounds(r: { x: number; y: number; w: number; h: number }, vw: number, vh: number): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= vw && r.y + r.h <= vh
}

test.describe('组队页 横屏 1280×720', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('列表+详情左右分栏；聚焦、换人、出发上场 5 人', async ({ page }) => {
    await page.goto('/')
    await enterSelect(page)

    let s = await selectState(page)
    expect(s.items.length).toBeGreaterThanOrEqual(6)
    expect(s.selected).toBe(s.size)
    expect(s.start.enabled).toBe(true)
    // 详情在左、列表在右（对应竖屏的 上/下），都在最小可用空间内
    expect(s.detail.x + s.detail.w).toBeLessThanOrEqual(s.list.x)
    expect(inBounds(s.list, 1280, 720)).toBe(true)
    expect(inBounds(s.detail, 1280, 720)).toBe(true)
    for (const it of s.items) expect(inBounds(it, 1280, 720)).toBe(true)

    // 聚焦替补：详情切换，满员时按钮为「阵容已满」
    const benched = s.items.find((i) => !i.inLineup)!
    await clickItem(page, benched.id)
    await page.waitForFunction((id) => window.__warmoji?.select?.focusedId === id, benched.id)
    s = await selectState(page)
    expect(s.toggle.mode).toBe('full')
    await page.screenshot({ path: 'test-results/select-landscape.png' })

    // 移出一名出战成员 → 出发禁用，且该角色详情变为可加入
    const member = s.items.find((i) => i.inLineup)!
    await clickItem(page, member.id)
    await page.waitForFunction((id) => window.__warmoji?.select?.focusedId === id, member.id)
    await clickToggle(page)
    await page.waitForFunction((n) => window.__warmoji?.select?.selected === n, s.size - 1)
    s = await selectState(page)
    expect(s.start.enabled).toBe(false)
    expect(s.toggle.mode).toBe('add')

    // 换上替补 → 恢复满员
    await clickItem(page, benched.id)
    await page.waitForFunction((id) => window.__warmoji?.select?.focusedId === id, benched.id)
    await clickToggle(page)
    await page.waitForFunction((n) => window.__warmoji?.select?.selected === n, s.size)
    s = await selectState(page)
    expect(s.start.enabled).toBe(true)
    expect(s.items.find((i) => i.id === benched.id)!.inLineup).toBe(true)

    await clickStart(page)
    await page.waitForFunction((n) => window.__warmoji?.alive === n, s.size)
  })
})

test.describe('组队页 竖屏 720×1280', () => {
  test.use({ viewport: { width: 720, height: 1280 } })

  test('上下分栏（详情在上、列表在下）位于最小可用空间内，可直接出发', async ({ page }) => {
    await page.goto('/')
    await enterSelect(page)

    const s = await selectState(page)
    expect(s.detail.y + s.detail.h).toBeLessThanOrEqual(s.list.y)
    expect(inBounds(s.list, 720, 1280)).toBe(true)
    expect(inBounds(s.detail, 720, 1280)).toBe(true)
    for (const it of s.items) expect(inBounds(it, 720, 1280)).toBe(true)
    expect(
      inBounds(
        { x: s.start.x - s.start.w / 2, y: s.start.y - s.start.h / 2, w: s.start.w, h: s.start.h },
        720,
        1280,
      ),
    ).toBe(true)
    await page.screenshot({ path: 'test-results/select-portrait.png' })

    await clickStart(page)
  })
})

test.describe('组队页 多分辨率', () => {
  test.use({ viewport: { width: 1024, height: 720 } })

  test('矮宽/加长竖屏/宽屏下内容都在视口内且水平居中', async ({ page }) => {
    await page.goto('/')
    await enterSelect(page)
    const sizes = [
      { w: 1024, h: 720 }, // 0.8x → 逻辑 1280×900
      { w: 720, h: 1600 }, // 竖屏加长 → 逻辑 720×1600
      { w: 2560, h: 1600 }, // 2x → 逻辑 1280×800
    ]
    for (const size of sizes) {
      await page.setViewportSize({ width: size.w, height: size.h })
      await page.waitForFunction(
        (css) => {
          const d = window.__warmoji
          if (d?.scene !== 'select' || !d.select) return false
          // 与 core/viewport computeViewport 同规则：宽 >= 高即横屏
          const fit =
            css.w >= css.h ? Math.min(css.w / 1280, css.h / 720) : Math.min(css.w / 720, css.h / 1280)
          return Math.abs(d.viewW - css.w / fit) < 1 && Math.abs(d.viewH - css.h / fit) < 1
        },
        size,
        { timeout: 5_000 },
      )
      const { s, vw, vh } = await page.evaluate(() => ({
        s: window.__warmoji!.select!,
        vw: window.__warmoji!.viewW,
        vh: window.__warmoji!.viewH,
      }))
      expect(inBounds(s.list, vw, vh), `list @${size.w}x${size.h}`).toBe(true)
      expect(inBounds(s.detail, vw, vh), `detail @${size.w}x${size.h}`).toBe(true)
      for (const it of s.items) expect(inBounds(it, vw, vh), `item ${it.id} @${size.w}x${size.h}`).toBe(true)
      const btn = { x: s.start.x - s.start.w / 2, y: s.start.y - s.start.h / 2, w: s.start.w, h: s.start.h }
      expect(inBounds(btn, vw, vh), `start @${size.w}x${size.h}`).toBe(true)
      // 内容块水平居中：左右留白相等
      const left = Math.min(s.list.x, s.detail.x)
      const right = vw - Math.max(s.list.x + s.list.w, s.detail.x + s.detail.w)
      expect(Math.abs(left - right)).toBeLessThanOrEqual(2)
    }
  })
})
