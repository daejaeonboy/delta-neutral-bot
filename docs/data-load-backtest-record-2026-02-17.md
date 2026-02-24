# 데이터 로드 장애 분석 및 조치 기록 (2026-02-17)

## 1) 증상
- 간헐적으로 프론트에서 "데이터를 불러오지 못함" 상태 발생
- 특히 멀티코인 김프/외부 API 의존 구간에서 단일 소스 장애 시 전체 실패 가능

## 2) 원인 분석
- 프론트 API 호출이 단일 base URL 실패 시 복구 경로가 부족했음
- `fetchMultiPremium`은 `AbortSignal.timeout` 직접 사용으로 브라우저/환경 호환 리스크가 있었고 에러 메시지 표준화가 약했음
- `/api/multi-premium`은 OKX Spot 단일 의존이라 OKX 응답 실패 시 바로 500으로 전파됨
- 데이터 로드 실패 원인을 추적할 서버 측 영속 로그가 없어 사후 분석이 어려웠음

## 3) 적용한 수정
- 프론트 API 클라이언트 개선
  - API base URL 자동 폴백: `same-origin -> localhost:4000 -> 배포 API`
  - 공통 타임아웃/응답 파싱/에러 메시지 일원화
  - `fetchMultiPremium`도 공통 fetch 계층으로 통합
- 백엔드 안정성 개선
  - 외부 API 호출 재시도 로직 추가 (`REQUEST_RETRY_COUNT`, `REQUEST_RETRY_DELAY_MS`)
  - `/api/multi-premium` 글로벌 시세 소스 폴백: `OKX -> Binance -> Bybit`
- 기록(로그) 기능 추가
  - 파일 로그: `logs/data-load-events.ndjson`
  - 조회 API: `GET /api/data-load-events?limit=50`
  - 성공/실패/재시도/백테스트 이벤트 기록
- 수익성 검증 기능 추가
  - 백엔드: `GET /api/backtest/premium`
  - 프론트: 백테스트 패널(파라미터 입력, 총손익/수익률/승률/MDD/체결 로그 표시)

## 4) 검증 결과
- 실행: `npm run test:api`
- 결과:
  - 실시간/봉/상위거래량 API 정상
  - 멀티코인 API 정상
  - 백테스트 API 정상
  - 데이터 로드 이벤트 조회 API 정상

## 5) 참고
- 본 백테스트는 프리미엄 캔들 기반 단순 규칙(진입/청산 임계값) 시뮬레이션이며, 실제 체결/슬리피지/시장충격/자금조달 제약을 완전 반영하지 않습니다.
