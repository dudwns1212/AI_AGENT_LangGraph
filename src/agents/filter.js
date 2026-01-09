///
/// 필터 에이전트: 검색된 병원 데이터를 기준에 맞게 걸러내기
///
export async function filter(state) {
    const filtered = state.hospitals.filter(h => h.distance < 50);

    return { hospitals: filtered, filtered: true };
}
