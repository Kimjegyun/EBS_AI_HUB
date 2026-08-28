// 앱 본문 — 여기만 고치면 됩니다.
//
// 허브는 이 파일이 아니라 빌드 결과(dist/<id>.app.js)를 읽습니다.
// JSX 와 최신 문법을 그대로 쓰면 build.mjs 가 허브가 읽을 수 있는 형태로 바꿔 줍니다.
//
// 규칙은 하나입니다: React 를 import 하지 마세요.
// 허브가 자기 React 를 넘겨줍니다. 따로 import 하면 인스턴스가 둘이 되어 훅이 깨집니다.

export default ({ React }) => {
  // JSX 가 이 두 이름으로 컴파일됩니다 (build.mjs 의 jsxFactory 설정).
  const h = React.createElement
  const Fragment = React.Fragment
  const { useState, useEffect } = React

  /**
   * 위젯 본문. ctx 로 허브 상태를 받습니다.
   *   ctx.isAdmin        관리자 여부
   *   ctx.maximized      전체 화면 여부
   *   ctx.toggleMaximize 전체 화면 전환
   *
   * 전체 계약은 ai-hub-web/src/apps/types.ts 를 보세요.
   */
  function Body(ctx) {
    const [count, setCount] = useState(0)
    const [now, setNow] = useState('')

    useEffect(() => {
      const tick = () => setNow(new Date().toLocaleTimeString('ko-KR'))
      tick()
      const timer = setInterval(tick, 1000)
      return () => clearInterval(timer)
    }, [])

    // 허브의 Tailwind 디자인 토큰을 그대로 쓸 수 있습니다.
    // text-on-surface, bg-primary, border-outline-variant 등.
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <p className="text-body-sm text-on-surface-variant">
          {ctx.isAdmin ? '관리자' : '사용자'}님, 지금은 {now} 입니다.
        </p>

        <button
          type="button"
          onClick={() => setCount((n) => n + 1)}
          className="self-start rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary hover:bg-primary/90"
        >
          {count}번 눌렀습니다
        </button>

        <p className="mt-auto text-caption text-on-surface-variant">
          src/app.jsx 를 고치고 <code className="rounded bg-surface-container-high px-1">npm run build</code> 하세요.
        </p>
      </div>
    )
  }

  // 반환값에서 필수는 Body 하나입니다.
  // id·name·icon 등은 제출할 때 입력한 값이 우선하므로 여기서는 생략해도 됩니다.
  return {
    Body,
    defaultSize: { w: 4, h: 3, minW: 2, minH: 2 },
  }
}
