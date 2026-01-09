///
/// 포맷터 에이전트: 최종 병원 목록을 사용자에게 이해하기 쉽게 정리
///
import { llm } from "../llm.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";

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
