export async function filter(state) {
  console.log('filter 호출됨');

  const plan = state.plan;

  let hospitals = state.needsResearch
    ? [...(state.hospitals || [])]
    : [...(state.rawHospitals || [])];
  
  console.log(`filter 입력: ${hospitals.length}건`);
  
  // 응급
  if (plan.emergency) {
    const withData = hospitals.filter(h => h.emyDayYn !== undefined);
    
    console.log(`filter 응급 데이터 보유 병원 (${withData.length}건):`,
      withData.map(h => ({
        name:     h.yadmNm,
        emyDayYn: h.emyDayYn,
        emyNgtYn: h.emyNgtYn,
      }))
    );

    if (withData.length > 0) {
      hospitals = hospitals.filter(h => h.emyDayYn === 'Y' || h.emyNgtYn === 'Y');
      console.log(`filter 응급 필터 결과 → ${hospitals.length}건`);
    } else {
      console.warn('filter 응급 데이터 없음 - getDtlInfo 병합 실패 가능성');
    }
  }

  // 주말
  if (plan.weekend) {
    if (hospitals.some(h => h.trmtSatStart !== undefined)) {
      hospitals = hospitals.filter(h => h.trmtSatStart || h.trmtSunStart);
      console.log(`filter 주말 → ${hospitals.length}건`);
    } else console.warn('filter 주말 데이터 없음 - 스킵');
  }

  // 장비 필수 조건
  if (plan.must?.includes('MRI')) {
    hospitals = hospitals.filter(h => h.hasMri === true);
    console.log(`filter MRI 필수 → ${hospitals.length}건`);
  }
  if (plan.must?.includes('CT')) {
    hospitals = hospitals.filter(h => h.hasCt === true);
    console.log(`filter CT 필수 → ${hospitals.length}건`);
  }

  // 거리 필터 (감소 포함 — rawHospitals에서 재필터링하므로 항상 정확)
  if (plan.distanceRequired && plan.distance) {
    hospitals = hospitals.filter(
      h => h.distance != null && parseFloat(h.distance) <= plan.distance
    );
    console.log(`filter 거리(${plan.distance}m) → ${hospitals.length}건`);
  }

  // 점수 산정 + Top 10
  hospitals = hospitals
    .map(h => {
      let score = 0;
      if (plan.prefer?.includes('MRI') && h.hasMri) score += 2;
      if (plan.prefer?.includes('CT')  && h.hasCt)  score += 2;
      const dist = parseFloat(h.distance) || 99999;
      if (dist < 1000)      score += 3;
      else if (dist < 3000) score += 2;
      else if (dist < 5000) score += 1;
      return { ...h, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  console.log(`filter 최종: ${hospitals.length}건`);
  return { hospitals, isFiltered: true, step: 'filtered',
    searchedParams: state.searchedParams
      ? {...state.searchedParams, distance: state.plan.distance}
      : null
  };
}
// Searcher의 결과로 나온 병원 리스트를 사용자의 요청에 따라 필터링
