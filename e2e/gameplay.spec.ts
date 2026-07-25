import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// 致命失败守卫（之二）：游戏能不能打。装得上但玩不了——出怪断了、能力不索敌、
// 时钟不推进——类型与单测都拦不住，只能真跑一局。开局流程内联在此，不设共享
// helper 层：唯一使用方就是本文件。
// 站桩：默认队长 1 人第 1 波，节奏缓，无操作也能撑过断言窗口。
// 软渲染下游戏时钟偏慢，慢输出首发角色偶发撑不出击杀而超时，允许重试。
test.describe.configure({ retries: 2 })

/** 逻辑坐标 → canvas CSS 坐标后点击（canvas CSS 尺寸 = 窗口尺寸） */
async function click(page: Page, logical: { x: number; y: number }): Promise<void> {
  const pos = await page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
  await page.locator('#game canvas').click({ position: pos })
}

/** 走完开局：标题 → 地图确认 → 队长确认 → 整编（点满名额入队）→ 战斗 */
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
      // 队形环节确认即出发
      await confirm()
      await page.waitForFunction(() => window.__warmoji?.scene !== 'promote', undefined, {
        timeout: 15_000,
      })
      break
    }
    if (st.picked.length < st.due) {
      // 命定卡池三态：只点可选（open）的牌，点满名额才能整批确认
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

  // 先出现刷怪预告标记，随后敌人落地
  await page.waitForFunction(() => (window.__warmoji?.pending ?? 0) > 0, undefined, {
    timeout: 15_000,
  })
  await page.waitForFunction(() => (window.__warmoji?.enemies ?? 0) > 0, undefined, {
    timeout: 15_000,
  })

  // 玩家不动，能力自动索敌应产生击杀（随机首发可能是慢输出角色，窗口放宽）
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

  // 暂停（ESC）：局内时间冻结；恢复后继续推进
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
