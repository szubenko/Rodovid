import { expect, it } from 'vitest'
import { defaultAudioPreferences, parseAudioPreferences } from './preferences'

it('recovers corrupt storage, clamps volumes and discards unrelated data', () => {
  for (const raw of [null, '{', 'null', '42']) expect(parseAudioPreferences(raw)).toEqual(defaultAudioPreferences)
  expect(parseAudioPreferences(JSON.stringify({ musicEnabled: true, effectsEnabled: 'true', musicVolume: 2, effectsVolume: -1, people: ['private'], extra: {} }))).toEqual({ musicEnabled: true, effectsEnabled: false, musicVolume: 1, effectsVolume: 0 })
  expect(parseAudioPreferences('{"musicVolume":"loud","effectsVolume":null}')).toEqual(defaultAudioPreferences)
})
