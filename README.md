# Delta Neutral Bot Dashboard

실시간 김치 프리미엄 모니터링/시뮬레이션 웹앱입니다.

## 실행 방법

사전 요구사항: Node.js 18+

1. 의존성 설치
   `npm install`
2. Gemini 키 설정 (`.env.local`)
   `GEMINI_API_KEY=...`
3. 프론트+백엔드 동시 실행
   `npm run dev:all`

프론트엔드: `http://localhost:3000`  
백엔드 API: `http://localhost:4000`

참고: 개발 서버는 `localhost`의 IPv4/IPv6(`127.0.0.1`/`::1`) 모두에서 접속 가능하도록 설정되어 있습니다.

## 데이터 소스

- 국내 시세: Upbit `KRW-BTC`
- 해외 시세: Binance `BTCUSDT` (실패 시 Bybit `BTCUSDT` fallback)
- 환율(USD/KRW): `open.er-api` (실패 시 `frankfurter` fallback)
- 환산율(KRW/USDT): Upbit `KRW-USDT`
- 김프 계산식: `((국내 BTC/KRW) / (해외 BTC/USDT * KRW/USDT) - 1) * 100`

## 봉(캔들) 데이터

- 지원 봉: `1분봉`, `10분봉`, `30분봉`, `1일봉`
- API: `GET /api/premium-candles?interval=1m|10m|30m|1d&limit=...`
- 봉 계산:
  - 국내 BTC/KRW 캔들: Upbit
  - 해외 BTC/USDT 캔들: Binance
  - 환산 KRW/USDT 캔들: Upbit
  - 각 봉의 O/H/L/C 프리미엄을 계산해 캔들화
- 참고: Binance는 `10m` 원본 봉이 없어 `5m`를 서버에서 10분으로 집계합니다.

## 상위 거래량 + 펀딩비

- API: `GET /api/top-volume-funding?limit=10&side=SHORT|LONG&notionalUsdt=1000&fundingIntervalHours=8`
- 기능:
  - 선물 시장 기준 상위 거래량 코인(기본 10개) 조회
  - 각 코인의 현재 펀딩비율(8시간 기준) 조회
  - 입력 포지션 규모/방향/시간으로 예상 펀딩손익(USDT/KRW) 계산
- 데이터 소스: Binance Futures (실패 시 Bybit Linear fallback)

## 환경 변수

- `VITE_API_BASE_URL` (선택): 프론트엔드가 호출할 API 주소 (기본값 `http://localhost:4000`)
- `PORT` (선택): 백엔드 포트 (기본값 `4000`)
- `CANDLE_CACHE_TTL_MS` (선택): 봉 API 캐시 TTL (기본값 `20000`)
- `FX_CACHE_TTL_MS` (선택): 환율 캐시 TTL (기본값 `300000`)

## 점검 스크립트

- 외부/로컬 API 연결 점검: `npm run test:api`

## 문제 해결

- 수치가 갱신되지 않으면 `npm run dev:all`로 백엔드가 함께 실행되는지 먼저 확인하세요.
- 봉 데이터 연결 실패가 간헐적으로 뜨면 `npm run test:api`로 Binance/Bybit 연결 상태를 함께 점검하세요.
- 화면 상단 상태가 `데이터 연결 오류`이면 백엔드 로그(`server.js`)를 확인하세요.
