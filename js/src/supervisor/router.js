export function supervisorRoute(state) {
  if (!state.step)               return 'planner';
  if (state.step === 'planned')  return state.needsResearch ? 'searcher' : 'filter'; // 플래너였다면 다음 searcher 또는 filter
  if (state.step === 'searched') return 'filter'; // ...
  if (state.step === 'filtered') return 'formatter'; // ...
  return 'formatter';
}
// LLM을 사용하지 않고 다음 단계를 return된 구문에 따라 결정하는 방식으로 변경