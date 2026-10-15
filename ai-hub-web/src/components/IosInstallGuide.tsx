import { useState } from 'react'
import { Icon } from './Icon'

/**
 * iOS has no install API (no beforeinstallprompt): a web page cannot add itself to
 * the home screen. This guide makes the manual path as short as possible: it points
 * at the right button for the browser in use, and gets users out of in-app browsers
 * (KakaoTalk, NAVER, Instagram, ...) where "홈 화면에 추가" does not exist at all.
 */
type IosBrowser = 'safari' | 'chrome' | 'kakao' | 'inapp'

function detectIosBrowser(userAgent = navigator.userAgent): IosBrowser {
  if (/KAKAOTALK/i.test(userAgent)) return 'kakao'
  if (/NAVER|Line\/|Instagram|FBAN|FBAV|DaumApps|everytimeApp|BAND\//i.test(userAgent)) return 'inapp'
  if (/CriOS|EdgiOS|FxiOS/i.test(userAgent)) return 'chrome'
  return 'safari'
}

interface IosInstallGuideProps {
  appName: string
  onClose: () => void
}

export default function IosInstallGuide({ appName, onClose }: IosInstallGuideProps) {
  const browser = detectIosBrowser()
  const [copied, setCopied] = useState(false)
  const url = window.location.href

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true) } catch { setCopied(false); window.prompt('아래 주소를 복사하세요', url) }
  }

  const steps = browser === 'chrome'
    ? [
        { icon: 'ios_share', text: <>주소창 오른쪽의 <b>공유(□↑)</b> 버튼을 누르세요.</> },
        { icon: 'add_box', text: <>목록을 내려 <b>‘홈 화면에 추가’</b>를 누르세요.</> },
        { icon: 'check_circle', text: <>오른쪽 위 <b>‘추가’</b>를 누르면 홈 화면에 <b>‘{appName}’</b> 아이콘이 생깁니다.</> },
      ]
    : [
        { icon: 'ios_share', text: <>화면 아래의 <b>공유(□↑)</b> 버튼을 누르세요. 안 보이면 <b>⋯</b>(더보기)를 누른 뒤 <b>공유</b>를 누르세요.</> },
        { icon: 'add_box', text: <>목록을 위로 올려 <b>‘홈 화면에 추가’</b>를 누르세요.</> },
        { icon: 'check_circle', text: <><b>‘웹 앱으로 열기’</b>가 보이면 켜 두고, 오른쪽 위 <b>‘추가’</b>를 누르세요. 홈 화면에 <b>‘{appName}’</b> 아이콘이 생깁니다.</> },
      ]

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/75 text-white" role="dialog" aria-modal="true" aria-label="홈 화면에 추가 방법">
      {/* Chrome's share button is top right, where the arrow points; keep the close button clear of it. */}
      <div className={`flex p-3 ${browser === 'chrome' ? 'justify-start' : 'justify-end'}`}>
        <button type="button" onClick={onClose} aria-label="닫기" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
          <Icon name="close" />
        </button>
      </div>

      <div className={`flex flex-1 flex-col px-5 ${browser === 'chrome' ? 'justify-start' : 'justify-end pb-28'}`}>
        <div className="mx-auto w-full max-w-sm rounded-2xl bg-surface p-5 text-on-surface shadow-xl">
          <p className="text-h3 font-bold">홈 화면에 추가하기</p>

          {browser === 'kakao' || browser === 'inapp' ? (
            <div className="mt-3 space-y-3 text-body-sm">
              <p>
                지금은 <b>{browser === 'kakao' ? '카카오톡' : '앱'} 안의 브라우저</b>로 열려 있어 홈 화면에 추가할 수 없습니다.
                <b> Safari</b>로 열어 주세요.
              </p>
              {browser === 'kakao' && (
                <a href={`kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-on-primary">
                  <Icon name="open_in_browser" /> Safari로 열기
                </a>
              )}
              <button type="button" onClick={() => void copyLink()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant py-3 font-semibold">
                <Icon name={copied ? 'check' : 'content_copy'} /> {copied ? '주소를 복사했습니다' : '주소 복사'}
              </button>
              <p className="text-caption text-on-surface-variant">
                {browser === 'kakao' ? '버튼이 동작하지 않으면 ' : ''}오른쪽 아래(또는 위) <b>⋯</b> 메뉴에서 <b>‘다른 브라우저로 열기’</b>를 고르거나, 주소를 복사해 Safari에 붙여 넣으세요.
              </p>
            </div>
          ) : (
            <ol className="mt-3 space-y-3">
              {steps.map((step, index) => (
                <li key={index} className="flex items-start gap-3 text-body-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-caption font-bold text-on-primary">{index + 1}</span>
                  <span className="min-w-0 pt-0.5">{step.text}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Points at the browser's share button: bottom toolbar in Safari, address bar in Chrome. */}
      {(browser === 'safari' || browser === 'chrome') && (
        <div aria-hidden="true" className={`pointer-events-none absolute flex flex-col items-center ${browser === 'chrome' ? 'right-6 top-2' : 'bottom-3 left-1/2 -translate-x-1/2'}`}>
          {browser === 'chrome' && <Icon name="arrow_upward" className="animate-bounce text-[44px]" />}
          <span className="rounded-full bg-white px-3 py-1 text-caption font-bold text-black">공유 □↑</span>
          {browser === 'safari' && <Icon name="arrow_downward" className="animate-bounce text-[44px]" />}
        </div>
      )}
    </div>
  )
}
