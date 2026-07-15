import { expect, test } from '@playwright/test'
import {
  clickFormationMember,
  clickPromoteConfirm,
  clickPromoteItem,
  clickShopBuy,
  clickShopNext,
  clickShopRefresh,
  clickShopSlot,
  startRun,
} from './helpers'

// 存活 30 秒受随机刷怪影响，慢渲染环境下偶发全灭，允许重试
test.describe.configure({ retries: 2 })

test('波次循环：整编强制招募→满编升级 → 商店纯购物 → 下一波满员上场', async ({ page }) => {
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

  // 注入经验：足够触发 4 次强制招募（满编 5 人）+ 至少 1 次强制升级
  await page.evaluate(() => window.__addXp!(500))

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

  // 波末必进整编页（经验不可延迟消费）
  await page.waitForFunction(() => window.__warmoji?.scene === 'promote', undefined, {
    timeout: 15_000,
  })

  // 整编循环：未满编阶段必须是招募（先点法师入队验证指定招募），满编后必须是升级；
  // 点数逐步花光后落在队形环节
  const modesSeen = new Set<string>()
  let recruitedMage = false
  for (let step = 0; step < 24; step++) {
    const promote = await page.evaluate(() => window.__warmoji!.promote!)
    if (promote.mode === 'formation') break
    modesSeen.add(promote.mode)
    expect(promote.points).toBeGreaterThan(0)
    if (promote.mode === 'recruit' && !recruitedMage) {
      await clickPromoteItem(page, 'mage')
      recruitedMage = true
    }
    const before = promote.points
    await clickPromoteConfirm(page)
    await page.waitForFunction(
      (prev) =>
        window.__warmoji?.promote?.mode === 'formation' ||
        (window.__warmoji?.promote?.points ?? 99) < prev,
      before,
      { timeout: 15_000 },
    )
  }
  // 未满编先招募、满编才升级：两种步骤都必须出现过
  expect([...modesSeen].sort()).toEqual(['recruit', 'upgrade'])

  // 首次满员：自动展示一次阵型页（N 保 1），默认中心 = 1 号位，点选改保法师
  const f0 = await page.evaluate(() => window.__warmoji!.promote!)
  expect(f0.mode).toBe('formation')
  expect(f0.formation!.center).toBe('juggler')
  expect(f0.items).toHaveLength(5)
  const order0 = f0.items.map((i) => i.id) // [juggler, mage, unicorn, troll, cowboy]
  await clickFormationMember(page, 'mage')
  // 稳定次序：互换只动法师与旧中心两人，其他外圈不跳位
  const order1 = await page.evaluate(() => window.__warmoji!.promote!.items.map((i) => i.id))
  expect(order1).toEqual(['mage', ...order0.slice(1).map((id) => (id === 'mage' ? 'juggler' : id))])
  await page.screenshot({ path: 'test-results/promote-done.png' })
  await clickPromoteConfirm(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'shop' && !!window.__warmoji.shop)

  // 商店：满编 6 个上架位（队长+5 队员），没有招募位；法师在队；有人已升级
  const shop = await page.evaluate(() => window.__warmoji!.shop!)
  expect(shop.wave).toBe(2)
  expect(shop.freeRefreshes).toBe(3)
  expect(shop.slots).toHaveLength(6)
  expect(shop.slots.map((s) => s.id)).toContain('mage')
  expect(shop.slots.every((s) => s.id !== 'recruit')).toBe(true)
  expect(shop.slots.some((s) => (s.memberLevel ?? 1) >= 2)).toBe(true)
  expect(shop.slots[1]!.offer).not.toBeNull()

  // 商店阵型入口：进阵型页改保巨魔，返回后货架/免费刷新/金币原样保留
  expect(shop.formation).not.toBeNull()
  const offersBefore = shop.slots.map((s) => s.offer)
  await page.locator('#game canvas').click({
    position: await page.evaluate(({ x, y }) => {
      const k = window.innerWidth / window.__warmoji!.viewW
      return { x: Math.round(x * k), y: Math.round(y * k) }
    }, shop.formation!),
  })
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'promote' && window.__warmoji.promote?.mode === 'formation',
  )
  expect(await page.evaluate(() => window.__warmoji!.promote!.formation!.center)).toBe('mage')
  await clickFormationMember(page, 'troll')
  // 换保巨魔后：法师顶到巨魔原岗位，其余原位
  const order2 = await page.evaluate(() => window.__warmoji!.promote!.items.map((i) => i.id))
  expect(order2).toEqual(order1.map((id) => (id === 'troll' ? 'mage' : id === 'mage' ? 'troll' : id)))
  await clickPromoteConfirm(page) // 「返回商店」
  await page.waitForFunction(() => window.__warmoji?.scene === 'shop' && !!window.__warmoji.shop)
  const shopBack = await page.evaluate(() => window.__warmoji!.shop!)
  expect(shopBack.freeRefreshes).toBe(3)
  expect(shopBack.coins).toBe(shop.coins)
  expect(shopBack.slots.map((s) => s.offer)).toEqual(offersBefore)

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

  // 用完剩余免费刷新（不扣钱），再刷新一次转为付费（扣 2 金币）
  for (let n = 2; n > 0; n--) {
    await clickShopRefresh(page)
    await page.waitForFunction((exp) => window.__warmoji?.shop?.freeRefreshes === exp, n - 1)
  }
  const paidBefore = await page.evaluate(() => window.__warmoji!.shop!.coins)
  expect(paidBefore).toBe(bought.coins)
  await clickShopRefresh(page)
  await page.waitForFunction((exp) => window.__warmoji?.shop?.coins === exp, paidBefore - 2)

  // 继续下一波：满编 5 人上场，金币与击杀延续，整编页选的队形生效
  const coinsIntoWave = paidBefore - 2
  const killsBefore = await page.evaluate(() => window.__warmoji!.kills)
  await clickShopNext(page)
  await page.waitForFunction(() => (window.__warmoji?.wave ?? 0) === 2)
  const start2 = await page.evaluate(() => window.__warmoji!)
  expect(start2.alive).toBe(5)
  expect(start2.formation).toBe('guard')
  expect(start2.coins ?? 0).toBeGreaterThanOrEqual(coinsIntoWave)
  await page.waitForFunction((k) => (window.__warmoji?.kills ?? 0) > k, killsBefore, {
    timeout: 20_000,
  })
  expect(errors).toEqual([])
})
