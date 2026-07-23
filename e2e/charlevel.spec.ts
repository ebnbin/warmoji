import { expect, test } from '@playwright/test'
import {
  clickShopBuy,
  clickShopRefresh,
  clickShopSlot,
  completePromote,
  drainCards,
  drainChests,
  startRun,
} from './helpers'

// 存活到波末受随机刷怪影响，慢渲染环境下偶发全灭，允许重试
test.describe.configure({ retries: 2 })

test('角色专属经验：为角色买道具累积经验，跨阈值自动质变升级（免费）', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto('/')
  await startRun(page)

  // 走位撑到波末 → 抽卡/开箱 → 整编招募 → 商店
  const KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'] as const
  for (let i = 0; i < 55; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene !== 'arena') break
    await page.keyboard.down(KEYS[i % 4]!)
    await page.waitForTimeout(1400)
    await page.keyboard.up(KEYS[i % 4]!)
  }
  await drainCards(page)
  await drainChests(page)
  await completePromote(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'shop' && !!window.__warmoji.shop)

  // 给焦点角色（槽位 0）注入接近阈值的经验 + 充足金币
  await page.evaluate(() => {
    window.__addCoins!(500)
    window.__addCharXp!(75, 0)
  })
  const focusedId = await page.evaluate(() => window.__warmoji!.shop!.focusedId)
  await clickShopSlot(page, focusedId) // 聚焦并刷新调试快照
  await page.waitForFunction(() => window.__warmoji?.shop?.focusedLevel === 1)

  // 确保焦点位有货可买（没有就免费刷一次）
  const hasOffer = await page.evaluate(
    (id) => !!window.__warmoji!.shop!.slots.find((s) => s.id === id)?.offer,
    focusedId,
  )
  if (!hasOffer) {
    await clickShopRefresh(page)
    await page.waitForFunction(
      (id) => !!window.__warmoji?.shop?.slots.find((s) => s.id === id)?.offer,
      focusedId,
    )
  }

  // 购买一件 → 该角色专属经验跨过阈值 → 自动升到 2 级（无需再花钱买升级卡）
  const coinsBefore = await page.evaluate(() => window.__warmoji!.shop!.coins)
  await clickShopBuy(page)
  await page.waitForFunction(() => window.__warmoji?.shop?.focusedLevel === 2, undefined, {
    timeout: 10_000,
  })
  const after = await page.evaluate(() => window.__warmoji!.shop!)
  expect(after.focusedLevel).toBe(2)
  expect(after.coins).toBeLessThan(coinsBefore) // 只花了道具钱，升级免费
  expect(errors, `控制台/页面错误：\n${errors.join('\n')}`).toHaveLength(0)
})
