# UI/운영 후속 작업 기록 (2026-02-19)

## 1) 목표
- Railway 상시 운영(24시간) 가능한 자동매매 서버로 정리
- 운영 보안 강화(로그인/로그아웃 기반 인증)
- 프론트에서 실행 상태를 안전하게 제어 가능하도록 정리

## 2) 서버 인증 구조 변경
- 실행 API 보호 미들웨어 적용
  - `server.js`의 `/api/execution/*`에 인증 필요
- 인증 API 추가
  - `GET /api/auth/session`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
- 세션 쿠키 기반 인증 추가(`httpOnly`, `sameSite=lax`, secure 조건 처리)
- 엔진 내부 주문 호출 인증 보완
  - 토큰이 없는 로그인 전용 모드에서도 내부 주문 호출이 인증 통과하도록 처리

## 3) 프론트 인증/화면 변경
- 로그인 전 대시보드 전체 차단
  - 로그인 화면만 노출
- 로그인 후에만 대시보드 렌더링
- 자동매매 설정 카드 내 로그인 섹션 제거
- 상단 바에 최소 기능만 유지
  - 로그인 사용자 표시
  - 로그아웃 버튼
- 운영 토큰 입력 UI 제거

## 4) 배포/루트 경로 관련 정리
- Railway 빌드 명령 정리
  - 프론트 `dist` 빌드 포함
- `/` 접근 시 SPA 정적 파일 정상 서빙되도록 서버 보완
- `Cannot GET /` 이슈 재발 방지 적용

## 5) 오류 메시지 개선
- 실행 상태 API 실패 시 과도한 JSON 원문 노출을 줄이도록 프론트 에러 파싱 개선
- Binance 인증 코드 가독성 문구 추가
  - `-2015`: 권한/IP/시크릿 점검 안내
  - `-2008`: API Key ID 오류(잘못된 키/삭제된 키) 안내

## 6) 운영 환경 상태(현재)
- 최신 성공 배포: `35f3c4db-dc0e-472e-9593-714d0553d67a`
- 인증 모드
  - `EXECUTION_ADMIN_TOKEN`: 제거됨
  - `EXECUTION_AUTH_USERNAME/PASSWORD`: 설정됨
  - 결과: `tokenEnabled=false`, `passwordEnabled=true`
- 주문 안전 스위치
  - `EXECUTION_ALLOW_LIVE_ORDERS=true`
  - `BINANCE_TESTNET=false`

## 7) 현재 블로커
- Binance 실행 연결 실패
  - 확인된 오류: `-2008 Invalid Api-Key ID`
  - 의미: 현재 입력된 API 키 자체가 유효하지 않거나(오타/삭제/다른 키) 대상 환경과 불일치
- 최신 배포 후 서버 재기동 과정에서 런타임 키가 비어 있는 상태도 확인됨
  - 현재 상태 API에서 `configured=false` 확인됨

## 8) 다음 실행 계획
1. UI에서 Binance API Key/Secret 재입력
2. `실행 준비도 점검`에서 `ready=true` 확인
3. 드라이런으로 엔진 시작/정지 및 이벤트 로그 확인
4. 소액으로 실주문 전환 후 모니터링

## 9) 주요 변경 파일
- `server.js`
- `App.tsx`
- `services/marketService.ts`
- `types.ts`
- `README.md`

