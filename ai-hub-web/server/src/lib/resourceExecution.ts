import type { RequestHandler } from 'express'
import { readEnvironmentData } from './environmentStore'
import { normalizeResourcePolicy } from './resourcePolicy'

let active = 0
export const resourceActivity = () => ({ active })
export async function readResourcePolicy() {
  return normalizeResourcePolicy((await readEnvironmentData()).resource_policy)
}

// Acquire before multer allocates a file buffer. Includes outbound STT requests.
export const resourceGuard: RequestHandler = async (req, res, next) => {
  try {
    const policy = await readResourcePolicy()
    if (res.destroyed) return
    if (active >= policy.maxConcurrent) {
      res.setHeader('Retry-After', '5')
      res.status(429).json({ error: '서버 작업이 진행 중입니다. 잠시 후 다시 실행해 주세요.' })
      return
    }
    active++
    // Device classification is a scheduling hint, never an authentication boundary.
    const mobileCentral = req.headers['x-aihub-execution'] === 'mobile-central' && policy.mobileHeavyToServer
    res.locals.resourcePolicy = mobileCentral ? { ...policy, audioMode: 'central', workbookMode: 'central' } : policy
    let released = false
    const release = () => { if (!released) { released = true; active-- } }
    // Release when processing ends, including disconnected clients via explicit finally.
    res.locals.releaseResource = release
    res.once('finish', release)
    res.once('close', () => { if (!res.locals.resourceProcessing) release() })
    next()
  } catch (error) { next(error) }
}
