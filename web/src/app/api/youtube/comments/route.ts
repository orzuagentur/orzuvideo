import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFreshYoutubeAccessToken } from "@/lib/youtube";

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
    const url =
      "https://www.googleapis.com/youtube/v3/commentThreads?" +
      new URLSearchParams({
        part: "snippet,replies",
        videoId,
        maxResults: "30",
        order: "relevance",
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

    const comments = (data.items || []).map(
      (item: {
        id: string;
        snippet?: {
          topLevelComment?: {
            snippet?: {
              authorDisplayName?: string;
              authorProfileImageUrl?: string;
              textDisplay?: string;
              likeCount?: number;
              publishedAt?: string;
            };
          };
          totalReplyCount?: number;
        };
      }) => {
        const s = item.snippet?.topLevelComment?.snippet;
        return {
          id: item.id,
          author: s?.authorDisplayName || "Viewer",
          avatar: s?.authorProfileImageUrl || null,
          text: s?.textDisplay || "",
          likes: s?.likeCount || 0,
          publishedAt: s?.publishedAt || null,
          replyCount: item.snippet?.totalReplyCount || 0,
        };
      },
    );

    return NextResponse.json({ comments });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load comments" },
      { status: 500 },
    );
  }
}
