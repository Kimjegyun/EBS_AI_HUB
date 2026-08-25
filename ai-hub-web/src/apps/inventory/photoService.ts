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

const MAX_DIM = 1280
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
