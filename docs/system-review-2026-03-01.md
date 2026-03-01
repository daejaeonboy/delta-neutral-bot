# System Review 2026-03-01

## Current Architecture
- Frontend: Vite React (`App.tsx`)
- Backend: Express monolith (`server.js`)
- API routing: `VITE_API_BASE_URL` → `/api/*`
- Runtime state: `.runtime/*` (credentials + engine state)

## Market Data Flow
- 국내 BTC/KRW: Bithumb `BTC_KRW`
- 해외 BTC/USD: Binance COIN-M `BTCUSD_PERP` (fallback: Binance Spot → Bybit → Kraken → OKX → CoinGecko)
- USD/KRW: open.er-api (fallback: frankfurter)
- USDT/KRW: Bithumb `USDT_KRW` (없으면 USD/KRW 사용)
- 김프 계산: `국내 BTC/KRW` vs `해외 BTC/USD * 합성환율`

## Execution Engine Flow
- 빗썸: BTC 현물 주문
- 바이낸스: BTC 선물 주문 (COIN-M 또는 USDT-M)
- 런타임 키는 `.runtime/execution-credentials.json`에 저장되며 `.env`보다 우선 적용
- 엔진 상태는 `.runtime/execution-engine-state.json`에 저장되어 재시작 시 복구 가능

## Known Failure Points
- 프론트가 로컬 API를 호출하면 AWS 서버와 불일치로 404/500 발생
- Binance `-2015`는 IP 화이트리스트, 권한, 시장(COIN-M/USDT-M) 불일치가 원인일 수 있음
- AWS EIP를 사용해도 NAT/ALB 경유 시 외부 egress IP가 달라질 수 있음
- Upbit 기반 프리미엄/백테스트/멀티김프 기능은 비활성화됨(410)

## Fixes Applied (This Round)
- 설정 화면에 API Base 표시 및 로컬 경고 추가
- 바이낸스/빗썸 섹션에 런타임 키 우선 적용 안내 추가
- README 데이터 소스/비활성화 기능/운영 팁 업데이트
- AWS 엔드포인트 기록 유지: `docs/aws-backend.md`

## Ops Checklist
- `VITE_API_BASE_URL`이 AWS 주소로 고정되어 있는지 확인
- Binance API에 실제 egress IP가 화이트리스트되어 있는지 확인
- 선택 시장(COIN-M/USDT-M)과 API 권한이 일치하는지 확인
- 빗썸 API 키가 설정되어 있는지 확인
- `GET /api/execution/engine/readiness`로 실행 준비도 점검
