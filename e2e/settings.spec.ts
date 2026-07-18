import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function cssPoint(page: Page, logical: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
}

async function enterSettings(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu' && !!window.__warmoji.menu)
  const gear = await page.evaluate(() => window.__warmoji!.menu!.settings)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: gear.x, y: gear.y }) })
  await page.waitForFunction(() => window.__warmoji?.scene === 'settings' && !!window.__warmoji.settings)
}

async function toggleItem(page: Page, id: string): Promise<void> {
  const it = await page.evaluate(
    (key) => window.__warmoji!.settings!.items.find((x) => x.id === key)!,
    id,
  )
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: it.x + it.w / 2, y: it.y + it.h / 2 }) })
  await page.waitForFunction(
    ({ key, want }) => window.__warmoji?.settings?.items.find((x) => x.id === key)?.on === want,
    { key: id, want: !it.on },
  )
}

test('设置页：入口可达、开关默认全开、切换即时持久化、返回与旋转保持', async ({ page }) => {
  await page.goto('/')
  await enterSettings(page)

  // 默认全部选项都开启
  const items = await page.evaluate(() => window.__warmoji!.settings!.items)
  expect(items.map((i) => i.id).sort()).toEqual(['bgm', 'damageNumbers', 'hitShake', 'sound'])
  expect(items.every((i) => i.on)).toBe(true)
  await page.screenshot({ path: 'test-results/settings.png' })

  // 关掉全部开关
  await toggleItem(page, 'damageNumbers')
  await toggleItem(page, 'hitShake')
  await toggleItem(page, 'sound')
  await toggleItem(page, 'bgm')

  // 旋转到竖屏：仍在设置页且开关状态保持
  await page.setViewportSize({ width: 720, height: 1280 })
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'settings' && (window.__warmoji.viewH ?? 0) > (window.__warmoji.viewW ?? 0),
  )
  const rotated = await page.evaluate(() => window.__warmoji!.settings!.items)
  expect(rotated.every((i) => !i.on)).toBe(true)

  // 刷新页面重进：设置已持久化
  await page.reload()
  await enterSettings(page)
  const reloaded = await page.evaluate(() => window.__warmoji!.settings!.items)
  expect(reloaded.every((i) => !i.on)).toBe(true)

  // 返回主界面
  const back = await page.evaluate(() => window.__warmoji!.settings!.back)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: back.x, y: back.y }) })
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu')
})
