export const UI_FONT =
  'system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'

// 逻辑 px。手机上 fitScale ≈ 0.5~0.57，body 26 → ~14 CSS px 是可读下限，勿再调小
export const FONT = {
  caption: '20px',
  small: '22px',
  body: '26px',
  strong: '28px',
  head: '30px',
  lead: '34px',
  title: '38px',
  big: '48px',
  banner: '56px',
  display: '76px',
} as const
