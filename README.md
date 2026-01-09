# AI_AGENT_LangGraph
JavaScript기반의 LangGraph 실습

## AGENT2 전체 실행 흐름(index.js 기준)

text - 사용자 입력

→ START → supervisor(supervisorRoute) → planner → … formatter → END

StateGraph가 상태를 계속 업데이트하면서 각 노드를 거침

**State 구조**(Zod를 활용해서 타입을 명시)

```
const StateSchema = z.object({
    messages: z.array(z.any()).default([]),
    plan: z.any().nullable().default(null),
    hospitals: z.array(z.any()).nullable().default(null),
    filtered: z.boolean().default(false),
    finalAnswer: z.string().nullable().default(null),
});
```

**Supervisor** → 두뇌 역할, 현재 대화 및 분석 상태를 보고 다음 노드를 선택

supervisor/node.js

```jsx
export function supervisorNode(state) {
    return {};
}
```

사용되지 않는 것으로 보임. Node는 key와 func로 이루어져있음, Edge에서 key가 호출되면 func을 실행하는 구조인데, 저 supervisorNode는 빈 배열을 리턴함

supervisor/router.js

```jsx
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
```

코드를 보면 아래의 코드를 볼 수 있는데 아래의 코드는 다음 Edge를 연결해주는 함수임(addConditionalEdges), 위에서 supervisorNode가 빈 껍데기만 리턴하는 이유가 결국 supervisor은 아래의 supervisorRoute를 호출하기 위해서 사용되기 때문(명목상 노드에 추가해야 되므로 빈 배열을 리턴하는 함수를 추가한거)

`graph.addConditionalEdges("supervisor", supervisorRoute);`

supervisorRoute는 LLM을 기반으로 다음에 어떤 Node가 실행되어야 할지 분석 및 리턴

현재 상태를 요약(summary)하여 prompt에 전송

```jsx
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
```

llm을 활용하여 다음 노드를 결정 및 반환 

**Agents(** 각 노드(역할)를 수행)

planner : 사용자가 입력한 글을 구조화 된 JSON 객체로 변환

```jsx
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
```

이렇게 prompt에 요청

**searcher**(검색 전문가)

1. 사용 가능한 도구 목록을 제공함

```jsx
while (true) {
  const toolDescriptions = Object.entries(TOOL_REGISTRY)
      .map(([name, meta]) => `- ${name}: ${meta.description} (추천 상황: ${meta.suitableFor})`)
      .join("\n");
```

![image.png](attachment:19a0af41-eb35-4e14-a0e2-a8945ec820fd:image.png)

3가지 툴은 각각 다른 쿼리문을 호출해 상황에 맞는 데이터를 추출함

1. 프롬프트로 도구 결정 및 종료 

```jsx
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
```

위의 코드는 프롬프트이고, 도구를 결정하면 아래의 코드로 도구를 실행

```jsx
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
```

1. 점수 계산

```jsx
// 가중치 기반 점수 계산
	if (context.hospitals.length > 0) {
		context.hospitals = applyWeights(context.hospitals, constraints, weights);
	}
	
		console.log(`Searcher finished`);
		console.log(`=== Searcher Context ===`, JSON.stringify(context, null, 2));
	
		return { hospitals: context.hospitals, doctors: context.doctors, pharmacies: context.pharmacies 
};
```

```jsx
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
```

**formatter**(응답 생성기)

```jsx
export async function formatter(state) {
    const prompt = ChatPromptTemplate.fromTemplate(`
다음 병원 목록을 사용자에게 이해하기 쉽게 정리해줘.

병원 목록:
{hospitals}

한국어로 친절하게 요약:
`);
    const chain = prompt.pipe(llm);
    const res = await chain.invoke({
        hospitals: JSON.stringify(state.hospitals, null, 2)
    });

    const output =
        typeof res.content === "string"
            ? res.content
            : Array.isArray(res.content)
                ? res.content.map(c => c.text || c).join("\n")
                : res.content?.text ?? String(res.content);

    return { finalAnswer: output.trim() };
}
```

LangChain의 LCEL 패턴을 사용 (LangChain Expression Language)

![image.png](attachment:ba595778-aa16-48e2-aee6-ff24c0ba23a9:image.png)

다양한 구성 요소를 하나의 체인으로 연결하여 output(출력)

**Tools**

**searchDoctorTool**

```jsx
const query = `
    SELECT name, specialty, hospital, experience_years
    FROM doctors
    WHERE specialty = ?
    ORDER BY experience_years DESC
  `;
```

doctors 테이블에서 데이터를 추출 및 경력 순으로 추출

**searchHospitalTool**

```jsx
`SELECT name, dept, weekend, price_level AS price, distance_km AS distance FROM hospitals WHERE 1=1`

if (affordable_cost) {
        query += ` AND price_level != '비쌈'`;
    }

    query += ` ORDER BY distance_km ASC`;
```

Hospital 정보 + 비쌈 빼고, 거리순 정렬

**searchPharmacyTool**

```jsx
let query = `
    SELECT name, address, open_24h, distance_km AS distance
    FROM pharmacies
    WHERE 1=1
  `;
  
  if (openNow) {
    query += ` AND open_24h = 1`;
  }

  query += ` ORDER BY distance_km ASC`;
```

24시간 및 거리순으로 정렬 된 약국

# DB 분석

예제 파일에는 3가지의 테이블이 존재, id는 생략

doctors : name, specialty(전공), hospital(근무병원), experience_years(경력)

hospitals : name, dept(부서(내과, 심장내과..)), weekend(주말에 열면 1, 아니면 0), price_level(저렴, 중간, 비쌈), distance_km(사용자와의 거리), lat, lng, address

pharmacies(약국) : name, address, open_24h(0 or 1, 24시간 여는지), distance_km

예제 파일은 DB기반으로 데이터를 받아서 사용자의 요청에 따라 데이터를 추출 및 가산점을 부여해서 최적의 병원을 추천해줌

병원 추천을 더 상세하게 하려면 기본의 데이터가 잘 정제되어 있어야 함

https://opendata.hira.or.kr/op/opc/selectOpenData.do?sno=11925 → 전국 병의원 데이터 2025/9

# 코드 리뷰(상세)

## index.js(메인 실행 파일)

```jsx
const StateSchema = z.object({
    messages: z.array(z.any()).default([]),
    plan: z.any().nullable().default(null),
    hospitals: z.array(z.any()).nullable().default(null),
    filtered: z.boolean().default(false),
    finalAnswer: z.string().nullable().default(null),
});
```

상태 스키마 정의 - zod를 활용하여 타입을 명시

```jsx
const graph = new StateGraph(StateSchema);
```

graph 객체를 생성

```jsx
graph.addNode("supervisor", supervisorNode, {
    ends: ["planner", "searcher", "filter", "formatter", END],
});

graph.addNode("planner", planner);
graph.addNode("searcher", searcher);
graph.addNode("filter", filter);
graph.addNode("formatter", formatter);
```

graph에 노드를 추가, supervisor는 연결해주는 노드이기 때문에 ends값들을 정의

각각의 노드들은 (”key”, function) 으로 추가됨

Edge에서 key값이 불리면 function이 실행되는 형태

```jsx
graph.addConditionalEdges("supervisor", supervisorRoute);
```

위에서 supervisorNode는 껍데기 함수와 ends로 다음 경로를 저장한 것이고 실제 다음 노드를 결정하는 함수는 supervisorRoute임(router.js)

```jsx
graph.addEdge(START, "supervisor")
graph.addEdge("planner", "supervisor");
graph.addEdge("searcher", "supervisor");
graph.addEdge("filter", "supervisor");
graph.addEdge("formatter", END);
```

흐름을 정의하는 코드

-START(초기 상태를 전달) → sueprvisor(다음 노드 결정)

-planner(초기의 상태를 구조화) → superviosr …

이런식으로 Edge에 각 (노드, 라우터) 형태로 정의

```jsx
const app = graph.compile();
```

compile을 실행하면 graph가 langchain의 Runnerble 객체로 컴파일 된다고 한다.

app = Runnerble 객체이며 따라서 아래의 함수를 실행시킬 수 있다

```jsx
const runApp = async (input) => app.invoke({ messages: [input] });
```

invoke의 경우 Runnerble의 실행 함수이다.

| **Runnerble 실행 메서드** | **설명** | **사용 예** |
| --- | --- | --- |
| `.invoke()` | 한 번 실행 | 단일 질문/응답 |
| `.stream()` | 실시간 스트리밍 | 채팅, 토큰 출력 |
| `.bind()` | 설정 고정한 새 Runnable 반환 | `temperature`, `tools` 지정 |
| `.pipe()` | 단계별 처리 연결 | 프롬프트 → LLM → 파서 |

## agnets

### planner.js

```jsx
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
```

extractJSON 함수 - LLM 출력에서 JSON을 추출하는 함수

LLM은 프롬프트의 요청을 마치고 종종 JSON을 마크다운 코드블록으로 감싸 반환하는데 이를 제거하고 순수 문자열만 남기는 파싱 함수로 볼 수 있다.

.replace(/```json/gi, "") : gi - 대소문자 구분 없이 ```json 제거

.replace(/```/g, "") : g - 남은 모든 백틱 제거

```jsx
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
```

상태기반 에이전트 아키텍처 구조

**const input = state.messages[state.messages.length - 1]; → 자연스러운 문자열 형태(궁금해서 출력)

프롬프트 설정 - 절대, 오직 등의 강조 표현을 하는게 중요함, 출력 형식을 예시로 보여줄 때, 그대로 복사하지 말 것 이라는 명령을 통해서 LLM이 실제 입력을 분석하도록 강제할 수 있음

 

프롬프트 입력 후 llm을 호출하여 프롬프트를 전달하고 응답을 받음

또한 응답을 extractJSON으로 파싱

LLM에서 weights가 누락된 경우 제약조건이 true면 가중치를 높게, 아니면 낮게 설정 후 plan 반환

### searcher.js

검색 에이전트

```jsx
export async function searcher(state) {
    console.log(`searcher started`);
    console.log(`=== Searcher Plan ===`, state.plan);
		
		// plan에서 요약한 정보들을 각 변수에 저장
    const { symptoms, location, constraints, weights } = state.plan;
		
    let context = {
        hospitals: [],   // 병원 검색 결과 누적
        doctors: [],     // 의사 검색 결과 누적
        pharmacies: []   // 약국 검색 결과 누적
    };
		// 에이전트가 충분한 정보를 수집할 때까지 도구선택 -> 실행 -> 결과 누적을 반
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
				// LLM을 호출하여 응답을 받고 planner와 마찬가지로 safeJSON으로 파싱
        const decision = safeJSON((await llm.invoke(prompt)).content);
        console.log(`🔍 Searcher decision:`, decision);
				
        // 종료 조건
        if (decision.done === true) {
            break;
        }
				// 종료가 안됐다면 다시 도구 검증 및 실행
        const { tool, params } = decision;
				// LLM이 선택한 도구가 REGISTRY에 있는지 검증
        if (!TOOL_REGISTRY[tool]) {
            throw new Error(`❌ 선택된 tool이 존재하지 않습니다: ${tool}`);
        }
				// 실행
        console.log(`🔧 Executing tool: ${tool}`);
        const results = await TOOL_REGISTRY[tool].run(params);

        context = mergeResults(context, results, tool);
    }
		
    // 가중치 기반 점수 계산, planner가 생성한 가중치를 기반으로 점수 계산 
    if (context.hospitals.length > 0) {
        context.hospitals = applyWeights(context.hospitals, constraints, weights);
    }

    console.log(`Searcher finished`);
    console.log(`=== Searcher Context ===`, JSON.stringify(context, null, 2));

    return { hospitals: context.hospitals, doctors: context.doctors, pharmacies: context.pharmacies };
}
```

점수 계산 함수

```jsx
function applyWeights(hospitals, constraints, weights) {
    if (!hospitals.length) return hospitals;
		// 모든 병원의 distance중 최대값을 구함
    const maxDistance = Math.max(...hospitals.map(h => h.distance));
		// 각 병원의 거리 점수를 계산, 위에서 구한 최대값을 기준점으로 가까울수록 1에 가까운 점수
    return hospitals.map(h => {
        const distance_score = 1 - (h.distance / maxDistance);
        // 각 병원의 진료비 점수, planner에서 받은 값에 따라 다른 점수를 부여
        const price_score =
            h.price === "저렴" ? 1 :
                h.price === "중간" ? 0.6 :
                    0.2;
        const weekend_score = h.weekend ? 1.0 : 0.0;
				// 가중치를 부여하여 총 점수를 계산
        h.total_score =
            distance_score * weights.distance +
            price_score * weights.cost +
            weekend_score * weights.weekend;

        return h;
    // 내림차순으로 정렬하여 가장 높은 점수가 처음에 보이게 설정
    }).sort((a, b) => b.total_score - a.total_score);
}
```

### formatter.js, filter.js

→ 그냥 병원 목록을 정리 및 기준에 맞게 거르는 역할 ⇒ 최종 결과

```jsx
다음은 서울 및 인근 지역의 주요 병원 목록을 이해하기 쉽게 정리한 내용입니다. 각 병원은 진료과, 주말 진료 여부, 진료비 수준, 병원까지의 거리(단위: km), 그리고 종합 평점(1점 만점 기준)을 포함하고 있습니다.

---

### 1. 강남세브란스병원
- **진료과:** 심장내과
- **주말 진료:** 가능
- **진료비:** 저렴
- **거리:** 약 2.1km
- **종합 평점:** 0.94 (매우 우수)

### 2. 삼성서울병원
- **진료과:** 내과
- **주말 진료:** 가능
- **진료비:** 중간 수준
- **거리:** 약 1.2km (가장 가까움)
- **종합 평점:** 0.89 (우수)

### 3. 순천향대학교 서울병원
- **진료과:** 내과
- **주말 진료:** 가능
- **진료비:** 저렴
- **거리:** 약 6.2km
- **종합 평점:** 0.83 (양호)

### 4. 국립중앙의료원
- **진료과:** 응급의학과
- **주말 진료:** 가능
- **진료비:** 저렴
- **거리:** 약 7.8km
- **종합 평점:** 0.78 (보통 이상)

### 5. 가톨릭대학교 여의도성모병원
- **진료과:** 내과
- **주말 진료:** 가능
- **진료비:** 중간 수준
- **거리:** 약 10.4km
- **종합 평점:** 0.63 (보통)

### 6. 서울성모병원
- **진료과:** 순환기내과
- **주말 진료:** 불가
- **진료비:** 중간 수준
- **거리:** 약 3.5km
- **종합 평점:** 0.52 (다소 낮음)

### 7. 서울아산병원
- **진료과:** 심장내과
- **주말 진료:** 불가
- **진료비:** 비쌈
- **거리:** 약 4.3km
- **종합 평점:** 0.42 (낮음)

### 8. 분당서울대학교병원
- **진료과:** 심장내과
- **주말 진료:** 가능
- **진료비:** 비쌈
- **거리:** 약 18km (가장 멂)
- **종합 평점:** 0.34 (낮음)

---

### 요약
- **주말 진료가 가능한 병원** 중에서는 강남세브란스병원과 삼성서울병원이 진료비도 저렴하거나 중간 수준이며 평점도 높아 추천할 만합니다.
- **가까운 병원**은 삼성서울병원(1.2km), 강남세브란스병원(2.1km), 서울성모병원(3.5km) 순입니다.
- **진료비가 저렴한 병원**은 강남세브란스병원, 순천향대학교 서울병원, 국립중앙의료원이 있습니다.
- **평점이 가장 높은 병원**은 강남세브란스병원(0.94)이며, 반대로 평점이 낮은 병원은 분당서울대학교병원(0.34)입니다.
- 주말 진료가 불가능한 병원은 서울성모병원과 서울아산병원입니다.

필요한 진료과와 예산, 주말 진료 여부를 고려해 병원을 선택하시면 좋겠습니다. 추가로 궁금한 점 있으면 알려주세요!
```
