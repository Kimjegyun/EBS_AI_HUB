# 원격 앱 만들기 — 공동 마켓플레이스

EBS AI HUB는 **허브를 다시 빌드하지 않고** 앱을 추가할 수 있습니다.
앱 번들(JS 파일 하나)을 마켓플레이스에 올리면 허브가 실행 중에 내려받아 등록합니다.

---

## 앱을 넣는 두 가지 방법

| | 내장 앱 | **원격 앱** |
|---|---|---|
| 추가 방법 | 저장소에 파일 추가 + 레지스트리 한 줄 | 관리자 화면에서 번들 업로드 |
| 빌드 필요 | 예 (허브 재빌드·재배포) | **아니오** |
| JSX / TypeScript | 사용 가능 | 불가 (빌드 단계가 없음) |
| 배포 범위 | 이 저장소를 쓰는 모두 | 그 서버를 쓰는 조직 |
| 적합한 경우 | 널리 쓰일 앱, 복잡한 앱 | 조직 전용 앱, 빠른 실험, 배포 없이 배포 |

널리 쓰일 앱은 [CONTRIBUTING.md](../CONTRIBUTING.md) 대로 PR로 등록해 주세요.
원격 앱은 **재배포 없이 바로 얹는** 경로입니다.

---

## 번들 규격

앱 번들은 **정적 `import`가 없는 ESM 파일 하나**이며,
호스트가 넘겨주는 `React`를 받아 `AppPlugin`을 돌려주는 **팩토리를 `export default`** 합니다.

```js
export default ({ React }) => {
  const { useState } = React
  const h = React.createElement

  function Body(ctx) {
    const [n, setN] = useState(0)
    return h('div', { className: 'p-4' },
      h('p', null, `${ctx.isAdmin ? '관리자' : '사용자'}님 안녕하세요`),
      h('button', { onClick: () => setN(n + 1) }, `클릭 ${n}`),
    )
  }

  return {
    id: 'hello-world',
    name: '인사',
    icon: 'waving_hand',          // Material Symbols 이름
    description: '최소 예제',
    category: '생산성',            // 코어 | 생산성 | 운영 | AI
    version: '1.0.0',
    defaultSize: { w: 3, h: 3, minW: 2, minH: 2 },
    Body,
  }
}
```

전체 예제: [`examples/remote-apps/hello-world.app.js`](../examples/remote-apps/hello-world.app.js)

### 지켜야 할 것

| 규칙 | 이유 |
|---|---|
| **정적 `import` 금지** | 동적 로딩 시 해석되지 않습니다. 서버가 업로드를 거부합니다. |
| **React를 번들하지 말 것** | React 인스턴스가 둘이면 훅이 깨집니다. 반드시 인자로 받은 `React`를 쓰세요. |
| **JSX 대신 `React.createElement`** | 빌드 단계가 없어 JSX가 변환되지 않습니다. |
| 앱 id는 소문자·숫자·하이픈 | 저장 키로 쓰입니다. 내장 앱과 같은 id는 무시됩니다. |
| 번들 2MB 이하 | 서버 제한입니다. |

### 쓸 수 있는 것

- 호스트의 React 전부 — `useState`, `useEffect`, `useMemo`, `createElement` …
- 브라우저 API 전부 — `fetch`, `localStorage`, `IndexedDB` …
- 허브의 Tailwind 클래스 — `text-on-surface`, `bg-primary` 등 디자인 토큰이 그대로 먹습니다
- `Body`가 받는 `ctx` — `isAdmin`, `maximized`, `toggleMaximize` 등 (계약은 [`src/apps/types.ts`](../ai-hub-web/src/apps/types.ts))

### 반환값

| 필드 | 필수 | 설명 |
|---|---|---|
| `Body` | ✅ | 위젯 본문 컴포넌트. `ctx`를 props로 받습니다. |
| `defaultSize` | | 대시보드 기본 크기. 생략 시 `{w:4,h:3,minW:2,minH:2}` |
| `HeaderExtra` | | 위젯 제목 줄 오른쪽 컨트롤 |
| `Provider` | | 헤더와 본문이 상태를 공유해야 할 때 |
| `bodyClassName` | | 본문 래퍼에 붙일 추가 클래스 |

`id`·`name`·`icon`·`description`·`category`·`version`은 **업로드할 때 입력한 값이 우선**합니다.
목록 화면과 실제 앱이 어긋나지 않게 하기 위해서입니다.

---

## 올리는 방법

1. 관리자로 로그인 → **앱 등록** 화면
2. 아래쪽 **원격 앱 (공동 마켓플레이스)** → `앱 올리기`
3. 번들 파일과 메타데이터 입력 → `마켓플레이스에 등록`
4. 등록되면 목록에 나타나고, 사용자는 마켓플레이스에서 설치할 수 있습니다

원격 앱은 **자동으로 설치되지 않습니다.** 사용자가 직접 골라야 합니다.

---

## 동작 원리

```
[관리자] 번들 업로드
   └→ 서버가 검증(ESM·정적 import 없음·크기) 후 uploads/apps/<id>.js 에 저장
      SHA-256 을 함께 기록

[허브] 로그인 후
   └→ GET /api/apps/remote            등록 목록
   └→ GET /api/apps/remote/:id/bundle 번들 본문 (인증 필요)
   └→ Blob URL 로 만들어 동적 import
   └→ export default 팩토리에 호스트 React 를 넘겨 실행
   └→ 반환값을 AppPlugin 계약에 맞게 검증한 뒤 레지스트리에 등록
   └→ 마켓플레이스·대시보드·설치 관리 화면에 자동 반영
```

`import()`는 헤더를 붙일 수 없어서, 번들을 먼저 인증된 `fetch`로 받아 Blob URL로 만들어 넘깁니다.

앱 하나가 실패해도 나머지는 정상 등록되며, 실패한 앱은 **관리자 화면에 실패 사유가 표시**됩니다.

---

## ⚠️ 보안 — 반드시 읽어주세요

**원격 앱 코드는 허브와 같은 권한으로 브라우저에서 실행됩니다.**
로그인 세션, localStorage, 허브가 호출할 수 있는 모든 API에 접근할 수 있습니다.

| 장치 | 내용 |
|---|---|
| 업로드 권한 | 관리자만 가능 |
| 번들 열람 | 인증된 요청만 |
| 무결성 | 업로드 시 SHA-256 기록, 관리자 화면에서 앞 8자 확인 |
| 검증 | ESM 여부·정적 import 없음·크기·앱 id 형식 |
| 격리 | **없음** — 샌드박스가 아닙니다 |

**소스를 직접 확인한 앱만 올리세요.** 출처를 모르는 번들을 올리는 것은
브라우저에서 임의 코드를 실행하는 것과 같습니다.

향후 로드맵: 앱 서명·권한 선언·iframe 샌드박스 실행.

---

## 문제가 생기면

| 증상 | 원인 |
|---|---|
| 업로드 시 `정적 import 는 사용할 수 없습니다` | 파일 상단의 `import` 문을 지우고 인자로 받은 React를 쓰세요 |
| 업로드 시 `ESM 기본 내보내기가 없습니다` | `export default` 팩토리가 있어야 합니다 |
| 목록에 `불러오기 실패` | 관리자 화면에 표시된 사유를 보세요. 대개 팩토리 반환값에 `Body`가 없는 경우입니다 |
| 훅 오류(`Invalid hook call`) | React를 번들에 포함시켰습니다. 인자로 받은 React만 쓰세요 |
| 화면이 비어 있음 | `Body`가 `React.createElement` 결과를 반환하는지 확인하세요 (JSX는 변환되지 않습니다) |
