import unavailableIllustration from '../assets/acap-offline.svg'

export default function ServiceUnavailablePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-center text-on-surface">
      <section className="w-full max-w-2xl rounded-3xl border border-outline-variant bg-white p-8 shadow-sm sm:p-12">
        <img src={unavailableIllustration} alt="오프라인 상태를 나타내는 구름과 연결 해제 표시" className="mx-auto mb-7 h-auto w-full max-w-sm" />
        <p className="mb-3 text-sm font-semibold tracking-wide text-primary">ACAP 서비스 안내</p>
        <h1 className="text-2xl font-semibold leading-relaxed">이 서비스는 더 이상 온라인으로 제공되지 않습니다.</h1>
        <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-on-surface-variant">ACAP 온라인 서비스 이용이 종료되었습니다. 이용에 참고해 주세요.</p>
      </section>
    </main>
  )
}
