import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { clickShopNext, startRun } from './helpers'

async function cssPoint(page: Page, logical: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
}

/** 绕圈走位撑完当前波（波末离开 arena 即返回） */
async function kiteUntilLeaveArena(page: Page, maxSteps = 40): Promise<void> {
  const KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'] as const
  for (let i = 0; i < maxSteps; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene !== 'arena') return
    const key = KEYS[i % 4]!
    await page.keyboard.down(key)
    await page.waitForTimeout(1200)
    await page.keyboard.up(key)
  }
}

// 波内生存受随机刷怪影响，慢渲染环境下偶发翻车，允许重试
test.describe.configure({ retries: 2 })

test('通关胜利：快进到最后一波打完 → 胜利结算页 → 再来一局', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))

  // 神童满编开局火力足；跳波不改累计战斗时长，敌人血量仍是开局水平
  await page.addInitScript(() => {
    localStorage.setItem('warmoji.captain.v1', 'prodigy')
  })
  await page.goto('/')
  await startRun(page)

  // 第 1 波（15 秒短波）打完 → 整编/商店
  await kiteUntilLeaveArena(page)
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'promote' || window.__warmoji?.scene === 'shop',
  )
  // 结清可能的升级点数，进商店后把波数拨到最后一波
  for (let i = 0; i < 8; i++) {
    const st = await page.evaluate(() => ({
      scene: window.__warmoji!.scene,
      confirm: window.__warmoji!.promote?.confirm,
    }))
    if (st.scene === 'shop') break
    await page
      .locator('#game canvas')
      .click({ position: await cssPoint(page, { x: st.confirm!.x, y: st.confirm!.y }) })
    await page.waitForTimeout(400)
  }
  await page.waitForFunction(() => window.__warmoji?.scene === 'shop')
  await page.evaluate(() => window.__setWave!(15))
  await clickShopNext(page)

  // 最后一波（30 秒）：绕圈撑完 → 胜利结算
  await kiteUntilLeaveArena(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'result' && !!window.__warmoji.result, undefined, {
    timeout: 20_000,
  })
  const r = await page.evaluate(() => window.__warmoji!.result!)
  expect(r.win).toBe(true)
  expect(r.rows).toBe(5)
  await page.screenshot({ path: 'test-results/result-win.png' })

  // 再来一局 → 回队长页（防误触延迟后可点）
  await page.waitForTimeout(700)
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: r.again.x, y: r.again.y }) })
  await page.waitForFunction(() => window.__warmoji?.scene === 'captain')
  expect(errors).toEqual([])
})

test('团灭失败：全队倒下 → 失败结算页（同页复用）→ 回主菜单', async ({ page }) => {
  test.setTimeout(120_000)
  // 天使 1 人队开战后直接经运行时抹掉全队血量（确定性团灭，不赌刷怪节奏）
  await page.goto('/')
  await startRun(page)
  await page.waitForFunction(() => (window.__warmoji?.elapsed ?? 0) > 1)
  await page.evaluate(() => {
    const game = window.__game as {
      scene: { keys: Record<string, { members: unknown[]; hurtMember(m: unknown, dmg: number, tint: number): void }> }
    }
    const arena = game.scene.keys['arena']!
    for (const m of [...arena.members]) arena.hurtMember(m, 99_999, 0xff7777)
  })

  await page.waitForFunction(() => window.__warmoji?.scene === 'result' && !!window.__warmoji.result, undefined, {
    timeout: 20_000,
  })
  const r = await page.evaluate(() => window.__warmoji!.result!)
  expect(r.win).toBe(false)
  await page.screenshot({ path: 'test-results/result-lose.png' })

  await page.waitForTimeout(700)
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: r.menu.x, y: r.menu.y }) })
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu')
})
