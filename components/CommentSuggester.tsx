"use client";

import React, { useState } from "react";

export type Platform = "tiktok" | "linkedin" | "x";

interface CommentSuggestion {
  text: string;
  tone: string;
  structure: string;
  length: string;
}

interface ApiResponse {
  suggestions: CommentSuggestion[];
  platform: string;
  model: string;
  error?: string;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://suggest-comment.vercel.app";

const TONES = [
  { value: "insightful", label: "Insightful" },
  { value: "technical", label: "Technical" },
  { value: "founder", label: "Founder" },
  { value: "builder", label: "Builder" },
  { value: "question", label: "Question" },
  { value: "appreciative", label: "Appreciative (no insight, just thanks)" },
];

const MODELS = [
  { value: "gpt-5-mini", label: "GPT-5 mini (default)" },
  { value: "gpt-5.4", label: "GPT-5.4 (best quality)" },
  { value: "gpt-4o-mini", label: "GPT-4o mini (fastest, cheapest)" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
];

const GOALS = [
  { value: "add_value", label: "Add value" },
  { value: "ask_question", label: "Ask a question" },
  { value: "share_resource", label: "Share a resource" },
  { value: "challenge_assumption", label: "Challenge an assumption" },
];

const PLATFORM_META: Record<
  Platform,
  { label: string; placeholder: string; footer: string }
> = {
  tiktok: {
    label: "TikTok",
    placeholder: "Paste the TikTok caption or video transcript here...",
    footer:
      "Review and edit before posting. You must manually paste and post this comment in TikTok.",
  },
  linkedin: {
    label: "LinkedIn",
    placeholder: "Paste the LinkedIn post text here...",
    footer:
      "Review and edit before posting. You must manually paste and post this comment on LinkedIn.",
  },
  x: {
    label: "X",
    placeholder: "Paste the X (Twitter) post text here...",
    footer:
      "Review and edit before posting. You must manually paste and post this comment on X.",
  },
};

export default function CommentSuggester({ platform }: { platform: Platform }) {
  const [postText, setPostText] = useState("");
  const [conversationContext, setConversationContext] = useState("");
  const [tone, setTone] = useState("insightful");
  const [goal, setGoal] = useState("add_value");
  const [model, setModel] = useState(MODELS[0].value);
  const [suggestions, setSuggestions] = useState<CommentSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const meta = PLATFORM_META[platform];

  const handleGenerate = async () => {
    if (!postText.trim()) {
      setError(`Please paste the ${meta.label} caption or post text.`);
      return;
    }

    setLoading(true);
    setError("");
    setSuggestions([]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/suggest-comment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform,
          postText,
          tone,
          goal,
          model,
          userContext: conversationContext.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to generate suggestions");
        return;
      }

      const data: ApiResponse = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setSuggestions(data.suggestions);
    } catch (err) {
      setError(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div
      style={{ colorScheme: "light" }}
      className="min-h-screen bg-[#fafafa] text-[#111]"
    >
      <div className="mx-auto max-w-2xl px-6 py-16">
        {/* Header */}
        <div className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e4e4e7] bg-white px-3 py-1 text-xs font-medium text-[#71717a] shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00d4a0]" />
              {meta.label}
            </div>
            <nav className="flex items-center gap-3 text-xs font-medium text-[#a1a1aa]">
              {(["tiktok", "linkedin", "x"] as Platform[]).map((p) => (
                <a
                  key={p}
                  href={`/${p}`}
                  className={
                    p === platform
                      ? "text-[#0a0a0a]"
                      : "transition-colors hover:text-[#0a0a0a]"
                  }
                >
                  {PLATFORM_META[p].label}
                </a>
              ))}
            </nav>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#0a0a0a]">
            Comment Suggester
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[#71717a]">
            Paste a caption, get AI-powered suggestions. Copy and post
            manually.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-[#eaeaea] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {/* Input */}
          <div className="border-b border-[#eaeaea] p-5">
            <label className="mb-2 block text-xs font-medium text-[#71717a]">
              Caption or post text
            </label>
            <textarea
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder={meta.placeholder}
              className="min-h-[110px] w-full resize-y rounded-md border border-[#e4e4e7] bg-[#fafafa] px-3 py-2.5 text-sm leading-relaxed text-[#0a0a0a] placeholder:text-[#a1a1aa] outline-none transition-colors focus:border-[#0a0a0a] focus:bg-white"
            />
          </div>

          {/* Conversation context */}
          <div className="border-b border-[#eaeaea] p-5">
            <label className="mb-2 block text-xs font-medium text-[#71717a]">
              Conversation context (optional)
            </label>
            <textarea
              value={conversationContext}
              onChange={(e) => setConversationContext(e.target.value)}
              placeholder="Replying to a reply on your own comment? Paste the thread so far (your comment, their reply) so suggestions stay on-topic."
              className="min-h-[70px] w-full resize-y rounded-md border border-[#e4e4e7] bg-[#fafafa] px-3 py-2.5 text-sm leading-relaxed text-[#0a0a0a] placeholder:text-[#a1a1aa] outline-none transition-colors focus:border-[#0a0a0a] focus:bg-white"
            />
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-end gap-3 p-5">
            <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
              <label className="text-xs font-medium text-[#71717a]">
                Tone
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="rounded-md border border-[#e4e4e7] bg-white px-3 py-2 text-sm text-[#0a0a0a] outline-none transition-colors focus:border-[#0a0a0a]"
              >
                {TONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
              <label className="text-xs font-medium text-[#71717a]">
                Goal
              </label>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="rounded-md border border-[#e4e4e7] bg-white px-3 py-2 text-sm text-[#0a0a0a] outline-none transition-colors focus:border-[#0a0a0a]"
              >
                {GOALS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
              <label className="text-xs font-medium text-[#71717a]">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="rounded-md border border-[#e4e4e7] bg-white px-3 py-2 text-sm text-[#0a0a0a] outline-none transition-colors focus:border-[#0a0a0a]"
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="rounded-md bg-[#0a0a0a] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
            {error}
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-[#71717a]">
              Suggestions
            </h2>
            <div className="flex flex-col gap-3">
              {suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-[#eaeaea] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-[#d4d4d8]"
                >
                  <p className="mb-3 text-sm leading-relaxed text-[#0a0a0a]">
                    {suggestion.text}
                  </p>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-[#ecfdf5] px-2.5 py-0.5 text-[11px] font-medium text-[#047857]">
                      {suggestion.tone}
                    </span>
                    <span className="rounded-full bg-[#f4f4f5] px-2.5 py-0.5 text-[11px] font-medium text-[#52525b]">
                      {suggestion.length}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopy(suggestion.text, index)}
                    className={`w-full rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      copiedIndex === index
                        ? "border-[#00d4a0] bg-[#ecfdf5] text-[#047857]"
                        : "border-[#e4e4e7] bg-white text-[#0a0a0a] hover:bg-[#fafafa]"
                    }`}
                  >
                    {copiedIndex === index ? "Copied" : "Copy"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 border-t border-[#eaeaea] pt-6 text-center text-xs leading-relaxed text-[#a1a1aa]">
          {meta.footer}
        </div>
      </div>
    </div>
  );
}
