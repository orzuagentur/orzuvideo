import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFreshYoutubeAccessToken } from "@/lib/youtube";
import { getActiveYoutubeChannel } from "@/lib/youtube-channels";

type YtThreadItem = {
  id: string;
  snippet?: {
    totalReplyCount?: number;
    topLevelComment?: {
      id?: string;
      snippet?: {
        authorDisplayName?: string;
        authorProfileImageUrl?: string;
        authorChannelId?: { value?: string };
        textDisplay?: string;
        likeCount?: number;
        publishedAt?: string;
      };
    };
  };
  replies?: {
    comments?: Array<{
      id?: string;
      snippet?: {
        authorDisplayName?: string;
        textDisplay?: string;
        authorChannelId?: { value?: string };
        publishedAt?: string;
      };
    }>;
  };
};

async function generateAiReply(params: {
  commentText: string;
  author: string;
  style: string;
  niche: string;
  brandRules: string;
  replyLanguages: string;
}): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is not set on the web app. Enable Comments in AI Training and let the worker reply, or add the key.",
    );
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const langRule =
    params.replyLanguages && params.replyLanguages !== "auto"
      ? `Reply in language code: ${params.replyLanguages}.`
      : "Reply in the SAME language as the comment.";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You reply to YouTube comments for a channel.
${langRule}
Style: ${params.style || "Friendly, brief, on-brand"}
Brand rules: ${params.brandRules || "none"}
Niche: ${params.niche || "general"}
Keep replies under 280 characters. No hashtag spam.
Return JSON: {"reply":"..."}`,
        },
        {
          role: "user",
          content: `Author: ${params.author}\nComment: ${params.commentText}`,
        },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "AI reply failed");
  }
  const raw = data.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as { reply?: string };
  const reply = (parsed.reply || "").trim();
  if (!reply) throw new Error("Empty AI reply");
  return reply;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const videoId = new URL(request.url).searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  try {
    const { accessToken } = await getFreshYoutubeAccessToken(user.id);
    const active = await getActiveYoutubeChannel(user.id);
    const ownChannelId = active?.channel_id || null;

    const url =
      "https://www.googleapis.com/youtube/v3/commentThreads?" +
      new URLSearchParams({
        part: "snippet,replies",
        videoId,
        maxResults: "40",
        order: "time",
        textFormat: "plainText",
      });

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message || "Failed to load comments" },
        { status: 500 },
      );
    }

    const items = (data.items || []) as YtThreadItem[];
    const commentIds = items
      .map((item) => item.snippet?.topLevelComment?.id)
      .filter(Boolean) as string[];

    const repliedMap = new Map<string, { status: string; reply_text: string | null }>();
    if (commentIds.length) {
      const { data: rows } = await supabase
        .from("comment_replies")
        .select("youtube_comment_id,status,reply_text")
        .eq("user_id", user.id)
        .in("youtube_comment_id", commentIds);
      for (const r of rows || []) {
        repliedMap.set(r.youtube_comment_id, {
          status: r.status,
          reply_text: r.reply_text,
        });
      }
    }

    const comments = items.map((item) => {
      const top = item.snippet?.topLevelComment;
      const s = top?.snippet;
      const commentId = top?.id || item.id;
      const nest = (item.replies?.comments || []).map((r) => ({
        id: r.id || "",
        author: r.snippet?.authorDisplayName || "Viewer",
        text: r.snippet?.textDisplay || "",
        authorChannelId: r.snippet?.authorChannelId?.value || null,
        publishedAt: r.snippet?.publishedAt || null,
      }));
      const ours = nest.some(
        (r) => ownChannelId && r.authorChannelId === ownChannelId,
      );
      const tracked = repliedMap.get(commentId);
      return {
        id: item.id,
        commentId,
        author: s?.authorDisplayName || "Viewer",
        authorChannelId: s?.authorChannelId?.value || null,
        avatar: s?.authorProfileImageUrl || null,
        text: s?.textDisplay || "",
        likes: s?.likeCount || 0,
        publishedAt: s?.publishedAt || null,
        replyCount: item.snippet?.totalReplyCount || 0,
        replies: nest,
        ourReply:
          tracked?.status === "replied"
            ? tracked.reply_text
            : ours
              ? nest.find((r) => r.authorChannelId === ownChannelId)?.text || null
              : null,
        repliedByUs: Boolean(ours || tracked?.status === "replied"),
      };
    });

    return NextResponse.json({
      comments,
      note: "YouTube API cannot like or heart comments — only reply is supported.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load comments" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const videoId = String(body.videoId || "").trim();
  const commentId = String(body.commentId || "").trim();
  const mode = String(body.mode || "manual").trim(); // manual | ai
  let text = String(body.text || "").trim();

  if (!videoId || !commentId) {
    return NextResponse.json(
      { error: "videoId and commentId required" },
      { status: 400 },
    );
  }

  try {
    const active = await getActiveYoutubeChannel(user.id);
    let trainingQuery = supabase
      .from("ai_training")
      .select(
        "reply_comments_enabled,reply_style_prompt,reply_languages,niche,brand_rules,is_trained",
      )
      .eq("user_id", user.id)
      .eq("is_trained", true);
    if (active?.channel_id) {
      trainingQuery = trainingQuery.eq("youtube_channel_id", active.channel_id);
    }
    const { data: training } = await trainingQuery.maybeSingle();

    // Fallback: any trained row
    let trainingRow = training;
    if (!trainingRow) {
      const { data: anyTraining } = await supabase
        .from("ai_training")
        .select(
          "reply_comments_enabled,reply_style_prompt,reply_languages,niche,brand_rules,is_trained",
        )
        .eq("user_id", user.id)
        .eq("is_trained", true)
        .limit(1)
        .maybeSingle();
      trainingRow = anyTraining;
    }

    const commentAuthor = String(body.author || "Viewer");
    const commentText = String(body.commentText || "");

    if (mode === "ai") {
      if (!trainingRow?.is_trained) {
        return NextResponse.json(
          { error: "Save AI Training first" },
          { status: 400 },
        );
      }
      text = await generateAiReply({
        commentText: commentText || text,
        author: commentAuthor,
        style: trainingRow.reply_style_prompt || "",
        niche: trainingRow.niche || "",
        brandRules: trainingRow.brand_rules || "",
        replyLanguages: trainingRow.reply_languages || "auto",
      });
    }

    if (text.length < 1) {
      return NextResponse.json({ error: "Reply text is empty" }, { status: 400 });
    }

    const { accessToken } = await getFreshYoutubeAccessToken(user.id);
    const ytRes = await fetch(
      "https://www.googleapis.com/youtube/v3/comments?part=snippet",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          snippet: {
            parentId: commentId,
            textOriginal: text.slice(0, 9000),
          },
        }),
      },
    );
    const ytData = await ytRes.json();
    if (!ytRes.ok) {
      return NextResponse.json(
        { error: ytData.error?.message || "Failed to post reply" },
        { status: 500 },
      );
    }

    await supabase.from("comment_replies").upsert(
      {
        user_id: user.id,
        youtube_video_id: videoId,
        youtube_comment_id: commentId,
        comment_text: (commentText || text).slice(0, 4000),
        comment_author: commentAuthor.slice(0, 200),
        reply_text: text,
        status: "replied",
        replied_at: new Date().toISOString(),
        error_message: null,
      },
      { onConflict: "youtube_comment_id" },
    );

    return NextResponse.json({
      ok: true,
      replyId: ytData.id,
      reply: text,
      mode,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to reply" },
      { status: 500 },
    );
  }
}
