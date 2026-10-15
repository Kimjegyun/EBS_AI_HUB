# 홈 화면에 추가 (PWA)

| 앱 | 주소 | 홈 화면 이름 |
|---|---|---|
| 사용자 포털 | `/user/` | EBS AI 허브 |
| 관리자 포털 | `/admin/` | AI 허브 관리자 |
| 재물조사 | `/inventory.html` | 재물조사 |

## 사용 방법

- **안드로이드(Chrome·Edge):** 로그인 화면 아래 배너에서 **앱 설치**를 누릅니다. 버튼이 없으면 브라우저 메뉴(⋮)에서 **앱 설치**를 고릅니다.
- **아이폰:** 배너의 **홈 화면에 추가** 버튼을 누르면 전체 화면 안내(`src/components/IosInstallGuide.tsx`)가 열립니다. iOS는 웹페이지가 스스로 홈 화면에 추가하는 기능(설치 API)을 제공하지 않으므로, 사용자가 직접 누를 버튼을 화살표로 가리킵니다.
  - **Safari:** 화면 아래의 공유(□↑)를 가리킵니다. iOS 26처럼 공유가 ⋯ 메뉴 안에 있는 경우도 안내합니다. 그다음 **홈 화면에 추가** → **추가**를 누릅니다.
  - **Chrome·Edge(iOS):** 주소창 오른쪽의 공유 버튼을 가리킵니다.
  - **카카오톡 안 브라우저:** 홈 화면에 추가할 수 없으므로 **Safari로 열기** 버튼(`kakaotalk://web/openExternal`)과 **주소 복사**를 제공합니다.
  - **네이버·인스타그램 등 다른 앱 안 브라우저:** **주소 복사**와 '다른 브라우저로 열기' 안내를 제공합니다.
- 카카오톡 같은 앱 안의 브라우저에서는 설치할 수 없습니다. 외부 브라우저로 열어서 설치합니다.

## 구성

- `public/manifest.webmanifest`: 경로를 상대 주소(`./`)로 적어 두었습니다. 그래서 `/user/`와 `/admin/`이 각각 별도 앱으로 설치됩니다. 관리자 포털의 이름은 `scripts/build-public-portals.mjs`가 빌드할 때 바꿉니다.
- 아이콘: `public/hub-icon-180/192/512.png`. 아이폰은 SVG 아이콘을 쓰지 못해서 `apple-touch-icon`에 180px PNG를 지정했습니다.
- `public/sw.js`: `src/main.tsx`가 포털별 범위(`BASE_URL`)로 등록합니다.
- 설치 배너: 공통 컴포넌트는 `src/components/InstallBanner.tsx`입니다. 로그인 화면과 재물조사 화면에서 사용하며, 이미 설치된 앱으로 열었을 때는 표시되지 않습니다.

변경 사항을 외부에 반영하려면 `node scripts/build-public-portals.mjs`(재물조사는 `node scripts/build-inventory-public.mjs`)를 실행합니다.
