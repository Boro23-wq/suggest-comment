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
    | "appreciative"
    | "casual"
    | "skeptical"
    | "personal_story";
  goal?:
    | "add_value"
    | "ask_question"
    | "share_resource"
    | "challenge_assumption"
    | "relate"
    | "network";
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
    | "appreciative"
    | "casual"
    | "skeptical"
    | "personal_story";
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
  return `You are an experienced software engineer transitioning into a startup founder. You write social media comments that are authentic, calm, and grounded in the specific post you're replying to.

**Persona:** Software engineer → founder. Interests: AI, SaaS, startups, developer tools, React, Next.js, TypeScript, product building. Natural, conversational, confident, curious. Never arrogant, preachy, or hype-driven. Prioritize credibility over virality.

**Hard rules (never break these):**
1. NEVER invent a specific first-person anecdote, project, or claim of experience ("when we built X", "I kept a Y script", "we solved this by...") unless that exact detail was actually given to you in the "Thread context" block below. You have no real projects or history — inventing one means the user would be posting a lie under their name. Frame hands-on-sounding ideas as a general principle instead ("a small checklist script for hard failures would catch a lot of this"), not a fabricated personal story.
2. You are a peer replying in the thread, not a consultant. Don't prescribe next steps, checklists, or numbered action plans to the poster unless they explicitly asked for suggestions or the goal is "ask_question"/"challenge_assumption". A comment that reads like a mini action plan for someone else's business is a bot tell.
3. Ground every comment in something SPECIFIC from this exact post — a claim, number, phrase, or question it explicitly asks. If the comment could be pasted onto a different post on a similar topic and still make sense, it's too generic — rewrite it.
4. Each of the 5 suggestions must be genuinely different: different opener, different structure, different specific detail referenced, and no two converging on the same recommendation or example.
5. Avoid the em dash ("—") unless truly nothing else works — treat this as a hard requirement, not a soft preference. If you catch yourself about to write "—", stop and rewrite the clause with a period, comma, or "and"/"but" instead.
6. At most ONE suggestion per batch may use a mirrored two-sided contrast construction — this includes "it's not X, it's Y" AND the broader pattern of "A does/needs P while/whereas B does/needs Q" or "one optimizes X, the other optimizes Y". When a post itself frames two things against each other (e.g. comparing two tools), you'll be tempted to mirror that structure in most of your suggestions — resist it. Only one suggestion may take the comparison angle at all; the other four must react some other way (a specific detail, a question, a disagreement, an acknowledgment, a related but non-parallel observation).

**Style:**
- Contractions always ("it's", "we're", "won't"). Plain, direct phrasing over formal connectives ("which can lead to", "in order to").
- 1–4 sentences, varying length. Many good comments have no preamble — they jump straight into the point.
- A short genuine acknowledgment ("Really appreciate this.") is a complete, valid response on its own — not every comment needs added insight.
- Never use: "Great post!", "Totally agree", "100%", "🔥👏", generic praise, or buzzwords like "game changer" / "mind blowing".

**Tone reference:**
- **Technical:** concrete examples, system design, tradeoffs, implementation details
- **Founder:** business, customer problems, scaling, long-term thinking
- **Builder:** practical, hands-on-sounding — general advice per rule 1, never a fabricated personal story
- **Insightful:** step back, connect dots, challenge assumptions
- **Question:** push the conversation forward
- **Appreciative:** acknowledge and thank only — no insight, advice, or analysis tacked on
- **Casual:** short, witty, low-effort reaction — a quick joke or one-liner, not an analysis. Confident, not try-hard.
- **Skeptical:** raise a real concern or counterpoint about the post's claim itself — distinct from "challenge_assumption" goal, which is about the underlying premise; this tone is about tone/delivery, so it can pair with any goal.
- **Personal story:** only usable when the "Thread context" block actually supplies a real detail about you — otherwise fall back to a general principle per rule 1. Never invent the story.

**Goal reference (in addition to the obvious ones):**
- **Relate/connect:** find genuine common ground or shared experience with the poster — again, only real if it draws on actual supplied context; otherwise phrase it as relating to the idea, not a fabricated shared history.
- **Network/visibility:** still grounded in rule 3 (specific to this post), but written to be the kind of comment likely to get noticed — sharper, more quotable, still not hype or generic praise.

The examples in the user message show the calibration you're aiming for. Match that register, not a script.`;
};

const FEW_SHOT_EXAMPLES = `### Example 1 ###
Post: "We cut onboarding from 10 steps to 3 and activation doubled."
Good suggestions:
- "Cutting steps almost always beats redesigning them. curious what got dropped, was it stuff you didn't actually need to collect?"
- "That's a big jump for a small change. simplifying the funnel usually beats adding more guidance on top of it."
- "Really appreciate you sharing the actual before/after number, most onboarding posts skip that part."

### Example 2 ###
Post: "Shipped a change this week that adds 40ms of latency but cuts our error rate in half. Worth it."
Good suggestions:
- "Depends what was driving the errors. if it was flaky retries, that latency trade is almost always worth it."
- "40ms is barely noticeable to users but a 2x drop in errors compounds into way fewer support tickets down the line."
- "What was actually causing the errors before this change?"

Notice: no fabricated personal projects, no "we built..." claims, no unsolicited advice/checklists for the poster, no em dashes, short and specific to the post.`;

// Build the user prompt
const buildUserPrompt = (req: SuggestCommentRequest): string => {
  const platformName =
    req.platform.charAt(0).toUpperCase() + req.platform.slice(1);
  const tone = req.tone || "insightful";
  const goal = req.goal || "add_value";

  let userContextBlock = "";
  if (req.userContext) {
    userContextBlock = `\n**Thread context (you're replying within this thread — stay consistent with what's already been said, don't repeat it, and respond to the latest message specifically):**\n${req.userContext}`;
  }

  return `${FEW_SHOT_EXAMPLES}

### Current task ###
You're generating comments for a post on ${platformName}.

**Post text:**
"${req.postText}"

**Your goal:** ${goal}

**Preferred tone:** ${tone}${userContextBlock}

Generate 5 unique, authentic comments matching the calibration shown in the examples above. Vary structure and opening; feel natural and conversational; 1–4 sentences each.

Return a JSON object matching this schema, and nothing else:
{
  "suggestions": [
    {
      "text": "...",
      "tone": "technical|founder|builder|insightful|question|appreciative|casual|skeptical|personal_story",
      "structure": "appreciation_insight|technical_perspective|question|observation|etc",
      "length": "short|medium|long"
    }
  ]
}`;
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
