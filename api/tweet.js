// Fetches one Twitter / X post (text, photos, videos, GIFs) for the Posts page.
//
//   GET /api/tweet?url=https://x.com/someone/status/1234567890
//   GET /api/tweet?id=1234567890
//
// No Twitter account or API key is needed. We ask the same public endpoint that
// Twitter's own embedded tweets use (cdn.syndication.twimg.com). If that fails,
// we try api.fxtwitter.com, a free public mirror of the same data.

const SYNDICATION_URL = "https://cdn.syndication.twimg.com/tweet-result";
const FXTWITTER_URL = "https://api.fxtwitter.com/status/";
const CALL_TIMEOUT_MS = 15_000;

// Feature flags Twitter's embed widget sends; without some of them the reply
// can come back empty.
const FEATURES = [
  "tfw_timeline_list:",
  "tfw_follower_count_sunset:true",
  "tfw_tweet_edit_backend:on",
  "tfw_refsrc_session:on",
  "tfw_fosnr_soft_interventions_enabled:on",
  "tfw_show_birdwatch_pivots_enabled:on",
  "tfw_show_business_verified_badge:on",
  "tfw_duplicate_scribes_to_settings:on",
  "tfw_use_profile_image_shape_enabled:on",
  "tfw_show_blue_verified_badge:on",
  "tfw_legacy_timeline_sunset:true",
  "tfw_show_gov_verified_badge:on",
  "tfw_show_business_affiliate_badge:on",
  "tfw_tweet_edit_frontend:on",
].join(";");

// Accepts a bare id or any link to a post: twitter.com, x.com, mobile.,
// fxtwitter, vxtwitter, fixupx, with or without ?s=20 etc.
export function tweetId(input) {
  const s = String(input ?? "").trim();
  if (/^\d{1,20}$/.test(s)) return s;
  const m = s.match(/\/status(?:es)?\/(\d{1,20})/);
  return m ? m[1] : null;
}

// The token the embed widget sends along with the id.
function syndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

// The post text with t.co links swapped for the real link, the t.co links to
// the photo/video and to a quoted post removed, and the leading "@reply"
// names cut off. Only the start of display_text_range is used: its end is
// counted on the unescaped text, so it can land short when the text has &amp;.
function syndicationText(t) {
  const start = Array.isArray(t.display_text_range) ? t.display_text_range[0] || 0 : 0;
  let text = Array.from(t.text || "").slice(start).join("");   // counts characters, not UTF-16 units
  const quotedId = t.quoted_tweet && t.quoted_tweet.id_str;
  for (const u of (t.entities && t.entities.urls) || []) {
    if (!u.url || !u.expanded_url) continue;
    const isQuote = quotedId && u.expanded_url.includes(`/status/${quotedId}`);
    text = text.split(u.url).join(isQuote ? "" : u.expanded_url);
  }
  for (const m of (t.entities && t.entities.media) || []) {
    if (m.url) text = text.split(m.url).join("");
  }
  return decodeEntities(text).trim();
}

// Highest-quality mp4 of a video or GIF.
function bestMp4(variants) {
  const mp4 = (variants || []).filter((v) => v.content_type === "video/mp4" && v.url);
  mp4.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  return mp4.length ? mp4[0].url : null;
}

export function fromSyndication(t, depth = 0) {
  if (!t || t.__typename === "TweetTombstone" || !t.user) return null;
  const photos = [];
  const videos = [];
  for (const m of t.mediaDetails || []) {
    const width = (m.original_info && m.original_info.width) || null;
    const height = (m.original_info && m.original_info.height) || null;
    if (m.type === "photo") {
      photos.push({ url: m.media_url_https, width, height });
    } else if (m.type === "video" || m.type === "animated_gif") {
      const url = bestMp4(m.video_info && m.video_info.variants);
      if (url) videos.push({ url, poster: m.media_url_https, width, height, gif: m.type === "animated_gif" });
    }
  }
  const id = t.id_str || String(t.id || "");
  const handle = t.user.screen_name || "";
  return {
    id,
    url: `https://x.com/${handle || "i"}/status/${id}`,
    author: { name: t.user.name || handle, handle, avatar: t.user.profile_image_url_https || "" },
    created: t.created_at || "",
    text: syndicationText(t),
    photos,
    videos,
    quoted: depth === 0 && t.quoted_tweet ? fromSyndication(t.quoted_tweet, 1) : null,
  };
}

export function fromFxtwitter(t, depth = 0) {
  if (!t || !t.author) return null;
  const media = t.media || {};
  const handle = t.author.screen_name || "";
  return {
    id: String(t.id || ""),
    url: t.url || `https://x.com/${handle || "i"}/status/${t.id}`,
    author: { name: t.author.name || handle, handle, avatar: t.author.avatar_url || "" },
    created: t.created_timestamp ? new Date(t.created_timestamp * 1000).toISOString() : t.created_at || "",
    text: String(t.text || "").trim(),
    photos: (media.photos || []).map((p) => ({ url: p.url, width: p.width || null, height: p.height || null })),
    videos: (media.videos || [])
      .filter((v) => v.url)
      .map((v) => ({ url: v.url, poster: v.thumbnail_url || "", width: v.width || null, height: v.height || null, gif: v.type === "gif" })),
    quoted: depth === 0 && t.quote ? fromFxtwitter(t.quote, 1) : null,
  };
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!r.ok) return null;
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTweet(id) {
  const q = new URLSearchParams({ id, lang: "en", token: syndicationToken(id), features: FEATURES });
  const post = fromSyndication(await getJson(`${SYNDICATION_URL}?${q}`));
  if (post) return post;
  const fx = await getJson(FXTWITTER_URL + id);
  return fromFxtwitter(fx && fx.tweet);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "GET only" });
    return;
  }
  const query = req.query || Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
  const id = tweetId(query.id || query.url);
  if (!id) {
    res.status(400).json({ error: "That doesn't look like a link to a post (it should contain /status/ and a number)." });
    return;
  }
  const post = await fetchTweet(id);
  if (!post) {
    res.status(404).json({ error: "Couldn't load that post. It may be deleted, private, or age-restricted." });
    return;
  }
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).json(post);
}
