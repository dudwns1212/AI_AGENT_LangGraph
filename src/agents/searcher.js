///
/// 검색 에이전트: 사용자가 요청한 데이터에 따라 병원/의사/약국 검색 및 결과를 상태에 저장
///
import { llm } from "../llm.js";
import { TOOL_REGISTRY } from "../tools/index.js";

export async function searcher(state) {
    console.log(`searcher started`);
    console.log(`=== Searcher Plan ===`, state.plan);

    const { symptoms, location, constraints, weights } = state.plan;

    let context = {
        hospitals: [],   // 병원 검색 결과 누적
        doctors: [],     // 의사 검색 결과 누적
        pharmacies: []   // 약국 검색 결과 누적
    };

    while (true) {
        const toolDescriptions = Object.entries(TOOL_REGISTRY)
            .map(([name, meta]) => `- ${name}: ${meta.description} (추천 상황: ${meta.suitableFor})`)
            .join("\n");

        const prompt = `
당신은 의료 추천 시스템의 Decision Agent 입니다.

사용 가능한 Tool:
${toolDescriptions}

현재까지 수집된 정보:
${JSON.stringify(context, null, 2)}

사용자 정보:
- 증상: ${symptoms}
- 위치: ${location}
- 제약조건: ${JSON.stringify(constraints)}
- 가중치: ${JSON.stringify(weights)}

반드시 아래 형식으로 JSON 한 객체만 출력하세요:

{
  "done": false,
  "tool": "searchHospitalTool",
  "params": { ... }
}

또는 아래와 같을 때 종료하세요:

{
  "done": true
}

설명 금지. 코드블록 금지. JSON 외 출력 금지.
`;

        const decision = safeJSON((await llm.invoke(prompt)).content);
        console.log(`🔍 Searcher decision:`, decision);

        // 종료 조건
        if (decision.done === true) {
            break;
        }

        const { tool, params } = decision;

        if (!TOOL_REGISTRY[tool]) {
            throw new Error(`❌ 선택된 tool이 존재하지 않습니다: ${tool}`);
        }

        console.log(`🔧 Executing tool: ${tool}`);
        const results = await TOOL_REGISTRY[tool].run(params);

        context = mergeResults(context, results, tool);
    }

    // 가중치 기반 점수 계산
    if (context.hospitals.length > 0) {
        context.hospitals = applyWeights(context.hospitals, constraints, weights);
    }

    console.log(`Searcher finished`);
    console.log(`=== Searcher Context ===`, JSON.stringify(context, null, 2));

    return { hospitals: context.hospitals, doctors: context.doctors, pharmacies: context.pharmacies };
}


// =============================================
// 점수 계산
// =============================================
function applyWeights(hospitals, constraints, weights) {
    if (!hospitals.length) return hospitals;

    const maxDistance = Math.max(...hospitals.map(h => h.distance));

    return hospitals.map(h => {
        const distance_score = 1 - (h.distance / maxDistance);
        const price_score =
            h.price === "저렴" ? 1 :
                h.price === "중간" ? 0.6 :
                    0.2;
        const weekend_score = h.weekend ? 1.0 : 0.0;

        h.total_score =
            distance_score * weights.distance +
            price_score * weights.cost +
            weekend_score * weights.weekend;

        return h;
    }).sort((a, b) => b.total_score - a.total_score);
}


// =============================================
// Tool 결과 병합
// =============================================
function mergeResults(context, results, toolName) {
    if (toolName === "searchHospitalTool") {
        const merged = [...context.hospitals, ...results];
        context.hospitals = dedupeByName(merged);
    } else if (toolName === "searchDoctorTool") {
        const merged = [...context.doctors, ...results];
        context.doctors = dedupeByName(merged);
    } else if (toolName === "searchPharmacyTool") {
        const merged = [...context.pharmacies, ...results];
        context.pharmacies = dedupeByName(merged);
    }
    return context;
}

function dedupeByName(list) {
    const map = new Map();
    list.forEach(item => map.set(item.name, item));
    return [...map.values()];
}


// =============================================
// 안전하게 JSON 파싱
// =============================================
function safeJSON(text) {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
}
