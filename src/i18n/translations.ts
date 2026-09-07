export const ui: Record<string, Record<string, string>> = {
  en: {
    // Navbar
    "nav.info": "INFO",
    "nav.community": "COMMUNITY",
    "nav.login": "LOGIN",
    "nav.profile": "PROFILE",

    // LandingHero
    "hero.statement.connect":
      "The Visual Science Communication Network brings together everyone who gives knowledge a visual form.",
    "hero.statement.purpose":
      "A growing community of illustrators, designers, and scientists — connected through a shared directory, events, and showcases.",
    "hero.cta.join": "Join our community",
    "hero.cta.community": "Community",

    // InfoPage
    "info.intro":
      "The Visual Science Communication Network — VSCN, pronounced “Vision” — connects people passionate about visualizing knowledge.",
    "info.p2":
      "We believe that more knowledge deserves to be given a visual form. Images make research accessible, spark curiosity, and build bridges between science and society.",
    "info.h2.building": "What We’re Building",
    "info.li.1": "Building a comprehensive registry of illustrators, designers, and scientists.",
    "info.li.2": "Organizing events for and about visual science communication.",
    "info.li.3": "Showcasing and celebrating outstanding visual storytelling.",
    "info.li.4": "Creating stronger links between the sciences, illustration, and design.",
    "info.h2.scientists": "For Scientists & Research Groups",
    "info.p.scientists":
      "VSCN is not only for the people who make the images — it is just as much for the researchers who need them. If you want your work to be seen and understood, you belong here. No portfolio required.",
    "info.li.sci.1": "Find illustrators, designers, and animators who already work in your field.",
    "info.li.sci.2": "Make your research group findable for visual collaborations.",
    "info.li.sci.3": "Show how your research has been visualized — and who helped do it.",
    "info.h2.started": "We’re in the early stages",
    "info.p4": "If you’d like to help build and shape this community, feel free to reach out:",
    "info.contact": "Contact",

    // CommunityGrid
    "community.title": "Community",
    "community.member": "member",
    "community.members": "members",
    "community.empty": "No members yet.",
    "community.view.label": "View",
    "community.view.gallery": "Gallery",
    "community.view.grid": "Grid",
    "community.view.index": "Index",
    "community.index.search": "Search name, role, tags…",
    "community.filter.type": "Who",
    "community.filter.looking": "Looking for",
    "community.filter.all": "All",
    "community.filter.creators": "Creators",
    "community.filter.scientists": "Scientists",
    "community.filter.organizations": "Research groups",
    "community.filter.offering": "Offering services",
    "community.filter.seeking": "Looking for services",
    "community.filter.none": "No members match this filter.",
    // The GRID's version of the line above. The wall is a wall of works, so a
    // tag whose only members have no artwork empties it while those members
    // do match the filter — saying "no members" there would be untrue.
    "community.filter.none.works": "No artwork matches this filter.",
    "community.filter.tags": "Tags",
    "community.filter.tags.all": "All tags",
    "community.filter.tags.search": "Search tags…",

    // MemberCard
    "member.showBio": "Show bio for",
    "member.hideBio": "Hide bio for",
    "member.badge.scientist": "Scientist",
    "member.badge.both": "Creator & Scientist",
    "member.badge.organization": "Research group",

    // AuthForm
    "auth.title.login": "Log In",
    "auth.title.reset": "Reset Password",
    "auth.submit.login": "Log In",
    "auth.submit.loginLoading": "Logging in...",
    "auth.status.login": "Logging you in...",
    "auth.status.redirecting": "Redirecting...",
    "auth.forgot": "Forgot?",
    "auth.noAccount": "Don’t have an account?",
    "auth.cta.signup": "Sign up",
    "auth.reset.send": "Send reset link",
    "auth.reset.sending": "Sending…",
    "auth.reset.sent": "Sent",
    "auth.reset.success": "Check your inbox for a reset link.",
    "auth.reset.back": "← Back to log in",
    "auth.error.enterEmail": "Please enter your email address.",
    "auth.error.resetFailed": "Could not send reset email. Please check the address and try again.",
    "auth.error.wait": "Please wait a moment before trying again.",
    "auth.error.generic": "Something went wrong. Please try again.",

    // Code → message for the auth forms. authErrors.ts holds the code→key
    // map; the sentences live here so /de gets German ones. Anything NOT
    // listed here falls back to auth.error.generic with the raw Firebase code
    // appended, which is what a member can paste into an email to us.
    "auth.error.code.emailInUse":
      "An account with this email already exists. Try logging in instead.",
    "auth.error.code.invalidEmail": "Please enter a valid email address.",
    "auth.error.code.weakPassword": "Password must be at least 6 characters.",
    "auth.error.code.invalidCredential": "Invalid email or password.",
    "auth.error.code.tooManyRequests": "Too many attempts. Please wait and try again.",
    "auth.error.code.network":
      "Could not reach the server. Check your internet connection, and any ad blocker or VPN.",
    "auth.error.code.operationNotAllowed":
      "Sign-up is temporarily unavailable. This is on our end. Please contact us at info@vscn.ch.",
    "auth.error.code.userDisabled":
      "This account has been disabled. Please contact us at info@vscn.ch.",
    // Firestore, not Auth. "Please try again" would be a lie: the retry runs
    // the same denied read.
    "auth.error.code.permissionDenied":
      "Your account was created, but we could not load your profile. Please contact us at info@vscn.ch.",

    // VerifyEmail
    "verify.title": "Check your inbox",
    "verify.sub": "We sent a verification link to",
    "verify.sub.suffix": ". Click it to activate your account.",
    "verify.cta": "I've verified my email — continue",
    "verify.checking": "Checking…",
    "verify.notVerified": "Email not verified yet. Check your inbox and click the link.",
    "verify.resend.label": "Didn't get it?",
    "verify.resend.btn": "Resend email",
    "verify.resend.msg":
      "We've sent a link to your email. If you don't see it shortly, please check your spam filter.",
    "verify.back": "← Back to sign up",
    "verify.error.generic": "Something went wrong. Please try again.",
    "verify.error.resend": "Could not resend. Please wait a moment and try again.",

    // ProfileForm
    "profile.loading": "Loading profile…",
    "profile.verifyBanner":
      "Please verify your email to secure your account — if it hasn't arrived, check your spam folder.",
    "profile.verifyResend": "Resend email",
    "profile.verifySent": "Email sent — check your inbox.",
    "profile.chooseImage": "Choose image",
    "profile.memberType.legend": "Who are you?",
    "profile.memberType.note": "Helps the community find each other. You can change this any time.",
    "profile.memberType.creator": "Visual creator",
    "profile.memberType.scientist": "Scientist · Researcher",
    "profile.memberType.both": "Both",
    "profile.memberType.organization": "Research group · Organization",
    "profile.label.name": "Display Name",
    "profile.ph.name": "Your name",
    "profile.ph.name.organization": "Name of your group or institution",
    "profile.label.role": "Role",
    "profile.ph.role": "e.g. Science Illustrator, Researcher, Data Journalist…",
    "profile.ph.role.science": "e.g. Neuroscientist, PhD Student, Lab Head…",
    "profile.ph.role.organization": "e.g. Research Group, Institute, Museum…",
    "profile.note.role": "Shown on your card — best kept under 25 characters.",
    "profile.label.affiliation": "Affiliation",
    "profile.ph.affiliation": "Studio, company, or freelance",
    "profile.ph.affiliation.science": "Institute, department, university",
    "profile.label.location": "Location",
    "profile.ph.location": "Zurich, Switzerland",
    "profile.label.languages": "Working languages",
    "profile.note.languages": "Languages you can work in.",
    "profile.lang.de": "German",
    "profile.lang.en": "English",
    "profile.lang.fr": "French",
    "profile.lang.it": "Italian",
    "profile.wantsToContribute": "I'd like to help build this community",
    "profile.wantsToContribute.note":
      "VSCN is still in its early stages. Tick this and we'll reach out about ways to get involved.",
    "profile.label.bio": "About you",
    "profile.ph.bio": "A short description of your work, interests, or background…",
    "profile.note.bio": "Maximum 35 words.",
    "profile.label.portfolio": "Portfolio / Website",
    "profile.ph.portfolio": "yoursite.com",
    "profile.label.portfolio.science": "Website / Lab page",
    "profile.ph.portfolio.science": "lab.university.edu",
    "profile.label.social": "Social Media",
    "profile.ph.social": "linkedin.com/in/yourname",
    "profile.note.social": "One link per row. LinkedIn, Instagram, X, Bluesky, etc.",
    "profile.social.add": "Add a link",
    "profile.social.remove": "Remove link",
    "profile.social.full": "That is as many links as a profile shows.",
    "profile.social.tooLong": "Together your links are too long. Shorten or remove one.",
    "profile.label.social.science": "Social / ORCID",
    "profile.ph.social.science": "orcid.org/0000-0000-0000-0000",
    "profile.openTo.legend": "I'm interested in…",
    "profile.openTo.offering": "Offer services",
    "profile.openTo.seeking": "Find services",
    "profile.openTo.networking": "Network & collaborate",
    "profile.openTo.custom.ph": "Something else? Add a custom option…",
    "profile.visualNeeds.legend": "What do you need visuals for?",
    "profile.visualNeeds.note":
      "Helps illustrators and designers find requests they can actually help with. Up to 8.",
    "profile.visualNeeds.custom.ph": "Something else? Add your own…",
    "profile.visualNeeds.add": "Add option",
    "profile.primaryAudience.legend": "Primary target audiences",
    "profile.primaryAudience.science": "Science",
    "profile.primaryAudience.public": "Public",
    "profile.primaryAudience.policyMakers": "Policy makers",
    "profile.primaryAudience.education": "Education",
    "profile.label.tags": "Tags",
    "profile.ph.tags": "Add a custom tag…",
    "profile.note.tags": "Up to 7 tags.",
    "profile.tag.add": "Add tag",
    "profile.browseTags": "Browse tags",
    "profile.browseAllTags": "Browse all tags",
    "profile.hideTags": "Hide tags",
    "profile.label.phone": "Phone Number",
    "profile.note.phone":
      "Hidden from the community page. Used only to help create a VSCN chat group.",
    "member.backToCommunity": "Community",
    "member.openTo": "Open to",
    "member.needs": "Looking for",
    "member.tags": "Tags",
    "member.elsewhere": "Elsewhere",
    "member.work": "Work",
    "member.workAlt": "work sample",
    "member.lightbox.close": "Close",
    "member.lightbox.zoom": "Zoom",
    "member.lightbox.prev": "Previous image",
    "member.lightbox.next": "Next image",
    "member.lightbox.error": "This image could not be loaded.",
    // The link's accessible name. Its visible text is the URL with the
    // scheme stripped, which names a destination but not what it IS.
    "member.lightbox.link": "Where this image appeared",
    "community.card.expand": "Expand profile:",
    // Two forms of the same idea, and they are not interchangeable. The
    // colon-suffixed one is an ARIA-LABEL PREFIX — "View profile: Jane Doe" —
    // and reads as nonsense if it is ever printed. `.text` is the visible
    // control on the image card's caption row.
    "community.card.viewProfile": "View profile:",
    "community.card.viewProfile.text": "View profile",
    // Aria-label prefix for the artwork itself, which as of 2026-09-01 opens
    // the lightbox rather than the profile.
    "community.card.openImage": "Open image:",
    "community.card.prev": "Previous image",
    "community.card.next": "Next image",
    // The two carousel roledescriptions and the position template are spoken,
    // never seen. {n} and {total} are filled by the card's client script; a
    // translation may move them, but must keep both.
    "community.card.carousel": "carousel",
    "community.card.image": "image",
    "community.card.gallery": "gallery",
    "community.card.imagePosition": "Image {n} of {total}",
    "profile.gallery.nudge":
      "Your card in the directory shows no artwork yet — add images and it becomes an image card.",
    "profile.cardPreview": "Community card preview",
    "profile.tab.profile": "Profile",
    "profile.tab.work": "Work",
    "profile.tab.account": "Account",
    "profile.tab.preview": "Preview",
    "profile.view.noWorks": "No images yet. Add work in the gallery field and it will appear here.",
    "profile.view.defaultName": "Your name",
    "profile.saveMsg": "Changes saved. Your community card will update within a few minutes.",
    "profile.adminConsole": "Admin console",
    "profile.logout": "Log Out",
    "profile.save": "Save Changes",
    "profile.delete.idle": "Delete account",
    "profile.delete.text":
      "Your account, profile and images are deleted immediately and permanently. There is no undo, and no way for us to bring them back.",
    "profile.delete.cancel": "Cancel",
    "profile.delete.confirm": "Delete permanently",
    "profile.delete.scheduled":
      "Your account is scheduled for deletion on {date}. Sign in any time before then to keep it.",
    "profile.delete.banner": "This account is scheduled for deletion on {date}.",
    "profile.delete.keep": "Keep my account",
    "profile.delete.keeping": "Restoring…",
    "profile.delete.error": "The account could not be deleted. Please try again.",
    "profile.delete.typePrompt": "To confirm, type this account's email address:",
    "profile.delete.typeMismatch": "That is not the address on this account.",
    "profile.email.title": "Change email address",
    "profile.email.new": "New email address",
    "profile.email.submit": "Send confirmation link",
    "profile.email.sending": "Sending…",
    "profile.email.sent":
      "We sent a confirmation link to {email}. Your address changes once you click it.",
    "profile.email.error":
      "The address could not be changed. Check it and your password, then try again.",
    "profile.reauth.text": "Please enter your password to confirm.",
    "profile.reauth.cancel": "Cancel",
    "profile.reauth.confirm": "Confirm delete",
    "profile.preview.defaultName": "Your name",
    "profile.upload.processing": "Processing…",
    "profile.upload.uploading": "Uploading…",
    "profile.upload.selected": "Selected: ",
    "profile.upload.complete": "Upload complete.",
    "profile.upload.error": "Could not process image.",
    "profile.label.gallery": "Gallery",
    "profile.note.gallery":
      "Up to 8 images. They appear on your member card after the next site update.",
    "profile.note.galleryUnverified":
      "One image until your email is verified — then up to 8. They appear on your member card after the next site update.",
    "profile.gallery.add": "Add images",
    "profile.gallery.full": "Gallery is full (8 images max).",
    "profile.gallery.verifyForMore":
      "Verify your email to add more images. Check your inbox for the link.",
    "profile.gallery.error": "Could not upload image. Please try again.",
    // ONE MESSAGE PER CAUSE (see GalleryErrorCode in src/lib/gallery.ts). The
    // single "please try again" above was wrong advice for most of them — an
    // expired session and a file that will never fit do not improve on a
    // second attempt — so it survives only as the fallback for a failure that
    // is not an upload at all (a Firestore write on remove, say).
    "profile.gallery.err.tooBig": "Over 25 MB. Export a smaller file.",
    "profile.gallery.err.svg": "SVGs can't be uploaded. Export as PNG or JPEG.",
    "profile.gallery.err.heic": "HEIC photos can't be read. Export as JPEG.",
    "profile.gallery.err.type": "Only JPEG, PNG, WebP or AVIF images can be used.",
    "profile.gallery.err.decode": "This image couldn't be read. Try a JPEG or PNG export.",
    "profile.gallery.err.tooLarge": "Too detailed to fit the size limit. Try a tighter crop.",
    "profile.gallery.err.denied": "Your sign-in expired. Sign in again, then try once more.",
    "profile.gallery.err.network": "Connection lost.",
    "profile.gallery.err.quota": "Storage is full. Please contact VSCN.",
    "profile.gallery.err.cancelled": "Cancelled.",
    "profile.gallery.err.unknown": "Something went wrong.",
    "profile.gallery.remove": "Remove image",
    "profile.gallery.drop": "Drop images here",
    // The cover image is not a setting anywhere — it is whichever image is
    // first. Nothing said so, and the consequence is large: works[0]'s
    // proportions become the shape of the member's card in the directory.
    "profile.gallery.cover": "Cover",
    "profile.gallery.coverNote":
      "The first image is your cover: its proportions set the shape of your card in the directory.",
    "profile.gallery.moveUp": "Move image earlier",
    "profile.gallery.moveDown": "Move image later",
    // Visible text on the switch stays the bare "EN"/"DE" — two-letter codes
    // any member of a bilingual site already reads without translation, and
    // there is no room in the compact gallery row for the full word twice.
    // These are the buttons' accessible names only.
    "profile.gallery.lang.en": "Show the English caption and description fields",
    "profile.gallery.lang.de": "Show the German caption and description fields",
    "profile.gallery.cancel": "Cancel upload",
    "profile.gallery.retry": "Retry",
    "profile.gallery.dismiss": "Dismiss",
    "profile.gallery.queued": "Waiting…",
    "profile.gallery.preparing": "Preparing…",
    "profile.gallery.overflow": "Only {n} images fit — {m} not added.",
    // The label, which is also the field's accessible name — so it stays a
    // label and the EXAMPLE lives in .ph beside it, exactly as the link field
    // below splits the two. Writing the example into this key would have a
    // screen reader announce one specific zebrafish before every caption box.
    "profile.gallery.caption": "Caption",
    // A REAL ONE (2026-09-04, Josh: "only caption (make a good example)"),
    // labelled as one (2026-09-04, Josh: "the example inside the text box
    // should be labeled as such") — a member's own first attempt could sit in
    // this same box, and a bare sentence with nothing marking it as sample
    // text reads as one. It said "One line. Also read aloud as the image
    // description." before that — a specification of a caption rather than a
    // caption, which left members typing "Illustration" and "My work".
    // Showing the kind of sentence that works teaches the field in a way
    // describing it cannot: a subject, and the thing about it worth knowing.
    "profile.gallery.caption.ph": "Example: Zebrafish retina in cross-section, confocal",
    "profile.gallery.captionNote": "One line. Also read aloud to people who can't see the image.",
    // The accessible name for the German field below, not its placeholder —
    // see .de.ph for that. Names the field itself so a screen reader tabbing
    // in announces what it is, the same job "Caption" above does.
    "profile.gallery.caption.de": "Caption (German)",
    // The example carries its OWN caption.de.ph rather than reusing the one
    // above (2026-09-04, "make the explanations better"): the sentence has to
    // exist in German to demonstrate a German caption, and swapping only the
    // "Example:" word in front of an English sentence would show a member the
    // wrong language example for the field they are looking at.
    "profile.gallery.caption.de.ph": "Example: Zebrafisch-Netzhaut im Querschnitt, konfokal",
    // Rewritten (2026-09-04) to say what happens rather than point at a
    // neighbouring field — the EN/DE switch above means the two are never
    // both on screen at once, so "the line above" no longer names anything.
    "profile.gallery.caption.deNote":
      "Optional. German visitors hear this read aloud in place of the caption; until it's filled in, they hear the English one instead.",
    "profile.gallery.description": "About this image — how it was made, who it was for, what it shows",
    "profile.gallery.description.de": "Description (German)",
    // Longer than the German caption's example on purpose (2026-09-04, Josh:
    // "example for lng image description should be longer") — this field
    // holds up to 600 characters and reads as the paragraph on the profile
    // page, so a one-clause placeholder undersold what actually belongs
    // here. Two sentences: what it is and how it was made, then who it was
    // for and what it shows — the same "how/who/what" GalleryItem.description
    // itself asks for in gallery.ts.
    "profile.gallery.description.de.ph":
      "Example: Angefertigt für eine Publikation über Immunzellen im Zebrafisch-Embryo, aus konfokalen Mikroskopieaufnahmen rekonstruiert. Die Illustration zeigt, wie Fresszellen durch das Gewebe wandern, um Krankheitserreger aufzuspüren.",
    "profile.gallery.description.deNote":
      "Optional. German visitors read this in place of the description; until it's filled in, they read the English one instead.",
    // Stored without a scheme, like Portfolio: the input carries a fixed
    // https:// prefix, so the placeholder must not repeat one.
    "profile.gallery.link": "Where this image appeared",
    "profile.gallery.link.ph": "nature.com/articles/… (optional)",
    "profile.tag.error": "Tags must be unique, 1–50 characters, and no more than 7 tags.",
    "profile.reauth.confirming": "Confirming…",
    "profile.reauth.error": "Incorrect password. Please try again.",
    "profile.save.saving": "Saving…",
    "profile.save.error": "Could not save changes.",

    // Onboarding
    "onboarding.step1.title": "About you",
    "onboarding.step1.sub": "Tell us the basics to get your profile started.",
    "onboarding.step2.title": "What are you looking for?",
    "onboarding.step2.sub": "Help us understand what you want from VSCN.",
    "onboarding.request.label": "What would you like to see from this platform?",
    "onboarding.request.helper": "Share requests, ideas, needs, or problems VSCN could help with.",
    "onboarding.bridge.title": "Basic profile complete!",
    "onboarding.bridge.sub": "For a more rounded profile, consider adding tags and a bio.",
    "onboarding.bridge.continue": "Continue",
    "onboarding.step3.title": "Your tags",
    "onboarding.step3.sub": "Help others find you with relevant tags.",
    "onboarding.tags.group.disciplines": "Disciplines",
    "onboarding.tags.group.tools": "Tools",
    "onboarding.tags.group.topics": "Topics",
    "onboarding.tags.group.other": "Other",
    "onboarding.step4.title": "Bio & photo",
    "onboarding.step4.sub": "A short bio and photo help your profile stand out.",
    "onboarding.step5.title": "Show your work",
    "onboarding.step5.sub": "Add a few images and they become your card in the member directory.",
    "onboarding.step5.note": "Up to 8 images.",
    "onboarding.step5.noteUnverified":
      "One image for now — up to 8 once your email is verified.",
    "onboarding.step5.noteUnverifiedFull":
      "That is your one image until your email is verified. You can add the rest from your profile afterwards.",
    "onboarding.step5.formats":
      "JPG, PNG or WebP. Captions and descriptions come later, in your profile.",
    "onboarding.step5.later":
      "Nothing to show yet is a normal answer — your card carries your tags instead, and you can add images any time.",
    "onboarding.step5.skip": "Nothing to show yet",
    "onboarding.nav.next": "Next",
    "onboarding.nav.finish": "Finish",
    "onboarding.nav.skip": "Skip for now",
    "onboarding.saving": "Saving…",
    "onboarding.error.save": "Could not save. Please try again.",
    "onboarding.done.title": "Welcome to VSCN",
    "onboarding.done.sub": "Your member card is built.",
    "onboarding.done.disclaimer":
      "Note: Your profile may take a moment to appear in the public community feed. You can edit it any time on your profile page.",
    "onboarding.done.edit": "Edit profile",
    "onboarding.done.goCommunity": "Go to community",

    // Onboarding auth step
    "onboarding.auth.title": "Create your account",
    "onboarding.auth.sub": "Join VSCN to build your public profile.",
    "onboarding.auth.email": "Email",
    "onboarding.auth.password": "Password",
    "onboarding.auth.cta": "Create Account",
    "onboarding.auth.passwordConfirm": "Confirm password",
    "onboarding.auth.haveAccount": "Already have an account?",
    "onboarding.auth.cta.login": "Log in",
    "onboarding.auth.error.invalid": "Invalid email or password. Please try again.",
    "onboarding.auth.error.weak": "Password must be at least 6 characters.",
    "onboarding.auth.error.mismatch": "Passwords don't match.",

    // Profile active toggle
    "profile.active.label": "Active",
    "profile.active.note": "Should your community card be visible?",

    // Signup CTA
    "signup.cta.info": "Join our community",
    "signup.cta.community": "Join the Community",
  },
  de: {
    // Navbar
    "nav.info": "INFO",
    "nav.community": "COMMUNITY",
    "nav.login": "ANMELDEN",
    "nav.profile": "PROFIL",

    // LandingHero
    "hero.statement.connect":
      "Das Visual Science Communication Network verbindet Menschen, die Wissen visuell zugänglich machen.",
    "hero.statement.purpose":
      "Eine wachsende Community aus Illustration, Design und Wissenschaft — vernetzt durch ein zentrales Verzeichnis, Veranstaltungen und Showcases.",
    "hero.cta.join": "Werde Teil unserer Community",
    "hero.cta.community": "Community",

    // InfoPage
    "info.intro":
      "Das Visual Science Communication Network — VSCN, ausgesprochen „Vision“ — verbindet Menschen, die mit Leidenschaft Wissen in Bilder übersetzten.",
    "info.p2":
      "Wir glauben, dass es mehr Wissen verdient hat eine visuelle Form zu bekommen! Bilder machen Forschung verständlich, wecken Neugier und schaffen Brücken zwischen Wissenschaft und Gesellschaft.",
    "info.h2.building": "Was wir aufbauen",
    "info.li.1":
      "Ein umfassendes Verzeichnis von Gestalter:innen und Forschenden im Bereich der visuellen Wissenschaftskommunikation.",
    "info.li.2": "Veranstaltungen für Austausch, Wissenstransfer und Vernetzung.",
    "info.li.3": "Herausragendes visuelles Storytelling sichtbar machen.",
    "info.li.4": "Verbindungen zwischen Wissenschaft, Illustration und Design stärken.",
    "info.h2.scientists": "Für Wissenschaft & Forschungsgruppen",
    "info.p.scientists":
      "VSCN ist nicht nur für Menschen, die Bilder machen — sondern genauso für Forschende, die sie brauchen. Wenn du möchtest, dass deine Arbeit gesehen und verstanden wird, bist du hier richtig. Ein Portfolio brauchst du dafür nicht.",
    "info.li.sci.1":
      "Illustrator:innen, Designer:innen und Animator:innen finden, die dein Fachgebiet schon kennen.",
    "info.li.sci.2": "Deine Forschungsgruppe für visuelle Zusammenarbeit auffindbar machen.",
    "info.li.sci.3": "Zeigen, wie deine Forschung visualisiert wurde — und von wem.",
    "info.h2.started": "Wir sind gerade erst gestartet",
    "info.p4": "Wenn du diese Community mitgestalten möchtest, melde dich gerne direkt bei:",
    "info.contact": "Kontakt",

    // CommunityGrid
    "community.title": "Community",
    "community.member": "Mitglied",
    "community.members": "Mitglieder",
    "community.empty": "Noch keine Mitglieder.",
    "community.view.label": "Ansicht",
    "community.view.gallery": "Galerie",
    "community.view.grid": "Raster",
    "community.view.index": "Index",
    "community.index.search": "Name, Rolle, Tags suchen…",
    "community.filter.type": "Wer",
    "community.filter.looking": "Auf der Suche nach",
    "community.filter.all": "Alle",
    "community.filter.creators": "Gestaltung",
    "community.filter.scientists": "Wissenschaft",
    "community.filter.organizations": "Forschungsgruppen",
    "community.filter.offering": "Bietet Dienste an",
    "community.filter.seeking": "Sucht Dienste",
    "community.filter.none": "Keine Mitglieder entsprechen diesem Filter.",
    "community.filter.none.works": "Keine Arbeiten entsprechen diesem Filter.",
    "community.filter.tags": "Tags",
    "community.filter.tags.all": "Alle Tags",
    "community.filter.tags.search": "Tags suchen…",

    // MemberCard
    "member.showBio": "Bio anzeigen für",
    "member.hideBio": "Bio ausblenden für",
    "member.badge.scientist": "Wissenschaft",
    "member.badge.both": "Gestaltung & Wissenschaft",
    "member.badge.organization": "Forschungsgruppe",

    // AuthForm
    "auth.title.login": "Anmelden",
    "auth.title.reset": "Passwort zurücksetzen",
    "auth.submit.login": "Anmelden",
    "auth.submit.loginLoading": "Wird angemeldet...",
    "auth.status.login": "Du wirst angemeldet...",
    "auth.status.redirecting": "Weiterleitung...",
    "auth.forgot": "Vergessen?",
    "auth.noAccount": "Noch kein Konto?",
    "auth.cta.signup": "Registrieren",
    "auth.reset.send": "Reset-Link senden",
    "auth.reset.sending": "Wird gesendet…",
    "auth.reset.sent": "Gesendet",
    "auth.reset.success": "Überprüfe dein Postfach für einen Reset-Link.",
    "auth.reset.back": "← Zurück zum Login",
    "auth.error.enterEmail": "Bitte gib deine E-Mail-Adresse ein.",
    "auth.error.resetFailed":
      "Reset-E-Mail konnte nicht gesendet werden. Bitte überprüfe die Adresse und versuche es erneut.",
    "auth.error.wait": "Bitte warte einen Moment, bevor du es erneut versuchst.",
    "auth.error.generic": "Etwas ist schiefgelaufen. Bitte versuche es erneut.",

    // Siehe die englischen Schlüssel: nicht gelistete Codes fallen auf
    // auth.error.generic zurück, mit dem Firebase-Code im Text.
    "auth.error.code.emailInUse":
      "Es gibt bereits ein Konto mit dieser E-Mail-Adresse. Melde dich stattdessen an.",
    "auth.error.code.invalidEmail": "Bitte gib eine gültige E-Mail-Adresse ein.",
    "auth.error.code.weakPassword": "Das Passwort muss mindestens 6 Zeichen haben.",
    "auth.error.code.invalidCredential": "E-Mail oder Passwort ist falsch.",
    "auth.error.code.tooManyRequests":
      "Zu viele Versuche. Bitte warte einen Moment und versuche es dann erneut.",
    "auth.error.code.network":
      "Der Server ist nicht erreichbar. Überprüfe deine Internetverbindung sowie Adblocker und VPN.",
    "auth.error.code.operationNotAllowed":
      "Die Registrierung ist derzeit nicht verfügbar. Das liegt an uns. Bitte kontaktiere uns unter info@vscn.ch.",
    "auth.error.code.userDisabled":
      "Dieses Konto wurde deaktiviert. Bitte kontaktiere uns unter info@vscn.ch.",
    // Firestore, nicht Auth. Ein erneuter Versuch trifft dieselbe Ablehnung.
    "auth.error.code.permissionDenied":
      "Dein Konto wurde erstellt, aber wir konnten dein Profil nicht laden. Bitte kontaktiere uns unter info@vscn.ch.",

    // VerifyEmail
    "verify.title": "Posteingang prüfen",
    "verify.sub": "Wir haben einen Bestätigungslink an",
    "verify.sub.suffix": " gesendet. Klicke darauf, um dein Konto zu aktivieren.",
    "verify.cta": "E-Mail bestätigt — weiter",
    "verify.checking": "Wird geprüft…",
    "verify.notVerified":
      "E-Mail noch nicht bestätigt. Überprüfe deinen Posteingang und klicke auf den Link.",
    "verify.resend.label": "Nicht erhalten?",
    "verify.resend.btn": "E-Mail erneut senden",
    "verify.resend.msg":
      "Wir haben einen Link an deine E-Mail gesendet. Falls du ihn nicht siehst, überprüfe bitte deinen Spam-Ordner.",
    "verify.back": "← Zurück zur Registrierung",
    "verify.error.generic": "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    "verify.error.resend":
      "Erneutes Senden fehlgeschlagen. Bitte warte einen Moment und versuche es erneut.",

    // ProfileForm
    "profile.loading": "Profil wird geladen…",
    "profile.verifyBanner":
      "Bitte bestätige deine E-Mail, um dein Konto zu sichern — ist sie nicht angekommen, sieh in deinem Spam-Ordner nach.",
    "profile.verifyResend": "E-Mail erneut senden",
    "profile.verifySent": "E-Mail gesendet — Posteingang prüfen.",
    "profile.chooseImage": "Bild auswählen",
    "profile.memberType.legend": "Wer bist du?",
    "profile.memberType.note":
      "Hilft der Community, sich gegenseitig zu finden. Du kannst das jederzeit ändern.",
    "profile.memberType.creator": "Gestaltung · Illustration",
    "profile.memberType.scientist": "Wissenschaft · Forschung",
    "profile.memberType.both": "Beides",
    "profile.memberType.organization": "Forschungsgruppe · Institution",
    "profile.label.name": "Anzeigename",
    "profile.ph.name": "Dein Name",
    "profile.ph.name.organization": "Name deiner Gruppe oder Institution",
    "profile.label.role": "Rolle",
    "profile.ph.role": "z.B. Wissenschaftsillustrator:in, Forscher:in, Datenjournalist:in…",
    "profile.ph.role.science": "z.B. Neurowissenschaftler:in, Doktorand:in, Institutsleitung…",
    "profile.ph.role.organization": "z.B. Forschungsgruppe, Institut, Museum…",
    "profile.note.role": "Wird auf deiner Karte angezeigt — am besten unter 25 Zeichen.",
    "profile.label.affiliation": "Institution",
    "profile.ph.affiliation": "Studio, Agentur oder freischaffend",
    "profile.ph.affiliation.science": "Institut, Abteilung, Universität",
    "profile.label.location": "Ort",
    "profile.ph.location": "Zürich, Schweiz",
    "profile.label.languages": "Arbeitssprachen",
    "profile.note.languages": "Sprachen, in denen du arbeiten kannst.",
    "profile.lang.de": "Deutsch",
    "profile.lang.en": "Englisch",
    "profile.lang.fr": "Französisch",
    "profile.lang.it": "Italienisch",
    "profile.wantsToContribute": "Ich möchte helfen, diese Community aufzubauen",
    "profile.wantsToContribute.note":
      "VSCN steht noch am Anfang. Setze hier ein Häkchen und wir melden uns mit Möglichkeiten, dich einzubringen.",
    "profile.label.bio": "Über dich",
    "profile.ph.bio": "Eine kurze Beschreibung deiner Arbeit, Interessen oder deines Hintergrunds…",
    "profile.note.bio": "Maximal 35 Wörter.",
    "profile.label.portfolio": "Portfolio / Website",
    "profile.ph.portfolio": "deinewebsite.com",
    "profile.label.portfolio.science": "Website / Institutsseite",
    "profile.ph.portfolio.science": "institut.uni.ch",
    "profile.label.social": "Social Media",
    "profile.ph.social": "linkedin.com/in/deinname",
    "profile.note.social": "Ein Link pro Zeile. LinkedIn, Instagram, X, Bluesky, etc.",
    "profile.social.add": "Link hinzufügen",
    "profile.social.remove": "Link entfernen",
    "profile.social.full": "Mehr Links zeigt ein Profil nicht.",
    "profile.social.tooLong": "Zusammen sind deine Links zu lang. Kürze oder entferne einen.",
    "profile.label.social.science": "Social / ORCID",
    "profile.ph.social.science": "orcid.org/0000-0000-0000-0000",
    "profile.openTo.legend": "Ich bin interessiert an…",
    "profile.openTo.offering": "Dienste anzubieten",
    "profile.openTo.seeking": "Dienste zu finden",
    "profile.openTo.networking": "Netzwerken & zusammenzuarbeiten",
    "profile.openTo.custom.ph": "Etwas anderes? Eigene Option hinzufügen…",
    "profile.visualNeeds.legend": "Wofür brauchst du Visualisierungen?",
    "profile.visualNeeds.note":
      "Hilft Illustrator:innen und Designer:innen, passende Anfragen zu finden. Bis zu 8.",
    "profile.visualNeeds.custom.ph": "Etwas anderes? Eigene Option hinzufügen…",
    "profile.visualNeeds.add": "Option hinzufügen",
    "profile.primaryAudience.legend": "Primäre Zielgruppen",
    "profile.primaryAudience.science": "Wissenschaft",
    "profile.primaryAudience.public": "Öffentlichkeit",
    "profile.primaryAudience.policyMakers": "Politische Entscheidungsträger:innen",
    "profile.primaryAudience.education": "Bildung",
    "profile.label.tags": "Tags",
    "profile.ph.tags": "Eigenen Tag hinzufügen…",
    "profile.note.tags": "Bis zu 7 Tags.",
    "profile.tag.add": "Tag hinzufügen",
    "profile.browseTags": "Tags durchsuchen",
    "profile.browseAllTags": "Alle Tags durchsuchen",
    "profile.hideTags": "Tags ausblenden",
    "profile.label.phone": "Telefonnummer",
    "profile.note.phone":
      "Nicht auf der Community-Seite sichtbar. Nur zur Erstellung einer VSCN-Chat-Gruppe.",
    "member.backToCommunity": "Community",
    "member.openTo": "Offen für",
    "member.needs": "Sucht",
    "member.tags": "Tags",
    "member.elsewhere": "Weitere Links",
    "member.work": "Arbeiten",
    "member.workAlt": "Arbeitsbeispiel",
    "member.lightbox.close": "Schliessen",
    "member.lightbox.zoom": "Zoomen",
    "member.lightbox.prev": "Vorheriges Bild",
    "member.lightbox.next": "Nächstes Bild",
    "member.lightbox.error": "Dieses Bild konnte nicht geladen werden.",
    "member.lightbox.link": "Wo dieses Bild erschienen ist",
    "community.card.expand": "Profil aufklappen:",
    "community.card.viewProfile": "Profil ansehen:",
    "community.card.viewProfile.text": "Profil ansehen",
    "community.card.openImage": "Bild öffnen:",
    "community.card.prev": "Vorheriges Bild",
    "community.card.next": "Nächstes Bild",
    "community.card.carousel": "Karussell",
    "community.card.image": "Bild",
    "community.card.gallery": "Galerie",
    "community.card.imagePosition": "Bild {n} von {total}",
    "profile.gallery.nudge":
      "Deine Karte im Verzeichnis zeigt noch keine Arbeiten — füge Bilder hinzu und sie wird zur Bildkarte.",
    "profile.cardPreview": "Community-Karten-Vorschau",
    "profile.tab.profile": "Profil",
    "profile.tab.work": "Arbeiten",
    "profile.tab.account": "Konto",
    "profile.tab.preview": "Vorschau",
    "profile.view.noWorks":
      "Noch keine Bilder. Füge Arbeiten im Galerie-Feld hinzu, dann erscheinen sie hier.",
    "profile.view.defaultName": "Dein Name",
    "profile.saveMsg":
      "Änderungen gespeichert. Deine Community-Karte wird innerhalb weniger Minuten aktualisiert.",
    "profile.adminConsole": "Admin-Konsole",
    "profile.logout": "Abmelden",
    "profile.save": "Änderungen speichern",
    "profile.delete.idle": "Konto löschen",
    "profile.delete.text":
      "Dein Konto, dein Profil und deine Bilder werden sofort und endgültig gelöscht. Das lässt sich nicht rückgängig machen.",
    "profile.delete.cancel": "Abbrechen",
    "profile.delete.confirm": "Endgültig löschen",
    "profile.delete.scheduled":
      "Dein Konto wird am {date} gelöscht. Melde dich bis dahin jederzeit an, um es zu behalten.",
    "profile.delete.banner": "Dieses Konto wird am {date} gelöscht.",
    "profile.delete.keep": "Konto behalten",
    "profile.delete.keeping": "Wird wiederhergestellt…",
    "profile.delete.error": "Das Konto konnte nicht gelöscht werden. Bitte erneut versuchen.",
    "profile.delete.typePrompt":
      "Gib zur Bestätigung die E-Mail-Adresse dieses Kontos ein:",
    "profile.delete.typeMismatch": "Das ist nicht die Adresse dieses Kontos.",
    "profile.email.title": "E-Mail-Adresse ändern",
    "profile.email.new": "Neue E-Mail-Adresse",
    "profile.email.submit": "Bestätigungslink senden",
    "profile.email.sending": "Wird gesendet…",
    "profile.email.sent":
      "Wir haben einen Bestätigungslink an {email} geschickt. Die Adresse ändert sich, sobald du ihn anklickst.",
    "profile.email.error":
      "Die Adresse konnte nicht geändert werden. Prüfe sie und dein Passwort und versuche es erneut.",
    "profile.reauth.text": "Bitte gib dein Passwort zur Bestätigung ein.",
    "profile.reauth.cancel": "Abbrechen",
    "profile.reauth.confirm": "Löschen bestätigen",
    "profile.preview.defaultName": "Dein Name",
    "profile.upload.processing": "Wird verarbeitet…",
    "profile.upload.uploading": "Wird hochgeladen…",
    "profile.upload.selected": "Ausgewählt: ",
    "profile.upload.complete": "Upload abgeschlossen.",
    "profile.upload.error": "Bild konnte nicht verarbeitet werden.",
    "profile.label.gallery": "Galerie",
    "profile.note.gallery":
      "Bis zu 8 Bilder. Sie erscheinen nach dem nächsten Site-Update auf deiner Mitgliedskarte.",
    "profile.note.galleryUnverified":
      "Ein Bild, bis deine E-Mail bestätigt ist — danach bis zu 8. Sie erscheinen nach der nächsten Aktualisierung auf deiner Mitgliederkarte.",
    "profile.gallery.add": "Bilder hinzufügen",
    "profile.gallery.full": "Galerie ist voll (max. 8 Bilder).",
    "profile.gallery.verifyForMore":
      "Bestätige deine E-Mail, um weitere Bilder hinzuzufügen. Der Link ist in deinem Posteingang.",
    "profile.gallery.error": "Bild konnte nicht hochgeladen werden. Bitte erneut versuchen.",
    "profile.gallery.err.tooBig": "Über 25 MB. Bitte kleiner exportieren.",
    "profile.gallery.err.svg":
      "SVGs können nicht hochgeladen werden. Als PNG oder JPEG exportieren.",
    "profile.gallery.err.heic": "HEIC-Fotos können nicht gelesen werden. Als JPEG exportieren.",
    "profile.gallery.err.type": "Nur JPEG, PNG, WebP oder AVIF sind möglich.",
    "profile.gallery.err.decode":
      "Dieses Bild konnte nicht gelesen werden. Als JPEG oder PNG exportieren.",
    "profile.gallery.err.tooLarge": "Zu detailreich für das Grössenlimit. Enger zuschneiden.",
    "profile.gallery.err.denied":
      "Deine Anmeldung ist abgelaufen. Neu anmelden, dann erneut versuchen.",
    "profile.gallery.err.network": "Verbindung unterbrochen.",
    "profile.gallery.err.quota": "Der Speicher ist voll. Bitte VSCN kontaktieren.",
    "profile.gallery.err.cancelled": "Abgebrochen.",
    "profile.gallery.err.unknown": "Etwas ist schiefgelaufen.",
    "profile.gallery.remove": "Bild entfernen",
    "profile.gallery.drop": "Bilder hier ablegen",
    "profile.gallery.cover": "Titelbild",
    "profile.gallery.coverNote":
      "Das erste Bild ist dein Titelbild: seine Proportionen bestimmen die Form deiner Karte im Verzeichnis.",
    "profile.gallery.moveUp": "Bild nach vorne",
    "profile.gallery.moveDown": "Bild nach hinten",
    "profile.gallery.lang.en": "Englische Felder für Bildtitel und Beschreibung anzeigen",
    "profile.gallery.lang.de": "Deutsche Felder für Bildtitel und Beschreibung anzeigen",
    "profile.gallery.cancel": "Upload abbrechen",
    "profile.gallery.retry": "Erneut versuchen",
    "profile.gallery.dismiss": "Verwerfen",
    "profile.gallery.queued": "Wartet…",
    "profile.gallery.preparing": "Wird vorbereitet…",
    "profile.gallery.overflow": "Es passen nur {n} Bilder — {m} nicht hinzugefügt.",
    "profile.gallery.caption": "Bildtitel",
    "profile.gallery.caption.ph": "Beispiel: Zebrafisch-Netzhaut im Querschnitt, konfokal",
    "profile.gallery.captionNote":
      "Eine Zeile. Wird auch Menschen vorgelesen, die das Bild nicht sehen können.",
    "profile.gallery.caption.de": "Bildtitel (Deutsch)",
    "profile.gallery.caption.de.ph": "Beispiel: Zebrafisch-Netzhaut im Querschnitt, konfokal",
    "profile.gallery.caption.deNote":
      "Optional. Wird deutschen Besucher:innen anstelle des Bildtitels vorgelesen; bis er ausgefüllt ist, hören sie den englischen.",
    "profile.gallery.description":
      "Über dieses Bild — wie es entstand, für wen, was es zeigt",
    "profile.gallery.description.de": "Beschreibung (Deutsch)",
    "profile.gallery.description.de.ph":
      "Beispiel: Angefertigt für eine Publikation über Immunzellen im Zebrafisch-Embryo, aus konfokalen Mikroskopieaufnahmen rekonstruiert. Die Illustration zeigt, wie Fresszellen durch das Gewebe wandern, um Krankheitserreger aufzuspüren.",
    "profile.gallery.description.deNote":
      "Optional. Wird deutschen Besucher:innen anstelle der Beschreibung gezeigt; bis sie ausgefüllt ist, lesen sie die englische.",
    "profile.gallery.link": "Wo dieses Bild erschienen ist",
    "profile.gallery.link.ph": "nature.com/articles/… (optional)",
    "profile.tag.error": "Tags müssen eindeutig sein, 1–50 Zeichen, und maximal 7 Tags.",
    "profile.reauth.confirming": "Wird bestätigt…",
    "profile.reauth.error": "Falsches Passwort. Bitte erneut versuchen.",
    "profile.save.saving": "Wird gespeichert…",
    "profile.save.error": "Änderungen konnten nicht gespeichert werden.",

    // Onboarding
    "onboarding.step1.title": "Über dich",
    "onboarding.step1.sub": "Erzähl uns das Wichtigste, um dein Profil zu starten.",
    "onboarding.step2.title": "Was suchst du?",
    "onboarding.step2.sub": "Hilf uns zu verstehen, was du von VSCN erwartest.",
    "onboarding.request.label": "Was würdest du dir von dieser Plattform wünschen?",
    "onboarding.request.helper":
      "Teile Wünsche, Ideen, Bedürfnisse oder Probleme, bei denen VSCN helfen könnte.",
    "onboarding.bridge.title": "Basis-Profil vollständig!",
    "onboarding.bridge.sub":
      "Für ein vollständigeres Profil kannst du noch Tags und eine Bio hinzufügen.",
    "onboarding.bridge.continue": "Weiter",
    "onboarding.step3.title": "Deine Tags",
    "onboarding.step3.sub": "Hilf anderen, dich mit passenden Tags zu finden.",
    "onboarding.tags.group.disciplines": "Fachgebiete",
    "onboarding.tags.group.tools": "Werkzeuge",
    "onboarding.tags.group.topics": "Themen",
    "onboarding.tags.group.other": "Sonstige",
    "onboarding.step4.title": "Bio & Foto",
    "onboarding.step4.sub": "Eine kurze Bio und ein Foto lassen dein Profil hervorstechen.",
    "onboarding.step5.title": "Zeig deine Arbeit",
    "onboarding.step5.sub":
      "Ein paar Bilder genügen — sie werden zu deiner Karte im Mitgliederverzeichnis.",
    "onboarding.step5.note": "Bis zu 8 Bilder.",
    "onboarding.step5.noteUnverified":
      "Vorerst ein Bild — bis zu 8, sobald deine E-Mail bestätigt ist.",
    "onboarding.step5.noteUnverifiedFull":
      "Das ist dein eines Bild, bis deine E-Mail bestätigt ist. Die übrigen kannst du danach im Profil ergänzen.",
    "onboarding.step5.formats":
      "JPG, PNG oder WebP. Bildtexte und Beschreibungen kommen später, in deinem Profil.",
    "onboarding.step5.later":
      "Noch nichts zu zeigen ist eine ganz normale Antwort — deine Karte trägt dann deine Tags, und Bilder kannst du jederzeit nachreichen.",
    "onboarding.step5.skip": "Noch nichts zu zeigen",
    "onboarding.nav.next": "Weiter",
    "onboarding.nav.finish": "Fertigstellen",
    "onboarding.nav.skip": "Überspringen",
    "onboarding.saving": "Wird gespeichert…",
    "onboarding.error.save": "Fehler beim Speichern. Bitte erneut versuchen.",
    "onboarding.done.title": "Willkommen bei VSCN",
    "onboarding.done.sub": "Deine Member-Karte ist erstellt.",
    "onboarding.done.disclaimer":
      "Hinweis: Es kann einen Moment dauern, bis dein Profil im öffentlichen Community-Feed erscheint. Du kannst es jederzeit auf deiner Profilseite bearbeiten.",
    "onboarding.done.edit": "Profil bearbeiten",
    "onboarding.done.goCommunity": "Zur Community",

    // Onboarding auth step
    "onboarding.auth.title": "Konto erstellen",
    "onboarding.auth.sub": "Tritt VSCN bei und erstelle dein öffentliches Profil.",
    "onboarding.auth.email": "E-Mail",
    "onboarding.auth.password": "Passwort",
    "onboarding.auth.cta": "Konto erstellen",
    "onboarding.auth.passwordConfirm": "Passwort bestätigen",
    "onboarding.auth.haveAccount": "Hast du schon ein Konto?",
    "onboarding.auth.cta.login": "Anmelden",
    "onboarding.auth.error.invalid":
      "Ungültige E-Mail oder falsches Passwort. Bitte erneut versuchen.",
    "onboarding.auth.error.weak": "Das Passwort muss mindestens 6 Zeichen haben.",
    "onboarding.auth.error.mismatch": "Die Passwörter stimmen nicht überein.",

    // Profile active toggle
    "profile.active.label": "Aktiv",
    "profile.active.note": "Soll deine Community-Karte sichtbar sein?",

    // Signup CTA
    "signup.cta.info": "Werde Teil unserer Community",
    "signup.cta.community": "Join der Community",
  },
};

export type Lang = "en" | "de";
