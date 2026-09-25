declare const __BUILD_HASH__: string
declare const __BUILD_TIME__: string

interface Navigator {
  readonly standalone?: boolean
}

interface Performance {
  readonly memory?: { readonly usedJSHeapSize: number }
}
