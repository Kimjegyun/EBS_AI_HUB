// Photo capture/storage for the 재물조사 app. Photos are taken with the device
// camera (via a file input with capture), downscaled to keep storage small, and
// kept in IndexedDB as JPEG data URLs. Each photo is referenced by id from a
// SurveyResult.

import { idbDelete, idbGet, idbPut, STORE_PHOTOS } from './idb'

export interface StoredPhoto {
  id: string
  dataUrl: string
  createdAt: string
}

// 2048px keeps printed asset numbers legible for 사진 분석 OCR (at 1280px a
// portrait label shot is ~590px wide and the text no longer reads); ~400KB each.
const MAX_DIM = 2048
const QUALITY = 0.7

/** Downscale + re-encode an image File to a compact JPEG data URL. */
export async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('이미지 처리를 지원하지 않는 브라우저입니다.')
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', QUALITY)
}

export async function savePhoto(file: File): Promise<StoredPhoto> {
  const dataUrl = await fileToDataUrl(file)
  const photo: StoredPhoto = {
    id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dataUrl,
    createdAt: new Date().toISOString(),
  }
  await idbPut(STORE_PHOTOS, photo)
  return photo
}

/** Sequential decoding avoids holding several full-resolution gallery images in memory. */
export async function importPhotos(files: File[], onProgress?: (done: number, total: number) => void) {
  const photos: StoredPhoto[] = []
  const errors: string[] = []
  for (const [index, file] of files.entries()) {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('20MB 이하의 사진을 선택해 주세요.')
      if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error('이미지 파일이 아닙니다.')
      photos.push(await savePhoto(file))
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error && /20MB|이미지 파일/.test(error.message) ? error.message : '사진을 읽지 못했습니다. JPG 또는 PNG로 변환 후 다시 선택해 주세요.'}`)
    }
    onProgress?.(index + 1, files.length)
  }
  return { photos, errors }
}

export async function getPhoto(id: string): Promise<StoredPhoto | undefined> {
  return idbGet<StoredPhoto>(STORE_PHOTOS, id)
}

export async function getPhotos(ids: string[]): Promise<StoredPhoto[]> {
  const all = await Promise.all(ids.map((id) => getPhoto(id)))
  return all.filter((p): p is StoredPhoto => !!p)
}

export async function deletePhoto(id: string): Promise<void> {
  await idbDelete(STORE_PHOTOS, id).catch(() => undefined)
}

export async function deletePhotos(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deletePhoto(id)))
}
