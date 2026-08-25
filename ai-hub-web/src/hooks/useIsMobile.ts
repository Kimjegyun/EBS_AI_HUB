import { useEffect, useState } from 'react'

function detectMobile(): boolean {
  if (typeof window === 'undefined') return false
  const narrow = window.matchMedia('(max-width: 767px)').matches
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent)
  return narrow || (coarsePointer && mobileUa)
}

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => detectMobile())

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setMobile(detectMobile())
    update()
    media.addEventListener('change', update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      media.removeEventListener('change', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return mobile
}
