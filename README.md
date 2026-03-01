# Delta Neutral Bot Dashboard

실시간 김치 프리미엄 모니터링/시뮬레이션 웹앱입니다.

## 실행 방법

사전 요구사항: Node.js 20+

1. 의존성 설치: `npm install`
2. `.env.local`에 API 주소 설정: `VITE_API_BASE_URL=http://43.201.172.91:4000` (운영) 또는 `http://localhost:4000` (로컬)
3. 실행: `npm run dev:all` (로컬 백엔드 포함) 또는 `npm run dev` (프론트만)

프론트엔드: `http://localhost:3000`
백엔드 API: `VITE_API_BASE_URL` 값에 따라 로컬 또는 원격(AWS) 사용

참고: 개발 서버는 `localhost`의 IPv4/IPv6(`127.0.0.1`/`::1`) 모두에서 접속 가능하도록 설정되어 있습니다.

## 데이터 소스

- 국내 시세: Bithumb `BTC_KRW`
- 해외 시세: Binance COIN-M `BTCUSD_PERP` (실패 시 Binance Spot `BTCUSDT` → Bybit → Kraken → OKX → CoinGecko 순차 폴백)
- 환율(USD/KRW): `open.er-api` (실패 시 `frankfurter` fallback)
- 환산율(USDT/KRW): Bithumb `USDT_KRW` (없으면 USD/KRW 사용)
- 김프 계산식: `((국내 BTC/KRW) / (해외 BTC/USD * 합성환율) - 1) * 100`

## 봉(캔들) 데이터

현재 Upbit 기반 프리미엄 캔들 기능은 비활성화되어 `410`을 반환합니다.

## 상위 거래량 + 펀딩비

- API: `GET /api/top-volume-funding?limit=10&side=SHORT|LONG&notionalUsdt=1000&fundingIntervalHours=8`
- 기능:
  - 선물 시장 기준 상위 거래량 코인(기본 10개) 조회
  - 각 코인의 현재 펀딩비율(8시간 기준) 조회
  - 입력 포지션 규모/방향/시간으로 예상 펀딩손익(USDT/KRW) 계산
- 데이터 소스: Binance Futures (실패 시 Bybit Linear fallback)

## 멀티 코인 김프

현재 Upbit 기반 멀티 코인 김프 기능은 비활성화되어 `410`을 반환합니다.

## 전략 백테스트

현재 Upbit 기반 프리미엄 백테스트 기능은 비활성화되어 `410`을 반환합니다.

## 바이낸스 실행 연결 (실거래 준비)

- 서버 엔진 상태: `GET /api/execution/engine/status`
- 서버 엔진 준비도 점검: `GET /api/execution/engine/readiness?mode=live|dryrun&marketType=coinm|usdm&symbol=...`
- 실행 키 상태: `GET /api/execution/credentials/status`
- 실행 키 저장(런타임): `POST /api/execution/credentials`
  - body 예시:
    - `{"apiKey":"...","apiSecret":"...","persist":true}`
- 실행 키 삭제(런타임): `POST /api/execution/credentials/clear`
- 서버 엔진 시작: `POST /api/execution/engine/start`
  - body 예시:
    - `{"marketType":"coinm","symbol":"BTC/USD:BTC","amount":1,"dryRun":true,"premiumBasis":"USD","entryThreshold":2.0,"exitThreshold":0.0}`
- 서버 엔진 정지: `POST /api/execution/engine/stop`
  - body 예시:
    - `{"reason":"manual-stop"}`
- 자동매매는 브라우저가 아니라 서버 엔진 루프에서 실행됩니다. UI는 시작/정지 및 모니터링 역할입니다.
- UI의 `바이낸스 라이브키 입력` 섹션에서 키를 직접 입력/적용할 수 있습니다.
- 런타임 키가 설정되면 환경변수 키보다 우선 사용됩니다(`source=runtime`).
- 엔진 상태는 `.runtime/execution-engine-state.json`에 저장되며, 서버 재시작 시 자동 복구(`desiredRunning=true`)를 시도합니다.
- 연결 상태: `GET /api/execution/binance/status?marketType=coinm|usdm`
- 포지션 조회: `GET /api/execution/binance/position?marketType=coinm|usdm&symbol=...`
- 체결 내역: `GET /api/execution/binance/fills?marketType=coinm|usdm&symbol=...&limit=50&since=...`
  - `since`는 Unix ms 또는 ISO datetime
  - 반환: 최근 체결 side/amount/price/fee/realizedPnl
- 주문 실행: `POST /api/execution/binance/order`
  - body 예시:
    - `{"marketType":"coinm","symbol":"BTC/USD:BTC","side":"sell","type":"market","amount":1,"dryRun":true}`
  - 실주문(`dryRun=false`)에서는 `Idempotency-Key` 헤더(또는 `idempotencyKey`)를 반드시 전달
  - 재시도 정책: `retries`(기본 env), `retryDelayMs`(기본 env)
- 안전 상태: `GET /api/execution/safety`
- 안전 상태 리셋: `POST /api/execution/safety/reset`
  - body 예시: `{"reason":"manual-reset"}`
- 실행 이벤트 로그: `GET /api/execution/events?limit=50&onlyFailures=true`
  - `coinm` 기본 심볼: `BTC/USD:BTC`
  - `usdm` 기본 심볼: `BTC/USDT:USDT`
- 기본 시장은 `coinm`, 기본 실행 모드는 `demo trading`(`BINANCE_TESTNET=true`)입니다.
- 안전 기본값:
  - `EXECUTION_ALLOW_LIVE_ORDERS=false` (메인넷 주문 기본 차단)
  - `EXECUTION_ALLOW_TESTNET_ORDERS=true`
  - 연속 실패가 임계값(`EXECUTION_FAILURE_SAFE_MODE_THRESHOLD`) 이상이면 safe mode로 주문 차단
- `POST /api/execution/engine/start`는 라이브 시작 시 아래를 사전검증하고 실패 시 즉시 차단합니다.
  - API 키 설정 여부
  - safe mode 여부
  - `EXECUTION_ALLOW_LIVE_ORDERS` / `EXECUTION_ALLOW_TESTNET_ORDERS`
  - Binance 연결/잔고 조회 가능 여부

## 데이터 로드 기록

- API: `GET /api/data-load-events?limit=50`
- 실행 전용 API: `GET /api/execution/events?limit=50`
- 파일: `logs/data-load-events.ndjson`
- 내용: 외부 API 재시도, 엔드포인트 성공/실패, 백테스트 실행 기록

## 환경 변수

- `VITE_API_BASE_URL` (권장): 프론트엔드 API 주소 고정값. 설정 시 해당 주소만 사용하며, 미설정 시 현재 origin 및 로컬 `:4000` 후보를 순차 사용
- `PORT` (선택): 백엔드 포트 (기본값 `4000`)
- `CANDLE_CACHE_TTL_MS` (선택): 봉 API 캐시 TTL (기본값 `20000`)
- `PREMIUM_HISTORY_MAX_POINTS` (선택): interval별 히스토리 최대 저장 봉 수 (기본값 `50000`)
- `FX_CACHE_TTL_MS` (선택): 환율 캐시 TTL (기본값 `300000`)
- `REQUEST_TIMEOUT_MS` (선택): 외부 API 요청 타임아웃 (기본값 `7000`)
- `REQUEST_RETRY_COUNT` (선택): 외부 API 재시도 횟수 (기본값 `1`)
- `REQUEST_RETRY_DELAY_MS` (선택): 재시도 기본 지연(ms, 기본값 `250`)
- `BINANCE_API_KEY` / `BINANCE_API_SECRET`: 바이낸스 API 키
- `BITHUMB_API_KEY` / `BITHUMB_API_SECRET`: 빗썸 API 키
- `BINANCE_EXECUTION_MARKET` (선택): `coinm` 또는 `usdm` (기본값 `coinm`)
- `BINANCE_TESTNET` (선택): `true|false` (기본값 `true`)
- `BINANCE_RECV_WINDOW_MS` (선택): 서명 요청 recvWindow (기본값 `5000`)
- `EXECUTION_ALERT_WEBHOOK_URL` (선택): 실행 실패 알림 웹훅 URL (Slack/Discord/Webhook 수신기)
- `EXECUTION_ALERT_TIMEOUT_MS` (선택): 알림 전송 타임아웃 (기본값 `5000`)
- `EXECUTION_ALERT_COOLDOWN_MS` (선택): 알림 최소 간격 (기본값 `60000`)
- `EXECUTION_FAILURE_SAFE_MODE_THRESHOLD` (선택): 연속 실패 시 safe mode 전환 임계값 (기본값 `3`)
- `EXECUTION_ALLOW_LIVE_ORDERS` (선택): 메인넷 주문 허용 (`true`일 때만 실주문 가능, 기본값 `false`)
- `EXECUTION_ALLOW_TESTNET_ORDERS` (선택): 테스트넷 주문 허용 (기본값 `true`)
- `EXECUTION_ORDER_RETRY_COUNT` (선택): 주문 재시도 횟수(추가 재시도 수, 기본값 `1`)
- `EXECUTION_ORDER_RETRY_DELAY_MS` (선택): 주문 재시도 지연(ms, 기본값 `400`)
- `EXECUTION_IDEMPOTENCY_TTL_MS` (선택): 주문 아이템포턴시 키 보관 시간(ms, 기본값 `86400000`)
- `EXECUTION_IDEMPOTENCY_MAX_ENTRIES` (선택): 아이템포턴시 저장 최대 개수 (기본값 `2000`)
- `EXECUTION_ENGINE_POLL_INTERVAL_MS` (선택): 서버 자동매매 엔진 루프 주기(ms, 기본값 `3000`)
- `EXECUTION_ENGINE_ORDER_COOLDOWN_MS` (선택): 서버 자동매매 엔진 주문 최소 간격(ms, 기본값 `5000`)
- `EXECUTION_ENGINE_AUTO_START` (선택): 서버 시작 시 자동으로 엔진 시작 (`true|false`, 기본값 `false`)
- `EXECUTION_ENGINE_AUTO_DRY_RUN` (선택): 자동 시작 시 드라이런 여부 (기본값 `true`)
- `EXECUTION_ENGINE_AUTO_MARKET_TYPE` (선택): 자동 시작 시장 (`coinm|usdm`, 기본값 `BINANCE_EXECUTION_MARKET`)
- `EXECUTION_ENGINE_AUTO_SYMBOL` (선택): 자동 시작 심볼 (미설정 시 시장 기본 심볼 사용)
- `EXECUTION_ENGINE_AUTO_AMOUNT` (선택): 자동 시작 주문 수량 (기본값 `1`)
- `EXECUTION_ENGINE_AUTO_PREMIUM_BASIS` (선택): 자동 시작 프리미엄 기준 (`USD|USDT`, 기본값 `USD`)
- `EXECUTION_ENGINE_AUTO_ENTRY_THRESHOLD` (선택): 자동 시작 진입 임계값 (기본값 `2.0`)
- `EXECUTION_ENGINE_AUTO_EXIT_THRESHOLD` (선택): 자동 시작 청산 임계값 (기본값 `0.0`)
- `EXECUTION_ENGINE_LEADER_REPLICA_ID` (선택): 멀티 레플리카 환경에서 엔진 시작을 허용할 replica id (`RAILWAY_REPLICA_ID`와 일치할 때만 시작)
- `NIXPACKS_NODE_VERSION` (권장): Railway Node 버전 고정 (`20` 이상 권장)
- `EXECUTION_ADMIN_TOKEN` (선택): 실행 API 관리자 토큰. 설정 시 `/api/execution/*` 호출에 `x-admin-token` 또는 `Authorization: Bearer ...` 지원
- `EXECUTION_AUTH_USERNAME` (선택): 운영 로그인 계정명 (기본값 `admin`)
- `EXECUTION_AUTH_PASSWORD` (권장): 운영 로그인 비밀번호. 설정 시 `/api/execution/*`에 로그인 세션 인증 사용 가능
- `EXECUTION_AUTH_SESSION_TTL_MS` (선택): 로그인 세션 TTL(ms, 기본값 `43200000` = 12시간)
- `EXECUTION_AUTH_COOKIE_SECURE` (선택): 인증 쿠키 `Secure` 강제 여부 (`true|false`, 미설정 시 `x-forwarded-proto=https`면 자동 적용)

## 점검 스크립트

- 외부/로컬 API 연결 점검: `npm run test:api`

## 문제 해결

- 수치가 갱신되지 않으면 `npm run dev:all`로 백엔드가 함께 실행되는지 먼저 확인하세요.
- 봉 데이터 연결 실패가 간헐적으로 뜨면 `npm run test:api`로 Binance/Bybit 연결 상태를 함께 점검하세요.
- 화면 상단 상태가 `데이터 연결 오류`이면 `logs/data-load-events.ndjson` 또는 `GET /api/data-load-events`를 확인하세요.
- 운영 자동매매에서는 Railway 인스턴스를 `1개`로 고정하세요(다중 인스턴스는 중복 주문 위험).
- 공용 URL에서 운영할 때는 별도 인증(예: Cloudflare Access/사설망)을 적용하세요. 실행 키/자동매매 제어 API는 민감 엔드포인트입니다.
- UI에서는 `운영 로그인`으로 인증해야 실행 API 조회/제어가 가능합니다. (`EXECUTION_ADMIN_TOKEN`은 헤더 기반 API 호출용)
- Railway 리전에 따라 Binance가 `451 restricted location`으로 차단될 수 있습니다. Binance 자동매매는 아시아 리전(예: `asia-southeast1`)에서 먼저 readiness 점검 후 사용하세요.
- Binance `-2015` 오류는 IP 화이트리스트, API 권한, 선택 시장(COIN-M/USDT-M) 불일치 가능성이 있습니다.
- 화면의 API Base가 `localhost`로 표시되면 프론트가 로컬 백엔드를 호출 중이니 `VITE_API_BASE_URL`을 확인하세요.
- 메인넷 실주문 전환 체크리스트:
  1. `BINANCE_TESTNET=false`
  2. `BINANCE_API_KEY`, `BINANCE_API_SECRET` 설정
  3. `EXECUTION_ALLOW_LIVE_ORDERS=true`
  4. `GET /api/execution/engine/readiness?mode=live&marketType=...&symbol=...`가 `ready=true`인지 확인
