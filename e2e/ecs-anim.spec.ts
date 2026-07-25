import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P6（部件动画）：队员/敌人的 idle 常驻翻帧——帧是惰性烘焙进图集的，
// 未就绪时保持静态帧、烘好后自然接上。校验帧确实在推进，且图集页数受控
//（页数一旦超过 maxTexturesPerBatch=16 就会把单批绘制切成多刀，见 ecs-batching）。

type EcsDbg = { ready: boolean; pages: number; frames: number[]; enemies: number }

test('ECS 部件动画：idle 帧在推进，图集页数受控', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'warmoji.settings.v1',
        JSON.stringify({ damageNumbers: true, hitShake: true, sound: false, bgm: false, showSkinTone: false, ecs: true }),
      )
    } catch {
      /* ignore */
    }
  })
  await page.goto('/')
  await page.evaluate(() => window.__ecsLabRoster!(['juggler', 'unicorn'], ['zombie']))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(
    () => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true,
    undefined,
    { timeout: 20_000 },
  )

  // 给惰性烘焙一点时间，然后采样若干帧：帧下标应在多个值之间循环
  await page.waitForTimeout(4000)
  const seen = new Set<number>()
  for (let i = 0; i < 30; i++) {
    for (const f of await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs.frames)) seen.add(f)
    await page.waitForTimeout(120)
  }
  expect(seen.size).toBeGreaterThan(3)

  const st = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs)
  expect(st.pages).toBeLessThan(16)

  await page.screenshot({ path: 'test-results/ecs-anim.png' })
  expect(errors).toEqual([])
})
