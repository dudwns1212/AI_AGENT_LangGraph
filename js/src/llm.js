import 'dotenv/config';
import { ChatOpenAI } from "@langchain/openai"

export const llm = new ChatOpenAI({
    apiKey: process.env.OPEN_AI_KEY || undefined,
    model: "gpt-4.1-mini",
    temperature: 0.1,
    top_p: 0.9
})