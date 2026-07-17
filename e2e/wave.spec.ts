import { expect, test } from '@playwright/test'
import {
  clickCaptain,
  clickFormationMember,
  clickPromoteConfirm,
  clickPromoteItem,
  clickShopBuy,
  clickShopNext,
  clickShopRefresh,
  clickShopSlot,
  completePromote,
  confirmCaptain,
  enterCaptain,
  startRun,
} from './helpers'

// 存活 30 秒受随机刷怪影响，慢渲染环境下偶发全灭，允许重试
test.describe.configure({ retries: 2 })

test('波次循环：波末固定招募 1 人 → 商店购物 → 下一波扩编上场', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  // 预选财迷队长（验证免费刷新）；开局整编默认招募第一位候选
  await page.addInitScript(() => {
    localStorage.setItem('warmoji.captain.v1', 'moneybags')
  })
  await page.goto('/')
  await startRun(page)
  const alive0 = await page.evaluate(() => window.__warmoji!.alive)
  expect(alive0).toBe(1)

  // 站桩会被围死：小步绕圈走位撑到波次结束
  const KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'] as const
  for (let i = 0; i < 55; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene === 'promote' || scene === 'shop') break
    expect(scene, '波次中途不应全灭或离开战斗').toBe('arena')
    const key = KEYS[i % 4]!
    await page.keyboard.down(key)
    await page.waitForTimeout(1400)
    await page.keyboard.up(key)
  }

  // 波末必进整编页：本波固定 1 个招募名额，指定招募法师
  await page.waitForFunction(() => window.__warmoji?.scene === 'promote', undefined, {
    timeout: 15_000,
  })
  const promote = await page.evaluate(() => window.__warmoji!.promote!)
  expect(promote.mode).toBe('recruit')
  await clickPromoteItem(page, 'mage')
  await page.screenshot({ path: 'test-results/promote-done.png' })
  await clickPromoteConfirm(page)

  // 名额用完直接进商店：上架位 = 队长 + 2 名队员，法师在列
  await page.waitForFunction(() => window.__warmoji?.scene === 'shop' && !!window.__warmoji.shop)
  const shop = await page.evaluate(() => window.__warmoji!.shop!)
  expect(shop.wave).toBe(2)
  expect(shop.freeRefreshes).toBe(3)
  expect(shop.slots).toHaveLength(3)
  expect(shop.slots.map((s) => s.id)).toContain('mage')
  expect(shop.slots[1]!.offer).not.toBeNull()

  // 注入金币走道具购买：扣款、持有 +1、自动补货
  await page.evaluate(() => window.__addCoins!(200))
  await clickShopSlot(page, 'mage')
  await page.waitForFunction(() => window.__warmoji?.shop?.focusedId === 'mage')
  await clickShopRefresh(page) // 免费刷新一次触发重绘同步金币
  await page.waitForFunction(() => window.__warmoji?.shop?.freeRefreshes === 2)
  const before = await page.evaluate(() => window.__warmoji!.shop!)
  const slot = before.slots.find((s) => s.id === 'mage')!
  expect(before.buy.enabled).toBe(true)
  await clickShopBuy(page)
  await page.waitForFunction((exp) => window.__warmoji?.shop?.coins === exp, before.coins - slot.price!)
  const bought = await page.evaluate(() => window.__warmoji!.shop!)
  const slotAfter = bought.slots.find((s) => s.id === 'mage')!
  expect(slotAfter.owned).toBe(slot.owned + 1)
  expect(slotAfter.offer, '购买后自动补货').not.toBeNull()
  await page.screenshot({ path: 'test-results/shop.png' })

  // 用完剩余免费刷新（不扣钱），再刷新一次转为付费
  for (let n = 2; n > 0; n--) {
    await clickShopRefresh(page)
    await page.waitForFunction((exp) => window.__warmoji?.shop?.freeRefreshes === exp, n - 1)
  }
  const paidBefore = await page.evaluate(() => window.__warmoji!.shop!.coins)
  expect(paidBefore).toBe(bought.coins)
  await clickShopRefresh(page)
  await page.waitForFunction((exp) => (window.__warmoji?.shop?.coins ?? -1) < exp, paidBefore)
  const paidAfter = await page.evaluate(() => window.__warmoji!.shop!.coins)
  expect(paidAfter).toBeLessThan(paidBefore)

  // 继续下一波：扩编 2 人上场，金币与击杀延续
  const coinsIntoWave = paidAfter
  const killsBefore = await page.evaluate(() => window.__warmoji!.kills)
  await clickShopNext(page)
  await page.waitForFunction(() => (window.__warmoji?.wave ?? 0) === 2)
  const start2 = await page.evaluate(() => window.__warmoji!)
  expect(start2.alive).toBe(2)
  expect(start2.coins).toBe(coinsIntoWave)
  expect(start2.kills).toBe(killsBefore)
  expect(errors, `控制台/页面错误：\n${errors.join('\n')}`).toHaveLength(0)
})

test('满员阵型：神童开局满编 → 阵型首秀选中心 → 互换稳定次序 → 满员上场', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    localStorage.setItem('warmoji.captain.v1', 'prodigy')
  })
  await page.goto('/')
  await enterCaptain(page)
  await clickCaptain(page, 'prodigy')
  await confirmCaptain(page)

  // 开局满编 → 首次满员自动展示阵型页（N 保 1），默认中心 = 1 号位
  const f0 = await page.evaluate(() => window.__warmoji!.promote!)
  expect(f0.mode).toBe('formation')
  expect(f0.formation!.center).toBe('juggler')
  expect(f0.items).toHaveLength(5)
  const order0 = f0.items.map((i) => i.id)
  await clickFormationMember(page, 'mage')
  // 稳定次序：互换只动法师与旧中心两人，其他外圈不跳位
  const order1 = await page.evaluate(() => window.__warmoji!.promote!.items.map((i) => i.id))
  expect(order1).toEqual(['mage', ...order0.slice(1).map((id) => (id === 'mage' ? 'juggler' : id))])
  await completePromote(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
  await page.waitForFunction(() => window.__warmoji?.alive === 5)
  const st = await page.evaluate(() => ({
    wave: window.__warmoji!.wave,
    formation: window.__warmoji!.formation,
  }))
  expect(st.wave).toBe(10)
  expect(st.formation).toBe('guard')
})
