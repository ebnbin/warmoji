import { expect, test } from '@playwright/test'
import { enterLab, enterMap, startTestBattle } from './helpers'

// P0：A/B 开关正确路由。默认（ecs 关）走旧竞技场；开 ecs 走新的 ECS 实验场景。
// 旧路径不受影响由既有全部 e2e + 349 单测保证，这里只验证新接缝。

test('ecs 关（默认）：测试模式进入旧竞技场 arena', async ({ page }) => {
  await page.goto('/')
  await enterMap(page)
  await enterLab(page, 'forest') // 内部断言 scene === 'arena'
  const onEcs = await page.evaluate(
    () => (window.__game as { scene: { isActive(k: string): boolean } }).scene.isActive('ecsArena'),
  )
  expect(onEcs).toBe(false)
})

test('ecs 开：测试模式进入 ECS 实验场景 ecsArena，无控制台错误', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  // 开战前置好 ecs 开关（battleSceneFor 在启动战斗时读取）
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'warmoji.settings.v1',
        JSON.stringify({ damageNumbers: true, hitShake: true, sound: false, bgm: false, showSkinTone: false, ecs: true }),
      )
    } catch {
      /* 隐私模式忽略 */
    }
  })

  await page.goto('/')
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(
    () => (window.__game as { scene: { isActive(k: string): boolean } }).scene.isActive('ecsArena'),
    undefined,
    { timeout: 15_000 },
  )
  const onArena = await page.evaluate(
    () => (window.__game as { scene: { isActive(k: string): boolean } }).scene.isActive('arena'),
  )
  expect(onArena).toBe(false)

  await page.waitForTimeout(500)
  expect(errors).toEqual([])
})
