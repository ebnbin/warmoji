import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function cssPoint(page: Page, logical: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
}

test('图鉴：类别横向 tab、条目详情、全部 emoji 网格点选与滚动、返回', async ({ page }) => {
  // 软渲染容器里与其他用例并行时光栅化偏慢，预算适当放宽
  test.setTimeout(120_000)
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

  // 默认类别为地图；顺序 地图/队长/角色/敌人/道具，「全部」平级排最后
  let w = await page.evaluate(() => window.__warmoji!.wiki!)
  expect(w.category).toBe('地图')
  expect(w.categories.map((c) => c.title)).toEqual(['地图', '队长', '角色', '敌人', '道具', '全部'])
  expect(w.entryCount).toBe(7)

  // 切到敌人类别：条目数与聚焦跟随（含 Boss）
  const enemyCat = w.categories.find((c) => c.title === '敌人')!
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: enemyCat.x, y: enemyCat.y }) })
  await page.waitForFunction(() => window.__warmoji?.wiki?.category === '敌人')
  w = await page.evaluate(() => window.__warmoji!.wiki!)
  expect(w.entryCount).toBe(28)
  expect(w.focused.startsWith('敌人:')).toBe(true)

  // 点另一个条目切换详情
  const target = w.items.find((i) => i.key !== w.focused)!
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: target.x + target.w / 2, y: target.y + 26 }) })
  await page.waitForFunction((k) => window.__warmoji?.wiki?.focused === k, target.key)
  await page.screenshot({ path: 'test-results/wiki-entries.png' })

  // 切到「全部」类别：feed 流无 loading，网格即刻就绪，首屏缩略图按需渲染
  const allTab = w.categories.find((c) => c.title === '全部')!
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: allTab.x, y: allTab.y }) })
  await page.waitForFunction(
    () => window.__warmoji?.wiki?.category === '全部' && (window.__warmoji.wiki.thumbsReady ?? 0) > 30,
    undefined,
    { timeout: 30_000 },
  )
  w = await page.evaluate(() => window.__warmoji!.wiki!)
  expect(w.manifestCount).toBeGreaterThan(1500)
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

  // 深下滑再回滑到顶：页内缓存命中，回看已翻阅区域不应空白/报错
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 5000)
  await page.waitForFunction(() => (window.__warmoji?.wiki?.scrollY ?? 0) > 5000)
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -6000)
  await page.waitForFunction(() => (window.__warmoji?.wiki?.scrollY ?? 0) === 0)
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'test-results/wiki-backscroll.png' })

  // 旋转保持：类别与选中不丢
  await page.setViewportSize({ width: 720, height: 1280 })
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'wiki' && (window.__warmoji.viewH ?? 0) > (window.__warmoji.viewW ?? 0),
  )
  w = await page.evaluate(() => window.__warmoji!.wiki!)
  expect(w.category).toBe('全部')
  expect(w.allSelected).not.toBeNull()

  // 返回主界面
  const back = await page.evaluate(() => window.__warmoji!.wiki!.back)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: back.x, y: back.y }) })
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu')
  expect(errors).toEqual([])
})
