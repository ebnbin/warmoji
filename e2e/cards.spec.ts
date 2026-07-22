import { expect, test, type Page } from '@playwright/test'
import { startRun } from './helpers'

// 存活到波末受随机刷怪影响，慢渲染环境下偶发全灭，允许重试
test.describe.configure({ retries: 2 })

async function clickLogical(page: Page, x: number, y: number): Promise<void> {
  const p = await page.evaluate(
    ({ x, y }) => {
      const k = window.innerWidth / window.__warmoji!.viewW
      return { x: Math.round(x * k), y: Math.round(y * k) }
    },
    { x, y },
  )
  await page.locator('#game canvas').click({ position: p })
}

test('团队升级卡：战斗后按升级次数抽卡，三选一即升该卡等级，抽完进正常流程', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('/')
  await startRun(page)
  // 灌一大笔经验 → 攒下多次升级抽卡（叠加本波自然升级）
  await page.evaluate(() => window.__addXp!(6000))

  // 走位撑到波末 → 升级抽卡页
  const KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'] as const
  for (let i = 0; i < 55; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene !== 'arena') break
    const key = KEYS[i % 4]!
    await page.keyboard.down(key)
    await page.waitForTimeout(1400)
    await page.keyboard.up(key)
  }
  await page.waitForFunction(() => window.__warmoji?.scene === 'cards', undefined, { timeout: 15_000 })

  // 候选合法：≥3 张、互不相同、未满级
  const c0 = await page.evaluate(() => window.__warmoji!.cards!)
  expect(c0.remaining).toBeGreaterThanOrEqual(2)
  expect(c0.choices.length).toBeGreaterThanOrEqual(3)
  expect(new Set(c0.choices.map((x) => x.id)).size).toBe(c0.choices.length)
  for (const ch of c0.choices) expect(ch.level).toBeLessThan(ch.maxLevel)

  // 选第一张 → 该卡等级 +1，抽卡次数 -1
  const picked = c0.choices[0]!
  await clickLogical(page, picked.x, picked.y)
  await page.waitForFunction((r) => (window.__warmoji?.cards?.remaining ?? 0) < r, c0.remaining)
  const c1 = await page.evaluate(() => window.__warmoji!.cards!)
  expect(c1.owned[picked.id]).toBe(picked.level + 1)

  // 抽完剩余：每次选第一张，直到离开抽卡页
  for (let i = 0; i < 30; i++) {
    const scene = await page.evaluate(() => window.__warmoji?.scene)
    if (scene !== 'cards') break
    const cc = await page.evaluate(() => window.__warmoji!.cards!)
    const before = cc.remaining
    const ch = cc.choices[0]!
    await clickLogical(page, ch.x, ch.y)
    await page.waitForFunction(
      (b) => window.__warmoji?.scene !== 'cards' || (window.__warmoji?.cards?.remaining ?? 0) < b,
      before,
    )
  }

  // 抽完 → 进正常下一站（本波有招募名额 → 整编页）
  await page.waitForFunction(() => window.__warmoji?.scene !== 'cards')
  expect(await page.evaluate(() => window.__warmoji?.scene)).toBe('promote')
  expect(errors).toEqual([])
})
