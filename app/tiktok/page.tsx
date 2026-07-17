// pages/tiktok.tsx or app/tiktok/page.tsx
// Simple web app for TikTok comment suggestions

import React, { useState } from "react";

interface CommentSuggestion {
  text: string;
  tone: string;
  structure: string;
  length: string;
}

interface ApiResponse {
  suggestions: CommentSuggestion[];
  platform: string;
  error?: string;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://your-vercel-deployment.vercel.app";

export default function TikTokCommentSuggester() {
  const [postText, setPostText] = useState("");
  const [tone, setTone] = useState("insightful");
  const [goal, setGoal] = useState("add_value");
  const [suggestions, setSuggestions] = useState<CommentSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleGenerate = async () => {
    if (!postText.trim()) {
      setError("Please paste the TikTok caption or post text.");
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
          platform: "tiktok",
          postText,
          tone,
          goal,
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
    <div style={styles.container}>
      <div style={styles.wrapper}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>✨ TikTok Comment Suggester</h1>
          <p style={styles.subtitle}>
            Paste a caption, get AI-powered suggestions. Then copy and comment
            manually.
          </p>
        </div>

        {/* Input Section */}
        <div style={styles.section}>
          <label style={styles.label}>TikTok Caption or Post Text</label>
          <textarea
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            placeholder="Paste the TikTok caption or video transcript here..."
            style={styles.textarea}
          />
        </div>

        {/* Controls */}
        <div style={styles.controls}>
          <div style={styles.controlGroup}>
            <label style={styles.label}>Tone</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              style={styles.select}
            >
              <option value="insightful">Insightful</option>
              <option value="technical">Technical</option>
              <option value="founder">Founder</option>
              <option value="builder">Builder</option>
              <option value="question">Question</option>
            </select>
          </div>

          <div style={styles.controlGroup}>
            <label style={styles.label}>Goal</label>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              style={styles.select}
            >
              <option value="add_value">Add Value</option>
              <option value="ask_question">Ask Question</option>
              <option value="share_resource">Share Resource</option>
              <option value="challenge_assumption">Challenge Assumption</option>
            </select>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            style={styles.generateBtn}
          >
            {loading ? "⏳ Generating..." : "✨ Generate"}
          </button>
        </div>

        {/* Error */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Suggestions</h2>
            <div style={styles.suggestionsList}>
              {suggestions.map((suggestion, index) => (
                <div key={index} style={styles.suggestionCard}>
                  <p style={styles.suggestionText}>{suggestion.text}</p>
                  <div style={styles.meta}>
                    <span style={styles.tag}>{suggestion.tone}</span>
                    <span style={styles.tag}>{suggestion.length}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(suggestion.text, index)}
                    style={{
                      ...styles.copyBtn,
                      ...(copiedIndex === index ? styles.copyBtnCopied : {}),
                    }}
                  >
                    {copiedIndex === index ? "✓ Copied!" : "📋 Copy"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={styles.footer}>
          <p>
            🤝 Review and edit before posting. You must manually paste and post
            this comment in TikTok.
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "20px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
  } as React.CSSProperties,
  wrapper: {
    maxWidth: "700px",
    margin: "0 auto",
    background: "white",
    borderRadius: "12px",
    padding: "32px",
    boxShadow: "0 10px 40px rgba(0, 0, 0, 0.1)",
  } as React.CSSProperties,
  header: {
    marginBottom: "32px",
    textAlign: "center",
  } as React.CSSProperties,
  title: {
    fontSize: "28px",
    fontWeight: "700",
    color: "#333",
    marginBottom: "8px",
  } as React.CSSProperties,
  subtitle: {
    fontSize: "14px",
    color: "#666",
    lineHeight: "1.5",
  } as React.CSSProperties,
  section: {
    marginBottom: "24px",
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: "16px",
    fontWeight: "600",
    color: "#333",
    marginBottom: "16px",
  } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: "500",
    color: "#666",
    marginBottom: "8px",
  } as React.CSSProperties,
  textarea: {
    width: "100%",
    minHeight: "120px",
    padding: "12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "14px",
    fontFamily: "inherit",
    lineHeight: "1.5",
    resize: "vertical",
  } as React.CSSProperties,
  controls: {
    display: "flex",
    gap: "12px",
    marginBottom: "24px",
    flexWrap: "wrap",
  } as React.CSSProperties,
  controlGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
    flex: 1,
    minWidth: "120px",
  } as React.CSSProperties,
  select: {
    padding: "8px 12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "13px",
    fontFamily: "inherit",
    background: "white",
  } as React.CSSProperties,
  generateBtn: {
    padding: "8px 16px",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "opacity 0.2s",
    alignSelf: "flex-end",
  } as React.CSSProperties,
  error: {
    background: "#ffebee",
    border: "1px solid #ef5350",
    color: "#c62828",
    padding: "12px",
    borderRadius: "6px",
    fontSize: "13px",
    marginBottom: "24px",
  } as React.CSSProperties,
  suggestionsList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px",
  } as React.CSSProperties,
  suggestionCard: {
    border: "1px solid #e0e0e0",
    borderRadius: "6px",
    padding: "16px",
    transition: "all 0.2s",
  } as React.CSSProperties,
  suggestionText: {
    fontSize: "14px",
    lineHeight: "1.6",
    color: "#333",
    marginBottom: "12px",
  } as React.CSSProperties,
  meta: {
    display: "flex",
    gap: "8px",
    marginBottom: "12px",
    flexWrap: "wrap" as const,
  } as React.CSSProperties,
  tag: {
    display: "inline-block",
    background: "#f0f0f0",
    padding: "4px 8px",
    borderRadius: "3px",
    fontSize: "11px",
    color: "#666",
  } as React.CSSProperties,
  copyBtn: {
    width: "100%",
    padding: "8px 12px",
    background: "white",
    border: "1px solid #ddd",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "500",
    transition: "all 0.2s",
  } as React.CSSProperties,
  copyBtnCopied: {
    background: "#e8f5e9",
    borderColor: "#4caf50",
    color: "#4caf50",
  } as React.CSSProperties,
  footer: {
    marginTop: "32px",
    paddingTop: "24px",
    borderTop: "1px solid #e0e0e0",
    fontSize: "13px",
    color: "#666",
    textAlign: "center" as const,
    lineHeight: "1.6",
  } as React.CSSProperties,
};
