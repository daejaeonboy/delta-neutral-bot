import { StrategyRisk } from './types';

export const INITIAL_CAPITAL = 10000000; // 10 Million KRW
export const DEFAULT_EXCHANGE_RATE = 1440; // KRW per USD (fallback baseline)

// Theory text provided by the user, used for AI Context
export const STRATEGY_THEORY_CONTEXT = `
1. 기본 개념: 코인 가격 방향성 리스크 제거 + 가격 괴리(김프) 수렴에서 수익 확보가 핵심.
구조: 국내 거래소 가격 − 해외 거래소 가격 = 김치프리미엄. 이 괴리가 벌어질 때 진입, 괴리가 줄어들 때 수익 실현.
2. 포지션 구성 원리 (델타 중립):
- 국내: 현물 매수
- 해외: 선물 숏 (동일 수량)
- 코인 가격 변동 거의 상쇄됨. 남는 변수: 김프 변화, 펀딩비, 환율/테더 괴리.
3. 진입 조건 (평균회귀 가정):
- 김프는 일정 범위 내에서 움직이다가 수렴하는 경향이 있음.
- 김프 과거 평균 대비 과확장 시 진입 (예: 3% 이상). 기대 차익 > 거래 비용일 때만 진입.
4. 청산 전략 (구간 청산 권장):
- 김프는 0까지 정확히 수렴 안 할 때 많음.
- 단계적 청산 추천 (예: 김프 3% 진입 -> 1.5% 일부 청산 -> 0% 완전 청산).
5. 기대 수익 구조:
- 김프 수렴 차익 (핵심 수익원).
- 펀딩비 수익 (조건부, 숏 포지션 시 롱이 많으면 수취 가능).
- 베이시스 차익.
6. 주요 리스크 요소:
- 거래소 리스크 (파산, 출금 제한 등).
- 펀딩비 역전 (숏 비용 발생 가능).
- 환율/테더 괴리 (KRW ↔ USDT 변동 영향).
- 실행 리스크 (슬리피지, 전송 지연).
`;

export const RISKS: StrategyRisk[] = [
  { id: '1', name: '펀딩비 역전', level: 'MEDIUM', description: '하락장이 지속되거나 숏 포지션이 많아지면 펀딩비를 지불해야 할 수 있음.' },
  { id: '2', name: '거래소/출금 리스크', level: 'LOW', description: '극심한 변동성 발생 시 거래소 입출금이 지연되거나 제한될 위험.' },
  { id: '3', name: '실행 슬리피지', level: 'MEDIUM', description: '국내 매수와 해외 매도 사이의 시간차로 인해 목표한 김프에 진입하지 못할 위험.' },
  { id: '4', name: '환율 변동성', level: 'HIGH', description: '원달러 환율의 급격한 변동이 김프 차익을 상쇄하거나 손실을 유발할 수 있음.' },
];
