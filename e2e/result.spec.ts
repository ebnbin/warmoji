import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { clickShopNext, completePromote, confirmCaptain, enterCaptain, startRun } from './helpers'

async function cssPoint(page: Page, logical: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
}

/** 绕圈走位撑完当前波（波末离开 arena 即返回）。步数按墙钟给足：
 * 软渲染 + 并行争抢下游戏时钟可能只有墙钟的几分之一 */
async function kiteUntilLeaveArena(page: Page, maxSteps = 120): Promise<void> {
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
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))

  // 神童（测试直通车）；开局整编期间就把波次拨到 18——招满 5 人后按
  // 波末规则进商店、直接开终波。不打中间波次：无人值守的生存暴露在
  // 慢渲染环境下会随机团灭（这正是本测试历史上的翻车点）
  await page.addInitScript(() => {
    localStorage.setItem('warmoji.captain.v1', 'prodigy')
  })
  await page.goto('/')
  await enterCaptain(page)
  await confirmCaptain(page)
  await page.evaluate(() => window.__setWave!(18))
  await completePromote(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'shop', undefined, {
    timeout: 30_000,
  })
  await clickShopNext(page)

  // 最后一波（90 秒 Boss 波）：等 Boss 落地后把它血量拨到 1，
  // 队伍随手一击即触发「击败 Boss 提前通关」（确定性覆盖 Boss 击杀胜利分支）
  await page.waitForFunction(
    () => {
      const game = window.__game as { scene: { keys: Record<string, { boss?: { active: boolean } }> } }
      return !!game?.scene?.keys?.['arena']?.boss?.active
    },
    undefined,
    { timeout: 40_000 },
  )
  await page.evaluate(() => {
    const game = window.__game as {
      scene: { keys: Record<string, { boss?: { setData(k: string, v: number): void } }> }
    }
    game.scene.keys['arena']!.boss!.setData('hp', 1)
  })
  // 绕圈把 Boss 引进武器射程内补刀
  await kiteUntilLeaveArena(page, 40)
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
