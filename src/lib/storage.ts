/** 浏览器本地存储的统一入口：集中键名、屏蔽隐私模式 / 配额异常。 */
export const STORAGE_KEYS = {
  dataSource: 'peripheral-viewer.dataSource',
  layout: 'peripheral-viewer.layout.v1',
  settings: 'peripheral-viewer.settings',
  viewer: 'peripheral-viewer.viewer',
} as const

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function readStorage(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string): boolean {
  try {
    storage()?.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function removeStorage(key: string): void {
  try {
    storage()?.removeItem(key)
  } catch {
    // 存储不可用时静默降级，内存态仍然可用
  }
}

export function readJson<T>(key: string): T | null {
  const raw = readStorage(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    return writeStorage(key, JSON.stringify(value))
  } catch {
    return false
  }
}
