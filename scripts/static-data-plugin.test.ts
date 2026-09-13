import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, createServer } from 'vite'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { familyDataSchema, mediaSchema } from '../src/data/schema.ts'
import { validateData } from './validation/validate.ts'

const repo = fileURLToPath(new URL('../', import.meta.url))
const provenance = [{ kind: 'supplement', file: 'Data/annotations.json', entryId: 'test-media' }]
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
const photo = { id: 'test-photo', path: 'assets/photos/shared.png', mimeType: 'image/png', title: 'Test photo',
  thumbnail: { path: 'assets/thumbs/shared.png', mimeType: 'image/png' }, provenance }

it('builds fresh data and only declared files, shares bytes, rejects invalid inputs, and removes obsolete assets', async () => {
  const parent = resolve(tmpdir())
  const directory = await mkdtemp(join(parent, 'rodovid-static-'))
  if (dirname(directory) !== parent || !directory.startsWith(join(parent, 'rodovid-static-'))) throw new Error('Unexpected temp path')
  const put = async (path: string, value: string | Buffer) => {
    await mkdir(dirname(join(directory, path)), { recursive: true })
    await writeFile(join(directory, path), value)
  }
  const json = (path: string, value: unknown) => put(path, JSON.stringify(value))
  const get = (path: string) => readFile(join(directory, path))
  const config = { schemaVersion: 1, title: 'Isolated build test', dataVersion: 'version-1', homePersonId: 'I1' }
  const bytes = await readFile(join(repo, 'tests/fixtures/conversion/complex.ged'))
  const result = convertGedcom({ bytes, config, supplements: { schemaVersion: 1 } })
  const run = () => build({ configFile: join(repo, 'vite.config.ts'), root: directory, logLevel: 'silent' })
  try {
    await put('index.html', '<!doctype html><html><body>Isolated build fixture</body></html>')
    await put('Data/Zubenko.ged', bytes)
    await json('Data/site.json', config)
    await json('Data/identities.json', result.identities)
    await json('Data/annotations.json', { schemaVersion: 1, media: [photo, { ...photo, id: 'second-binding' }] })
    await put(photo.path.replace('assets/', 'Data/assets/'), png)
    await put('Data/assets/thumbs/shared.png', png)
    await put('Data/assets/unlisted.png', png)
    await put('Data/originals/archive.png', png)
    await put('Data/Zubenko.rmtree', 'private archive')
    await put('public/leak.ged', 'must never be copied')
    await put('tests/fixtures/family.json', 'must never be copied')
    await put('generated/family.json', 'obsolete invalid JSON')
    await run()
    const files = (await readdir(join(directory, 'dist'), { recursive: true })).map((path) => path.replaceAll('\\', '/'))
    expect(files.filter((path) => path.includes('.') && !path.startsWith('app-assets/')).sort()).toEqual([
      'assets/photos/shared.png', 'assets/thumbs/shared.png', 'data/family.json', 'index.html',
    ])
    expect(await get(`dist/${photo.path}`)).toEqual(png)
    expect(await get('dist/assets/thumbs/shared.png')).toEqual(png)
    const first = await get('dist/data/family.json')
    expect(first.toString()).not.toContain(directory)
    const family = familyDataSchema.parse(JSON.parse(first.toString()))
    expect(family.config.dataVersion).toBe('version-1')
    expect(family.media).toHaveLength(2)
    expect(family.media[0]!.path).toBe(family.media[1]!.path)
    expect(family.media[0]!.dimensions).toEqual({ width: 1, height: 1 })
    await run()
    expect(await get('dist/data/family.json')).toEqual(first)
    const replacement = Buffer.concat([png, Buffer.from('replacement')])
    await put('Data/assets/photos/shared.png', replacement)
    await run()
    expect(await get('dist/assets/photos/shared.png')).toEqual(replacement)

    // An invalid declared thumbnail blocks the actual Vite build, preserving the last good output.
    await put('Data/assets/thumbs/shared.png', 'invalid')
    await expect(run()).rejects.toThrow('Validation failed')
    expect(await get('dist/data/family.json')).toEqual(first)
    expect(JSON.parse((await get('tmp/data-conversion.json')).toString()).validation.status).toBe('failed')
    await put('Data/assets/thumbs/shared.png', png)
    await json('Data/annotations.json', { schemaVersion: 1, media: [{ ...photo, path: 'assets/missing.png' }] })
    await expect(run()).rejects.toThrow('Validation failed')
    await put('Data/assets/disguised.ged', png)
    await json('Data/annotations.json', { schemaVersion: 1, media: [{ ...photo, path: 'assets/disguised.ged' }] })
    await expect(run()).rejects.toThrow('Validation failed')
    await json('Data/annotations.json', { schemaVersion: 1, media: [photo, { ...photo, id: 'case-collision', path: 'assets/photos/SHARED.png' }] })
    await put('Data/assets/photos/SHARED.png', png)
    await expect(run()).rejects.toThrow('Case-insensitive asset collision')

    const pdf = Buffer.from('%PDF-1.4\n% byte preservation fixture\n%%EOF\n')
    await put('Data/assets/documents/scan.pdf', pdf)
    await json('Data/annotations.json', { schemaVersion: 1,
      media: [{ ...photo, path: 'assets/documents/scan.pdf', mimeType: 'application/pdf' }] })
    await run()
    expect(await get('dist/assets/documents/scan.pdf')).toEqual(pdf)

    // A changed input and empty optional content replace the previous distribution completely.
    await json('Data/site.json', { ...config, dataVersion: 'version-2', title: 'Updated input' })
    await json('Data/annotations.json', { schemaVersion: 1 })
    await run()
    const second = JSON.parse((await get('dist/data/family.json')).toString())
    expect(second.config).toMatchObject({ dataVersion: 'version-2', title: 'Updated input' })
    expect(second.media).toEqual([])
    expect((await readdir(join(directory, 'dist'))).sort()).toEqual(['app-assets', 'data', 'index.html'])
    expect(await get('Data/Zubenko.ged')).toEqual(bytes)

    const server = await createServer({ configFile: join(repo, 'vite.config.ts'), root: directory,
      logLevel: 'silent', server: { port: 0, strictPort: false } })
    try {
      await server.listen()
      const response = await fetch(`${server.resolvedUrls!.local[0]}data/family.json`)
      expect(response.headers.get('content-type')).toBe('application/json')
      expect(familyDataSchema.parse(await response.json()).config.dataVersion).toBe('version-2')
    } finally { await server.close() }
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 120_000)

it('validates thumbnail paths, roles, and missing files', async () => {
  expect(mediaSchema.safeParse({ ...photo, thumbnail: { ...photo.thumbnail, path: 'C:/Downloads/photo.png' } }).success).toBe(false)
  expect(mediaSchema.safeParse({ ...photo, path: 'assets/music.mp3', mimeType: 'audio/mpeg' }).success).toBe(false)
  const family = familyDataSchema.parse(JSON.parse(await readFile(join(repo, 'tests/fixtures/data-contract/minimal.json'), 'utf8')))
  family.media = [mediaSchema.parse(photo)]
  const missing = await validateData(family, { assetsRoot: join(repo, 'tmp/missing-assets') })
  expect(missing.issues.filter((issue) => issue.code === 'INVALID_DECLARED_FILE').map((issue) => issue.path))
    .toEqual([photo.path, photo.thumbnail.path])
})
