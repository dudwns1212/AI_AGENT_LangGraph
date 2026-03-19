///
/// 플래너 에이전트: 사용자 요청을 분석하여 필요한 데이터 추출
///
import { llm } from "../llm.js";
import { DEPT_CODE } from "../tools/deptMapper.js";
import { HP_TYPE_CODE } from "../tools/hpTypeMapper.js";

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
// 검색을 우선 결정(첫 검색인지, 재검색인지, 필터링인지)
function checkNeedsResearch(newPlan, searchedparams) {
  // 첫 검색
  if(!searchedparams) return true;
  // 재검색이 필요(search1API)
  if(newPlan.location !== searchedparams.location) return true;
  if(newPlan.div !== searchedparams.div) return true;
  if(newPlan.symptoms !== searchedparams.symptoms) return true;
  if((newPlan.distance || 0) > (searchedparams.distance || 0)) return true;
  // 재검색 x, 필터링 o
  return false;
}

export async function planner(state) {
  console.log(`planner 시~~~~~작!`);
  
  const prompt = `
당신은 병원 검색 조건을 분석하는 플래너입니다.
이전 조건을 기반으로 사용자의 새 요청을 반영해 조건을 업데이트하세요.

[이전 검색 조건]
${state.prevPlan ? JSON.stringify(state.prevPlan, null, 2) : '없음 (최초 요청)'}

[사용자 요청]
${state.userMessage}

[출력 형식 - JSON만 출력]
{
  "symptoms": "사용자의 증상에 따른 진료과 코드 또는 null",
  "div": "병원 종류 코드 또는 null",
  "location": "검색 기준 주소 문자열",
  "weekend": false,
  "emergency": false,
  "distanceRequired": false,
  "distance": 3000,
  "must": [],
  "prefer": []
}

[참고 코드표]
- symptoms: ${JSON.stringify(DEPT_CODE)}
- div: ${JSON.stringify(HP_TYPE_CODE)}
- distance: 미터 단위 (5km → 5000), 기본값 3000

[규칙]
1. 이전 조건이 있으면 변경된 필드만 수정, 나머지는 이전 값 유지
2. 사용자가 명시적으로 바꾼 것만 수정
`;
  
  const res = await llm.invoke(prompt);
  let plan = extractJSON(res.content);
  
  console.log(`Planner 결과 =>`, plan);

  console.log(`searchedParams: `, state.searchedparams)
  console.log(`prevPlan: `, state.prevPlan)

  const needsResearch = checkNeedsResearch(plan, state.searchedParams);
  console.log(`needsResearch =>`, needsResearch)

  return { plan, needsResearch, step: 'planned' };
}
// LLM으로 사용자의 요청에 따라 Plan 객체를 생성