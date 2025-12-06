import React, { useState, useRef } from "react";
import { analyzeSegments } from "../utils/analyzeSegments.js";
import { analyzeConversation } from "../api/analysis.js";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "have",
  "this",
  "from",
  "your",
  "what",
  "when",
  "were",
  "will",
  "about",
  "there",
  "would",
  "could",
  "should",
  "cant",
  "dont",
  "doesnt",
  "didnt",
  "just",
  "here",
  "want",
  "need",
  "thanks",
  "thank",
  "please",
  "been",
  "they",
  "them",
  "then",
  "have",
  "into",
  "because",
  "like",
  "really",
  "some",
  "were",
  "theres",
]);

function parseDateString(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const [monthStr, dayStr, yearStr] = parts.map((part) => part.trim());
  const month = Number.parseInt(monthStr, 10) - 1;
  const day = Number.parseInt(dayStr, 10);
  const year = yearStr.length === 2 ? Number.parseInt(`20${yearStr}`, 10) : Number.parseInt(yearStr, 10);
  if (
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(year) ||
    month < 0 ||
    month > 11 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const parsed = new Date(year, month, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDuration(startDate, endDate) {
  if (
    !(startDate instanceof Date) ||
    Number.isNaN(startDate?.getTime()) ||
    !(endDate instanceof Date) ||
    Number.isNaN(endDate?.getTime())
  ) {
    return "Unknown";
  }

  let from = startDate;
  let to = endDate;
  if (to < from) {
    [from, to] = [to, from];
  }

  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();

  if (days < 0) {
    const previousMonth = new Date(to.getFullYear(), to.getMonth(), 0);
    days += previousMonth.getDate();
    months -= 1;
  }

  if (months < 0) {
    months += 12;
    years -= 1;
  }

  years = Math.max(years, 0);
  months = Math.max(months, 0);
  days = Math.max(days, 0);

  const yearLabel = `${years} year${years === 1 ? "" : "s"}`;
  const monthLabel = `${months} month${months === 1 ? "" : "s"}`;
  const dayLabel = `${days} day${days === 1 ? "" : "s"}`;
  return `${yearLabel}, ${monthLabel}, ${dayLabel}`;
}

function buildConversationText(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "";
  }

  return messages
    .filter(
      (msg) =>
        msg &&
        typeof msg.text === "string" &&
        msg.text.trim().length > 0
    )
    .map((msg) => {
      const sender = typeof msg.sender === "string" && msg.sender.trim().length > 0
        ? msg.sender.trim()
        : "Unknown";
      const text = msg.text.replace(/\s+/g, " ").trim();
      const date = typeof msg.date === "string" ? msg.date.trim() : "";
      const time = typeof msg.time === "string" ? msg.time.trim() : "";
      const timestamp = [date, time].filter(Boolean).join(" ");
      const prefix = timestamp ? `[${timestamp}] ` : "";
      return `${prefix}${sender}: ${text}`;
    })
    .join("\n");
}

function fallbackTopicsFromMessages(messages, limit = 5) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const frequency = new Map();

  messages.forEach((msg) => {
    if (!msg || typeof msg.text !== "string") return;
    const normalizedWords = msg.text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    normalizedWords.forEach((word) => {
      if (word.length < 4) return;
      if (STOPWORDS.has(word)) return;
      frequency.set(word, (frequency.get(word) || 0) + 1);
    });
  });

  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function aggregateTopicsFromSegments(segments, limit = 5) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return [];
  }

  const topicMap = new Map();

  segments.forEach((segment) => {
    if (!segment || !Array.isArray(segment.topics)) return;
    segment.topics.forEach((topic) => {
      if (typeof topic !== "string") return;
      const cleaned = topic.trim();
      if (!cleaned) return;
      const key = cleaned.toLowerCase();
      const current = topicMap.get(key);
      if (current) {
        current.count += 1;
      } else {
        topicMap.set(key, { label: cleaned, count: 1 });
      }
    });
  });

  return [...topicMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((entry) => entry.label);
}

function normalizeTopics(topics, limit = 5) {
  if (!Array.isArray(topics)) {
    return [];
  }

  return topics
    .filter((topic) => typeof topic === "string")
    .map((topic) => topic.trim())
    .filter(Boolean)
    .slice(0, limit);
}

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
    const year = yStrRaw.length === 2 ? Number(`20${yStrRaw}`) : Number(yStrRaw);
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

function normalizeTodoItems(value, limit = 12, fallbackDate = null) {
  if (!Array.isArray(value)) {
    if (value && typeof value === "object" && Array.isArray(value.items)) {
      return normalizeTodoItems(value.items, limit, fallbackDate);
    }
    return [];
  }

  const seen = new Map();
  const todos = [];
  const normalizedFallback = normalizeTodoDate(fallbackDate);

  value.forEach((entry) => {
    if (!entry) return;

    let task = "";
    let assignee = "Unassigned";
    let date = null;

    if (typeof entry === "string") {
      const cleaned = entry.trim();
      if (!cleaned) return;

      const colonIndex = cleaned.indexOf(":");
      if (colonIndex !== -1) {
        const potentialAssignee = cleaned.slice(0, colonIndex).trim();
        const potentialTask = cleaned.slice(colonIndex + 1).trim();
        if (potentialTask) {
          assignee = potentialAssignee || "Unassigned";
          task = potentialTask;
        }
      }

      if (!task) {
        task = cleaned;
      }
    } else if (typeof entry === "object") {
      const taskSource =
        typeof entry.task === "string"
          ? entry.task
          : typeof entry.todo === "string"
          ? entry.todo
          : typeof entry.description === "string"
          ? entry.description
          : "";
      task = taskSource.trim();
      const assigneeSource =
        typeof entry.assignee === "string"
          ? entry.assignee
          : typeof entry.owner === "string"
          ? entry.owner
          : typeof entry.person === "string"
          ? entry.person
          : "";
      assignee = assigneeSource.trim() || "Unassigned";

       const dateSource =
         typeof entry.date === "string"
           ? entry.date
           : typeof entry.when === "string"
           ? entry.when
           : typeof entry.on === "string"
           ? entry.on
           : "";
       date = normalizeTodoDate(dateSource);
    }

    if (!task) return;

    if (!date && normalizedFallback) {
      date = normalizedFallback;
    }

    const key = `${assignee.toLowerCase()}|${task.toLowerCase()}`;
    if (seen.has(key)) {
      const existing = todos[seen.get(key)];
      existing.date = pickEarlierDate(existing.date || null, date || null);
      return;
    }

    const todoEntry = { assignee, task };
    if (date) {
      todoEntry.date = date;
    }

    todos.push(todoEntry);
    seen.set(key, todos.length - 1);
  });

  todos.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  return todos.slice(0, limit);
}

function formatTodoDisplayDate(value) {
  const normalized = normalizeTodoDate(value);
  if (!normalized) return null;
  const [yearStr, monthStr, dayStr] = normalized.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthIndex = Number(monthStr) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    return normalized;
  }
  const day = Number(dayStr);
  const month = months[monthIndex];
  return `${month} ${Number.isNaN(day) ? dayStr : day}, ${yearStr}`;
}

function collectTodos(overall, segments, limit = 12) {
  const combined = [];
  const seen = new Map();

  function addTodos(list, fallbackDate) {
    const normalized = normalizeTodoItems(list, limit, fallbackDate);
    normalized.forEach((todo) => {
      const key = `${todo.assignee.toLowerCase()}|${todo.task.toLowerCase()}`;
      if (seen.has(key)) {
        const existing = combined[seen.get(key)];
        existing.date = pickEarlierDate(existing.date || null, todo.date || null);
        return;
      }
      combined.push(todo);
      seen.set(key, combined.length - 1);
    });
  }

  if (overall) {
    addTodos(overall.todos, null);
    addTodos(overall.todoList, null);
    addTodos(overall.todoItems, null);
    addTodos(overall.actionItems, null);
    addTodos(overall.tasks, null);
  }

  if (Array.isArray(segments)) {
    segments.forEach((segment) => {
      if (!segment) return;
      const fallbackDate =
        typeof segment.start === "string"
          ? segment.start.split(" ")[0]
          : null;
      addTodos(segment.todos, fallbackDate);
      addTodos(segment.todoList, fallbackDate);
      addTodos(segment.todoItems, fallbackDate);
      addTodos(segment.actionItems, fallbackDate);
      addTodos(segment.tasks, fallbackDate);
    });
  }

  combined.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  return combined.slice(0, limit);
}

function generateInsightsSummary({ overall, segments, messages, firstDate, lastDate }) {
  const startDate = parseDateString(firstDate);
  const endDate = parseDateString(lastDate);
  const timeRange = formatDuration(startDate, endDate);

  const relationshipType = (() => {
    const overallType = typeof overall?.relationshipType === "string"
      ? overall.relationshipType.trim().toLowerCase()
      : null;
    if (overallType === "personal" || overallType === "professional") {
      return overallType;
    }

    if (Array.isArray(segments) && segments.length > 0) {
      const tally = segments.reduce(
        (acc, seg) => {
          const type = typeof seg?.relationshipType === "string"
            ? seg.relationshipType.trim().toLowerCase()
            : null;
          if (type === "personal" || type === "professional") {
            acc[type] = (acc[type] || 0) + 1;
          }
          return acc;
        },
        {}
      );

      const professionalCount = tally.professional || 0;
      const personalCount = tally.personal || 0;

      if (professionalCount || personalCount) {
        return professionalCount > personalCount ? "professional" : "personal";
      }
    }

    return "personal";
  })();

  let topics = normalizeTopics(overall?.topics);
  if (!topics.length) {
    topics = aggregateTopicsFromSegments(segments);
  }
  // if (!topics.length) {
  //   topics = fallbackTopicsFromMessages(messages);
  // }
  if (!topics.length) {
    topics = ["Not enough data"];
  }

  const todos = collectTodos(overall, segments);

  return {
    timeRange,
    relationshipType,
    topics,
    overview:
      typeof overall?.summary === "string" && overall.summary.trim().length > 0
        ? overall.summary.trim()
        : null,
    todos,
  };
}

export default function InsightsView({ chat }) {
  const [segments, setSegments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [avgTime, setAvgTime] = useState(null);
  const startTimeRef = useRef(null);

  async function handleAnalyze() {
    setSegments([]);
    setSummary(null);
    setLoading(true);
    const startedAt = Date.now();
    startTimeRef.current = startedAt;

    try {
      const overallPromise = (async () => {
        try {
          const conversationText = buildConversationText(chat?.messages);
          if (!conversationText) {
            return null;
          }
          return await analyzeConversation(conversationText);
        } catch (overallErr) {
          console.error("Overall analysis failed:", overallErr);
          return null;
        }
      })();

      // 🧠 1. Run main per-segment analysis
      const segmentsPromise = analyzeSegments(chat.messages, (result, current, total) => {
        if (result) {
          setSegments((prev) => [...prev, result]);
        }
        setProgress({ current, total });

        // Update average per-segment timing for remaining estimate
        if (current > 0 && startTimeRef.current) {
          const elapsed = (Date.now() - startTimeRef.current) / 1000;
          setAvgTime(elapsed / current);
        }
      });

      const [overall, results] = await Promise.all([overallPromise, segmentsPromise]);

      setSegments(results);

      if (chat) {
        setSummary(
          generateInsightsSummary({
            overall,
            segments: results,
            messages: Array.isArray(chat?.messages) ? chat.messages : [],
            firstDate: chat?.firstDate || null,
            lastDate: chat?.lastDate || null,
          })
        );
      }

    } catch (err) {
      console.error("Analysis failed:", err);
      alert("Something went wrong during analysis. Check console for details.");
    } finally {
      setLoading(false);
      startTimeRef.current = null;
    }
  }

  // ⏱️ Remaining time estimate
  const remainingSeconds =
    avgTime && progress.total
      ? Math.max(0, (progress.total - progress.current) * avgTime)
      : 0;

  const formatRemaining = (seconds) => {
    const total = Math.max(0, Math.round(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    const minPart = mins > 0 ? `${mins} min${mins === 1 ? "" : "s"}` : null;
    const secPart = `${secs} sec${secs === 1 ? "" : "s"}`;
    return minPart ? `${minPart}, ${secPart}` : secPart;
  };

  const pct =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <h2>Conversation Insights</h2>

      <button
        onClick={handleAnalyze}
        disabled={loading}
        style={{
          marginBottom: "1rem",
          padding: "0.6rem 1.2rem",
          background: loading ? "#ccc" : "#007bff",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading
          ? `Analyzing (${progress.current}/${progress.total})...`
          : "Analyze Conversations"}
      </button>

      {loading && (
        <div style={{ marginBottom: "1rem" }}>
          <progress
            value={progress.current}
            max={progress.total}
            style={{ width: "100%" }}
          />
          <p style={{ fontSize: "0.9rem", color: "#666" }}>
            {pct}% complete
            {avgTime && <> — est. {formatRemaining(remainingSeconds)} remaining</>}
          </p>
        </div>
      )}

      {summary && (
        <div
          style={{
            marginTop: "1.5rem",
            padding: "1rem",
            borderRadius: "10px",
            background: "#f7f9fc",
            border: "1px solid #e1e8f5",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Summary</h3>
          {summary.overview && (
            <p style={{ margin: "0 0 0.75rem 0", color: "#333" }}>{summary.overview}</p>
          )}
          <p style={{ margin: "0 0 0.5rem 0" }}>
            <strong>Time Range:</strong> {summary.timeRange}
          </p>
          <p style={{ margin: "0 0 0.75rem 0" }}>
            <strong>Relationship Type:</strong> {summary.relationshipType}
          </p>
          <div>
            <strong>Top Topics:</strong>
            <ul style={{ marginTop: "0.5rem", paddingLeft: "1.25rem", marginBottom: 0 }}>
              {summary.topics.map((topic) => (
                <li key={topic}>{topic}</li>
              ))}
            </ul>
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <strong>Action Items:</strong>
            {summary.todos.length > 0 ? (
              <ul
                style={{
                  marginTop: "0.5rem",
                  paddingLeft: "1.25rem",
                  marginBottom: 0,
                }}
              >
                {summary.todos.map((todo) => {
                  const dateLabel = formatTodoDisplayDate(todo.date) || "Date unknown";
                  return (
                    <li key={`${todo.assignee}-${todo.task}-${todo.date || "nodate"}`}>
                      <strong>{todo.assignee}</strong>: {todo.task}{" "}
                      <span style={{ color: "#666" }}>[{dateLabel}]</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p style={{ margin: "0.35rem 0 0 0", color: "#555" }}>
                No clear action items detected.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 🧾 Render individual analyzed segments */}
      {segments.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          {segments.map((seg) => (
            <div
              key={seg.id}
              style={{
                marginBottom: "1rem",
                padding: "1rem",
                borderRadius: "10px",
                background:
                  seg.mood === "positive"
                    ? "#e6ffe6"
                    : seg.mood === "negative"
                    ? "#ffe6e6"
                    : seg.mood === "mixed"
                    ? "#fffbe6"
                    : "#f0f0f0",
              }}
            >
              <h4>
                Conversation {seg.id}{" "}
                <span style={{ color: "#666" }}>({seg.mood})</span>
              </h4>
              <p style={{ fontSize: "0.9rem", color: "#666" }}>
                {seg.start} – {seg.end}
              </p>
              <p>{seg.summary}</p>
            </div>
          ))}
        </div>
      )}

      {/* Semantic themes removed */}
    </div>
  );
}
