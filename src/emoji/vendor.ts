import { loadSettings } from '../save/settings'
import { browserStorage } from '../util/storage'
import { EMOJI_VENDORS } from './vendors'
import type { EmojiVendor, EmojiVendorId } from './vendors'

/** 这次启动用的画风：换画风要重新启动，运行中不变 */
export const EMOJI_VENDOR_ID: EmojiVendorId = loadSettings(browserStorage()).emojiVendor

export const EMOJI_VENDOR: EmojiVendor = EMOJI_VENDORS[EMOJI_VENDOR_ID]
