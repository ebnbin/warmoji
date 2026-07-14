import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function cssPoint(page: Page, logical: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
}

test('图鉴：分组条目与详情、全部 emoji 虚拟网格、返回', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('/')
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu' && !!window.__warmoji.menu)
  const book = await page.evaluate(() => window.__warmoji!.menu!.wiki)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: book.x, y: book.y }) })
  await page.waitForFunction(() => window.__warmoji?.scene === 'wiki' && !!window.__warmoji.wiki)

  // 图鉴页：五组条目聚合自注册表（角色8+队长5+敌人9+武器9+道具18=49）
  let w = await page.evaluate(() => window.__warmoji!.wiki!)
  expect(w.tab).toBe('entries')
  expect(w.entryCount).toBeGreaterThanOrEqual(45)
  expect(w.focused.length).toBeGreaterThan(0)

  // 点另一个可视条目切换详情
  const target = w.items.find((i) => i.key !== w.focused && i.y >= 0)!
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: target.x + target.w / 2, y: target.y + 26 }) })
  await page.waitForFunction((k) => window.__warmoji?.wiki?.focused === k, target.key)
  await page.screenshot({ path: 'test-results/wiki-entries.png' })

  // 切到全部 emoji：清单懒加载完成、收录数正确、网格可滚动
  const allTab = w.tabs.find((t) => t.id === 'all')!
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: allTab.x, y: allTab.y }) })
  await page.waitForFunction(() => (window.__warmoji?.wiki?.manifestCount ?? 0) > 1500, undefined, {
    timeout: 15_000,
  })
  w = await page.evaluate(() => window.__warmoji!.wiki!)
  expect(w.usedCount).toBeGreaterThanOrEqual(40)
  expect(w.maxScroll).toBeGreaterThan(1000)

  const gridCenter = await page.evaluate(() => {
    const d = window.__warmoji!
    const k = window.innerWidth / d.viewW
    const L = d.wiki!.list
    return { x: (L.x + L.w / 2) * k, y: (L.y + L.h / 2) * k }
  })
  await page.mouse.move(gridCenter.x, gridCenter.y)
  await page.mouse.wheel(0, 600)
  await page.waitForFunction(() => (window.__warmoji?.wiki?.scrollY ?? 0) > 0)
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'test-results/wiki-all.png' })

  // 旋转保持：标签页与滚动状态不丢
  await page.setViewportSize({ width: 720, height: 1280 })
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'wiki' && (window.__warmoji.viewH ?? 0) > (window.__warmoji.viewW ?? 0),
  )
  w = await page.evaluate(() => window.__warmoji!.wiki!)
  expect(w.tab).toBe('all')

  // 返回主界面
  const back = await page.evaluate(() => window.__warmoji!.wiki!.back)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: back.x, y: back.y }) })
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu')
  expect(errors).toEqual([])
})
