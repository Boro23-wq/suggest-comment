import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface SuggestCommentRequest {
  platform: "linkedin" | "x" | "tiktok";
  postText: string;
  postUrl?: string;
  tone?: "technical" | "founder" | "builder" | "insightful" | "question";
  goal?:
    | "add_value"
    | "ask_question"
    | "share_resource"
    | "challenge_assumption";
  userContext?: string;
}

interface CommentSuggestion {
  text: string;
  tone: "technical" | "founder" | "builder" | "insightful" | "question";
  structure: string;
  length: "short" | "medium" | "long";
}

interface SuggestCommentResponse {
  suggestions: CommentSuggestion[];
  platform: string;
  postUrl?: string;
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
2. Add value instead of repeating the post.
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

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(body);

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Cost-optimized
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.9, // Slightly higher for variety
      max_tokens: 1500,
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
      postUrl: body.postUrl,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in suggest-comment API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
