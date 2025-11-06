import config from "../config.js";
import { getOpenAIClient } from "./openaiClient.js";

function extractJsonContent(raw) {
  if (!raw) {
    return { summary: "No summary.", mood: "neutral" };
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    const match = raw.match(/{[\s\S]*}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (inner) {
        // fall through to fallback below
      }
    }

    return {
      summary: raw,
      mood:
        /positive|negative|mixed|neutral/i.exec(raw)?.[0]?.toLowerCase() || "neutral",
    };
  }
}

export async function summarizeWithOpenAI(conversationText, options = {}) {
  const client = getOpenAIClient();
  const { chatModel, temperature } = {
    ...config.openai,
    ...options,
  };

  const completion = await client.chat.completions.create({
    model: chatModel,
    temperature,
    messages: [
      {
        role: "system",
        content: `You are a precise conversation analyst.
Summarize the following chat in one or two sentences.
Then, label the overall mood as one of: "positive", "neutral", "negative", or "mixed".
Respond ONLY with a valid JSON object like this:
{"summary": "...", "mood": "..."}`,
      },
      { role: "user", content: conversationText },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content?.trim();
  return extractJsonContent(raw);
}

export async function summarizeConversation(conversationText) {
  return summarizeWithOpenAI(conversationText);
}

