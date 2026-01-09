///
/// 플래너 에이전트: 사용자 요청을 분석하여 필요한 데이터 추출
///
import { llm } from "../llm.js";

function extractJSON(text) {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.log("\nPlanner LLM Output :\n", text, "\n");
    throw new Error("Planner JSON 변환 실패");
  }
}

export async function planner(state) {
  console.log(`planner called`);
  console.log(`=== Planner Input ===`, state.messages);

  const input = state.messages[state.messages.length - 1];
  
  const prompt = `
사용자 병원 추천 요청을 이해하고 아래 형식의 JSON을 반환해줘.

**절대** 코드블록(\`\`\`) 이나 설명을 포함하지 말고  
오직 JSON **객체 하나만** 반환해.

출력 형식 (예시, 그대로 복사하지 말 것):
{
  "symptoms": "가슴 통증",
  "location": "서울 강남",
  "constraints": {
    "proximity": true,
    "weekend_service": true,
    "affordable_cost": true
  },
  "weights": {
    "distance": 0.5,
    "weekend": 0.3,
    "cost": 0.2
  }
}

- symptoms: 핵심 증상 요약
- location: 유저가 언급한 위치
- constraints: 유저가 선호한 조건을 true/false 로 표현
- weights: constraints를 반영하여 0~1 사이 값으로 가중치 추천
  (합이 1일 필요는 없음. 상대적 비율이면 충분함.)

입력:
${JSON.stringify(input)}
`;

  const res = await llm.invoke(prompt);
  let plan = extractJSON(res.content);

  // weights가 누락된 경우 constraints 기반 기본값 자동 생성
  if (!plan.weights) {
    plan.weights = {
      distance: plan.constraints?.proximity ? 0.5 : 0.3,
      weekend: plan.constraints?.weekend_service ? 0.3 : 0.1,
      cost: plan.constraints?.affordable_cost ? 0.3 : 0.2,
    };
  }

  console.log(`=== Planner Output ===`, plan);

  return { plan };
}
