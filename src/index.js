///
/// 메인 실행 파일
///
import { StateGraph, START, END } from "@langchain/langgraph";
import { z } from "zod";

import { planner } from "./agents/planner.js";
import { searcher } from "./agents/searcher.js";
import { filter } from "./agents/filter.js";
import { formatter } from "./agents/formatter.js";

import { supervisorNode } from "./supervisor/node.js";
import { supervisorRoute } from "./supervisor/router.js";



///
/// 상태 스키마 정의: 보관하고자 하는 모든 상태를 여기에 명시
///
const StateSchema = z.object({
    messages: z.array(z.any()).default([]),
    plan: z.any().nullable().default(null),
    hospitals: z.array(z.any()).nullable().default(null),
    filtered: z.boolean().default(false),
    finalAnswer: z.string().nullable().default(null),
});

// 그래프 생성
const graph = new StateGraph(StateSchema);

// supervisor는 "라우터 노드" 이므로 ends에서 어디로 갈지 정의
graph.addNode("supervisor", supervisorNode, {
    ends: ["planner", "searcher", "filter", "formatter", END],
});

// 실제 처리 노드들
graph.addNode("planner", planner);
graph.addNode("searcher", searcher);
graph.addNode("filter", filter);
graph.addNode("formatter", formatter);

// 조건에 따라 다음 노드를 결정하는 라우터 함수 연결
graph.addConditionalEdges("supervisor", supervisorRoute);

// 흐름을 정의
graph.addEdge(START, "supervisor")
graph.addEdge("planner", "supervisor");
graph.addEdge("searcher", "supervisor");
graph.addEdge("filter", "supervisor");
graph.addEdge("formatter", END);

// 그래프 컴파일
const app = graph.compile();

// 그래프 앱을 실행하는 헬퍼 함수
const runApp = async (input) => app.invoke({ messages: [input] });

// 실제 실행 샘플
const input = `안녕하세요, 저는 최근에 가슴 통증이 심해져서 병원을 찾고 있습니다.
제가 있는 곳은 서울 강남구이고, 가능한 한 가까운 병원을 원해요. 
또한, 주말에도 진료가 가능한 병원이면 좋겠습니다. 
비용도 너무 비싸지 않은 곳이면 좋겠고요. 
추천해주실 수 있을까요? 감사합니다!`;

console.log("\n=== 입력 ===\n", input);
const result = await runApp(input);
console.log("\n=== 전체 상태 ===\n", result);
console.log("\n=== 최종 결과 ===\n", result.finalAnswer);
