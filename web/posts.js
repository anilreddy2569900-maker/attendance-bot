/* Posts — show Twitter / X posts with their pictures and videos.
 * Each link goes through /api/tweet, which returns the post's text, photos
 * and the direct .mp4 of any video or GIF. Two lists are shown:
 *   - posts.json  (links in that file show for everyone who opens the site)
 *   - added here  (saved in this browser, removable with ×)
 */

"use strict";

const STORAGE_KEY = "attendance-bot.posts.v1";

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- state
let shared = [];   // posts from posts.json, newest first
let mine = [];     // posts added on this device, newest first

// ---------------------------------------------------------------- helpers
function tweetId(input) {
  const s = String(input || "").trim();
  if (/^\d{1,20}$/.test(s)) return s;
  const m = s.match(/\/status(?:es)?\/(\d{1,20})/);
  return m ? m[1] : null;
}

async function loadPost(id) {
  const r = await fetch(`/api/tweet?id=${encodeURIComponent(id)}`);
  let data = {};
  try { data = await r.json(); } catch (_) { /* not JSON */ }
  if (!r.ok) throw new Error(data.error || `couldn't load (HTTP ${r.status})`);
  return data;
}

// pbs.twimg.com serves several sizes of the same photo: ?name=small|medium|large|orig
function photoSize(url, name) {
  try {
    const u = new URL(url);
    if (u.hostname !== "pbs.twimg.com") return url;
    u.searchParams.set("name", name);
    return u.toString();
  } catch (_) {
    return url;
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function link(href, text, cls) {
  const a = el("a", cls, text);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

// Post text with links, @names and #tags clickable. Built from DOM nodes, never innerHTML.
function richText(text) {
  const p = el("p", "post-text");
  const re = /(https?:\/\/[^\s]+)|(@\w{1,15})|(#[\p{L}\p{N}_]+)/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) p.append(text.slice(last, m.index));
    if (m[1]) p.append(link(m[1], m[1].replace(/^https?:\/\/(www\.)?/, "")));
    else if (m[2]) p.append(link(`https://x.com/${m[2].slice(1)}`, m[2]));
    else p.append(link(`https://x.com/hashtag/${encodeURIComponent(m[3].slice(1))}`, m[3]));
    last = m.index + m[0].length;
  }
  if (last < text.length) p.append(text.slice(last));
  return p;
}

function when(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// ---------------------------------------------------------------- rendering
function renderMedia(post) {
  const frag = document.createDocumentFragment();

  if (post.photos.length) {
    const grid = el("div", `photos n${Math.min(post.photos.length, 4)}`);
    for (const ph of post.photos) {
      const a = link(photoSize(ph.url, "orig"), "");
      a.title = "Open full size";
      const img = el("img");
      img.src = photoSize(ph.url, "medium");
      img.alt = "Picture from the post";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      a.append(img);
      grid.append(a);
    }
    frag.append(grid);
  }

  for (const v of post.videos) {
    const video = el("video", "video");
    video.src = v.url;
    if (v.poster) video.poster = v.poster;
    video.playsInline = true;
    video.preload = "metadata";
    if (v.gif) {
      video.autoplay = video.loop = video.muted = true;
    } else {
      video.controls = true;
    }
    if (v.width && v.height) video.style.aspectRatio = `${v.width} / ${v.height}`;
    frag.append(video);
    const row = el("div", "media-links");
    row.append(link(v.url, v.gif ? "Open GIF ↗" : "Open video ↗"), el("span", "hint", " — to save it, open it and use Save / Download."));
    frag.append(row);
  }
  return frag;
}

// onRemove: shows an × button. quote: draws it as a box inside another post.
function renderPost(post, { onRemove, quote } = {}) {
  const card = el("article", quote ? "post quote" : "post card");

  const head = el("header", "post-head");
  if (post.author.avatar) {
    const av = el("img", "avatar");
    av.src = post.author.avatar;
    av.alt = "";
    av.referrerPolicy = "no-referrer";
    head.append(av);
  }
  const who = el("div", "who");
  who.append(el("b", "", post.author.name));
  const sub = el("span", "muted", `@${post.author.handle}` + (post.created ? ` · ${when(post.created)}` : ""));
  who.append(sub);
  head.append(who);
  head.append(link(post.url, "Open on X ↗", "open"));
  if (onRemove) {
    const del = el("button", "del", "×");
    del.type = "button";
    del.title = "Remove this post";
    del.setAttribute("aria-label", "Remove this post");
    del.addEventListener("click", onRemove);
    head.append(del);
  }
  card.append(head);

  if (post.text) card.append(richText(post.text));
  card.append(renderMedia(post));
  if (post.quoted) card.append(renderPost(post.quoted, { quote: true }));
  return card;
}

function render() {
  const box = $("posts");
  box.innerHTML = "";
  const shownIds = new Set();
  for (const p of mine) {
    shownIds.add(p.id);
    box.append(renderPost(p, { onRemove: () => removePost(p.id) }));
  }
  for (const p of shared) {
    if (shownIds.has(p.id)) continue;
    box.append(renderPost(p));
  }
  $("empty").hidden = box.childElementCount > 0;
}

// ---------------------------------------------------------------- saving
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mine));
  } catch (_) { /* private mode etc. */ }
}

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved)) mine = saved;
  } catch (_) { /* ignore */ }
}

function removePost(id) {
  mine = mine.filter((p) => p.id !== id);
  save();
  render();
}

// ---------------------------------------------------------------- adding
async function addLinks(text) {
  const warnings = $("postWarnings");
  warnings.innerHTML = "";
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length) return;

  $("add").disabled = true;
  $("add").textContent = "Adding…";
  const added = [];
  for (const part of parts) {
    const id = tweetId(part);
    if (!id) {
      warnings.append(el("div", "", `! not a link to a post: ${part}`));
      continue;
    }
    if (mine.some((p) => p.id === id) || added.some((p) => p.id === id)) continue;
    try {
      added.push(await loadPost(id));
    } catch (e) {
      warnings.append(el("div", "", `! ${part}: ${e.message}`));
    }
  }
  mine = added.reverse().concat(mine);
  save();
  render();
  $("add").disabled = false;
  $("add").textContent = "Add";
  if (added.length) $("link").value = "";
}

async function loadShared() {
  let links = [];
  try {
    const r = await fetch("posts.json", { cache: "no-cache" });
    if (r.ok) links = await r.json();
  } catch (_) { /* no posts.json */ }
  if (!Array.isArray(links)) return;
  const ids = links.map(tweetId).filter(Boolean);
  const loaded = await Promise.all(ids.map((id) => loadPost(id).catch(() => null)));
  shared = loaded.filter(Boolean);
  render();
}

// ---------------------------------------------------------------- events
$("add").addEventListener("click", () => addLinks($("link").value));
$("link").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !$("add").disabled) addLinks($("link").value);
});

// ---------------------------------------------------------------- boot
loadSaved();
render();
loadShared();
