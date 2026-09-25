import animationsJson from '../assets/animations.json'
import { fromJson } from './json'
import type { AnimResource } from '../types/anim'

export const ANIMATIONS = fromJson<AnimResource>(animationsJson)
