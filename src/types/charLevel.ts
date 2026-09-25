export interface LevelProgress {
  maxed: boolean
  /** 满级时均为 0 */
  cur: number
  need: number
  ratio: number
}
