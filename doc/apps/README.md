# 앱별 문서

AI-HUB의 **모든 앱은 앱별 md 문서를 하나씩** 가집니다. 문서에는 실행 과정, 사용 메뉴얼, 실행 순서가 반드시 들어갑니다.

## 규칙

1. **신규 앱을 만들면 이 폴더에 `<앱id>.md`를 함께 만든다.** 문서 없이 앱을 완료로 보지 않는다.
2. **기능을 바꾸면 같은 작업 안에서 문서도 고친다.** 코드와 문서가 따로 놀지 않게 한다.
3. **아래 목차에 한 줄을 추가한다.**
4. 문서에는 최소한 다음 다섯 절을 둔다 — [TEMPLATE.md](./TEMPLATE.md) 참고.
   - 개요 / 어떤 문제를 푸는 앱인지
   - 실행 순서 (준비 → 사용 → 마무리, 번호 매긴 단계)
   - 화면과 메뉴얼 (버튼·입력란별 동작)
   - 데이터와 저장 위치 (로컬/서버/외부)
   - 제약과 알려진 한계

## 앱 목차

| 앱 | id | 분류 | 문서 |
|---|---|---|---|
| 재물조사 | `inventory` | 운영 | [inventory.md](./inventory.md) |
| 캘린더 | `calendar` | 코어 | [calendar.md](./calendar.md) |
| 나의 LLM | `my-llm` | AI | [my-llm.md](./my-llm.md) |
| 메일 생성기 | `email-writer` | AI | [email-writer.md](./email-writer.md) |
| Codex | `codex` | AI | [codex.md](./codex.md) |
| 빠른 작업 | `quick-actions` | 생산성 | [quick-actions.md](./quick-actions.md) |
| 할 일 | `pending-tasks` | 생산성 | [pending-tasks.md](./pending-tasks.md) |
| 메시지 | `recent-messages` | 생산성 | [recent-messages.md](./recent-messages.md) |
| 메모 | `notes` | 생산성 | [notes.md](./notes.md) |
| 바로가기 | `bookmarks` | 생산성 | [bookmarks.md](./bookmarks.md) |

앱 목록의 원본은 [`src/apps/registry.ts`](../../ai-hub-web/src/apps/registry.ts)입니다. 레지스트리에 앱을 추가하면 이 표에도 한 줄을 추가하세요.

## 작성 상태

`inventory.md`는 전체 내용이 채워져 있습니다. 나머지 앱 문서는 레지스트리에서 확인한 사실(앱 id·분류·설명·구현 파일)만 채운 **골격 상태**이며, 실행 순서와 메뉴얼 본문은 각 앱을 실제로 확인하면서 채워야 합니다. 확인하지 않은 동작을 추측으로 적지 마세요 — 비어 있는 편이 틀린 설명보다 낫습니다.
