import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// 致命失败守卫（之三）：**ECS 战斗打不打得起来**。
//
// 钉的是一个具体缺陷：gameplay.spec.ts 走的是 src/arcade/——设置默认 ecs:false，
// 开局流程进的是老场景。于是天天在改的 ECS 侧一条 e2e 也没有：白屏、建场抛异常、
// 流水线某步炸掉，单测与 typecheck 全绿，CI 也全绿。ECS 路径唯一的入口是试炼场。
//
// 顺带钉住出站信箱的积压：sim.out 的五个队列是「仿真只写、场景侧排空」，
// 漏排一条不会报错，只会一路涨到卡顿——帧末积压恒 0 是它唯一的外部可观测量。
//
// 软渲染下时钟偏慢，允许一次重试。

test.describe.configure({ retries: 1 })

/** 逻辑坐标 → canvas CSS 坐标后点击（canvas CSS 尺寸 = 窗口尺寸） */
async function click(page: Page, logical: { x: number; y: number }): Promise<void> {
  const pos = await page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
  await page.locator('#game canvas').click({ position: pos })
}

// ECS 侧的探针是 window.__ecs（__warmoji 在 ECS 战斗期间是陈旧的，本场景不写它）。
// 页面内求值的闭包不能引用本文件的作用域，故各处内联展开
type Ecs = { elapsed: number; kills: number; enemies: number; outbox: number }
type WinEcs = Window & { __ecs?: Ecs }

test('试炼场：ECS 战斗跑得起来、有击杀、出站信箱不积压', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu' && !!window.__warmoji.menu)
  // 主菜单的 📊：设置按钮左侧第四格（基准页默认跑 ECS 框架）
  const s = await page.evaluate(() => window.__warmoji!.menu!.settings)
  await click(page, { x: s.x - 252, y: s.y })
  await page.waitForFunction(() => !!window.__warmoji?.bench?.start, undefined, { timeout: 20_000 })
  await click(page, await page.evaluate(() => window.__warmoji!.bench!.start!))

  await page.waitForFunction(() => (window as WinEcs).__ecs !== undefined, undefined, { timeout: 30_000 })
  await page.waitForFunction(() => ((window as WinEcs).__ecs?.elapsed ?? 0) > 15_000, undefined, { timeout: 120_000 })

  const ecs = await page.evaluate(() => (window as WinEcs).__ecs!)
  expect(errors, `控制台报错：\n${errors.join('\n')}`).toEqual([])
  expect(ecs.enemies, '场上没敌人：这一局没打起来').toBeGreaterThan(0)
  expect(ecs.kills, '一个都没杀死：能力没在索敌/施伤').toBeGreaterThan(0)
  expect(ecs.outbox, '出站信箱帧末仍有积压：某条 drain 没清').toBe(0)
})
