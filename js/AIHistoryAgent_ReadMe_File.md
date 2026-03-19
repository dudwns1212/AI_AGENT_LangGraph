# AIHistoryAgent 프로젝트 분석 보고서

## 1. 프로젝트 개요

AIHistoryAgent는 사용자의 자연어 요청을 분석하여 조건에 맞는 병원을 검색하고 추천하는 멀티 에이전트 시스템이다. LangGraph와 LangChain을 활용하여 복잡한 대화 흐름을 관리하며, 세션 기반 컨텍스트를 유지하여 이전 대화 내용을 기억하고 점진적으로 검색 조건을 개선한다.

### 기술 스택

**Backend**
- Node.js + Express (REST API 서버)
- LangGraph (워크플로우 관리)
- LangChain (LLM 통합)
- OpenAI API (자연어 처리)
- Axios (외부 API 통신)

**Frontend**
- Vue 3 (UI 프레임워크)
- Vite (빌드 도구)
- Pinia (상태 관리, 사용 가능)

## 2. 시스템 아키텍처

### 2.1 LangGraph 워크플로우

프로젝트의 핵심은 LangGraph의 StateGraph를 활용한 멀티 에이전트 시스템이다. 각 에이전트는 명확한 역할을 가지고 있으며, Supervisor가 상태에 따라 적절한 에이전트로 라우팅한다.

```
START → Supervisor → Planner → Supervisor → Searcher/Filter → Supervisor → Formatter → END
```

#### 워크플로우 상세

1. **Supervisor (node.js, router.js)**
   - 현재 상태의 `step` 값을 확인하여 다음 에이전트 결정
   - 상태 자체를 변경하지 않고 순수 라우팅 역할만 수행
   - 조건부 엣지를 통해 동적 흐름 제어

2. **Planner (planner.js)**
   - 사용자 메시지와 이전 plan을 비교하여 새로운 검색 조건 생성
   - LLM을 사용하여 자연어를 구조화된 JSON으로 변환
   - `checkNeedsResearch` 함수로 재검색 필요 여부 판단
   - 출력 형식: `{ symptoms, div, location, weekend, emergency, distance, must, prefer }`

3. **Searcher (searcher.js)**
   - `needsResearch=true`일 경우 외부 API 호출하여 병원 검색
   - `needsResearch=false`일 경우 기존 `rawHospitals` 재사용
   - LLM을 활용하여 현재 plan에 필요한 상세 API 동적 결정
   - `ykiho`(병원 고유번호)를 기준으로 여러 API 결과 병합
   - 이미 호출한 API는 `calledTools` 배열로 추적하여 중복 호출 방지

4. **Filter (filter.js)**
   - 응급, 주말, MRI/CT 보유, 거리 등 다양한 조건으로 필터링
   - 선호 조건에 따른 점수 계산 (거리, 장비 보유 여부)
   - 점수 기준 정렬 후 상위 10개 병원만 선택

5. **Formatter (formatter.js)**
   - LLM을 사용하여 최종 사용자 친화적 응답 생성
   - 이전 조건과 현재 조건을 비교하여 변경 사항 자연스럽게 안내
   - 결과가 없을 경우 조건 완화 제안

### 2.2 상태 관리

StateSchema는 Zod를 사용하여 타입 안전성을 보장한다.

```javascript
{
  userMessage: string,      // 사용자 입력
  sessionId: string,        // 세션 식별자
  plan: object,             // 현재 검색 조건
  needsResearch: boolean,   // 재검색 필요 여부
  toolsNeeded: string[],    // 필요한 도구 목록
  hospitals: array,         // 필터링된 병원 목록
  finalAnswer: string,      // 최종 응답
  step: string,             // 현재 워크플로우 단계
  prevPlan: object,         // 이전 검색 조건
  rawHospitals: array,      // 원본 병원 목록 (캐시)
  searchedParams: object,   // 마지막 검색 파라미터
  calledTools: string[]     // 호출된 API 목록
}
```

## 3. 핵심 기능 분석

### 3.1 세션 기반 컨텍스트 유지

서버는 `sessions` Map을 사용하여 각 세션의 상태를 메모리에 저장한다.

```javascript
sessions.set(sessionId, {
  plan: result.plan,
  rawHospitals: result.rawHospitals,
  searchedParams: result.searchedParams,
  calledTools: result.calledTools
});
```

이를 통해 사용자가 이전 대화 내용을 참조하는 요청을 할 때, 전체 검색을 다시 수행하지 않고 기존 데이터를 활용할 수 있다.

### 3.2 똑똑한 재검색 판단

`planner.js`의 `checkNeedsResearch` 함수는 새로운 plan과 이전 `searchedParams`를 비교하여 재검색 필요 여부를 결정한다.

**재검색이 필요한 경우:**
- 위치 변경 (location)
- 병원 타입 변경 (div)
- 증상/진료과 변경 (symptoms)
- 거리 증가 (기존 3km → 5km로 확대)

**필터링만 수행하는 경우:**
- 거리 감소 (5km → 2km로 축소)
- 응급/주말 조건 추가
- MRI/CT 조건 추가

이 로직을 통해 불필요한 API 호출을 줄이고 응답 속도를 개선한다.

### 3.3 동적 도구 선택

`searcher.js`의 `decideTools` 함수는 LLM을 활용하여 현재 검색 조건에 필요한 상세 API만 선택한다.

```javascript
async function decideTools(plan) {
  const toolDescriptions = Object.entries(TOOL_REGISTRY)
    .map(([name, meta]) => `- ${name}: ${meta.description}`)
    .join('\n');

  const prompt = `
현재 검색 조건: ${JSON.stringify(plan)}
사용 가능한 상세 API: ${toolDescriptions}
조건에 필요한 API만 골라 JSON으로 출력하세요.
  `;
  
  const res = await llm.invoke(prompt);
  return extractJSON(res.content).tools || [];
}
```

예를 들어, 사용자가 응급실 조건을 요청하면 `getDtlInfo` API만 호출하고, MRI 조건을 추가로 요청하면 `getMedOftInfo` API를 추가로 호출한다.

### 3.4 데이터 병합 전략

여러 API의 결과를 `ykiho`(병원 고유번호)를 기준으로 병합한다.

```javascript
function mergeByYkiho(hospitals, detailResults) {
  const map = new Map(detailResults.map(d => [d.ykiho, d]));
  return hospitals.map(h => {
    const detail = map.get(h.ykiho);
    return detail ? { ...h, ...detail } : h;
  });
}
```

이를 통해 기본 검색 결과에 상세 정보를 점진적으로 추가할 수 있다.

## 4. 코드 구조

### 4.1 Backend 디렉토리 구조

```
test4/
├── package.json
├── src/
│   ├── index.js              # Express 서버 및 LangGraph 설정
│   ├── llm.js                # LLM 인스턴스 초기화
│   ├── agents/
│   │   ├── planner.js        # 조건 분석 에이전트
│   │   ├── searcher.js       # 병원 검색 에이전트
│   │   ├── filter.js         # 필터링 에이전트
│   │   └── formatter.js      # 응답 생성 에이전트
│   ├── supervisor/
│   │   ├── node.js           # 수퍼바이저 노드
│   │   └── router.js         # 라우팅 로직
│   └── tools/
│       ├── index.js          # Tool Registry
│       ├── search1API.js     # 병원 검색 API
│       ├── getDtlInfo.js     # 상세 정보 API
│       ├── getMedOftInfo.js  # 의료 장비 정보 API
│       ├── geoconverter.js   # 주소-좌표 변환
│       ├── deptMapper.js     # 진료과 코드 매핑
│       └── hpTypeMapper.js   # 병원 타입 코드 매핑
```

### 4.2 Frontend 디렉토리 구조

```
vue/
├── package.json
├── vite.config.js
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── router/
│   │   └── index.js
│   ├── stores/
│   │   └── counter.js
│   └── views/
│       ├── AIHospital1.vue   # 병원 추천 UI (버전 1)
│       └── AIHospital2.vue   # 병원 추천 UI (버전 2)
```

## 5. 사용자 시나리오 예시

다음은 실제 대화 흐름을 통해 시스템이 어떻게 동작하는지 보여주는 예시다.

### 시나리오 1: 기본 검색

```
사용자: "강남에서 정형외과 찾아줘"

워크플로우:
1. Planner: location="강남", symptoms="정형외과" 추출, needsResearch=true
2. Searcher: search1API 호출, 30개 병원 검색
3. Filter: 거리 기준 정렬, Top 10 선택
4. Formatter: "강남 지역 정형외과 10곳을 찾았습니다..."

세션 저장:
{
  plan: { location: "강남", symptoms: "정형외과", distance: 3000 },
  rawHospitals: [...30개 병원...],
  searchedParams: { location: "강남", symptoms: "정형외과", distance: 3000 },
  calledTools: []
}
```

### 시나리오 2: 조건 추가 (필터링만)

```
사용자: "주말에도 하는 곳으로 좁혀줘"

워크플로우:
1. Planner: weekend=true 추가, needsResearch=false (위치/증상 변경 없음)
2. Searcher: 스킵됨 (기존 rawHospitals 재사용)
3. Filter: rawHospitals에서 weekend=true인 병원만 필터링, 5개 남음
4. Formatter: "주말 진료 가능한 병원 5곳으로 좁혀드렸습니다..."

세션 저장:
{
  plan: { location: "강남", symptoms: "정형외과", distance: 3000, weekend: true },
  rawHospitals: [...30개 병원...], // 변경 없음
  searchedParams: { location: "강남", symptoms: "정형외과", distance: 3000 },
  calledTools: []
}
```

### 시나리오 3: 상세 정보 요청 (API 추가 호출)

```
사용자: "MRI 있는 곳만 보여줘"

워크플로우:
1. Planner: must=["MRI"] 추가, needsResearch=false
2. Searcher: 
   - LLM이 getMedOftInfo API 필요하다고 판단
   - getMedOftInfo 호출하여 30개 병원의 장비 정보 가져옴
   - rawHospitals와 병합 (ykiho 기준)
3. Filter: hasMri=true인 병원만 필터링, 3개 남음
4. Formatter: "MRI 보유 병원 3곳입니다..."

세션 저장:
{
  plan: { location: "강남", symptoms: "정형외과", distance: 3000, weekend: true, must: ["MRI"] },
  rawHospitals: [...30개 병원 + MRI 정보...], // 병합됨
  searchedParams: { location: "강남", symptoms: "정형외과", distance: 3000 },
  calledTools: ["getMedOftInfo"] // 추가됨
}
```

### 시나리오 4: 거리 축소 (필터링만)

```
사용자: "거리 2km 이내로 좁혀줘"

워크플로우:
1. Planner: distance=2000으로 변경, needsResearch=false (거리 감소는 필터링만)
2. Searcher: 스킵됨
3. Filter: distance <= 2000인 병원만 필터링, 2개 남음
4. Formatter: "2km 이내 병원 2곳입니다..."
```

### 시나리오 5: 위치 변경 (재검색)

```
사용자: "역삼으로 바꿔줘"

워크플로우:
1. Planner: location="역삼"으로 변경, needsResearch=true (위치 변경)
2. Searcher: 
   - search1API 재호출 (역삼 기준으로 새로 검색)
   - calledTools 초기화 (새 검색이므로 상세 정보도 다시 필요)
3. Filter: 새로운 병원 목록에서 조건 필터링
4. Formatter: "역삼 지역으로 변경하여 검색했습니다..."

세션 저장:
{
  plan: { location: "역삼", symptoms: "정형외과", distance: 2000, weekend: true, must: ["MRI"] },
  rawHospitals: [...새로운 병원 목록...], // 완전히 교체
  searchedParams: { location: "역삼", symptoms: "정형외과", distance: 2000 },
  calledTools: [] // 초기화됨
}
```

## 6. 주요 API 및 도구

### 6.1 외부 API

- **search1API**: 기본 병원 검색 API (위치, 진료과, 병원 타입 기준)
- **getDtlInfo**: 병원 상세 정보 API (응급실 운영, 진료 시간 등)
- **getMedOftInfo**: 의료 장비 정보 API (MRI, CT 보유 여부)
- **geoconverter**: 주소를 위도/경도 좌표로 변환

### 6.2 코드 매퍼

- **deptMapper.js**: 진료과 이름을 코드로 매핑 (예: "정형외과" → "D003")
- **hpTypeMapper.js**: 병원 종류를 코드로 매핑 (예: "병원" → "01", "의원" → "21")

## 7. 장점 및 특징

### 효율성

- 불필요한 API 재호출 방지로 비용 절감 및 응답 속도 개선
- 상세 API는 필요할 때만 호출하여 네트워크 비용 최소화
- 세션 기반 캐싱으로 반복 검색 시 즉시 응답 가능

### 확장성

- 각 에이전트가 독립적으로 동작하여 유지보수 용이
- Tool Registry 패턴으로 새로운 API 추가 시 최소한의 코드 수정
- LangGraph의 선언적 워크플로우로 복잡한 비즈니스 로직 관리 용이

### 사용자 경험

- 자연어로 조건을 점진적으로 추가/수정 가능
- 이전 대화 맥락을 기억하여 반복 입력 불필요
- LLM 기반 응답 생성으로 친근한 안내 제공

### 아키텍처

- StateGraph로 상태 흐름을 명확하게 시각화
- Supervisor 패턴으로 복잡한 조건부 라우팅 로직 분리
- Zod 스키마로 타입 안전성 보장

## 8. 개선 가능한 부분

### 에러 처리

현재 코드는 기본적인 try-catch만 사용하고 있으며, 다음과 같은 개선이 필요하다.

- API 호출 실패 시 재시도 로직 부재
- LLM JSON 파싱 실패 시 사용자에게 명확한 안내 필요
- 외부 API 타임아웃 처리 미흡
- 부분 실패 시 fallback 전략 필요 (예: 상세 API 실패 시 기본 정보만 반환)

### 성능 최적화

- `p-limit` 패키지가 설치되어 있으나 실제 코드에서 미사용
- 여러 병원의 상세 정보를 순차적으로 호출하므로 병렬 처리로 개선 가능
- `calledTools` 중복 체크를 배열 includes로 하고 있어 Set 사용 권장

### 세션 관리

- 메모리 기반 세션 저장으로 서버 재시작 시 모든 세션 소실
- Redis 등 영구 저장소 도입 필요
- 세션 만료 정책 부재로 메모리 누수 가능성

### 테스트

- 단위 테스트 및 통합 테스트 부재
- 각 에이전트의 독립적 테스트 필요
- LLM 출력의 비결정성으로 인한 테스트 어려움 존재

### 문서화

- 환경 변수 설정 가이드 필요 (OpenAI API 키, 외부 API 키 등)
- API 응답 형식 명세 부족
- 코드 주석이 일부 누락되어 있음

## 9. 기술적 인사이트

### LangGraph의 효과적 활용

LangGraph의 StateGraph는 복잡한 멀티 에이전트 워크플로우를 선언적으로 정의할 수 있게 해준다. 조건부 엣지를 통해 동적 라우팅이 가능하며, 상태 변경을 명시적으로 관리할 수 있어 디버깅이 용이하다.

### LLM 기반 동적 의사결정

`decideTools` 함수처럼 LLM을 활용하여 런타임에 필요한 도구를 선택하는 패턴은 규칙 기반 시스템보다 유연하다. 새로운 조건이 추가되어도 코드 수정 없이 LLM이 자동으로 적응할 수 있다.

### 세션 기반 캐싱의 중요성

대화형 시스템에서 이전 결과를 재사용하는 것은 사용자 경험과 비용 절감 모두에 중요하다. `needsResearch` 플래그를 통한 선택적 재검색은 이를 효과적으로 구현한 예시다.

### Supervisor 패턴의 장점

각 에이전트는 자신의 작업만 수행하고, 다음 단계 결정은 Supervisor에게 위임한다. 이는 관심사 분리 원칙을 따르며, 워크플로우 변경 시 Supervisor의 라우팅 로직만 수정하면 된다.

## 10. 실행 방법

### Backend 실행

```bash
cd test4
npm install
npm run dev
```

서버는 http://localhost:3000에서 실행된다.

### Frontend 실행

```bash
cd vue
npm install
npm run dev
```

개발 서버는 기본적으로 http://localhost:5173에서 실행된다.

### 환경 변수 설정

`.env` 파일을 생성하여 다음 항목을 설정해야 한다.

```
OPENAI_API_KEY=sk-...
# 외부 병원 검색 API 키 (필요 시)
```

## 11. 결론

AIHistoryAgent는 LangGraph와 LangChain을 활용한 멀티 에이전트 시스템의 좋은 예시다. 특히 세션 기반 컨텍스트 관리와 똑똑한 재검색 판단 로직을 통해 효율성과 사용자 경험을 모두 고려한 설계를 보여준다.

현재 구현된 기능만으로도 실용적이지만, 에러 처리 강화, 세션 영구화, 병렬 처리 최적화 등을 추가하면 프로덕션 환경에서도 안정적으로 운영할 수 있을 것이다.

LLM을 활용한 동적 도구 선택과 자연스러운 응답 생성은 사용자에게 마치 실제 상담사와 대화하는 듯한 경험을 제공하며, 복잡한 검색 조건도 대화를 통해 쉽게 표현할 수 있게 한다.
