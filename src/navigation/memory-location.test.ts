import { afterEach, expect, it, vi } from 'vitest'
import { lastBranchMemoryPath, lastMemoryPath, rememberMemoryPath } from './memory-location'

afterEach(() => vi.unstubAllGlobals())

it('зберігає окремий спогад кожної родини протягом сеансу', () => {
  const items = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    setItem: (key: string, value: string) => items.set(key, value),
    getItem: (key: string) => items.get(key) ?? null,
  })
  const first = '/memories?branch=kernytski&person=I28'
  const second = '/memories?branch=zubenko&story=family'
  rememberMemoryPath(first)
  rememberMemoryPath(second)
  expect(lastBranchMemoryPath('kernytski')).toBe(first)
  expect(lastBranchMemoryPath('zubenko')).toBe(second)
  expect(lastMemoryPath()).toBe(second)
})
