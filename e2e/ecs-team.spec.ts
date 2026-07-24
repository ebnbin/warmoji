import { expect, test } from '@playwright/test'
import { enterMap, startTestBattle } from './helpers'

// P2：ECS 队伍编队 + 键盘移动 + 相机跟随 + 有界钳制。

type EcsDbg = {
  ready: boolean
  centerX: number
  centerY: number
  members: number
  mapW: number
  mapH: number
  memberPos: { x: number; y: number }[]
}
const dbg = () => (window as unknown as { __ecs: EcsDbg }).__ecs

async function bootEcsForest(page: import('@playwright/test').Page): Promise<void> {
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
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })
}

test('ECS 队伍：编队生成、键盘右移、相机跟随、有界钳制', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)))

  await bootEcsForest(page)

  const init = await page.evaluate(dbg)
  expect(init.members).toBeGreaterThan(0)
  // 出生居中
  expect(Math.abs(init.centerX - init.mapW / 2)).toBeLessThan(1)
  expect(Math.abs(init.centerY - init.mapH / 2)).toBeLessThan(1)

  await page.screenshot({ path: 'test-results/ecs-p2-team.png' })

  // 键盘右移：中心 x 增大
  await page.locator('#game canvas').click()
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(1000)
  const moved = await page.evaluate(dbg)
  expect(moved.centerX).toBeGreaterThan(init.centerX + 100)

  // 持续右推到边界：中心 x 收敛到 mapW - clampMin（clampMin=(0.8+0.45)*UNIT=1.25*64=80）
  await page.waitForTimeout(3000)
  await page.keyboard.up('ArrowRight')
  const clamped = await page.evaluate(dbg)
  expect(clamped.centerX).toBeGreaterThan(clamped.mapW - 82)
  expect(clamped.centerX).toBeLessThanOrEqual(clamped.mapW - 79)

  expect(errors).toEqual([])
})

test('ECS 队伍：多人环形阵，各就各位环绕中心', async ({ page }) => {
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
  // 只设阵容、不启场景；随后经地图页测试模式进入 ECS
  await page.evaluate(() => window.__ecsLabRoster!(['juggler', 'unicorn', 'troll', 'cowboy']))
  await enterMap(page)
  await startTestBattle(page, 'forest')
  await page.waitForFunction(() => (window as unknown as { __ecs?: EcsDbg }).__ecs?.ready === true, undefined, {
    timeout: 20_000,
  })
  await page.waitForTimeout(300)

  const d = await page.evaluate(dbg)
  expect(d.members).toBeGreaterThanOrEqual(3)
  // 环形阵：各员距中心约 ringRadius=0.8*UNIT=51.2（含待机游移 ≤6）
  const cx = d.centerX
  const cy = d.centerY
  const dists = d.memberPos.map((p) => Math.hypot(p.x - cx, p.y - cy))
  for (const r of dists) {
    expect(r).toBeGreaterThan(40)
    expect(r).toBeLessThan(70)
  }
  // 角度各异（不重叠）
  const angles = d.memberPos.map((p) => Math.atan2(p.y - cy, p.x - cx))
  const uniq = new Set(angles.map((a) => Math.round((a * 180) / Math.PI / 20)))
  expect(uniq.size).toBeGreaterThanOrEqual(3)

  await page.screenshot({ path: 'test-results/ecs-p2-ring.png' })
})
