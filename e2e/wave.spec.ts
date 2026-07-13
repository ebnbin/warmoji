import { expect, test } from '@playwright/test'
import { clickShopBuy, clickShopNext, clickShopRefresh, clickShopSlot, startRun } from './helpers'

// 存活 30 秒受随机刷怪影响，慢渲染环境下偶发全灭，允许重试
test.describe.configure({ retries: 2 })

test('波次循环：战斗 → 商店购买/刷新道具 → 下一波，状态跨波保留', async ({ page }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  // 预选财迷队长：验证免费刷新次数
  await page.addInitScript(() => localStorage.setItem('warmoji.captain.v1', 'moneybags'))
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

  // 商店：下一波编号 +1，战果（击杀/拾取的金币）带入；财迷 3 次免费刷新已就绪
  const shop = await page.evaluate(() => window.__warmoji!)
  expect(shop.shop!.wave).toBe(2)
  expect(shop.kills).toBeGreaterThanOrEqual(1)
  expect(shop.shop!.coins).toBeGreaterThanOrEqual(1)
  expect(shop.shop!.freeRefreshes).toBe(3)

  // 上架位 = 队长 1 + 出战角色 5，各自有上架道具；点其他位切换属性面板焦点
  expect(shop.shop!.slots.length).toBe(6)
  expect(shop.shop!.slots[0]!.id).toBe('captain')
  for (const s of shop.shop!.slots) expect(s.offer, `${s.id} 应有上架道具`).not.toBeNull()
  const other = shop.shop!.slots.find((s) => s.id !== shop.shop!.focusedId)!
  await clickShopSlot(page, other.id)
  await page.waitForFunction((id) => window.__warmoji?.shop?.focusedId === id, other.id)

  // 注入金币走购买流程：扣款、持有 +1、自动补货
  await page.evaluate(() => window.__addCoins!(200))
  await clickShopRefresh(page) // 触发一次重绘同步注入的金币（顺带消耗 1 次免费刷新）
  await page.waitForFunction(() => window.__warmoji?.shop?.freeRefreshes === 2)
  const before = await page.evaluate(() => window.__warmoji!.shop!)
  expect(before.coins).toBe(shop.shop!.coins + 200) // 免费刷新不扣钱
  const slot = before.slots.find((s) => s.id === other.id)!
  expect(slot.offer).not.toBeNull()
  expect(before.buy.enabled).toBe(true)
  await clickShopBuy(page)
  await page.waitForFunction((exp) => window.__warmoji?.shop?.coins === exp, before.coins - slot.price!)
  const bought = await page.evaluate(() => window.__warmoji!.shop!)
  const slotAfter = bought.slots.find((s) => s.id === other.id)!
  expect(slotAfter.owned).toBe(slot.owned + 1)
  expect(slotAfter.offer, '购买后自动补货').not.toBeNull()
  await page.screenshot({ path: 'test-results/shop.png' })

  // 用完剩余 2 次免费刷新（不扣钱），再刷新一次转为付费（扣 2 金币）
  for (let n = 2; n > 0; n--) {
    await clickShopRefresh(page)
    await page.waitForFunction((exp) => window.__warmoji?.shop?.freeRefreshes === exp, n - 1)
  }
  const paidBefore = await page.evaluate(() => window.__warmoji!.shop!.coins)
  expect(paidBefore).toBe(bought.coins) // 免费刷新未扣钱
  await clickShopRefresh(page)
  await page.waitForFunction((exp) => window.__warmoji?.shop?.coins === exp, paidBefore - 2)

  // 继续下一波：波次推进，全员在场，金币与击杀延续
  const coinsIntoWave = paidBefore - 2
  await clickShopNext(page)
  await page.waitForFunction(() => (window.__warmoji?.wave ?? 0) === 2)
  const start2 = await page.evaluate(() => window.__warmoji!)
  expect(start2.alive).toBe(5)
  expect(start2.coins ?? 0).toBeGreaterThanOrEqual(coinsIntoWave)
  await page.waitForFunction((k) => (window.__warmoji?.kills ?? 0) > k, shop.kills, {
    timeout: 20_000,
  })
  expect(errors).toEqual([])
})
