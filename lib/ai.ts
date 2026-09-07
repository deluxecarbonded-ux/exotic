"use client";

import type { AIQuestion, Category } from "./game";

/* Every AI feature goes through Ollama via /api/ai (server route).
   If Ollama is unreachable, a deterministic generator keeps the game playable. */

export async function fetchQuestion(opts: {
  category: Category | "mixed";
  difficulty: string;
  lang: string;
  level?: number;
  ai?: boolean; /* false = skip generation, use built-in questions */
}): Promise<AIQuestion> {
  try {
    const r = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "question", ...opts }),
    });
    if (!r.ok) throw new Error("ai-down");
    const j = await r.json();
    if (!j.question || typeof j.answer !== "string" || !j.answer)
      throw new Error("ai-bad");
    return j as AIQuestion;
  } catch {
    throw new Error("ai-unavailable");
  }
}

export async function fetchOracleHint(
  question: string,
  answerKind: string,
  answerLen: number,
  lang: string
): Promise<string> {
  try {
    const r = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "oracle",
        question,
        answer_kind: answerKind,
        answer_len: answerLen,
        lang,
      }),
    });
    if (!r.ok) throw new Error("ai-down");
    const j = await r.json();
    return j.text || "…";
  } catch {
    return "…";
  }
}

/* Re-render a generated question in the player's new language without
   touching the parked answer. Returns null when nothing better than the
   original text is available. */
export async function relocalizeQuestion(
  text: string,
  lang: string
): Promise<{ text: string; answer: string } | null> {
  try {
    const r = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "relocalize", text, lang }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (typeof j.text !== "string" || !j.text.trim() || j.text === text) return null;
    return {
      text: j.text.trim(),
      answer: typeof j.answer === "string" ? j.answer.trim() : "",
    };
  } catch {
    return null;
  }
}
