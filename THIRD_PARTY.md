# 제3자 오픈소스 고지 (SBOM)

EBS AI HUB가 직접 가져다 쓴 오픈소스 목록입니다. 버전은 실제 설치된 값이며,
라이선스는 각 패키지의 `LICENSE` 파일에서 확인했습니다.

**직접 의존성 60개 전부가 MIT / Apache-2.0 / BSD 계열입니다. GPL·AGPL·LGPL 계열은 하나도 없습니다.**

전체 목록은 [`ai-hub-web/package.json`](./ai-hub-web/package.json) 과
[`ai-hub-web/server/package.json`](./ai-hub-web/server/package.json) 에서 확인할 수 있습니다.

---

## 주요 의존성

| # | 라이브러리 | 버전 | 라이선스 | 공식 저장소 | 사용 목적 / 결합 방식 |
|---|---|---|---|---|---|
| 1 | html5-qrcode | 2.3.8 | Apache-2.0 | https://github.com/mebjas/html5-qrcode | 자산 라벨 QR 카메라 스캔 / 라이브러리로 불러 씀 |
| 2 | SheetJS (xlsx) | 0.18.5 | Apache-2.0 | https://github.com/SheetJS/sheetjs | 운영관리부 양식·ERP 엑셀 파싱 및 결과 엑셀 생성 / 라이브러리로 불러 씀 |
| 3 | ExcelJS | 4.4.0 | MIT | https://github.com/exceljs/exceljs | 설치부서 대조 엑셀의 셀 배경색·메모 기록 / 라이브러리로 불러 씀 |
| 4 | node-sqlite3 | 5.1.7 | BSD-3-Clause | https://github.com/TryGhost/node-sqlite3 | 자산 데이터셋·조사 세션 저장 / 라이브러리로 불러 씀 |
| 5 | React (react, react-dom) | 19.2.6 | MIT | https://github.com/facebook/react | 프론트엔드 UI 렌더링 및 컴포넌트 관리 / 라이브러리로 불러 씀 |
| 6 | Express | 4.22.2 | MIT | https://github.com/expressjs/express | REST API 서버 프레임워크 / 라이브러리로 불러 씀 |
| 7 | React Router | 7.15.0 | MIT | https://github.com/remix-run/react-router | SPA 라우팅 및 관리자 보호 라우트 / 라이브러리로 불러 씀 |
| 8 | TypeScript | 6.0.3 | Apache-2.0 | https://github.com/microsoft/TypeScript | 정적 타입 검사 및 빌드 / 빌드 도구로 실행 |
| 9 | Vite | 8.0.11 | MIT | https://github.com/vitejs/vite | 개발 서버 및 프로덕션 번들링 / 빌드 도구로 실행 |
| 10 | vite-plugin-mkcert | 1.17.12 | MIT | https://github.com/liuweiGL/vite-plugin-mkcert | 로컬 신뢰 HTTPS 발급 — 카메라·PWA는 보안 컨텍스트 필수 / 빌드 플러그인 |

---

## 그 밖의 직접 의존성

위 10개 외에 사용 중인 항목입니다.

**프론트엔드 런타임** — @supabase/supabase-js 2.105.3 (MIT), jspdf 4.2.1 (MIT),
pdfjs-dist 6.2.108 (Apache-2.0), docx 9.7.1 (MIT), mammoth 1.12.1 (BSD-2-Clause),
html-to-image 1.11.13 (MIT), file-saver 2.0.5 (MIT), qrcode 1.5.4 (MIT),
react-grid-layout 1.4.4 (MIT)

**백엔드 런타임** — helmet 7.2.0 (MIT), cors 2.8.6 (MIT), multer 2.2.0 (MIT),
jsonwebtoken 9.0.3 (MIT), bcrypt 5.1.1 (MIT), express-rate-limit 7.5.1 (MIT),
express-validator 7.3.2 (MIT), compression 1.8.1 (MIT), dotenv 16.6.1 (BSD-2-Clause),
winston 3.19.0 (MIT), uuid 9.0.1 (MIT)

**개발 도구** — ESLint 10.3.0 (MIT), typescript-eslint 8.59.2 (MIT),
eslint-plugin-react-hooks 7.1.1 (MIT), eslint-plugin-react-refresh 0.5.2 (MIT),
@vitejs/plugin-react 6.0.1 (MIT), tailwindcss 3.4.19 (MIT), @tailwindcss/forms 0.5.11 (MIT),
postcss 8.5.14 (MIT), autoprefixer 10.5.0 (MIT), tsx 4.22.4 (MIT), cross-env 10.1.0 (MIT)

**타입 정의** — `@types/*` 18종 (전부 MIT, https://github.com/DefinitelyTyped/DefinitelyTyped)

---

## AI 모델

이 프로젝트는 **AI 모델 가중치를 포함하거나 배포하지 않습니다.**
AI 보조 기능은 선택 사항이며, 사용자가 지정한 OpenAI 호환 엔드포인트로 요청합니다.
자신이 직접 구동하는 오픈웨이트 모델(Ollama, llama.cpp, vLLM 등)로 대체할 수 있습니다 —
[doc/LOCAL_MODEL.md](./doc/LOCAL_MODEL.md) 참고.

---

## 이 프로젝트의 라이선스

[MIT License](./LICENSE)
