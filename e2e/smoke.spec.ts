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

  // 屏幕锚定的渐变背景画在页面层
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundImage)
  expect(bg).toContain('linear-gradient')

  // twemoji 全集已部署：抽查一个未预载的 emoji（😀）
  const ver = await page.evaluate(() => window.__twemojiVersion)
  const dynamicSvg = await page.request.get(`/emoji/${ver}/1f600.svg`)
  expect(dynamicSvg.ok()).toBeTruthy()
  expect(await dynamicSvg.text()).toContain('<svg')

  // 跑几帧，暴露启动后才出现的运行时错误
  await page.waitForTimeout(800)
  expect(errors).toEqual([])

  await page.screenshot({ path: 'test-results/menu.png' })
})
