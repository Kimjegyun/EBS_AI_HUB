# 나만의 LLM 모델 목록

나만의 LLM은 Tencent Text Generation 게이트웨이(`https://text-aigc.vod-qcloud.com`)로 모델을 호출합니다. 모델 목록은 `src/lib/tencentCatalog.ts`의 `TENCENT_MODEL_CATALOG`에 있습니다.

## 지원 모델 (제공사별 최신 최대 4개)

| 제공사 | 모델 ID (화면 이름) | API |
|---|---|---|
| ChatGPT | `gpt-5.5`, `gpt-5.4-pro`, `gpt-5.4`, `gpt-5.4-mini` | `/v1/chat/completions` (5.4 Pro는 `/v1/responses`) |
| Claude | `cd-fable-5.1`, `cd-opus-5.5`, `cd-opus-5`, `cd-sonnet-5` | `/v1/messages` |
| Gemini | `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite` | `/v1/chat/completions` |
| Grok | `gk-4.3`, `gk-4-20-reasoning`, `gk-4-20-non-reasoning` | `/v1/chat/completions` |
| DeepSeek | `deepseek-v4-pro`, `deepseek-v4-flash`, `deepseek-v3.2` | `/v1/chat/completions` |
| Kimi | `kimi-k3`, `kimi-k2.6` | `/v1/chat/completions` |

- 각 제공사의 첫 번째 모델이 그 제공사의 기본 선택입니다.
- **Tencent 문서에 아직 없는 모델:** Claude 5 계열(Fable 5.1, Opus 5.5, Opus 5, Sonnet 5), Kimi K3, Gemini 3.5 Flash Lite.
  - 2026-10-08 게이트웨이에 직접 짧은 요청을 보내 응답을 확인했습니다.
  - 같은 날 응답하지 않은 ID: `cd-sonnet-5.5`, `cd-haiku-5`, `gpt-5.6`, `gpt-5.5-mini`, `gemini-3.5-pro`, `gk-5`, `kimi-k2.7`.
  - `kimi-k2.5`는 엔진 오류(500)를 돌려줘 목록에서 뺐습니다.
- Grok, DeepSeek, Kimi는 게이트웨이가 제공하는 모델이 4개보다 적습니다.

## 예전 모델 정리

- 목록에서 뺀 모델은 `RETIRED_MODEL_IDS`에 넣습니다. 그러면 예전에 저장한 설정에 남아 있어도 다시 나타나지 않습니다.
  - 이번에 뺀 모델: Claude Opus 4.8·4.7·4.6, Sonnet 4.6, Gemini 2.5 Pro·2.5 Flash·3 Flash Preview·3.1 Flash Lite Preview, GPT-5.4 Nano, Kimi K2.5.
- **'사용' 설정 이어받기** (`mergeTencentModels`):
  - 관리자가 한 모델이라도 '사용'으로 켜 둔 제공사에 새 모델이 추가되면, 그 새 모델은 자동으로 '사용' 상태가 됩니다. 그래서 예전 모델이 빠져도 그 제공사가 사용자 화면에서 사라지지 않습니다.
  - 관리자가 직접 끈 모델은 꺼진 채로 둡니다.
- 사용자가 고른 모델이 목록에서 빠지면 그 제공사의 첫 번째 모델로 바뀝니다.

## 모델을 추가할 때

1. 게이트웨이가 그 ID를 받는지 먼저 확인합니다. 400 `The model '…' is not available`이면 지원하지 않는 모델입니다.
2. `TENCENT_MODEL_CATALOG`에 `entry(id, 화면 이름, 제공사, API)`를 추가합니다. 같은 제공사에서 가장 오래된 모델은 `RETIRED_MODEL_IDS`로 옮깁니다.
3. `node scripts/build-public-portals.mjs`로 USER 포털을 다시 빌드합니다.

관리자는 설정 화면의 **추가** 버튼으로 목록에 없는 모델 ID를 직접 넣을 수도 있습니다.
