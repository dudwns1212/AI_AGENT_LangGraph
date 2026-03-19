import { llm } from '../llm.js';
import { ChatPromptTemplate } from '@langchain/core/prompts';

export async function formatter(state) {
  const prompt = ChatPromptTemplate.fromTemplate(`
당신은 병원 정보를 안내하는 AI 어시스턴트입니다.

[이번 요청]
{userMessage}

[이전 조건]
{prevPlan}

[현재 적용된 조건]
{plan}

[검색된 병원 목록]
{hospitals}

안내 규칙:
1. 이전 조건과 비교해 변경된 조건이 있으면 첫 문장에 자연스럽게 언급하세요.
2. 각 병원의 이름, 거리, 진료과, 주요 특이사항(주말·응급·MRI/CT 등)을 포함하세요.
3. 결과가 없으면 조건 완화를 친절하게 제안하세요.
`);

  const chain = prompt.pipe(llm);
  const res = await chain.invoke({
    userMessage: state.userMessage,
    prevPlan:    JSON.stringify(state.prevPlan  || {}, null, 2),
    plan:        JSON.stringify(state.plan      || {}, null, 2),
    hospitals:   JSON.stringify(state.hospitals || [], null, 2),
  });

  const output =
    typeof res.content === 'string'  ? res.content
    : Array.isArray(res.content)     ? res.content.map(c => c.text || c).join('')
    : res.content?.text ?? String(res.content);

  return { finalAnswer: output.trim() };
}
// 사용자가 보기 쉽게 포맷