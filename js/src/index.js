import express from 'express';
import cors from 'cors';
import { StateGraph, START, END } from "@langchain/langgraph";
import { z } from "zod";

import { planner }        from "./agents/planner.js";
import { searcher }       from "./agents/searcher.js";
import { formatter }      from "./agents/formatter.js";
import { filter }         from "./agents/filter.js";
import { supervisorNode } from "./supervisor/node.js";
import { supervisorRoute } from "./supervisor/router.js";

const server = express();
server.use(cors());
server.use(express.json());

export const sessions = new Map();

const StateSchema = z.object({
  userMessage:    z.string().default(''), // 클라이언트로부터 받은 메시지
  sessionId:      z.string().default(''), // 세션 식별자
  plan:           z.any().nullable().default(null), // planner가 생성한 계획
  needsResearch:  z.boolean().default(true), // Planner에서 판단한 추가 정보 검색 필요 여부(LLM X)
  toolsNeeded:    z.array(z.string()).default([]),
  hospitals:      z.array(z.any()).default([]),
  finalAnswer:    z.string().nullable().default(null),
  step:           z.string().nullable().default(null),
  prevPlan:       z.any().nullable().default(null),
  rawHospitals:   z.array(z.any()).default([]),
  searchedParams: z.any().nullable().default(null),
  calledTools:    z.array(z.string()).default([]),
});

const graph = new StateGraph(StateSchema);
graph.addNode("supervisor", supervisorNode);
graph.addNode("planner",    planner);
graph.addNode("searcher",   searcher);
graph.addNode("formatter",  formatter);
graph.addNode("filter",     filter);

graph.addConditionalEdges("supervisor", supervisorRoute);
graph.addEdge(START,       "supervisor");
graph.addEdge("planner",   "supervisor");
graph.addEdge("searcher",  "supervisor");
graph.addEdge("filter",    "supervisor");
graph.addEdge("formatter", END);

const app = graph.compile();

server.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: 'message와 sessionId는 필수입니다.' });
    }

    const prev = sessions.get(sessionId) || {};

    console.log('index: 세션에서 불러온 값:', {
      hasPlan:         !!prev.plan,
      hasRawHospitals: (prev.rawHospitals || []).length,
      searchedParams:  prev.searchedParams,
      calledTools:     prev.calledTools,
    });

    const inputState = {
      userMessage:    message,
      sessionId,
      plan:           null,
      needsResearch:  true,
      toolsNeeded:    [],
      hospitals:      [],
      finalAnswer:    null,
      step:           null,
      prevPlan:       prev.plan           || null,
      rawHospitals:   prev.rawHospitals   || [],
      searchedParams: prev.searchedParams || null,
      calledTools:    prev.calledTools    || [],
    };
    
    const result = await app.invoke(inputState);

    const saveData = {
      plan:           result.plan,
      rawHospitals:   result.rawHospitals,
      // needsResearch=false면 searcher 미실행 → result.searchedParams가 null
      // 이 경우 filter에서 distance만 갱신된 값을 쓰거나 이전 값 유지
      searchedParams: result.searchedParams || prev.searchedParams,
      calledTools:    result.calledTools,
    };
    
    console.log('index: 세션 저장:', saveData.searchedParams);
    sessions.set(sessionId, saveData);
    
    res.json({ answer: result.finalAnswer, sessionId });
  } catch (err) {
    console.error('서버 에러 발생:', err);
    res.status(500).json({ error: err.message });
  }
});

server.delete('/api/session/:sessionId', (req, res) => {
  sessions.delete(req.params.sessionId);
  res.json({ success: true });
});

server.listen(3000, () => {
  console.log('서버 실행중');
});
