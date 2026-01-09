///
/// 수퍼바이저 라우터 함수: 상태에 따라 다음 노드 결정
///
import { llm } from "../llm.js";
import { END } from "@langchain/langgraph";

export async function supervisorRoute(state) {
    console.log(`supervisorRoute called`);
    console.log(`--- Supervisor State ---`);
    console.log(JSON.stringify(state, null, 2));

    const summary = JSON.stringify({
        plan: state.plan,
        hospitals: state.hospitals,
        filtered: state.filtered,
        finalAnswer: state.finalAnswer
    }, null, 2);

    const prompt = `
현재 대화 및 분석 상태를 보고 다음 중 하나를 선택하세요:

- "planner"        : 사용자 요청을 분석하여 데이터 추출이 필요할 때
- "searcher"       : 병원을 조회해야 할 때
- "filter"         : 병원을 기준에 맞게 걸러야 할 때
- "formatter"      : 사용자에게 최종 문장을 정리할 때
- "end"            : 모든 작업이 끝났을 때

반환 형식:
{"next": "planner"}  // 예시

현재 상태:
${summary}
`;

    const res = await llm.invoke(prompt);

    let decision;
    try { decision = JSON.parse(res.content).next; }
    catch { return "planner"; }

    console.log(`Supervisor next decision: ${decision}`);

    if (decision === "end") return END;
    return decision;
}
