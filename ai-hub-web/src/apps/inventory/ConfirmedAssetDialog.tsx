import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export default function ConfirmedAssetDialog({ assetNo, onConfirm }: { assetNo: string; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    const requireConfirmation = (event: Event) => event.preventDefault()
    const blockEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    dialog?.setAttribute('closedby', 'none')
    document.addEventListener('keydown', blockEscape, true)
    dialog?.addEventListener('cancel', requireConfirmation)
    dialog?.showModal()
    return () => {
      dialog?.removeEventListener('cancel', requireConfirmation)
      document.removeEventListener('keydown', blockEscape, true)
      dialog?.close()
    }
  }, [])
  return createPortal(
    <dialog ref={dialogRef} aria-labelledby="confirmed-asset-title" aria-describedby="confirmed-asset-number"
      onCancel={event => event.preventDefault()}
      className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-2xl border border-outline-variant bg-surface p-5 text-on-surface shadow-xl backdrop:bg-black/50">
      <h2 id="confirmed-asset-title" className="text-lg font-bold">이미 확인된 자산입니다.</h2>
      <p id="confirmed-asset-number" className="mt-2 break-all text-body-sm text-on-surface-variant">자산번호: {assetNo}</p>
      <button type="button" autoFocus onClick={onConfirm}
        className="mt-5 min-h-11 w-full rounded-lg bg-primary px-4 py-2 font-semibold text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        확인
      </button>
    </dialog>, document.body,
  )
}
