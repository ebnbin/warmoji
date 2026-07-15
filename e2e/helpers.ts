import type { Page } from '@playwright/test'

/** 逻辑坐标 → canvas CSS 坐标（canvas CSS 尺寸 = 窗口尺寸） */
async function cssPoint(page: Page, logical: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => {
    const k = window.innerWidth / window.__warmoji!.viewW
    return { x: Math.round(x * k), y: Math.round(y * k) }
  }, logical)
}

/** 标题页点「组建队伍」按钮 → 队长选择页 */
export async function enterCaptain(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__warmoji?.scene === 'menu' && !!window.__warmoji.menu)
  const s = await page.evaluate(() => window.__warmoji!.menu!.start)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: s.x, y: s.y }) })
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'captain' && !!window.__warmoji.captain,
  )
}

/** 队长页点击某个队长行（单选） */
export async function clickCaptain(page: Page, id: string): Promise<void> {
  const r = await page.evaluate(
    (cid) => window.__warmoji!.captain!.items.find((x) => x.id === cid)!,
    id,
  )
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 }) })
  await page.waitForFunction((cid) => window.__warmoji?.captain?.selected === cid, id)
}

/** 队长页确认 → 整编页（开局组队 = 第一次强制整编） */
export async function confirmCaptain(page: Page): Promise<void> {
  const s = await page.evaluate(() => window.__warmoji!.captain!.start)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: s.x, y: s.y }) })
  await page.waitForFunction(
    () => window.__warmoji?.scene === 'promote' && !!window.__warmoji.promote,
  )
}

/** 把整编页的强制步骤走完（默认选中项逐点确认），直到离开整编页 */
export async function completePromote(page: Page): Promise<void> {
  for (let step = 0; step < 24; step++) {
    const scene = await page.evaluate(() => window.__warmoji!.scene)
    if (scene !== 'promote') return
    const before = await page.evaluate(() => window.__warmoji!.promote!.points)
    await clickPromoteConfirm(page)
    await page.waitForFunction(
      (prev) =>
        window.__warmoji?.scene !== 'promote' ||
        (window.__warmoji.promote?.points ?? 99) < prev,
      before,
      { timeout: 15_000 },
    )
  }
}

/** 走完整流程开局：标题页 → 队长确认 → 开局整编（默认招募）→ 战斗 */
export async function startRun(page: Page): Promise<void> {
  await enterCaptain(page)
  await confirmCaptain(page)
  await completePromote(page)
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
}

/** 商店页点击某个角色的上架位（切换属性面板焦点） */
export async function clickShopSlot(page: Page, id: string): Promise<void> {
  const r = await page.evaluate(
    (cid) => window.__warmoji!.shop!.slots.find((x) => x.id === cid)!,
    id,
  )
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 }) })
}

/** 商店页点击「购买」（作用于当前聚焦的上架位） */
export async function clickShopBuy(page: Page): Promise<void> {
  const b = await page.evaluate(() => window.__warmoji!.shop!.buy)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: b.x, y: b.y }) })
}

/** 商店页点击「刷新」（作用于当前聚焦的上架位） */
export async function clickShopRefresh(page: Page): Promise<void> {
  const r = await page.evaluate(() => window.__warmoji!.shop!.refresh)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: r.x, y: r.y }) })
}

/** 整编页点击网格中某个候选/队员 */
export async function clickPromoteItem(page: Page, key: string): Promise<void> {
  const r = await page.evaluate(
    (k) => window.__warmoji!.promote!.items.find((x) => x.id === k)!,
    key,
  )
  await page
    .locator('#game canvas')
    .click({ position: await cssPoint(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 }) })
  await page.waitForFunction((k) => window.__warmoji?.promote?.selected === k, key)
}

/** 整编页点击确认按钮（招募/升级 花 1 点） */
export async function clickPromoteConfirm(page: Page): Promise<void> {
  const b = await page.evaluate(() => window.__warmoji!.promote!.confirm)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: b.x, y: b.y }) })
}

/** 商店页点击「开始第 N 波」进入下一波 */
export async function clickShopNext(page: Page): Promise<void> {
  const s = await page.evaluate(() => window.__warmoji!.shop!.start)
  await page.locator('#game canvas').click({ position: await cssPoint(page, { x: s.x, y: s.y }) })
  await page.waitForFunction(() => window.__warmoji?.scene === 'arena')
}
