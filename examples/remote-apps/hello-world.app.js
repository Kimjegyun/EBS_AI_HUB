/**
 * EBS AI HUB 원격 앱 예제 — hello-world
 *
 * 규격 (doc/REMOTE_APPS.md 참고)
 *   · ESM 파일 하나. 정적 import 를 쓰지 않는다.
 *   · export default 는 호스트가 주는 { React } 를 받아 AppPlugin 을 돌려주는 팩토리.
 *   · React 를 직접 번들하지 말 것 — 훅이 깨진다. 반드시 인자로 받은 React 를 쓴다.
 *   · JSX 는 쓸 수 없다(빌드 단계가 없으므로). React.createElement 를 쓴다.
 *
 * 라이선스: MIT
 */

export default ({ React }) => {
  const { useState } = React
  const h = React.createElement

  function Body(ctx) {
    const [count, setCount] = useState(0)

    return h(
      'div',
      { className: 'flex h-full flex-col items-center justify-center gap-3 p-4 text-center' },
      h('p', { className: 'text-body-sm text-on-surface-variant' },
        `${ctx.isAdmin ? '관리자' : '사용자'}님, 안녕하세요`),
      h('p', { className: 'text-h1 font-bold text-primary' }, String(count)),
      h(
        'button',
        {
          type: 'button',
          onClick: () => setCount((n) => n + 1),
          className:
            'rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-on-primary hover:bg-primary/90',
        },
        '눌러 보세요',
      ),
      h('p', { className: 'text-caption text-on-surface-variant' },
        '허브를 다시 빌드하지 않고 등록된 원격 앱입니다.'),
    )
  }

  return {
    id: 'hello-world',
    name: '인사',
    icon: 'waving_hand',
    description: '원격 앱이 어떻게 동작하는지 보여 주는 최소 예제입니다.',
    category: '생산성',
    version: '1.0.0',
    author: 'EBS AI HUB',
    defaultSize: { w: 3, h: 3, minW: 2, minH: 2 },
    Body,
  }
}
