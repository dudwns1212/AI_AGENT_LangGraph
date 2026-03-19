import { llm }            from '../llm.js';
import { TOOL_REGISTRY }   from '../tools/index.js';
import { search1API }     from '../tools/search1API.js';
import { geocodeAddress } from '../tools/geoconverter.js';

function extractJSON(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); }
  catch (e) { throw new Error('Searcher JSON 파싱 실패'); }
}

function mergeByYkiho(hospitals, detailResults) {
  if (!Array.isArray(detailResults) || detailResults.length === 0) return hospitals;
  const map = new Map(detailResults.map(d => [d.ykiho, d]));

  let mergedCount = 0;
  const result = hospitals.map(h => {
    const detail = map.get(h.ykiho);
    if (detail) mergedCount++;
    return detail ? { ...h, ...detail } : h;
  });

  console.log(`[mergeByYkiho] 실제 병합: ${mergedCount}개`);
  return result;
}

// LLM으로 이번 plan에 필요한 상세 API 결정
async function decideTools(plan) { 
  const toolDescriptions = Object.entries(TOOL_REGISTRY)
    .map(([name, meta]) => `- ${name}: ${meta.description}`)
    .join('\n');

  const prompt = `
현재 검색 조건: ${JSON.stringify(plan)}

사용 가능한 상세 API:
${toolDescriptions}

조건에 필요한 API만 골라 JSON으로 출력하세요.
** 예시를 똑같이 따라하지 마시오 **
{"tools": ["getDtlInfo", "getMedOftInfo"]}  ← 예시
필요 없으면 {"tools": []}
`;
  try {
    const res = await llm.invoke(prompt);
    return extractJSON(res.content).tools || [];
  } catch (e) {
    console.error('searcher: 도구 결정 실패:', e.message);
    return [];
  }
}

export async function searcher(state) {
  console.log('searcher 호출됨');

  const plan = state.plan;
  let hospitals    = state.rawHospitals || [];
  let calledTools  = state.calledTools  || [];
  let searchedParams = state.searchedParams;

  // search1API 재검색 여부 
  if (state.needsResearch) {
    console.log('searcher: search1API 재검색 시작');
  
    if (!plan?.location) {
      console.warn('searcher: location 없음');
      return { hospitals: [], rawHospitals: [], step: 'searched' };
    }

    const geoInfo = await geocodeAddress(plan.location);
    if (!geoInfo) {
      console.warn('searcher: 좌표 변환 실패:', plan.location);
      return { hospitals: [], rawHospitals: [], step: 'searched' };
    }

    const result = await search1API({
      symptoms: plan.symptoms,
      div:      plan.div,
      distance: plan.distance,
      geoInfo,
    });
    
    hospitals     = result || [];
    calledTools   = []; // 재검색 시 이전 상세 API 캐시 초기화
    searchedParams = {
      location: plan.location,
      symptoms: plan.symptoms,
      div:      plan.div,
      distance: plan.distance,
    };
    console.log(`searcher: search1API 결과: ${hospitals.length}건`);
  } else {
    console.log('searcher: search1API 스킵 → rawHospitals 재사용');
  }
  
  // 상세 API 호출 (신규로 필요해진 것만) ──
  const allToolsNeeded = await decideTools(plan);
  const newTools = allToolsNeeded.filter(t => !calledTools.includes(t));
  console.log(`searcher: 필요한 상세 API: ${allToolsNeeded}, 신규 호출: ${newTools}`);

  const ykihoList = hospitals.map(h => h.ykiho).filter(Boolean);

  for (const toolName of newTools) {
    if (!TOOL_REGISTRY[toolName]) continue;
    console.log(`searcher: ${toolName} 호출 (${ykihoList.length}건)`);
    const results = await TOOL_REGISTRY[toolName].run(ykihoList);
    hospitals = mergeByYkiho(hospitals, results);
    calledTools.push(toolName);
  }

  console.log(`searcher: 최종 병합: ${hospitals.length}건, calledTools: ${calledTools}`);

  return {
    hospitals,
    rawHospitals:   hospitals,
    searchedParams,
    calledTools,
    step: 'searched',
  };
}
// LLM이 필요한 상세 API 결정 및 호출 판단 여부에 따라 각 API를 호출
