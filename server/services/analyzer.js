import config from "../config.js";
import { getOpenAIClient } from "./openaiClient.js";

const ALLOWED_MOODS = new Set(["positive", "neutral", "negative", "mixed"]);

function normalizeTodoDate(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();
  if (!cleaned) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  const slashMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const [, mStr, dStr, yStrRaw] = slashMatch;
    const normalizeYear = (y) => {
      if (y.length === 2) {
        return Number(`20${y}`);
      }
      return Number(y);
    };
    const year = normalizeYear(yStrRaw);
    const month = Number(mStr);
    const day = Number(dStr);
    if (
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      Number.isInteger(day) &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      const yyyy = String(year).padStart(4, "0");
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed?.getTime?.())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function pickEarlierDate(a, b) {
  if (a && !b) return a;
  if (b && !a) return b;
  if (!a && !b) return null;
  return a <= b ? a : b;
}

function normalizeTodoItem(item) {
  if (!item) return null;

  if (typeof item === "string") {
    const cleaned = item.trim();
    if (!cleaned) return null;

    const colonIndex = cleaned.indexOf(":");
    if (colonIndex !== -1) {
      const potentialAssignee = cleaned.slice(0, colonIndex).trim();
      const potentialTask = cleaned.slice(colonIndex + 1).trim();
      if (potentialTask) {
        return {
          assignee: potentialAssignee || "Unassigned",
          task: potentialTask,
        };
      }
    }

    return {
      assignee: "Unassigned",
      task: cleaned,
      date: null,
    };
  }

  if (typeof item === "object") {
    const task =
      typeof item.task === "string"
        ? item.task.trim()
        : typeof item.todo === "string"
        ? item.todo.trim()
        : typeof item.description === "string"
        ? item.description.trim()
        : "";

    if (!task) {
      return null;
    }

    const assigneeSource =
      typeof item.assignee === "string"
        ? item.assignee
        : typeof item.owner === "string"
        ? item.owner
        : typeof item.person === "string"
        ? item.person
        : "";

    const assignee = assigneeSource.trim() || "Unassigned";

    const normalized = {
      assignee,
      task,
      date: null,
    };

    if (typeof item.confidence === "number" && !Number.isNaN(item.confidence)) {
      const boundedConfidence = Math.max(0, Math.min(1, item.confidence));
      normalized.confidence = boundedConfidence;
    } else if (
      typeof item.confidence === "string" &&
      item.confidence.trim().length > 0
    ) {
      const parsedConfidence = Number.parseFloat(item.confidence);
      if (!Number.isNaN(parsedConfidence)) {
        const boundedConfidence = Math.max(0, Math.min(1, parsedConfidence));
        normalized.confidence = boundedConfidence;
      }
    }

    const dateSource =
      typeof item.date === "string"
        ? item.date
        : typeof item.when === "string"
        ? item.when
        : typeof item.on === "string"
        ? item.on
        : "";
    const normalizedDate = normalizeTodoDate(dateSource);
    if (normalizedDate) {
      normalized.date = normalizedDate;
    }

    return normalized;
  }

  return null;
}

function normalizeTodoList(value) {
  if (!Array.isArray(value)) {
    if (value && typeof value === "object" && Array.isArray(value.items)) {
      return normalizeTodoList(value.items);
    }
    return [];
  }

  const seen = new Map();
  const todos = [];

  value.forEach((entry) => {
    const normalized = normalizeTodoItem(entry);
    if (!normalized) return;

    const key = `${(normalized.assignee || "Unassigned").toLowerCase()}|${normalized.task.toLowerCase()}`;
    if (seen.has(key)) {
      const existing = todos[seen.get(key)];
      const nextDate = normalized.date || null;
      if (nextDate) {
        existing.date = pickEarlierDate(existing.date || null, nextDate);
      }
      return;
    }

    const todoEntry = {
      assignee: normalized.assignee || "Unassigned",
      task: normalized.task,
      ...(typeof normalized.confidence === "number"
        ? { confidence: normalized.confidence }
        : {}),
    };
    if (normalized.date) {
      todoEntry.date = normalized.date;
    }

    todos.push(todoEntry);
    seen.set(key, todos.length - 1);
  });

  return todos.slice(0, 12);
}

function normalizeResult(data) {
  const defaults = {
    summary: "No summary.",
    mood: "neutral",
    relationshipType: "personal",
    topics: [],
    todos: [],
  };

  if (!data || typeof data !== "object") {
    return defaults;
  }

  const summary = typeof data.summary === "string" && data.summary.trim().length > 0
    ? data.summary.trim()
    : defaults.summary;

  const rawMood = typeof data.mood === "string" ? data.mood.trim().toLowerCase() : "";
  const mood = ALLOWED_MOODS.has(rawMood) ? rawMood : defaults.mood;

  const rawRelationship = typeof data.relationshipType === "string"
    ? data.relationshipType.trim().toLowerCase()
    : typeof data.relationship === "string"
    ? data.relationship.trim().toLowerCase()
    : "";
  const relationshipType = rawRelationship === "professional"
    ? "professional"
    : rawRelationship === "personal"
    ? "personal"
    : defaults.relationshipType;

  const topicsSource = Array.isArray(data.topics)
    ? data.topics
    : Array.isArray(data.topTopics)
    ? data.topTopics
    : [];
  const topics = topicsSource
    .filter((topic) => typeof topic === "string")
    .map((topic) => topic.trim())
    .filter(Boolean)
    .slice(0, 5);

  const todoSourceCandidates = [
    data.todos,
    data.todoList,
    data.todoItems,
    data.actionItems,
    data.tasks,
  ];

  let todos = [];
  for (const candidate of todoSourceCandidates) {
    todos = normalizeTodoList(candidate);
    if (todos.length) break;
  }

  return {
    summary,
    mood,
    relationshipType,
    topics,
    todos,
  };
}

function extractJsonContent(raw) {
  if (!raw) {
    return normalizeResult(null);
  }

  try {
    return normalizeResult(JSON.parse(raw));
  } catch (err) {
    const match = raw.match(/{[\s\S]*}/);
    if (match) {
      try {
        return normalizeResult(JSON.parse(match[0]));
      } catch (inner) {
        // fall through to fallback below
      }
    }

    const fallbackMood =
      /positive|negative|mixed|neutral/i.exec(raw)?.[0]?.toLowerCase() || "neutral";
    return normalizeResult({ summary: raw, mood: fallbackMood });
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
Review the following chat transcript and respond ONLY with valid minified JSON.
Return an object with this exact shape:
{"summary": "concise 1-2 sentence overview",
 "mood": "positive|neutral|negative|mixed",
 "relationshipType": "personal|professional",
 "topics":["up to five brief sentences describing the most important recurring themes across the entire conversation"],
 "todos":[{"assignee":"person responsible or \\"Unassigned\\"","task":"specific actionable follow-up derived from the conversation","date":"YYYY-MM-DD"}]}
Ensure the relationshipType is either "personal" or "professional".
Provide between 3 and 5 sentences in the topics array, each summarizing a distinct theme that appears multiple times or carries notable weight across the full conversation transcript.
Derive todos from explicit commitments, plans, or requests made in the conversation. Deduplicate similar tasks, keep descriptions short and action-oriented, and set the assignee to the participant responsible (or "Unassigned" if unclear).
For each todo, set the date to the calendar date when the task was discussed in the transcript. Use the message's local date and format it as YYYY-MM-DD. If no date is available, leave the field empty but still include the property with an empty string.
Always include the todos array, even if it is empty.
Do not include any additional text outside of the JSON object.`,
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

