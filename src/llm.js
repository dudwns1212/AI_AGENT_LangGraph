///
/// LLM 설정
///
import { ChatOpenAI } from "@langchain/openai";

export const llm = new ChatOpenAI({
    model: "gpt-4.1-mini",
    temperature: 0.2,
});
