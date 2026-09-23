import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "../helpers/load-ts.mjs";

// The server's reading of a pasted link (functions/src/embedUrl.ts) and the
// browser's rebuilding of a player URL from what was stored (src/lib/embed.ts).
// 2026-09-23, release 1 of documentation/20260923-motion-works-design.md.
const server = loadTs("functions/src/embedUrl.ts", {});
const client = loadTs("src/lib/embed.ts", {});

const plain = (value) => (value === null ? null : { ...value });

test("every accepted form reduces to a provider and an id", () => {
  const accepted = [
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", { provider: "youtube", videoId: "dQw4w9WgXcQ" }],
    ["http://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123", { provider: "youtube", videoId: "dQw4w9WgXcQ" }],
    ["m.youtube.com/watch?v=dQw4w9WgXcQ", { provider: "youtube", videoId: "dQw4w9WgXcQ" }],
    ["  https://youtu.be/dQw4w9WgXcQ?si=Abc123  ", { provider: "youtube", videoId: "dQw4w9WgXcQ" }],
    ["youtu.be/jNQXAC9IVRw", { provider: "youtube", videoId: "jNQXAC9IVRw" }],
    ["https://www.youtube.com/shorts/mkxw7wIJH70", { provider: "youtube", videoId: "mkxw7wIJH70" }],
    ["youtube.com/shorts/eWrQk7yotjY?feature=share", { provider: "youtube", videoId: "eWrQk7yotjY" }],
    ["https://vimeo.com/22439234", { provider: "vimeo", videoId: "22439234" }],
    ["www.vimeo.com/1084537?share=copy", { provider: "vimeo", videoId: "1084537" }],
    ["https://vimeo.com/76979871/a1b2c3d4e5", { provider: "vimeo", videoId: "76979871", hash: "a1b2c3d4e5" }],
  ];
  for (const [input, expected] of accepted) assert.deepEqual(plain(server.parseEmbedUrl(input)), expected, input);
});

test("everything else is refused, including forms that are close", () => {
  const refused = [
    "", "   ", 42, null, undefined, "not a url",
    "https://www.youtube.com/", "https://www.youtube.com/watch", "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQX", // twelve characters
    "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://www.youtube.com/live/dQw4w9WgXcQ",
    "https://www.youtube.com/playlist?list=PL123", "https://www.youtube.com/@channel",
    "https://www.youtube.com/shorts/", "https://www.youtube.com/shorts/dQw4w9WgXcQ/extra",
    "https://youtu.be/", "https://youtu.be/dQw4w9WgXcQ/extra",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "https://evil.example/youtu.be/dQw4w9WgXcQ",
    "https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com:8443/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)//youtu.be/dQw4w9WgXcQ", "ftp://youtu.be/dQw4w9WgXcQ",
    "https://vimeo.com/", "https://vimeo.com/channels/staffpicks/22439234", "https://vimeo.com/showcase/123",
    "https://vimeo.com/22439234/NOT-HEX", "https://vimeo.com/abc", "https://player.vimeo.com/video/22439234",
    "https://vimeo.com/1234567890123", // thirteen digits
    "https://www.instagram.com/reel/Cx1AbCdEfGh/", "https://www.dailymotion.com/video/x7tgad0",
    `https://youtu.be/dQw4w9WgXcQ?${"x".repeat(600)}`,
    "https://youtu.be/dQw4w9WgXcQ extra words",
  ];
  for (const input of refused) assert.equal(server.parseEmbedUrl(input), null, String(input));
});

test("the oEmbed question is rebuilt from the id, not the pasted URL", () => {
  const ref = server.parseEmbedUrl("https://youtu.be/dQw4w9WgXcQ?si=tracking");
  assert.equal(server.oembedEndpoint(ref), "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ");
  assert.equal(server.oembedEndpoint({ provider: "vimeo", videoId: "1", hash: "abcdef" }),
    "https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F1%2Fabcdef");
});

test("thumbnails come only from the two platforms' image hosts, original aspect first", () => {
  const yt = server.thumbnailCandidates({ provider: "youtube", videoId: "dQw4w9WgXcQ" }, "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  assert.deepEqual(yt.map((c) => [c.url.split("/").pop(), c.letterboxed]),
    [["oar2.jpg", false], ["maxresdefault.jpg", true], ["hqdefault.jpg", true]]);
  const vimeo = server.thumbnailCandidates({ provider: "vimeo", videoId: "1" }, "https://i.vimeocdn.com/video/209-f028-d_640?region=us");
  assert.deepEqual(vimeo.map((c) => c.url), ["https://i.vimeocdn.com/video/209-f028-d_1920?region=us", "https://i.vimeocdn.com/video/209-f028-d_640?region=us"]);
  // A thumbnail URL oEmbed hands back on any other host is never fetched.
  assert.deepEqual(server.thumbnailCandidates({ provider: "vimeo", videoId: "1" }, "https://evil.example/x_640.jpg"), []);
  assert.equal(server.isThumbnailUrl("http://i.ytimg.com/vi/x/hq.jpg"), false);
  assert.equal(server.isThumbnailUrl("https://i.ytimg.com:444/vi/x/hq.jpg"), false);
});

test("the player URL is built from the stored id and nothing else", () => {
  assert.equal(client.embedPlayerUrl({ provider: "youtube", videoId: "dQw4w9WgXcQ" }),
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&playsinline=1");
  assert.equal(client.embedPlayerUrl({ provider: "vimeo", videoId: "22439234" }),
    "https://player.vimeo.com/video/22439234?dnt=1&autoplay=1");
  assert.equal(client.embedPlayerUrl({ provider: "vimeo", videoId: "22439234", hash: "a1b2c3d4e5" }),
    "https://player.vimeo.com/video/22439234?dnt=1&autoplay=1&h=a1b2c3d4e5");
  assert.equal(client.embedPageUrl({ provider: "youtube", videoId: "dQw4w9WgXcQ" }), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
});

test("a stored embed that is not a playable id is treated as no embed at all", () => {
  for (const bad of [
    null, "youtube", { provider: "youtube" }, { provider: "youtube", videoId: "../../evil" },
    { provider: "youtube", videoId: "dQw4w9WgXcQ", hash: "abcdef" }, { provider: "vimeo", videoId: "1?x=1" },
    { provider: "vimeo", videoId: "1", hash: "&autoplay=0" }, { provider: "other", videoId: "dQw4w9WgXcQ" },
  ]) assert.equal(client.validEmbed(bad), null, JSON.stringify(bad));
  assert.deepEqual(plain(client.validEmbed({ provider: "vimeo", videoId: "1", hash: "abcdef" })), { provider: "vimeo", videoId: "1", hash: "abcdef" });
});

test("data attributes round-trip through the dataset the lightbox reads", () => {
  const attrs = client.embedDataAttrs({ provider: "vimeo", videoId: "22439234", hash: "a1b2c3d4e5" });
  assert.deepEqual(attrs, { "data-pswp-embed": "vimeo", "data-pswp-embed-id": "22439234", "data-pswp-embed-hash": "a1b2c3d4e5" });
  const dataset = { pswpEmbed: "vimeo", pswpEmbedId: "22439234", pswpEmbedHash: "a1b2c3d4e5" };
  assert.deepEqual(plain(client.embedFromDataset(dataset)), { provider: "vimeo", videoId: "22439234", hash: "a1b2c3d4e5" });
  assert.equal(client.embedFromDataset({}), null);
  assert.deepEqual(client.embedDataAttrs(undefined), {});
});
