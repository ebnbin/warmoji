// e2e 通过 window.__warmoji 断言游戏状态
export function reportDebug(state: WarmojiDebug): void {
  window.__warmoji = state
}
