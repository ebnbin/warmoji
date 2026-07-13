import { expect, test } from '@playwright/test'
import { clickShopNext, clickShopSlot, startRun } from './helpers'

// 存活 30 秒受随机刷怪影响，慢渲染环境下偶发全灭，允许重试
test.describe.configure({ retries: 2 })

test('波次循环：30 秒战斗 → 商店 → 下一波，金币/击杀/血量跨波保留', async ({ page }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('/')
  await startRun(page)

  // 站桩会被围死：小步绕圈走位（留在武器清出的安全区内）撑到波次结束
  const KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'] as const
  for (let i = 0; i < 55; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene === 'shop') break
    expect(scene, '波次中途不应全灭或离开战斗').toBe('arena')
    const key = KEYS[i % 4]!
    await page.keyboard.down(key)
    await page.waitForTimeout(1400)
    await page.keyboard.up(key)
  }
  await page.waitForFunction(() => window.__warmoji?.scene === 'shop', undefined, {
    timeout: 15_000,
  })

  // 商店：下一波编号 +1，战果（击杀/拾取的金币）带入
  const shop = await page.evaluate(() => window.__warmoji!)
  expect(shop.shop!.wave).toBe(2)
  expect(shop.kills).toBeGreaterThanOrEqual(1)
  expect(shop.shop!.coins).toBeGreaterThanOrEqual(1)

  // 每个出战角色一个上架位；点其他位切换属性面板焦点
  expect(shop.shop!.slots.length).toBe(5)
  const other = shop.shop!.slots.find((s) => s.id !== shop.shop!.focusedId)!
  await clickShopSlot(page, other.id)
  await page.waitForFunction((id) => window.__warmoji?.shop?.focusedId === id, other.id)
  await page.screenshot({ path: 'test-results/shop.png' })

  // 继续下一波：波次推进，全员在场，金币与击杀延续
  await clickShopNext(page)
  await page.waitForFunction(() => (window.__warmoji?.wave ?? 0) === 2)
  const start2 = await page.evaluate(() => window.__warmoji!)
  expect(start2.alive).toBe(5)
  expect(start2.coins ?? 0).toBeGreaterThanOrEqual(shop.shop!.coins)
  await page.waitForFunction((k) => (window.__warmoji?.kills ?? 0) > k, shop.kills, {
    timeout: 20_000,
  })
  expect(errors).toEqual([])
})
