import { open, realpath } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import type { Media } from '../src/data/schema.ts'

export type AssetFile = Pick<Media, 'path' | 'mimeType'>
export const mediaFiles = (media: Media): AssetFile[] => [media, ...media.thumbnail ? [media.thumbnail] : []]

/** Read the exact bytes that will be emitted; archive originals stay outside assets/. */
export async function readAsset(assetsRoot: string, asset: AssetFile) {
  const root = await realpath(resolve(assetsRoot, 'assets'))
  const file = await realpath(resolve(assetsRoot, asset.path))
  const local = relative(root, file)
  if (isAbsolute(local) || local === '..' || local.startsWith('../') || local.startsWith('..\\')) {
    throw new Error('Файл виходить за межі папки матеріалів assets/')
  }
  const extensions: Record<AssetFile['mimeType'], string[]> = {
    'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'application/pdf': ['.pdf'],
    'audio/mpeg': ['.mp3'], 'audio/ogg': ['.ogg'], 'audio/wav': ['.wav'],
  }
  if (!extensions[asset.mimeType].includes(extname(asset.path).toLowerCase())) {
    throw new Error(`Розширення не відповідає ${asset.mimeType}`)
  }
  const handle = await open(file, 'r')
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Оголошений шлях не є звичайним файлом')
    const bytes = await handle.readFile()
    const signatures: Record<AssetFile['mimeType'], boolean> = {
      'image/jpeg': bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
      'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      'application/pdf': bytes.toString('ascii', 0, 5) === '%PDF-',
      'audio/ogg': bytes.toString('ascii', 0, 4) === 'OggS',
      'audio/wav': bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE',
      'audio/mpeg': bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0),
    }
    if (bytes.length < 3 || !signatures[asset.mimeType]) throw new Error(`Сигнатура не відповідає ${asset.mimeType}`)
    return bytes
  } finally { await handle.close() }
}
