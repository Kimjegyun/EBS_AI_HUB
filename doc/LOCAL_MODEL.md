# 로컬 오픈웨이트 모델로 구동하기

EBS AI HUB의 AI 계층은 **모델을 고정하지 않습니다.** 사용자가 쓰고 싶은 모델을 고르고,
필요하면 자신이 직접 구동하는 오픈웨이트 모델(Llama, Gemma, Qwen, Mistral 등)로 바꿔 끼웁니다.

## 언제 온프레미스로 돌리나

**사내 보안 데이터를 다루는 앱**을 만들 때입니다. 인사·자산·계약처럼 밖으로 내보낼 수 없는
데이터를 AI에 넣어야 한다면, 상용 API로는 안 됩니다. 그럴 때 오픈웨이트 모델을 자체 서버에
올려 두고 base URL만 그쪽으로 돌리면, **데이터가 사내를 벗어나지 않은 채** 같은 기능이 동작합니다.

반대로 보안 부담이 없는 일반 업무 앱(예: 「나의 LLM」)에서는 사용자가 GPT·Claude·Grok 등
원하는 모델을 골라 자신의 키로 쓰면 됩니다. 두 경로가 같은 인터페이스를 씁니다.

> 이 문서는 「2026년 오픈소스 개발자대회」 [부록2] 관문 2 — *"외부 상용 API 없이도
> 핵심 기능이 작동하는 독립 구동 경로"* 의 실행 방법 안내를 겸합니다.

---

## 전제: AI는 부가 기능입니다

먼저 분명히 해 둘 것이 있습니다. **이 프로젝트의 핵심 기능은 AI를 쓰지 않습니다.**

| 기능 | AI 필요 여부 |
|---|---|
| QR 스캔 → 자산 조회 (하이픈 무시 매칭) | ❌ 불필요 |
| 운영관리부 양식 + ERP 엑셀 병합 | ❌ 불필요 |
| 검수 기록 · 오프라인 동기화 | ❌ 불필요 |
| 검수 4열 반영 ERP 엑셀 생성 | ❌ 불필요 |
| 설치부서 대조(노랑/주황) 엑셀 생성 | ❌ 불필요 |
| 본부 → 부서 → 확인자 커버리지 통계 | ❌ 불필요 |
| 장부·현물 대조 AI 교차검증 *(선택)* | ⭕ 선택적 보조 |
| 나의 LLM · 메일 생성기 · Codex *(선택 앱)* | ⭕ 선택적 부가 앱 |

AI 키를 한 줄도 넣지 않아도 자산 실사 전 과정이 완전히 동작합니다.
그 위에서, AI 보조를 쓰고 싶다면 **상용 API와 로컬 오픈웨이트 모델 중 무엇이든** 고를 수 있습니다.

---

## 동작 원리

서버의 AI 프록시는 **OpenAI 호환 규격**으로 요청합니다.

1. 먼저 `POST {base_url}/responses` 를 시도합니다 (OpenAI 전용 신규 규격)
2. 실패하면 **`POST {base_url}/chat/completions` 로 폴백**합니다

2번은 **Ollama · llama.cpp · vLLM · LM Studio가 공통으로 노출하는 규격**입니다.
따라서 `ai_openai_base_url` 을 로컬 런타임 주소로 바꾸기만 하면 그대로 동작합니다.

구현 위치: [`server/src/services/aiProxy.service.ts`](../ai-hub-web/server/src/services/aiProxy.service.ts)

```ts
const baseUrl = (asString(config.ai_openai_base_url) || 'https://api.openai.com/v1').replace(/\/+$/, '')
const res = await fetch(`${baseUrl}/responses`, { ... })
// 404 등으로 실패하면
const fallback = await fetch(`${baseUrl}/chat/completions`, { ... })
```

---

## 설정 방법 (Ollama 기준)

### 1. 런타임 설치 및 모델 내려받기

```bash
# https://ollama.com 에서 설치한 뒤
ollama pull qwen2.5:7b        # Apache-2.0
# 또는
ollama pull gemma2:9b         # Gemma Terms of Use
ollama pull llama3.1:8b       # Llama 3.1 Community License
```

Ollama는 기본적으로 `http://localhost:11434` 에서 OpenAI 호환 API를 `/v1` 하위에 제공합니다.

### 2. 허브에 로컬 런타임 주소 지정

관리자 화면 → **설정 → 환경 설정**에서 다음 세 값을 지정합니다.

| 설정 키 | 값 |
|---|---|
| `ai_openai_base_url` | `http://localhost:11434/v1` |
| `ai_openai_model` | `qwen2.5:7b` (내려받은 모델 태그) |
| `ai_openai_api_key` | 아무 문자열 (Ollama는 키를 검사하지 않습니다) |

### 3. 확인

재물조사 조사 화면에서 자산을 조회한 뒤 **AI 교차검증**을 실행하면,
상용 API를 전혀 호출하지 않고 로컬 모델이 응답합니다.
`ollama ps` 로 모델이 적재되는 것을 함께 확인할 수 있습니다.

### 다른 런타임

| 런타임 | base_url |
|---|---|
| llama.cpp (`llama-server`) | `http://localhost:8080/v1` |
| vLLM | `http://localhost:8000/v1` |
| LM Studio | `http://localhost:1234/v1` |

---

## 동작 검증 기록

개발 중 이 경로가 실제로 동작하는지 확인한 결과입니다.
OpenAI 호환 규격을 그대로 구현한 로컬 HTTP 서버를 띄우고 `ai_openai_base_url` 을
그쪽으로 돌린 뒤, 재물조사 앱의 AI 교차검증을 호출했습니다.

```
로컬 런타임 기동 — http://127.0.0.1:18434/v1
설정 전환 — 상용 API → 내가 구동하는 로컬 런타임

응답 200
  content: 판정: 일치 — 로컬 오픈웨이트 모델이 응답했습니다.

로컬 런타임이 받은 요청:
  POST /v1/responses            ← 먼저 시도, 로컬 런타임엔 없으므로 404
  POST /v1/chat/completions     ← 폴백, 정상 응답

판정: ✅ 상용 API 없이 로컬 런타임으로 동작
```

`/responses` 가 없으면 `/chat/completions` 로 넘어가는 폴백이 실제로 작동하며,
이것이 Ollama·llama.cpp·vLLM이 공통으로 제공하는 경로입니다.

---

## 모델 라이선스 확인

오픈웨이트 모델은 각기 라이선스가 다릅니다. 사용 전 반드시 원문을 확인하세요.

| 모델 | 라이선스 | 비고 |
|---|---|---|
| Qwen2.5 (7B 이하) | Apache-2.0 | 제약이 가장 적습니다 |
| Mistral 7B | Apache-2.0 | |
| Gemma 2 | Gemma Terms of Use | 사용 제한 조항 확인 필요 |
| Llama 3.1 | Llama 3.1 Community License | 월간 사용자 수 조건 등 확인 필요 |

파생물 공개를 금지하거나 비상업·학술 전용 조건이 붙은 모델은 피하십시오.
