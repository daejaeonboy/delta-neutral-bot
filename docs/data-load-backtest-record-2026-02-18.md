# 데이터/백테스트/실행연동 작업 기록 (2026-02-18)

## 1) 요청 배경
- 프론트에서 데이터가 계속 로딩 상태로 멈춤
- 백테스트에서 거래가 거의/전혀 발생하지 않음
- 전략 의미를 `2%에서 판매, 0%에서 매수`로 맞추고 싶음
- 실거래 대비로 바이낸스 연동, 체결 내역 확인, 실패 알림/안전장치 필요

## 2) 적용한 주요 수정

### A. 백테스트/차트/전략 표시 보정
- 백테스트/라이브 전략 기본값을 `entryThreshold=2.0`, `exitThreshold=0.0`로 조정
- 프리미엄 기준을 USD 기준 흐름에 맞춰 정리
- UI 용어를 `진입/청산`에서 사용자 요청 의미에 맞춰 `판매/매수`로 정리
  - 앱 상태/로그 문구
  - 백테스트 패널 라벨/테이블/툴팁 문구

### B. 실행 연동 API 확장
- 바이낸스 연결 상태 조회:
  - `GET /api/execution/binance/status?marketType=coinm|usdm`
- 포지션 조회:
  - `GET /api/execution/binance/position?marketType=coinm|usdm&symbol=...`
- 체결 내역 조회:
  - `GET /api/execution/binance/fills?marketType=coinm|usdm&symbol=...&limit=...&since=...`
- 실행 이벤트 조회:
  - `GET /api/execution/events?limit=...&onlyFailures=true`

### C. 실패 안전장치/알림
- 실행 실패 연속 카운터 및 safe mode 상태 추적 추가
- 안전 상태 조회/리셋 API 추가
  - `GET /api/execution/safety`
  - `POST /api/execution/safety/reset`
- 실패 알림 웹훅 추가
  - `EXECUTION_ALERT_WEBHOOK_URL`
  - `EXECUTION_ALERT_TIMEOUT_MS`
  - `EXECUTION_ALERT_COOLDOWN_MS`
  - `EXECUTION_FAILURE_SAFE_MODE_THRESHOLD`

### D. 주문 실행 API 구현 (아이템포턴시 + 재시도)
- 주문 API 추가:
  - `POST /api/execution/binance/order`
- 지원 요소:
  - `market/limit`, `buy/sell`, `reduceOnly`, `positionSide`, `retries`, `retryDelayMs`
  - `dryRun` 모드
  - `Idempotency-Key`(헤더/바디) 기반 중복 방지 및 replay 응답
- 안전 기본값:
  - `EXECUTION_ALLOW_LIVE_ORDERS=false` (메인넷 실주문 기본 차단)
  - `EXECUTION_ALLOW_TESTNET_ORDERS=true`

### E. CCXT 선물 테스트넷 정책 변경 대응
- 기존 `setSandboxMode(true)` 방식은 Binance Futures에서 더 이상 지원되지 않음
- `BINANCE_TESTNET=true`일 때 `enableDemoTrading(true)` 사용하도록 전환

## 3) 문서/테스트 보강
- README에 실행/주문/안전 API 및 환경변수 추가 반영
- `scripts/api_connectivity_test.js`에 아래 항목 추가:
  - 실행 안전상태 조회
  - 드라이런 주문
  - 아이템포턴시 replay 확인
  - 안전상태 리셋

## 4) 검증 결과
- `node --check server.js`: 통과
- `npm run build`: 통과
- `npm run test:api`: 주요 공개 API/로컬 API 정상 확인
- 추가 수동 검증:
  - `BINANCE_TESTNET=true`: demo 엔드포인트 기준 키 권한 오류 확인 가능
  - `BINANCE_TESTNET=false`: 연결 상태 조회 정상 (`connected=true`)
  - 드라이런 주문 정상
  - 실주문 차단(`EXECUTION_ALLOW_LIVE_ORDERS=false`) 정상
  - 실주문 허용 후 잔고 부족 실패(`Margin is insufficient`) 및 실패 카운트 반영 확인
  - 안전상태 리셋 정상

## 5) 현재 상태(요약)
- 기능 구현 자체는 완료됨:
  - 데이터/백테스트/실행 이벤트/체결내역/주문 API/안전장치
- 실제 주문 성공을 위한 남은 조건:
  - 실행 모드에 맞는 키 권한 정합성
  - COIN-M 계정 담보(잔고) 확보

## 6) 다음 재개 시 체크리스트
1. 실행 모드 결정 (`BINANCE_TESTNET=true` demo vs `false` mainnet)
2. 해당 모드에 맞는 API 키/권한 확인
3. `GET /api/execution/binance/status`에서 `connected=true` 확인
4. `POST /api/execution/binance/order`로 `dryRun=true` 검증
5. 소액 실주문 1회 후 `fills/events/safety` 확인
