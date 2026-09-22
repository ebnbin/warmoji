import { expect, test } from '@playwright/test'

test('页面可加载：canvas 渲染、版本徽章存在、无控制台错误', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.goto('/')
  await expect(page).toHaveTitle(/Warmoji/i)

  await expect(page.locator('#game canvas')).toBeVisible()
  await expect(page.locator('#build-badge')).toHaveText(/^([0-9a-f]{7}|dev)$/)

  await page.waitForFunction(() => window.__warmoji?.scene === 'menu')

  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundImage)
  expect(bg).toContain('linear-gradient')
  const themeColor = await page.evaluate(
    () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '',
  )
  expect(themeColor).toMatch(/^#[0-9a-f]{6}$/i)

  const manifest = await page.request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBeTruthy()
  expect((await manifest.json()).display).toBe('fullscreen')
  expect((await page.request.get('/icons/icon-512.png')).ok()).toBeTruthy()

  // 到达 menu 即证明 emoji 包已加载解析（PreloadScene 门禁）

  // 跑几帧，暴露启动后才出现的运行时错误
  await page.waitForTimeout(800)
  expect(errors).toEqual([])

  await page.screenshot({ path: 'test-results/menu.png' })
})
