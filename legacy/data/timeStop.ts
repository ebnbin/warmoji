import timestopJson from '../assets/timestop.json'
import { fromJson } from './json'
import type { TimeStopTuning } from '../types/timeStop'

export const TIMESTOP = fromJson<TimeStopTuning>(timestopJson)
