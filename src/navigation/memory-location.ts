const key = 'rodovid:last-memory-path'

export function rememberMemoryPath(path: string) {
  try {
    sessionStorage.setItem(key, path)
    const branch = new URLSearchParams(path.split('?')[1]).get('branch') === 'zubenko' ? 'zubenko' : 'kernytski'
    sessionStorage.setItem(`${key}:${branch}`, path)
  } catch { /* Storage may be unavailable. */ }
}

export function lastBranchMemoryPath(branch: 'kernytski' | 'zubenko'): string | null {
  try {
    const path = sessionStorage.getItem(`${key}:${branch}`)
    if (!path || !/^\/memories(?:\?[^#]*)?$/.test(path)) return null
    const savedBranch = new URLSearchParams(path.split('?')[1]).get('branch') === 'zubenko' ? 'zubenko' : 'kernytski'
    return savedBranch === branch ? path : null
  } catch { return null }
}

export function lastMemoryPath(): string | null {
  try {
    const path = sessionStorage.getItem(key)
    return path && /^\/memories(?:\?[^#]*)?$/.test(path) ? path : null
  } catch { return null }
}
