import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function cssPoint(page: Page, logical: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
}

test('图鉴：类别横向 tab、条目详情、全部 emoji 网格点选与滚动、返回', async ({ page }) => {
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

  // 图鉴页：默认类别为角色，五个类别 tab
  let w = await page.evaluate(() => window.__warmoji!.wiki!)
  expect(w.tab).toBe('entries')
  expect(w.category).toBe('角色')
  expect(w.categories.map((c) => c.title)).toEqual(['角色', '队长', '敌人', '武器', '道具'])
  expect(w.entryCount).toBe(8)

  // 切到敌人类别：条目数与聚焦跟随
  const enemyCat = w.categories.find((c) => c.title === '敌人')!
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: enemyCat.x, y: enemyCat.y }) })
  await page.waitForFunction(() => window.__warmoji?.wiki?.category === '敌人')
  w = await page.evaluate(() => window.__warmoji!.wiki!)
  expect(w.entryCount).toBe(9)
  expect(w.focused.startsWith('敌人:')).toBe(true)

  // 点另一个条目切换详情
  const target = w.items.find((i) => i.key !== w.focused)!
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: target.x + target.w / 2, y: target.y + 26 }) })
  await page.waitForFunction((k) => window.__warmoji?.wiki?.focused === k, target.key)
  await page.screenshot({ path: 'test-results/wiki-entries.png' })

  // 切到全部 emoji：清单懒加载、网格可滚动
  const allTab = w.tabs.find((t) => t.id === 'all')!
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: allTab.x, y: allTab.y }) })
  await page.waitForFunction(() => (window.__warmoji?.wiki?.manifestCount ?? 0) > 1500, undefined, {
    timeout: 15_000,
  })
  w = await page.evaluate(() => window.__warmoji!.wiki!)
  expect(w.maxScroll).toBeGreaterThan(1000)

  // 点选第一个格子：选中态 + 详情出现（首个是未收录 emoji）
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: w.list.x + 31, y: w.list.y + 31 }) })
  await page.waitForFunction(() => window.__warmoji?.wiki?.allSelected !== null)

  // 滚动网格
  const gridCenter = await cssPoint(page, { x: w.list.x + w.list.w / 2, y: w.list.y + w.list.h / 2 })
  await page.mouse.move(gridCenter.x, gridCenter.y)
  await page.mouse.wheel(0, 600)
  await page.waitForFunction(() => (window.__warmoji?.wiki?.scrollY ?? 0) > 0)
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'test-results/wiki-all.png' })

  // 旋转保持：标签页与选中不丢
  await page.setViewportSize({ width: 720, height: 1280 })
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'wiki' && (window.__warmoji.viewH ?? 0) > (window.__warmoji.viewW ?? 0),
  )
  w = await page.evaluate(() => window.__warmoji!.wiki!)
  expect(w.tab).toBe('all')
  expect(w.allSelected).not.toBeNull()

  // 返回主界面
  const back = await page.evaluate(() => window.__warmoji!.wiki!.back)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: back.x, y: back.y }) })
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu')
  expect(errors).toEqual([])
})
