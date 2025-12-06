// utils/analyzeSegments.js
import pLimit from "p-limit";

import { segmentByGap } from "./segmentConversations.js";
import { analyzeConversationBatch } from "../api/analysis.js";

/**
 * Analyze each segment's text via the backend.
 * Uses p-limit for concurrency control.
 */
export async function analyzeSegments(messages, onProgress) {
  const limit = pLimit(8); // up to 8 parallel analyses
  const segments = segmentByGap(messages);
  const results = [];

  console.log(
    `→ Segmenting ${messages.length} messages into ${segments.length} sessions`
  );

  async function analyzeOne(segment, idx, total) {
    const conversationText = segment
      .filter((m) => m && typeof m.text === "string" && m.text.trim().length > 0)
      .map((m) => {
        const sender = (m.sender || "Unknown").toString().trim() || "Unknown";
        const text = m.text.replace(/\s+/g, " ").trim();
        const date = typeof m.date === "string" ? m.date.trim() : "";
        const time = typeof m.time === "string" ? m.time.trim() : "";
        const timestamp = [date, time].filter(Boolean).join(" ");
        const prefix = timestamp ? `[${timestamp}] ` : "";
        return `${prefix}${sender}: ${text}`;
      })
      .join("\n");

    const baseResult = {
      id: idx + 1,
      start: segment[0].date + " " + segment[0].time,
      end: segment[segment.length - 1].date + " " + segment[segment.length - 1].time,
    };

    // Safety: skip absurdly long chunks (prevents Ollama from choking)
    if (conversationText.length > 50000) {
      console.warn("Skipping huge segment", idx + 1, conversationText.length);
      const result = {
        ...baseResult,
        summary: "Segment too large, skipped.",
        mood: "neutral",
      };
      results[idx] = result;
      if (onProgress) onProgress(result, idx + 1, total);
      return;
    }

    console.log(`Analyzing segment ${idx + 1}/${total}, length: ${conversationText.length}`);
    console.log("Segment preview:", conversationText.slice(0, 200));

    if (!conversationText || conversationText.length < 20) {
      console.warn(`Skipping short/empty segment ${idx + 1}`);
      if (onProgress) onProgress(null, idx + 1, total);
      return;
    }

    try {
      const parsed = await analyzeConversationBatch(conversationText);
      const result = {
        ...baseResult,
        ...parsed,
      };

      results[idx] = result;
      if (onProgress) onProgress(result, idx + 1, total);
    } catch (err) {
      console.error("Error analyzing segment", idx, err);
    }
  }

  const tasks = segments.map((seg, i) => limit(() => analyzeOne(seg, i, segments.length)));
  await Promise.all(tasks);
  return results.filter(Boolean);
}
