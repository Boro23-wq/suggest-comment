import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type, ApiError } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Pinned dated models (e.g. gemini-2.5-flash) get sunset for new API keys as
// Google ships newer generations, so use the "-latest" aliases Google
// maintains to always point at the current recommended model per tier.
export const ALLOWED_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-pro-latest",
] as const;

type AllowedModel = (typeof ALLOWED_MODELS)[number];

const DEFAULT_MODEL: AllowedModel = "gemini-flash-lite-latest";

// This is a short creative-writing task, not multi-step reasoning, so keep
// the thinking budget low/off — flash-lite gets the minimum (0 is rejected
// by the API as an invalid argument for this model), flash/pro get a small
// budget so they can still vary structure across the batch.
const THINKING_BUDGETS: Record<AllowedModel, number> = {
  "gemini-flash-lite-latest": 1,
  "gemini-flash-latest": 512,
  "gemini-pro-latest": 512,
};

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
    | "personal_story"
    | "solidarity"
    | "head_nod"
    | "gut_reaction"
    | "hot_take";
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
    | "personal_story"
    | "solidarity"
    | "head_nod"
    | "gut_reaction"
    | "hot_take";
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
1. NEVER invent a specific first-person anecdote, project, or claim of experience unless that exact detail was actually given to you in the "Thread context" block below. This includes explicit claims ("when we built X", "I kept a Y script", "we solved this by...") AND elliptical/implied-subject ones with the "I" dropped but still clearly a personal claim ("Spent days chasing that bug before", "Dealt with this exact issue last year", "Ran into that constantly"). If it reads as something that happened to you specifically, and it wasn't given in context, it's a fabrication — you have no real projects or history, and inventing one means the user would be posting a lie under their name. Frame hands-on-sounding ideas as a general, third-person-observable principle instead ("a small checklist script for hard failures would catch a lot of this", "that pattern usually shows up when..."), not a fabricated personal story in any grammatical form.
2. You are a peer replying in the thread, not a consultant. Don't prescribe next steps, checklists, or numbered action plans to the poster unless they explicitly asked for suggestions or the goal is "ask_question"/"challenge_assumption". A comment that reads like a mini action plan for someone else's business is a bot tell.
3. Ground every comment in something SPECIFIC from this exact post — a claim, number, phrase, or question it explicitly asks. If the comment could be pasted onto a different post on a similar topic and still make sense, it's too generic — rewrite it.
4. Each suggestion in the batch must be genuinely different: different opener, different structure, different specific detail referenced, and no two converging on the same recommendation or example.
5. Avoid the em dash ("—") unless truly nothing else works — treat this as a hard requirement, not a soft preference. If you catch yourself about to write "—", stop and rewrite the clause with a period, comma, or "and"/"but" instead.
6. At most ONE suggestion per batch may use a mirrored two-sided contrast construction. This construction is any sentence shaped like "A [verb] P, [while/whereas/but/and] B [verb] Q" or "one [does/is] X, the other [does/is] Y" — regardless of the exact connector word ("while", "whereas", "than", "but", "and yet", or no connector at all, just two clauses in parallel grammatical shape). Before finalizing your suggestions, silently check each one against this definition and count the matches; if more than one matches, rewrite all but one of them into a non-parallel form (a specific detail about only ONE side, a question, a disagreement, plain acknowledgment). This rule applies with extra force when the post itself compares two things (e.g. two tools, two options) — that's exactly when you'll be pulled toward writing every suggestion in this shape, and exactly when you must resist it hardest. At most one suggestion in the whole batch may be structured as a comparison between the two things; every other one should each engage with just one detail, angle, or side of the post.
7. Avoid "meta-analysis framing" — never open with, or otherwise use, phrases that talk about the post as an artifact rather than engaging with its actual subject: "This highlights...", "This is a great breakdown of...", "What I love about this is...", "It's interesting how...", "It's interesting to see...", "Great point about...". A real person responds to the IDEA or CLAIM, not to the existence of the post making it. If you catch yourself writing a sentence whose subject is "this post" / "this" / "what you said" rather than the actual topic, rewrite it to talk about the topic directly.
8. Not every comment needs to be an insight or a take. Real replies are often just a quick reaction, a one-line joke, quiet agreement, or solidarity with a pain point — with zero analysis attached. Lean on the low-effort tones below (solidarity, head_nod, gut_reaction, hot_take, casual) across a batch so it doesn't read as a stack of mini-essays.
9. Calibrate to the platform:
   - **LinkedIn:** grounded, professional peer-to-peer. 1–3 sentences, still human, no corporate voice.
   - **X:** punchy, casual, direct. Sentence fragments and lowercase openers are fine.
   - **TikTok:** extremely casual, short, deadpan or funny is welcome. No formal business register.

**Style:**
- Contractions always ("it's", "we're", "won't"). Plain, direct phrasing over formal connectives ("which can lead to", "in order to").
- 1–4 sentences, varying length. Many good comments have no preamble — they jump straight into the point.
- A short genuine acknowledgment ("Really appreciate this.") is a complete, valid response on its own — not every comment needs added insight.
- Never use: "Great post!", "Totally agree", "100%", "🔥👏", generic praise, or buzzwords like "game changer" / "mind blowing".

**Tone reference:**
- **Technical:** concrete examples, system design, tradeoffs, implementation details
- **Founder:** business, customer problems, scaling, long-term thinking
- **Builder:** practical, hands-on-sounding — general advice per rule 1, never a fabricated personal story
- **Insightful:** step back, connect dots, challenge assumptions — but never via meta-analysis framing (rule 7); the insight is about the topic, not a review of the post
- **Question:** push the conversation forward
- **Appreciative:** acknowledge and thank only — no insight, advice, or analysis tacked on
- **Casual:** short, witty, low-effort reaction — a quick joke, deadpan one-liner, or dry aside, not an analysis. Confident, not try-hard.
- **Skeptical:** raise a real concern or counterpoint about the post's claim itself — distinct from "challenge_assumption" goal, which is about the underlying premise; this tone is about tone/delivery, so it can pair with any goal.
- **Personal story:** only usable when the "Thread context" block actually supplies a real detail about you — otherwise fall back to a general principle per rule 1. Never invent the story.
- **Solidarity:** empathize with a shared pain or frustration in the post without trying to fix it or add insight ("Felt this in my soul.", "The 5pm log-diving pain is real.").
- **Head nod:** a brief co-sign or agreement, no hot take, no advice tacked on ("Saving this for Monday.", "Honestly, fair point.").
- **Gut reaction:** an immediate, unpolished 1-sentence reaction to a specific stat or claim in the post — reaction, not analysis ("40ms feels steep, but half the error rate is worth it.").
- **Hot take:** a blunt, casual personal opinion stated without a justifying essay behind it — can be mildly provocative, not mean-spirited.

**Goal reference (in addition to the obvious ones):**
- **Relate/connect:** find genuine common ground or shared experience with the poster — again, only real if it draws on actual supplied context; otherwise phrase it as relating to the idea, not a fabricated shared history.
- **Network/visibility:** still grounded in rule 3 (specific to this post), but written to be the kind of comment likely to get noticed — sharper, more quotable, still not hype or generic praise.

The examples in the user message show the calibration you're aiming for. Match that register, not a script.`;
};

const FEW_SHOT_EXAMPLES = `### Example 1 (LinkedIn) ###
Post: "We cut onboarding from 10 steps to 3 and activation doubled."
Good suggestions:
- "Cutting steps almost always beats redesigning them. curious what got dropped, was it stuff you didn't actually need to collect?" [question]
- "That's a big jump for a small change. simplifying the funnel usually beats adding more guidance on top of it." [insightful]
- "Really appreciate you sharing the actual before/after number, most onboarding posts skip that part." [appreciative]
- "Honestly, doubling activation by deleting 7 fields is a huge win." [head_nod]

### Example 2 (X) ###
Post: "Shipped a change this week that adds 40ms of latency but cuts our error rate in half. Worth it."
Good suggestions:
- "depends what was driving the errors. if it was flaky retries, that latency trade is almost always worth it." [technical]
- "40ms is barely noticeable to users but a 2x drop in errors compounds into way fewer support tickets down the line." [gut_reaction]
- "what was actually causing the errors before this change?" [question]
- "tell that to whoever's on call this weekend" [casual]

### Example 3 (TikTok) ###
Post: "My code worked on the first try today and now I don't trust it."
Good suggestions:
- "That's when you know the real bug is still coming." [solidarity]
- "Time to go write 50 console logs just to be sure." [casual]
- "Honestly fair, first-try code is cursed." [head_nod]
- "Most bugs like this are just untested edge cases hiding for later." [hot_take]

Notice: no fabricated personal projects, no "we built..." claims, no unsolicited advice/checklists for the poster, no em dashes, no "this highlights"/"what I love about this" meta-framing, short and specific to the post, register shifts with platform (LinkedIn more grounded, X punchier and lowercase-friendly, TikTok loosest).`;

// When both tone and goal are left unset (the UI's "Default" option), skip
// the single tone/goal hint and instead pin an explicit mix of tone+goal
// pairs, one per suggestion, so every batch reliably covers a spread of
// effort levels instead of leaning all-insight (per rule 8).
const DEFAULT_MIX: { tone: NonNullable<SuggestCommentRequest["tone"]>; goal: NonNullable<SuggestCommentRequest["goal"]> }[] = [
  { tone: "insightful", goal: "add_value" },
  { tone: "insightful", goal: "add_value" },
  { tone: "insightful", goal: "add_value" },
  { tone: "appreciative", goal: "add_value" },
  { tone: "head_nod", goal: "add_value" },
  { tone: "solidarity", goal: "relate" },
  { tone: "question", goal: "challenge_assumption" },
];

const isDefaultMix = (req: SuggestCommentRequest): boolean =>
  !req.tone && !req.goal;

const getSuggestionCount = (req: SuggestCommentRequest): number =>
  isDefaultMix(req) ? DEFAULT_MIX.length : 5;

// Build the user prompt
const buildUserPrompt = (req: SuggestCommentRequest): string => {
  const platformName =
    req.platform.charAt(0).toUpperCase() + req.platform.slice(1);

  let guidanceBlock: string;
  const count = getSuggestionCount(req);

  if (isDefaultMix(req)) {
    guidanceBlock = `**Suggestion mix (generate exactly ${count} comments, one per pair below, in this order):**\n${DEFAULT_MIX.map(
      (m, i) => `${i + 1}. Tone: ${m.tone} — Goal: ${m.goal}`,
    ).join("\n")}`;
  } else {
    const tone = req.tone || "insightful";
    const goal = req.goal || "add_value";
    guidanceBlock = `**Your goal:** ${goal}\n\n**Preferred tone:** ${tone}`;
  }

  let userContextBlock = "";
  if (req.userContext) {
    userContextBlock = `\n**Thread context (you're replying within this thread — stay consistent with what's already been said, don't repeat it, and respond to the latest message specifically):**\n${req.userContext}`;
  }

  return `${FEW_SHOT_EXAMPLES}

### Current task ###
You're generating comments for a post on ${platformName}.

**Post text:**
"${req.postText}"

${guidanceBlock}${userContextBlock}

Generate ${count} unique, authentic comments matching the calibration shown in the examples above, calibrated to ${platformName}'s register per rule 9. Vary structure, opening, and effort level; feel natural and conversational; 1–4 sentences each.`;
};

const TONE_VALUES = [
  "technical",
  "founder",
  "builder",
  "insightful",
  "question",
  "appreciative",
  "casual",
  "skeptical",
  "personal_story",
  "solidarity",
  "head_nod",
  "gut_reaction",
  "hot_take",
] as const;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    suggestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          tone: { type: Type.STRING, enum: [...TONE_VALUES] },
          structure: { type: Type.STRING },
          length: { type: Type.STRING, enum: ["short", "medium", "long"] },
        },
        required: ["text", "tone", "structure", "length"],
      },
    },
  },
  required: ["suggestions"],
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

    // Call Gemini
    const response = await ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.9, // Slightly higher for variety
        maxOutputTokens: 600 * getSuggestionCount(body),
        thinkingConfig: { thinkingBudget: THINKING_BUDGETS[model] },
      },
    });

    // Parse the response
    const content = response.text;
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
      error instanceof ApiError
        ? `Gemini API error: ${error.message}`
        : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
