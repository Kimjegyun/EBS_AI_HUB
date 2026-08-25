# AI HUB 자동 승인 설정 가이드

이 문서는 Bob AI Assistant의 자동 승인 설정을 최적화하여 개발 효율성을 높이는 방법을 설명합니다.

## 🎯 권장 자동 승인 설정

### ✅ 완전 자동 승인 (Always Auto-Approve)

다음 작업들은 안전하고 되돌릴 수 있으므로 자동 승인을 권장합니다:

#### 1. **Read (파일 읽기)**
- `read_file` - 파일 내용 읽기
- `list_files` - 파일 목록 조회
- `list_code_definition_names` - 코드 정의 조회
- `search_files` - 파일 검색

**이유**: 읽기 작업은 시스템을 변경하지 않으며, 컨텍스트 파악에 필수적입니다.

#### 2. **Retry (재시도)**
- 실패한 작업 재시도

**이유**: 네트워크 오류 등으로 실패한 작업을 자동으로 재시도하여 워크플로우를 원활하게 합니다.

#### 3. **Mode (모드 전환)**
- `switch_mode` - 다른 모드로 전환
- `new_task` - 새 작업 시작

**이유**: 모드 전환은 작업 흐름을 개선하며, 언제든 되돌릴 수 있습니다.

#### 4. **Subtasks (하위 작업)**
- 복잡한 작업을 여러 단계로 분할

**이유**: 작업 구조화는 효율성을 높이며, 각 단계를 검토할 수 있습니다.

#### 5. **Todo (할 일 목록)**
- `update_todo_list` - 작업 진행 상황 추적

**이유**: 진행 상황 추적은 투명성을 높이며, 시스템에 영향을 주지 않습니다.

---

### ⚠️ 제한적 자동 승인 (Conditional Auto-Approve)

다음 작업은 상황에 따라 자동 승인을 고려할 수 있습니다:

#### **Write (파일 쓰기)**
- `write_to_file` - 새 파일 생성 또는 전체 파일 재작성
- `apply_diff` - 기존 파일의 특정 부분 수정
- `insert_content` - 파일에 내용 추가

**자동 승인 권장 조건**:
- ✅ 새 파일 생성
- ✅ 문서 파일 (`.md`, `.txt`) 수정
- ✅ 설정 파일 (`.json`, `.yaml`) 생성
- ✅ 작은 코드 변경 (< 100줄)

**수동 승인 권장 조건**:
- ❌ 핵심 비즈니스 로직 수정
- ❌ 데이터베이스 마이그레이션 파일
- ❌ 보안 관련 파일 (인증, 권한)
- ❌ 대량 파일 변경 (> 5개 파일)

---

### 🛑 수동 승인 유지 (Always Manual Approve)

다음 작업들은 반드시 수동으로 검토해야 합니다:

#### 1. **Execute (명령 실행)**
- `execute_command` - 시스템 명령 실행

**이유**: 
- 시스템 상태를 직접 변경
- 되돌릴 수 없는 작업 가능
- 보안 위험 존재

**예시**:
```powershell
# 위험한 명령들
rm -rf /
DROP DATABASE production;
npm publish
git push --force
```

#### 2. **Browser (브라우저 작업)**
- 웹 스크래핑
- 외부 API 호출

**이유**: 외부 시스템과 상호작용하며, 예상치 못한 결과 발생 가능

#### 3. **MCP (Model Context Protocol)**
- 외부 도구 및 서비스 연동

**이유**: 외부 시스템에 영향을 줄 수 있음

#### 4. **대량 파일 변경**
- 5개 이상의 파일 동시 수정
- 전체 디렉토리 재구성

**이유**: 광범위한 영향으로 인한 위험 증가

#### 5. **삭제 작업**
- 파일 삭제
- 디렉토리 삭제
- 데이터베이스 레코드 삭제

**이유**: 되돌릴 수 없는 작업

#### 6. **운영/배포 관련 작업**
- 프로덕션 배포
- 데이터베이스 마이그레이션 실행
- 환경 변수 변경
- 서버 재시작

**이유**: 운영 환경에 직접적인 영향

---

## 🔧 VSCode 설정 방법

### 1. Bob 설정 열기
- `Ctrl+Shift+P` (Windows/Linux) 또는 `Cmd+Shift+P` (Mac)
- "Bob: Open Settings" 입력

### 2. Auto-Approve 설정

```json
{
  "bob.autoApprove": {
    "read_file": true,
    "list_files": true,
    "list_code_definition_names": true,
    "search_files": true,
    "update_todo_list": true,
    "switch_mode": true,
    "new_task": true,
    "ask_followup_question": true,
    
    "write_to_file": false,  // 상황에 따라 true로 변경 가능
    "apply_diff": false,     // 상황에 따라 true로 변경 가능
    "insert_content": false, // 상황에 따라 true로 변경 가능
    
    "execute_command": false,
    "use_mcp_tool": false,
    "browser_action": false
  }
}
```

### 3. 프로젝트별 설정

프로젝트 루트에 `.vscode/settings.json` 생성:

```json
{
  "bob.autoApprove": {
    "read_file": true,
    "list_files": true,
    "search_files": true,
    "update_todo_list": true,
    "write_to_file": true,  // 개발 환경에서는 true
    "apply_diff": true,     // 개발 환경에서는 true
    "execute_command": false // 항상 수동 승인
  }
}
```

---

## 📊 권장 설정 시나리오

### 시나리오 1: 새 프로젝트 개발
```json
{
  "bob.autoApprove": {
    "read_file": true,
    "write_to_file": true,
    "apply_diff": true,
    "insert_content": true,
    "execute_command": false
  }
}
```

### 시나리오 2: 기존 프로젝트 유지보수
```json
{
  "bob.autoApprove": {
    "read_file": true,
    "write_to_file": false,  // 신중한 검토 필요
    "apply_diff": false,     // 신중한 검토 필요
    "execute_command": false
  }
}
```

### 시나리오 3: 프로덕션 환경
```json
{
  "bob.autoApprove": {
    "read_file": true,
    "write_to_file": false,
    "apply_diff": false,
    "execute_command": false,
    "use_mcp_tool": false
  }
}
```

---

## 🎓 베스트 프랙티스

### 1. 점진적 자동화
- 처음에는 모든 작업을 수동 승인으로 시작
- 신뢰가 쌓이면 점진적으로 자동 승인 확대
- 문제 발생 시 즉시 수동 승인으로 전환

### 2. 정기적 검토
- 주기적으로 변경 사항 검토
- Git 커밋 전 전체 변경 사항 확인
- 중요한 변경은 코드 리뷰 진행

### 3. 백업 유지
- Git을 사용하여 모든 변경 사항 추적
- 중요한 작업 전 브랜치 생성
- 정기적으로 커밋하여 복구 지점 생성

### 4. 환경별 설정
- 개발 환경: 더 많은 자동 승인
- 스테이징 환경: 제한적 자동 승인
- 프로덕션 환경: 최소한의 자동 승인

---

## ⚡ 효율성 향상 팁

### 1. 읽기 작업 자동화
```json
{
  "bob.autoApprove": {
    "read_file": true,
    "list_files": true,
    "search_files": true
  }
}
```
**효과**: 컨텍스트 파악 시간 50% 단축

### 2. 문서 작업 자동화
```json
{
  "bob.autoApprove": {
    "write_to_file": true  // *.md, *.txt 파일만
  }
}
```
**효과**: 문서 작성 시간 70% 단축

### 3. Todo 추적 자동화
```json
{
  "bob.autoApprove": {
    "update_todo_list": true
  }
}
```
**효과**: 진행 상황 실시간 추적

---

## 🔐 보안 고려사항

### 절대 자동 승인하지 말아야 할 것:

1. **환경 변수 변경**
   - API 키, 비밀번호 등 민감 정보

2. **데이터베이스 작업**
   - DROP, DELETE, TRUNCATE 명령

3. **외부 API 호출**
   - 결제, 이메일 발송 등

4. **시스템 명령**
   - 파일 시스템 변경
   - 네트워크 설정 변경

5. **배포 작업**
   - 프로덕션 배포
   - 패키지 게시

---

## 📝 요약

| 작업 유형 | 자동 승인 | 이유 |
|---------|---------|------|
| Read | ✅ 권장 | 안전, 되돌릴 수 있음 |
| Todo | ✅ 권장 | 추적 목적, 영향 없음 |
| Mode | ✅ 권장 | 워크플로우 개선 |
| Write | ⚠️ 조건부 | 상황에 따라 다름 |
| Execute | ❌ 수동 | 시스템 변경, 위험 |
| Delete | ❌ 수동 | 되돌릴 수 없음 |
| Deploy | ❌ 수동 | 운영 영향 |

---

**권장 사항**: 개발 초기에는 보수적으로 시작하고, 신뢰가 쌓이면 점진적으로 자동화를 확대하세요.