import { GoogleGenAI } from "@google/genai";
import { STRATEGY_THEORY_CONTEXT } from "../constants";

export const analyzeMarketSituation = async (
  premium: number,
  trend: 'WIDENING' | 'NARROWING' | 'STABLE',
  fundingRate: number
): Promise<string> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return "오류: API 키가 환경 변수에 설정되지 않았습니다.";
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
      현재 시장 데이터:
      - 김치 프리미엄: ${premium.toFixed(2)}%
      - 프리미엄 추세: ${trend} (WIDENING: 확대중, NARROWING: 축소중, STABLE: 횡보)
      - 예상 펀딩비 (8시간): ${fundingRate}%

      제공된 전략 이론을 바탕으로 분석해주세요:
      "${STRATEGY_THEORY_CONTEXT}"

      당신은 시니어 암호화폐 퀀트 트레이더입니다.
      1. 현재 시점이 진입, 홀딩, 또는 청산에 적합한지 분석하세요.
      2. 현재 데이터와 관련된 구체적인 리스크를 언급하세요.
      3. 100단어 이내로 간결하게 작성하세요.
      4. 반드시 **한국어**로 조언을 작성하세요.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "분석을 생성할 수 없습니다.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "분석 서비스를 일시적으로 사용할 수 없습니다.";
  }
};
