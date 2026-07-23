import { expect, test } from '@playwright/test'
import { enterLab, enterMap, startRun } from './helpers'

type LabEnemy = { active: boolean; getData(k: string): { def: { kind: string } } }
type LabGame = { scene: { keys: Record<string, { enemies: { getChildren(): LabEnemy[] } }> } }

test('测试模式入口：地图页勾选后确认即直接进入该图的沙盒（跳过队长/组队）', async ({ page }) => {
  await page.goto('/')
  await enterMap(page)
  await enterLab(page, 'forest')
  // 落在所选真实地图的竞技场（未经队长/组队/商店）
  await page.waitForFunction(() => window.__warmoji?.mapId === 'forest')
  // 队伍来自场内勾选阵容（默认 1 角色），而非正常流程的招募队——验证跳过组队且角色选择生效
  const alive = await page.evaluate(() => window.__warmoji!.alive)
  expect(alive).toBe(1)
})

test('测试模式：只出勾选的敌人、玩家免死无时限', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('/')
  await startRun(page)

  // 进入试炼场（默认黑森林），只勾选森林里的僵尸
  await page.evaluate(() => window.__setLab!(['zombie']))

  // 试炼场维持一个小在场池：僵尸会成群补到场
  await page.waitForFunction(
    () => {
      try {
        const g = window.__game as LabGame
        return g.scene.keys['arena']!.enemies.getChildren().filter((e) => e.active).length >= 4
      } catch {
        return false
      }
    },
    undefined,
    { timeout: 60_000 },
  )

  // 在场敌人全是勾选的那一种
  const kinds = await page.evaluate(() => {
    const g = window.__game as LabGame
    return g.scene.keys['arena']!.enemies
      .getChildren()
      .filter((e) => e.active)
      .map((e) => e.getData('enemy').def.kind)
  })
  expect(kinds.length).toBeGreaterThan(0)
  expect([...new Set(kinds)]).toEqual(['zombie'])

  // 玩家免死（测试模式默认「无敌」开，血量拉满）
  const s = await page.evaluate(() => window.__warmoji!)
  expect(s.hp).toBeGreaterThan(100_000)

  // 切换勾选实时生效：改成野猪后，新出场的应含野猪
  await page.evaluate(() => window.__setLab!(['boar']))
  await page.waitForFunction(
    () => {
      try {
        const g = window.__game as LabGame
        return g.scene.keys['arena']!.enemies
          .getChildren()
          .some((e) => e.active && e.getData('enemy').def.kind === 'boar')
      } catch {
        return false
      }
    },
    undefined,
    { timeout: 60_000 },
  )

  expect(errors).toEqual([])
})
