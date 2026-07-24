import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P1：自绘渲染管线地基。开 ecs 进入 ECS 场景，构建 emoji 图集并批量绘制一组演示实体，
// 校验：图集就绪、实体入世界、无 WebGL/控制台错误；截图供人工核对位姿/翻转/tint/深度。

test('ECS 渲染管线：图集构建 + 批量绘制演示实体，无错误', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)))

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
  await enterMap(page)
  await startTestBattle(page, 'forest')

  // 图集构建是异步的，等就绪
  await page.waitForFunction(
    () => (window as unknown as { __ecs?: { ready: boolean } }).__ecs?.ready === true,
    undefined,
    { timeout: 20_000 },
  )

  const info = await page.evaluate(
    () => (window as unknown as { __ecs: { ready: boolean; pages: number } }).__ecs,
  )
  expect(info.ready).toBe(true)
  expect(info.pages).toBeGreaterThanOrEqual(1)

  // 跑几帧后再取错误快照（WebGL 管线出错会在渲染帧里报出来）
  await page.waitForTimeout(600)
  expect(errors).toEqual([])

  await page.screenshot({ path: 'test-results/ecs-p1-render.png' })
})
