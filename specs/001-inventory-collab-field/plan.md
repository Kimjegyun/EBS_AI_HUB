# Implementation Plan: 재물조사 다중 사용자 협업 및 현장 효율화

**Branch**: `001-inventory-collab-field` | **Date**: 2025-07-30 | **Spec**: [spec.md](./spec.md)

## Summary

기존 IndexedDB 전용 재물조사 앱을 **사내 로컬 서버(Node.js + SQLite) 기반 다중 사용자 협업** 구조로 확장한다.
Supabase 없이 동작하며, 기존 로컬 동작은 하위 호환 유지한다. 연속 스캔 원터치 확인 모드와 관리자 통합 대시보드를 함께 추가한다.

## Technical Context

**Language/Version**: TypeScript 5.3 (서버), TypeScript 6.0 (클라이언트, React 19)
**Primary Dependencies (추가)**: multer (파일 업로드), xlsx (서버 사이드 엑셀 파싱), uuid (이미 설치됨)
**Storage**: SQLite (기존 `data/aihub.db` 확장 — 테이블 3개 추가)
**Testing**: 수동 검증 (quickstart.md 기반)
**Target Platform**: 사내 LAN, PC/모바일 브라우저 (Chrome/Safari)
**Project Type**: web-app (기존 포털 셸 플러그인 확장)
**Performance Goals**: 동기화 폴링 5초 간격, 조사 저장 응답 500ms 이내
**Constraints**: 사진 데이터는 서버 동기화 제외(IndexedDB 로컬만), 서버 오프라인 시 로컬 동작 보장
**Scale/Scope**: 10~50명 동시 사용, 1개 조사 세션당 최대 5,000건

## Constitution Check

- [x] **Plugin-First**: 기존 `inventoryApp.tsx` 플러그인 구조 유지. 서버 API는 별도 `inventoryApiClient.ts` 레이어 추가.
- [x] **Simplicity**: multer, xlsx(서버) 2개만 추가. SSE 방식으로 WebSocket 복잡성 회피.
- [x] **User-Scoped Storage**: 기존 `getUserScopedItem` 유지. 서버 API는 JWT 토큰 기반 사용자 식별.
- [x] **Type Safety**: 모든 신규 코드 TypeScript strict 모드.
- [x] **한국어 UI**: 모든 신규 UI 텍스트 한국어.

## Project Structure

### Documentation (this feature)

```text
specs/001-inventory-collab-field/
├── plan.md              # This file
├── research.md          # 기술 결정 근거
├── data-model.md        # DB 스키마 + 클라이언트 타입
├── contracts/
│   ├── inventory-api.md # REST API 명세
│   └── sse-events.md    # SSE 이벤트 명세
└── tasks.md             # Phase별 태스크 목록
```

### Source Code — 변경/추가 파일

```text
ai-hub-web/server/src/
├── config/
│   └── database.ts                        ← inventory 테이블 3개 추가 (MODIFY)
├── routes/
│   └── inventory.routes.ts                ← 신규 (NEW)
├── controllers/
│   └── inventory.controller.ts            ← 신규 (NEW)
└── services/
    └── inventory.service.ts               ← 신규 (NEW)
└── index.ts                               ← inventory 라우트 등록 (MODIFY)

ai-hub-web/src/apps/inventory/
├── inventoryApiClient.ts                  ← 신규: 서버 API 래퍼 (NEW)
├── syncService.ts                         ← 재작성: 로컬+서버 하이브리드 (MODIFY)
├── datasetService.ts                      ← 확장: 서버 데이터셋 지원 (MODIFY)
├── types.ts                               ← SyncQueueItem 타입 추가 (MODIFY)
└── InventoryApp.tsx                       ← 연속스캔 모드 + 대시보드 탭 (MODIFY)
```

## Complexity Tracking

| 항목 | 이유 | 단순 대안이 불충분한 이유 |
|------|------|--------------------------|
| SSE 실시간 동기화 | 다중 사용자 간 5초 이내 반영 요구사항(SC-001) | 폴링만으로는 서버 부하 집중, SSE가 단방향 스트리밍에 최적 |
| SyncQueue 오프라인 큐 | FR-009 서버 오프라인 시 로컬 저장 후 자동 재시도 | 단순 재시도 없이는 데이터 유실 위험 |
