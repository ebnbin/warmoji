import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// 守卫：游戏能不能打（出怪、索敌、时钟推进）。软渲染下时钟偏慢，允许重试
test.describe.configure({ retries: 2 })

/** 逻辑坐标 → canvas CSS 坐标后点击（canvas CSS 尺寸 = 窗口尺寸） */
async function click(page: Page, logical: { x: number; y: number }): Promise<void> {
  const pos = await page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
  await page.locator('#game canvas').click({ position: pos })
}

async function startRun(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu' && !!window.__warmoji.menu)
  await click(page, await page.evaluate(() => window.__warmoji!.menu!.start))
  await page.waitForFunction(() => window.__warmoji?.scene === 'map' && !!window.__warmoji.map)
  await click(page, await page.evaluate(() => window.__warmoji!.map!.start))
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'captain' && !!window.__warmoji.captain,
  )
  await click(page, await page.evaluate(() => window.__warmoji!.captain!.start))
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'promote' && !!window.__warmoji.promote,
  )
  const confirm = async (): Promise<void> =>
    click(page, await page.evaluate(() => window.__warmoji!.promote!.confirm))
  for (let step = 0; step < 40; step++) {
    const st = await page.evaluate(() => ({
      scene: window.__warmoji!.scene,
      mode: window.__warmoji!.promote?.mode,
      due: window.__warmoji!.promote?.due ?? 0,
      picked: window.__warmoji!.promote?.picked ?? [],
      items: (window.__warmoji!.promote?.items ?? []).map((x) => ({ id: x.id, state: x.state })),
    }))
    if (st.scene !== 'promote') break
    if (st.mode === 'formation') {
      await confirm()
      await page.waitForFunction(() => window.__warmoji?.scene !== 'promote', undefined, {
        timeout: 15_000,
      })
      break
    }
    if (st.picked.length < st.due) {
      const next = st.items.find((x) => (x.state ?? 'open') === 'open' && !st.picked.includes(x.id))
      if (!next) throw new Error('整编页：已解锁候选不足以点满名额')
      const r = await page.evaluate(
        (k) => window.__warmoji!.promote!.items.find((x) => x.id === k)!,
        next.id,
      )
      await click(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 })
      await page.waitForFunction((k) => window.__warmoji?.promote?.selected === k, next.id)
      continue
    }
    await confirm()
    await page.waitForFunction(
      () => window.__warmoji?.scene !== 'promote' || window.__warmoji.promote?.mode === 'formation',
      undefined,
      { timeout: 15_000 },
    )
  }
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
}

test('开局后自动战斗：出怪、能力自动击杀、计时推进、无控制台错误', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.goto('/')
  await startRun(page)

  await page.waitForFunction(() => (window.__warmoji?.pending ?? 0) > 0, undefined, {
    timeout: 15_000,
  })
  await page.waitForFunction(() => (window.__warmoji?.enemies ?? 0) > 0, undefined, {
    timeout: 15_000,
  })

  await page.waitForFunction(() => (window.__warmoji?.kills ?? 0) >= 1, undefined, {
    timeout: 120_000,
  })
  await page.waitForFunction(() => (window.__warmoji?.elapsed ?? 0) > 6, undefined, {
    timeout: 45_000,
  })

  const state = await page.evaluate(() => window.__warmoji)
  expect(state?.scene).toBe('arena')
  expect(state?.kills ?? 0).toBeGreaterThanOrEqual(1)
  expect(state?.hp ?? 0).toBeGreaterThan(0)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const t1 = await page.evaluate(() => window.__warmoji!.elapsed)
  await page.waitForTimeout(700)
  const t2 = await page.evaluate(() => window.__warmoji!.elapsed)
  expect(t2).toBe(t1)
  await page.keyboard.press('Escape')
  await page.waitForFunction((t) => (window.__warmoji?.elapsed ?? 0) > t, t2, { timeout: 10_000 })

  expect(errors).toEqual([])
})
