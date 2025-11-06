import config from "../config.js";
import { getOpenAIClient } from "./openaiClient.js";

export async function embedText(text, options = {}) {
  const client = getOpenAIClient();
  const { embeddingModel } = { ...config.openai, ...options };

  const response = await client.embeddings.create({
    model: embeddingModel,
    input: text,
  });

  const vector = response.data?.[0]?.embedding;
  if (!Array.isArray(vector)) {
    throw new Error("OpenAI embedding response missing vector data");
  }

  return vector;
}

