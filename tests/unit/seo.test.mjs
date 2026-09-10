// What the page head says to search engines, and to whom every image belongs.
// Pure functions: the layout and the two public pages only serialise what
// these return, so this is the one place the shapes are pinned.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alternateLinks,
  memberTitle,
  memberPageUrl,
  memberPageJsonLd,
  communityJsonLd,
  jsonLdScript,
} from "../../src/lib/seo.ts";

const SITE = "https://vscn.ch";

test("memberPageUrl is the canonical form — trailing slash — so both pages' person @ids agree", () => {
  assert.equal(memberPageUrl("en", "ada", SITE), "https://vscn.ch/members/ada/");
  assert.equal(memberPageUrl("de", "ada", SITE), "https://vscn.ch/de/members/ada/");
  const onMemberPage = memberPageJsonLd({
    member: { displayName: "Ada", portfolio: "", socialMedia: "" },
    works: [],
    pageUrl: "https://vscn.ch/members/ada/",
    site: SITE,
    description: "d",
  })["@graph"][0].mainEntity["@id"];
  const onCommunity = communityJsonLd({
    entries: [
      {
        member: { displayName: "Ada", portfolio: "", socialMedia: "", memberUrl: memberPageUrl("en", "ada", SITE) },
        works: [{ url: "https://x/a.webp", width: 1, height: 1 }],
      },
    ],
    pageUrl: "https://vscn.ch/community/",
    site: SITE,
    name: "n",
    description: "d",
  })["@graph"][0].hasPart[0].creator["@id"];
  assert.equal(onCommunity, onMemberPage);
});

test("alternateLinks: an English path gets its German twin and x-default is English", () => {
  assert.deepEqual(alternateLinks("/members/ada/", SITE), [
    { hreflang: "en", href: "https://vscn.ch/members/ada/" },
    { hreflang: "de", href: "https://vscn.ch/de/members/ada/" },
    { hreflang: "x-default", href: "https://vscn.ch/members/ada/" },
  ]);
});

test("alternateLinks: a German path resolves to the same pair, so both pages agree", () => {
  assert.deepEqual(alternateLinks("/de/members/ada/", SITE), alternateLinks("/members/ada/", SITE));
});

test("alternateLinks: the root and the German root are one pair", () => {
  const expected = [
    { hreflang: "en", href: "https://vscn.ch/" },
    { hreflang: "de", href: "https://vscn.ch/de/" },
    { hreflang: "x-default", href: "https://vscn.ch/" },
  ];
  assert.deepEqual(alternateLinks("/", SITE), expected);
  assert.deepEqual(alternateLinks("/de/", SITE), expected);
  assert.deepEqual(alternateLinks("/de", SITE), expected);
});

test("alternateLinks: a path that merely starts with de is not German", () => {
  assert.equal(alternateLinks("/design/", SITE)[1].href, "https://vscn.ch/de/design/");
});

test("memberTitle carries role and location, the words people search for", () => {
  assert.equal(
    memberTitle({ displayName: "Ada Lovelace", role: "Scientific illustrator", location: "Zurich, Switzerland" }),
    "Ada Lovelace — Scientific illustrator, Zurich, Switzerland — VSCN",
  );
  assert.equal(memberTitle({ displayName: "Ada", role: "Illustrator", location: "" }), "Ada — Illustrator — VSCN");
  assert.equal(memberTitle({ displayName: "Ada", role: "", location: "Bern" }), "Ada — Bern — VSCN");
  assert.equal(memberTitle({ displayName: "Ada", role: "", location: "" }), "Ada — VSCN");
});

const member = {
  displayName: "Ada Lovelace",
  role: "Scientific illustrator",
  bio: "Draws cells. Also engines.",
  affiliation: "ETH Zürich",
  location: "Zurich, Switzerland",
  portfolio: "adalovelace.ch",
  socialMedia: "linkedin.com/in/ada, not a link",
  photoURL: "https://firebasestorage.googleapis.com/v0/b/x/o/avatars%2Fada.jpg?alt=media",
};
const works = [
  {
    url: "https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fu%2Fgallery%2Fa.webp?alt=media",
    thumbnailUrl: "/_astro/a_hash.webp",
    width: 1200,
    height: 800,
    caption: "Zebrafish retina",
    description: "Confocal, false colour.",
    link: "https://nature.com/articles/1",
    siteLink: "https://adalovelace.ch/work/zebrafish",
  },
  { url: "https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fu%2Fgallery%2Fb.webp?alt=media", width: 800, height: 1200 },
];

test("memberPageJsonLd: the page is a ProfilePage whose person's url is their own site", () => {
  const ld = memberPageJsonLd({
    member,
    works,
    pageUrl: "https://vscn.ch/members/ada-lovelace/",
    site: SITE,
    description: "Ada — desc",
  });
  assert.equal(ld["@context"], "https://schema.org");
  const [page, ...images] = ld["@graph"];
  assert.equal(page["@type"], "ProfilePage");
  assert.equal(page["@id"], "https://vscn.ch/members/ada-lovelace/");
  assert.equal(page.description, "Ada — desc");
  const person = page.mainEntity;
  assert.equal(person["@type"], "Person");
  assert.equal(person["@id"], "https://vscn.ch/members/ada-lovelace/#person");
  assert.equal(person.name, "Ada Lovelace");
  // THE LINK BACK: the member's portfolio is the person's url, machine-readably.
  assert.equal(person.url, "https://adalovelace.ch");
  // Linkable socials, plus the VSCN page itself as another identity of the person.
  // The socials arrive through the same cleaner the page uses, canonical host and all.
  assert.deepEqual(person.sameAs, ["https://www.linkedin.com/in/ada", "https://vscn.ch/members/ada-lovelace/"]);
  assert.equal(person.jobTitle, "Scientific illustrator");
  assert.equal(person.description, "Draws cells. Also engines.");
  assert.equal(person.image, member.photoURL);
  assert.deepEqual(person.worksFor, { "@type": "Organization", name: "ETH Zürich" });
  assert.deepEqual(person.homeLocation, { "@type": "Place", name: "Zurich, Switzerland" });
  assert.equal(images.length, 2);
});

test("memberPageJsonLd: without a portfolio the person's url is the VSCN page", () => {
  const ld = memberPageJsonLd({
    member: { ...member, portfolio: "", socialMedia: "", affiliation: "", location: "", photoURL: undefined },
    works: [],
    pageUrl: "https://vscn.ch/members/ada-lovelace/",
    site: SITE,
    description: "d",
  });
  const person = ld["@graph"][0].mainEntity;
  assert.equal(person.url, "https://vscn.ch/members/ada-lovelace/");
  assert.equal("sameAs" in person, false);
  assert.equal("worksFor" in person, false);
  assert.equal("homeLocation" in person, false);
  assert.equal("image" in person, false);
});

test("memberPageJsonLd: every image names its creator by reference and carries credit text", () => {
  const ld = memberPageJsonLd({
    member,
    works,
    pageUrl: "https://vscn.ch/members/ada-lovelace/",
    site: SITE,
    description: "d",
  });
  const [, first, second] = ld["@graph"];
  assert.equal(first["@type"], "ImageObject");
  assert.equal(first.contentUrl, works[0].url);
  assert.equal(first.thumbnailUrl, "https://vscn.ch/_astro/a_hash.webp");
  assert.equal(first.name, "Zebrafish retina");
  assert.equal(first.description, "Confocal, false colour.");
  assert.equal(first.width, 1200);
  assert.equal(first.height, 800);
  assert.deepEqual(first.creator, { "@id": "https://vscn.ch/members/ada-lovelace/#person" });
  assert.equal(first.creditText, "Ada Lovelace");
  assert.equal(first.copyrightNotice, "© Ada Lovelace");
  // Two links, two roles: the member's own project page is what the image is
  // the main entity OF; the publication is what it is part of.
  assert.equal(first.mainEntityOfPage, "https://adalovelace.ch/work/zebrafish");
  assert.deepEqual(first.isPartOf, { "@type": "WebPage", url: "https://nature.com/articles/1" });
  // The bare second work: no texts, no links, no thumbnail — and no empty keys.
  assert.equal("name" in second, false);
  assert.equal("description" in second, false);
  assert.equal("mainEntityOfPage" in second, false);
  assert.equal("isPartOf" in second, false);
  assert.equal("thumbnailUrl" in second, false);
  assert.deepEqual(second.creator, first.creator);
});

test("communityJsonLd: a CollectionPage of every image, each creator a compact person pointing home", () => {
  const ld = communityJsonLd({
    entries: [
      { member: { ...member, memberUrl: "https://vscn.ch/members/ada-lovelace/" }, works },
      {
        member: { displayName: "Bo", portfolio: "", socialMedia: "", memberUrl: "https://vscn.ch/members/bo/" },
        works: [{ url: "https://x/c.webp", width: 10, height: 10, caption: "C" }],
      },
    ],
    pageUrl: "https://vscn.ch/community/",
    site: SITE,
    name: "Community — VSCN",
    description: "Browse…",
  });
  const page = ld["@graph"][0];
  assert.equal(page["@type"], "CollectionPage");
  assert.equal(page["@id"], "https://vscn.ch/community/");
  assert.equal(page.name, "Community — VSCN");
  assert.equal(page.hasPart.length, 3);
  const [a, , c] = page.hasPart;
  assert.deepEqual(a.creator, {
    "@type": "Person",
    "@id": "https://vscn.ch/members/ada-lovelace/#person",
    name: "Ada Lovelace",
    url: "https://adalovelace.ch",
  });
  assert.equal(a.creditText, "Ada Lovelace");
  assert.deepEqual(c.creator, {
    "@type": "Person",
    "@id": "https://vscn.ch/members/bo/#person",
    name: "Bo",
    url: "https://vscn.ch/members/bo/",
  });
});

test("jsonLdScript: member-authored text cannot close the script tag", () => {
  const out = jsonLdScript({ description: "</script><img src=x onerror=alert(1)>&" });
  assert.equal(out.includes("</script"), false);
  assert.equal(out.includes("<"), false);
  assert.equal(JSON.parse(out).description, "</script><img src=x onerror=alert(1)>&");
});
