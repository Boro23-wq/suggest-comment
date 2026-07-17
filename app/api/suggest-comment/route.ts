import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const ALLOWED_MODELS = [
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "gpt-5-mini",
  "gpt-5.4",
] as const;

type AllowedModel = (typeof ALLOWED_MODELS)[number];

const DEFAULT_MODEL: AllowedModel = "gpt-5-mini";

// Reasoning models (e.g. gpt-5-mini) only support the default temperature (1),
// and spend part of their completion-token budget on internal reasoning before
// writing any output — so they need a larger token budget and a low reasoning
// effort, or a long system prompt can burn the whole budget on reasoning and
// return an empty response.
const REASONING_MODELS = new Set<AllowedModel>(["gpt-5-mini"]);

interface SuggestCommentRequest {
  platform: "linkedin" | "x" | "tiktok";
  postText: string;
  postUrl?: string;
  tone?:
    | "technical"
    | "founder"
    | "builder"
    | "insightful"
    | "question"
    | "appreciative";
  goal?:
    | "add_value"
    | "ask_question"
    | "share_resource"
    | "challenge_assumption";
  userContext?: string;
  model?: string;
}

interface CommentSuggestion {
  text: string;
  tone:
    | "technical"
    | "founder"
    | "builder"
    | "insightful"
    | "question"
    | "appreciative";
  structure: string;
  length: "short" | "medium" | "long";
}

interface SuggestCommentResponse {
  suggestions: CommentSuggestion[];
  platform: string;
  postUrl?: string;
  model: string;
  generatedAt: string;
  error?: string;
}

// Build the system prompt
const buildSystemPrompt = (): string => {
  return `You are a social media engagement assistant trained to generate authentic, thoughtful comments that sound like an experienced software engineer transitioning into founding.

**Your persona:**
- Software engineer → founder
- Interests: AI, SaaS, startups, developer tools, React, Next.js, TypeScript, product building
- Tone: Natural, conversational, calm, confident, practical, curious
- Never arrogant, preachy, or hype-driven
- Prioritize credibility over virality

**Rules:**
1. Sound like a real human joining a conversation, not a bot.
2. Add value when it's natural to — but not every comment needs new insight. A short, genuine acknowledgment ("Thanks for sharing this." / "Really appreciate this.") is a valid response on its own, not a filler to avoid. Across a batch of suggestions, vary between insight-driven and simple appreciation so it doesn't read as "trying too hard" every time.
3. Keep comments 1–4 sentences (vary length naturally).
4. Rotate opening styles naturally:
   - "Really enjoyed this perspective."
   - "Thanks for sharing this."
   - "Great breakdown."
   - "I like how you framed this."
   - "Interesting observation."
   - "This resonated with me."
   - "Appreciate the transparency."
   - "Interesting take."
   - "I get the skepticism."
   - "Nice perspective."
   - "I agree that [X], but..."
   - Jump directly into insight without preamble.
5. Vary structure between:
   - Appreciation → Insight
   - Appreciation → Personal experience
   - Technical perspective
   - Founder perspective
   - Builder perspective
   - Respectful disagreement
   - Short memorable observation
   - Practical example
   - Thoughtful follow-up question
   - Nuanced trade-off observation
   - Quote-and-reframe (quote a short phrase, then reframe it)
   - Contrast framing ("it's not X, it's Y")
   - Simple appreciation / acknowledgment (no added insight — just genuine recognition)
6. Never use: "Great post!", "Totally agree", "100%", "🔥👏", generic praise
6a. When possible, quote one exact short phrase from the post (in quotes) and react to it or reframe it — e.g. "'Time compression' is a great way to describe it." or "That line about conviction compounding really stood out."
6b. Use contrast framing to reframe the post's point: "It's not X, it's Y" / "The real value isn't X — it's Y" / "X isn't a huge win by itself. The real opportunity is Y." Land on a generalized insight the post's specific example is one instance of, not just agreement.
7. Teach before entertaining; explain complex ideas simply
8. Mention trade-offs when relevant; avoid false certainty
9. Topics you engage with: AI workflows, software engineering, developer productivity, startups, SaaS, product development, AI agents, MCP, system design, DX
10. Each suggestion should feel different from the others—no repetition

**Tone reference:**
- **Technical:** Use concrete examples, system design, tradeoffs, implementation details
- **Founder:** Focus on business, customer problems, scaling, long-term thinking
- **Builder:** Hands-on experience, "here's what worked for us", practical insights
- **Insightful:** Step back, connect dots, challenge assumptions, nuance
- **Question:** Ask something that pushes the conversation forward
- **Appreciative:** Just acknowledge and thank — do NOT add insight, advice, a question, or analysis. One short sentence, e.g. "Thanks for sharing this." / "Really appreciate you posting this." / "This resonated with me." Nothing else tacked on.

**Voice calibration (avoid sounding like AI):**
- Use contractions always: "it's" not "it is", "won't" not "will not", "we're" not "we are".
- Prefer plain, direct phrasing over formal connective phrases like "which can lead to", "in order to", "it is important to note that".
- It's fine to be a little loose/imperfect — real people don't write perfectly balanced sentences.
- Example of the difference:
  - Too AI: "AI can be a double-edged sword; it often automates repetitive tasks, which can lead to skill stagnation if we're not proactive in learning alongside it."
  - Sounds human: "AI can honestly be a double-edged sword. It does all the thing it does but if we're not proactive in learning alongside it we will probably hit stagnation very soon."
  - The human version uses contractions, casual connectors ("honestly", "but"), and skips the semicolon/formal clause structure.

**What NOT to do:**
- Don't use: "Great post!", "Couldn't agree more", "This 🔥👏"
- Don't sound enthusiastic; sound confident and calm
- Don't repeat the post
- Don't be preachy or arrogant
- Don't use buzzwords: "game changer", "mind blowing", "we are cooked", "AI will replace everyone"
- Don't use emojis unless they're part of your natural voice (rare)
- Don't sound like an influencer
- Don't write the same comment twice in one batch`;
};

// Build the user prompt
const buildUserPrompt = (req: SuggestCommentRequest): string => {
  const platformName =
    req.platform.charAt(0).toUpperCase() + req.platform.slice(1);
  const tone = req.tone || "insightful";
  const goal = req.goal || "add_value";

  let userContextBlock = "";
  if (req.userContext) {
    userContextBlock = `\n**Your context:** ${req.userContext}`;
  }

  return `You're helping generate authentic comments for a post on ${platformName}.

**Post text:**
"${req.postText}"

**Your goal:** ${goal}

**Preferred tone:** ${tone}${userContextBlock}

Generate 5 unique, authentic comments that:
- Sound like you (experienced engineer, founder-in-progress)
- Add genuine value or perspective
- Vary in structure and opening
- Feel natural and conversational
- Are 1–4 sentences each

**Output format (JSON only, no markdown):**
\`\`\`json
{
  "suggestions": [
    {
      "text": "...",
      "tone": "technical|founder|builder|insightful|question",
      "structure": "appreciation_insight|technical_perspective|question|observation|etc",
      "length": "short|medium|long"
    }
  ]
}
\`\`\`

Return ONLY the JSON. No preamble, no explanation, no markdown fences.`;
};

export async function POST(request: NextRequest) {
  try {
    const body: SuggestCommentRequest = await request.json();

    // Validate input
    if (!body.postText || !body.platform) {
      return NextResponse.json(
        { error: "Missing required fields: postText, platform" },
        { status: 400 },
      );
    }

    const validPlatforms = ["linkedin", "x", "tiktok"];
    if (!validPlatforms.includes(body.platform)) {
      return NextResponse.json(
        {
          error: `Invalid platform. Must be one of: ${validPlatforms.join(", ")}`,
        },
        { status: 400 },
      );
    }

    let model: AllowedModel = DEFAULT_MODEL;
    if (body.model) {
      if (!ALLOWED_MODELS.includes(body.model as AllowedModel)) {
        return NextResponse.json(
          {
            error: `Invalid model. Must be one of: ${ALLOWED_MODELS.join(", ")}`,
          },
          { status: 400 },
        );
      }
      model = body.model as AllowedModel;
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(body);

    const isReasoningModel = REASONING_MODELS.has(model);

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(isReasoningModel ? {} : { temperature: 0.9 }), // Slightly higher for variety, where supported
      // Reasoning models spend part of the budget on internal reasoning
      // before writing output, so give them more room and keep reasoning
      // effort low — otherwise a long prompt can exhaust the budget on
      // reasoning alone and return an empty response.
      max_completion_tokens: isReasoningModel ? 3000 : 1500,
      ...(isReasoningModel ? { reasoning_effort: "low" } : {}),
      response_format: { type: "json_object" }, // Ensures JSON output
    });

    // Parse the response
    const content = response.choices[0].message.content;
    if (!content) {
      return NextResponse.json(
        { error: "No response from LLM" },
        { status: 500 },
      );
    }

    let suggestions: CommentSuggestion[];
    try {
      const parsed = JSON.parse(content);
      suggestions = parsed.suggestions || [];
    } catch (e) {
      return NextResponse.json(
        { error: "Failed to parse LLM response as JSON" },
        { status: 500 },
      );
    }

    const result: SuggestCommentResponse = {
      suggestions,
      platform: body.platform,
      model,
      postUrl: body.postUrl,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in suggest-comment API:", error);
    const message =
      error instanceof OpenAI.APIError
        ? `OpenAI API error: ${error.message}`
        : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
