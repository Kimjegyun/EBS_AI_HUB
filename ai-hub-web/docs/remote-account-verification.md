# ACAP 연동 원격 계정 검증 — 2026-10-26

대상: AI Hub `Kimjegyun/EBS_AI_HUB`, `main`. ACAP 제작 기능 변경은 별도 `D:/EBS_AI_CONTENTS_CREATION_v2`의 `docs/remote-account-production-audit.md`를 따른다.

사용자의 명시적 수정·배포 승인 후 `auth.controller.ts`의 `verifyAiHubSession`을 새 `lib/portalMembership.ts`에 연결했다. Supabase 사용자 조회의 429/5xx/연결 실패는 503, 인증 거절은 401, 승인 대기·회수·인증 사용자와 다른 멤버십은 403이다. 현재 승인된 동일 사용자만 통과한다. 기존 계정·역할·토큰·Google 연결·사용자별 저장소를 변경하지 않는다. 응답은 no-store이며 외부 리디렉션을 따르지 않는다.

`scripts/portal-membership.test.mjs`를 `verify:production-feedback`에 등록했다. 두 사용자에 대한 22개 승인·만료·일시 장애·사용자 불일치 조합을 확인했다. 전체 Node 회귀 26개와 로그인 브라우저 검사, 서버 TypeScript 빌드가 통과했다.

기존 인증 컨트롤러와 package.json은 ACAP 작업 폴더 `tmp/hub-session-fix/backup/`에 백업했다. 공개 게이트웨이가 사용하는 API 포트 3003의 PID·실행 파일·health를 확인하고 유휴 연결 상태에서 서버만 교체했다. 내부 API 및 `https://ebs-aihub.com/api/auth/verify-ai-hub-session`에서 미로그인 401·approved false·no-store를 확인했다. ACAP 제작 서버는 재시작하지 않았다.

새 브라우저에서 실제 `/ACAP` → 로그인 화면 이동과 입력 표시가 정상이고 HTTP 오류 및 페이지 실행 예외는 없었다. 실제 사용자 비밀번호 로그인이나 유료 콘텐츠 제작 완료를 검증한 것은 아니다.

Cloudflare CSP 후속 수정: 사용자가 정확한 출처 허용과 배포를 명시 승인해 `scripts/gatewaySecurity.mjs`의 `script-src`에 `https://static.cloudflareinsights.com`만 추가했다. 와일드카드·일반 HTTPS 스크립트·unsafe-inline·unsafe-eval 허용은 추가하지 않았다. `security-hardening.test.mjs`의 새 회귀와 전체 Node 26개·로그인 브라우저 검사가 통과했다. 진행 중 제작 요청이 0인 것을 확인하고 Cloudflare·내부 서버의 연결 유지 소켓을 구분한 뒤 게이트웨이만 갱신했다. 실제 공개 ACAP·사용자 로그인·관리자 로그인에서 새 정책을 확인했고 Chrome에서 통계 스크립트 HTTP 200, CSP 경고·실행 예외·HTTP 실패 0건을 확인했다. ACAP·인증 API·터널은 재시작하지 않았다. 초기 자동 승인 거절은 후속 명시 승인으로 해결됐으며 대기 중인 CSP 변경은 없다.
