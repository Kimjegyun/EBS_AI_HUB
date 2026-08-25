# Research: 재물조사 협업 서버 기술 결정

## 실시간 동기화 방식

**Decision**: Server-Sent Events (SSE)
**Rationale**: 조사 결과 변경 이벤트는 서버→클라이언트 단방향으로 충분하다. SSE는 HTTP 위에서 동작해 별도 프로토콜 업그레이드 없이 기존 Express + 프록시 구성에서 바로 사용 가능하다. WebSocket 대비 구현·운영 복잡도가 낮다.
**Alternatives considered**: 
- WebSocket: 양방향 불필요, 프록시 설정 추가 필요
- HTTP 폴링(5초): 구현 단순하지만 서버 부하 높고 SSE 대비 지연 큼

## 서버 사이드 엑셀 파싱

**Decision**: `xlsx` 패키지 (이미 클라이언트에 설치됨, 서버에도 추가)
**Rationale**: 기존 클라이언트 코드가 xlsx를 사용하므로 API 일관성 유지. multer로 파일 수신 후 메모리 버퍼에서 직접 파싱.
**Alternatives considered**: exceljs: 기능 풍부하지만 불필요한 오버헤드

## DB 스키마 전략

**Decision**: 기존 `aihub.db` SQLite 파일에 테이블 3개 추가 (inventory_datasets, inventory_sessions, inventory_sync_log)
**Rationale**: 별도 DB 파일 없이 기존 initDatabase() 패턴을 그대로 확장하면 운영 단순화.
**Alternatives considered**: 별도 inventory.db: 독립적이지만 백업/관리 포인트 분산

## 오프라인 동기화

**Decision**: IndexedDB `sync_queue` 스토어 + 주기적 재시도 (30초 간격)
**Rationale**: 서버 연결 불가 시 로컬에 저장하고, 서버 복구 감지 후 큐 항목을 순서대로 전송. 단순 FIFO 큐로 구현.
