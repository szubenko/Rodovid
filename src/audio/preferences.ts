export const audioStorageKey = 'rodovid.audio.v1'
export type AudioPreferences = { musicEnabled: boolean; effectsEnabled: boolean; musicVolume: number; effectsVolume: number }
export const defaultAudioPreferences: AudioPreferences = { musicEnabled: false, effectsEnabled: false, musicVolume: 0.15, effectsVolume: 0.3 }

export function parseAudioPreferences(raw: string | null): AudioPreferences {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    if (!value || typeof value !== 'object') return { ...defaultAudioPreferences }
    const input = value as Record<string, unknown>
    const volume = (key: 'musicVolume' | 'effectsVolume') => typeof input[key] === 'number' && Number.isFinite(input[key]) ? Math.max(0, Math.min(1, input[key])) : defaultAudioPreferences[key]
    return { musicEnabled: input.musicEnabled === true, effectsEnabled: input.effectsEnabled === true, musicVolume: volume('musicVolume'), effectsVolume: volume('effectsVolume') }
  } catch { return { ...defaultAudioPreferences } }
}

export function readAudioPreferences() {
  try { return parseAudioPreferences(localStorage.getItem(audioStorageKey)) } catch { return { ...defaultAudioPreferences } }
}

export function saveAudioPreferences(preferences: AudioPreferences) {
  try { localStorage.setItem(audioStorageKey, JSON.stringify(preferences)) } catch { /* Storage denial must not interrupt navigation. */ }
}
