import { Router } from "express";

import { summarizeConversation } from "../services/analyzer.js";

const router = Router();

function buildConversationText(body) {
  if (!body) return "";
  if (typeof body.conversationText === "string") {
    return body.conversationText;
  }
  if (typeof body.conversation === "string") {
    return body.conversation;
  }
  if (Array.isArray(body.messages)) {
    return body.messages
      .map((m) => `${m.sender || "Unknown"}: ${m.text || ""}`)
      .join("\n");
  }
  return "";
}

function isTooShort(text) {
  return !text || text.trim().length < 20;
}

router.post("/analyze", async (req, res) => {
  const conversationText = buildConversationText(req.body);
  console.log("Incoming /analyze body length:", conversationText?.length);

  if (isTooShort(conversationText)) {
    return res.json({
      summary: "Conversation too short or empty.",
      mood: "neutral",
    });
  }

  try {
    const result = await summarizeConversation(conversationText);
    res.json(result);
  } catch (err) {
    console.error("Error in /analyze:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/analyze-batch", async (req, res) => {
  const conversationText = buildConversationText(req.body);
  console.log(
    "Incoming /analyze-batch body length:",
    conversationText ? conversationText.length : "undefined"
  );

  if (isTooShort(conversationText)) {
    return res.json({
      summary: "Conversation too short or empty.",
      mood: "neutral",
    });
  }

  try {
    const result = await summarizeConversation(conversationText);
    res.json(result);
  } catch (err) {
    console.error("Error in /analyze-batch:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

