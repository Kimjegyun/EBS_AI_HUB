# EBS AI HUB 앱 템플릿

JSX 로 앱을 쓰고, 허브가 읽을 수 있는 **단일 ESM 파일 하나**로 빌드합니다.

```bash
cp -r examples/app-template ~/my-app    # 이 폴더를 복사해서 시작하세요
cd ~/my-app
npm install
npm run build
```

---

## 파일 넷이 전부입니다

| 파일 | 하는 일 |
|---|---|
| `ebs-app.json` | 앱 id·이름·아이콘·분류·**접근 범위 선언** |
| `src/app.jsx` | 앱 본문 — 여기만 고치면 됩니다 |
| `build.mjs` | 빌드 + 제출 전 검증 |
| `dist/<id>.app.js` | 빌드 결과 — 이 파일을 제출합니다 |

---

## 만드는 순서

**1. `ebs-app.json` 을 채웁니다**

```json
{
  "id": "notice-board",
  "name": "사내 공지",
  "icon": "campaign",
  "category": "생산성",
  "version": "1.0.0",
  "permissions": ["hub-api"]
}
```

`permissions` 는 **이 앱이 무엇에 접근하는지 미리 밝히는 것**입니다.
심사자가 코드에서 무엇을 확인해야 하는지 알려 주는 용도라, 빠뜨리면 반려될 수 있습니다.

| 값 | 뜻 |
|---|---|
| `network` | 외부 도메인으로 `fetch` 등을 호출 |
| `storage` | `localStorage` · `IndexedDB` 사용 |
| `hub-api` | 허브의 `/api/...` 호출 |
| `ai` | AI 게이트웨이 호출 |
| `clipboard` | 클립보드 읽기·쓰기 |

**2. `src/app.jsx` 를 고칩니다**

```jsx
export default ({ React }) => {
  const h = React.createElement       // JSX 가 이 이름으로 컴파일됩니다
  const Fragment = React.Fragment
  const { useState } = React

  function Body(ctx) {
    const [n, setN] = useState(0)
    return (
      <button className="rounded-lg bg-primary px-4 py-2 text-on-primary"
              onClick={() => setN(n + 1)}>
        {n}번 눌렀습니다
      </button>
    )
  }

  return { Body, defaultSize: { w: 4, h: 3 } }
}
```

`h` 와 `Fragment` 두 줄은 지우지 마세요. JSX 가 그 이름으로 변환됩니다.

**3. 빌드하고 확인합니다**

```bash
npm run build     # dist/<id>.app.js 생성 + 검증
npm run watch     # 저장할 때마다 다시 빌드
npm run check     # 검증만
```

빌드는 서버가 하는 검사를 미리 돌립니다. 여기서 통과하면 제출도 통과합니다.
선언하지 않은 접근이 코드에 있으면 경고로 알려 줍니다.

**4. 허브에서 미리 봅니다**

마켓플레이스 → **로컬 미리보기** → `dist/<id>.app.js` 선택

서버에 아무것도 올라가지 않습니다. 내 화면에서만 뜨고, 새로고침하면 사라집니다.
대시보드의 «앱 추가»에 `[미리보기]` 항목으로 나타납니다.

**5. 제출합니다**

마켓플레이스 → **앱 제출** → 파일과 정보 입력 → 심사 요청

관리자가 코드를 읽고 승인해야 다른 사람에게 배포됩니다.
결과는 같은 화면의 «내 제출 현황» 에서 확인합니다. 반려되면 사유가 함께 표시됩니다.

---

## 지켜야 할 것

| 규칙 | 이유 |
|---|---|
| **React 를 import 하지 말 것** | 인스턴스가 둘이면 훅이 깨집니다. 인자로 받은 `React` 만 쓰세요. |
| **정적 `import` 금지** | 허브가 동적 import 로 불러오므로 해석되지 않습니다. 빌드가 모두 인라인합니다. |
| 앱 id 는 소문자·숫자·하이픈 | 저장 키로 쓰입니다. 내장 앱과 같은 id 는 무시됩니다. |
| 번들 2MB 이하 | 서버 제한입니다. |
| 새 코드는 **버전을 올려서** 제출 | 승인은 버전 단위입니다. 같은 버전은 다시 낼 수 없습니다. |

`npm install` 로 라이브러리를 넣으면 빌드가 번들에 인라인합니다 —
정적 import 는 남지 않으니 그대로 쓰셔도 됩니다. 다만 용량은 2MB 안에 들어와야 합니다.

---

## 쓸 수 있는 것

- 호스트 React 전부 — `useState` · `useEffect` · `useMemo` · `useRef` …
- 브라우저 API 전부 — `fetch` · `localStorage` · `IndexedDB` …
  (쓴다면 `permissions` 에 밝혀 주세요)
- 허브의 Tailwind 디자인 토큰 — `text-on-surface` · `bg-primary` · `border-outline-variant` …
- `Body` 가 받는 `ctx` — `isAdmin` · `maximized` · `toggleMaximize`
  전체 계약: [`ai-hub-web/src/apps/types.ts`](../../ai-hub-web/src/apps/types.ts)

## 팩토리 반환값

| 필드 | 필수 | 설명 |
|---|---|---|
| `Body` | ✅ | 위젯 본문. `ctx` 를 props 로 받습니다. |
| `defaultSize` | | 대시보드 기본 크기. 생략 시 `{w:4,h:3,minW:2,minH:2}` |
| `HeaderExtra` | | 위젯 제목 줄 오른쪽 컨트롤 |
| `Provider` | | 헤더와 본문이 상태를 공유해야 할 때 |
| `bodyClassName` | | 본문 래퍼에 붙일 추가 클래스 |

`id` · `name` · `icon` · `description` · `category` · `version` 은
**제출할 때 입력한 값이 우선**합니다. 목록과 실제 앱이 어긋나지 않게 하기 위해서입니다.

---

빌드 없이 만들고 싶다면 [`examples/remote-apps/hello-world.app.js`](../remote-apps/hello-world.app.js) 를 보세요.
전체 규격과 심사 흐름은 [`doc/REMOTE_APPS.md`](../../doc/REMOTE_APPS.md) 에 있습니다.
