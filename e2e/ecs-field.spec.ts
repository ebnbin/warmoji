import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P4（战场拾取）：地面待拾（不磁吸，靠走位拾取）→ 施加限时战斗层 → 乘区实时生效 → 到期失效。
// 与金币分道：金币磁吸入账（永久经济），此处不磁吸、短时、可趋可避（战术层）。

type EcsDbg = {
  ready: boolean
  centerX: number
  field: { pickups: number; carriers: number; active: { id: string; remainMs: number }[] }
}

test('ECS 战场拾取：走位拾取 → 限时增益生效 → 到期失效', async ({ page }) => {
  test.setTimeout(120_000)
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
  await page.evaluate(() => window.__ecsLabRoster!(['troll']))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })

  // 掉在够得着但不在脚下的位置（1.5 格）：需要走过去才收得到
  await page.evaluate(() => window.__ecsDropField!('forest_swift', 1.5, 0))
  await page.waitForFunction(() => (window as unknown as { __ecs: EcsDbg }).__ecs.field.pickups === 1)
  // 还没走过去：未激活
  expect((await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs.field)).active).toEqual([])

  // 走过去拾取：地面清空 + 限时层激活
  await page.locator('#game canvas').click()
  await page.keyboard.down('ArrowRight')
  await page.waitForFunction(
    () => (window as unknown as { __ecs: EcsDbg }).__ecs.field.active.length >= 1,
    undefined,
    { timeout: 10_000 },
  )
  await page.keyboard.up('ArrowRight')
  const picked = await page.evaluate(() => (window as unknown as { __ecs: EcsDbg }).__ecs.field)
  expect(picked.pickups).toBe(0)
  expect(picked.active[0]!.id).toBe('forest_swift')
  expect(picked.active[0]!.remainMs).toBeGreaterThan(0)

  // 到期自动失效（林间疾风 6s 游戏时）
  await page.waitForFunction(
    () => (window as unknown as { __ecs: EcsDbg }).__ecs.field.active.length === 0,
    undefined,
    { timeout: 30_000 },
  )

  expect(errors).toEqual([])
})
