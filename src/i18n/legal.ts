// The prose of the three legal pages, both languages, as structured sections
// rather than flat keys in translations.ts: a privacy policy is dozens of
// paragraphs, and "privacy.p17" in a 900-line table is where such text goes
// to rot. tests/unit/legalContent.test.mjs holds en and de to the same
// section ids, so a paragraph added to one language cannot be forgotten in
// the other.
//
// Everything about WHO is read from src/data/legalEntity.ts; everything about
// WHAT the site does with data is written from the code as it stands — the
// Firebase services in src/lib/firebase.ts, Turnstile in
// src/lib/appCheckTurnstile.ts, the admin ping in functions/src/notify.ts.
// When one of those changes, the matching section here changes with it.
import type { Lang } from "./translations.ts";
import { legalEntity as e } from "../data/legalEntity.ts";

export type LegalPageId = "impressum" | "contact" | "privacy";
export const LEGAL_PAGES: readonly LegalPageId[] = ["impressum", "contact", "privacy"] as const;

/** A paragraph, or a bulleted list. */
export type LegalBlock = string | { list: string[] };

export interface LegalSection {
  id: string;
  heading?: string;
  body: LegalBlock[];
}

export interface LegalPageContent {
  title: string;
  /** For <meta name="description">. */
  description: string;
  /** ISO date of the last substantive change; shown on the page. */
  updated: string;
  sections: LegalSection[];
}

const UPDATED = "2026-09-10";

const en: Record<LegalPageId, LegalPageContent> = {
  impressum: {
    title: "Impressum",
    description: "Who runs vscn.ch and how to reach them.",
    updated: UPDATED,
    sections: [
      {
        id: "operator",
        heading: "Responsible for this website",
        body: [
          `${e.domain} is run by ${e.responsible} in a private capacity. ${e.name} is a community initiative, not a registered association or company.`,
          `Contact: ${e.email}`,
        ],
      },
      {
        id: "content",
        heading: "Content and liability",
        body: [
          "The texts on this site are written with care, but no guarantee is given that they are correct, complete or current. The member profiles and the works shown in the directory are written and uploaded by the members themselves; each member is responsible for their own entry.",
          "If you find content on this site that is wrong, out of date or that should not be here — for instance a picture that is yours and was uploaded without your permission — write to the address above and it will be looked at promptly.",
        ],
      },
      {
        id: "links",
        heading: "External links",
        body: [
          "Member profiles link to portfolios, social-media accounts and publications elsewhere on the web. Those sites are outside our control, and no responsibility is taken for their content.",
        ],
      },
      {
        id: "copyright",
        heading: "Copyright",
        body: [
          "The images in the directory belong to the members who uploaded them, or to the rights holders they credit. Reproducing them requires the rights holder’s permission — a member’s profile page tells you how to reach them. The site’s own texts and design may be quoted with attribution.",
        ],
      },
    ],
  },

  contact: {
    title: "Contact",
    description: "How to reach the people behind VSCN — for questions, problems with the site, or anything about your data.",
    updated: UPDATED,
    sections: [
      {
        id: "general",
        heading: "One address for everything",
        body: [
          `Questions about the network, ideas, something on the site not working, a request about your data — it all goes to ${e.email}. A person reads it, usually within a few days.`,
        ],
      },
      {
        id: "problems",
        heading: "Reporting a problem with the site",
        body: [
          "If something is broken, the fastest way to a fix is to include:",
          {
            list: [
              "the address of the page (copy it from the browser bar),",
              "what you did and what happened instead,",
              "your browser and device — for example “Safari on iPhone”, “Chrome on Windows”,",
              "a screenshot, if you have one.",
            ],
          },
          "If you cannot sign in or never received your verification email, say which address you registered with. Do not send your password.",
        ],
      },
      {
        id: "content",
        heading: "Content that should not be here",
        body: [
          `If a profile or a picture in the directory concerns you — it is your work shown without permission, or it is wrong about you — write to ${e.email} with a link to the page. It will be taken down or corrected while the matter is looked into.`,
        ],
      },
      {
        id: "data",
        heading: "Your data",
        body: [
          "You can see, change and delete everything about you yourself: sign in and open your profile. Deleting your account there removes it immediately. For anything the profile editor does not cover, or to ask what is stored about you, use the same address — see the privacy policy for what you are entitled to.",
        ],
      },
    ],
  },

  privacy: {
    title: "Privacy policy",
    description: "What personal data vscn.ch processes, why, where it goes, and what you can do about it.",
    updated: UPDATED,
    sections: [
      {
        id: "controller",
        heading: "Who is responsible",
        body: [
          `The person responsible for the processing of personal data on ${e.domain} (the “controller”) is ${e.responsible}, reachable at ${e.email}. “We” in this policy means him. VSCN is currently run in a private capacity and is not a registered organisation.`,
          "This policy follows the Swiss Federal Act on Data Protection (FADP). Where the EU General Data Protection Regulation (GDPR) applies to you, it is also written to meet that.",
        ],
      },
      {
        id: "visiting",
        heading: "Visiting the site",
        body: [
          "The site is a set of static pages served by Firebase Hosting, a service of Google LLC. When you open a page, Google’s servers receive and log the technical data any web server sees: your IP address, the page requested, the time, and your browser and operating system. We use these logs only to run the site and to find faults; they are kept by Google for a limited time (typically 30 days) and then deleted.",
          "The site sets no cookies of its own, runs no analytics, and embeds no advertising or tracking. Fonts are served from our own site, not from a third party.",
        ],
      },
      {
        id: "turnstile",
        heading: "Bot protection (Cloudflare Turnstile)",
        body: [
          "To keep automated abuse away from sign-up, sign-in and uploads, the site uses Cloudflare Turnstile, a service of Cloudflare, Inc. When you open a page that talks to our database, Turnstile runs a check in your browser and, in doing so, Cloudflare processes technical data such as your IP address and characteristics of your browser to tell a person from a script. Cloudflare does not use this data for advertising. The result is handed to Firebase App Check, which lets your browser talk to our database for a limited time. Nothing about you is stored on our side from this step.",
        ],
      },
      {
        id: "account",
        heading: "Creating an account",
        body: [
          "If you register, Firebase Authentication (Google) stores your email address and a hashed form of your password, and sends you a verification email. We never see the password itself. Your browser keeps you signed in using its own local storage (not a cookie); signing out clears it.",
          "When an account is created, an automatic notice with the email address used is sent to the controller so that new registrations can be attended to. That notice is delivered through Brevo (Sendinblue SAS, Paris, France) to a private mailbox of the controller, and is kept only as an ordinary email.",
        ],
      },
      {
        id: "profile",
        heading: "Your profile and your works",
        body: [
          "The point of VSCN is a public directory, so most of what you enter is meant to be public. You decide what to enter. The following is shown to everyone on the site once your email address is verified and you have finished setting up:",
          {
            list: [
              "your display name, member type, role, affiliation and location,",
              "your biography, languages, subject tags and what you are open to,",
              "links to your portfolio and social-media accounts,",
              "your profile picture and the works you upload, with their captions, descriptions, links and tags.",
            ],
          },
          "The following is private — visible only to you and to the site’s administrator: your email address, your phone number if you give one, your onboarding answers, and whether you would like to help with the network.",
          "Pictures are stored in Firebase Cloud Storage (Google). Each has a fixed web address, so anyone who has the address can view it even without opening the site; the address is not guessable. Pictures you remove are deleted from storage by an automatic sweep shortly after.",
          "Search engines index the directory. Your profile page may therefore appear in search results under your name for as long as it is public.",
        ],
      },
      {
        id: "purpose",
        heading: "Why we process this, and on what basis",
        body: [
          "We process your data to run the network you joined: to show your profile in the directory, to let you edit it, to keep your account secure, and to keep the site working. Where the GDPR applies, the basis is the agreement you enter when you register (Art. 6(1)(b)), our legitimate interest in a working, abuse-free site (Art. 6(1)(f)), and — for making your profile public — your own choice to publish it, which you can reverse at any time.",
        ],
      },
      {
        id: "recipients",
        heading: "Who else receives data",
        body: [
          "We use the following service providers, who process data on our behalf and are bound by contract to do so only as instructed:",
          {
            list: [
              "Google LLC (Firebase Hosting, Authentication, Firestore, Cloud Storage, Cloud Functions) — hosting, accounts, database, pictures. Data may be processed on Google servers outside Switzerland, including in the USA.",
              "Cloudflare, Inc. — bot protection (Turnstile) and the routing of email sent to our domain.",
              "Brevo (Sendinblue SAS, France) — delivery of the administrative notice when an account is created. Processed in the EU.",
              "GitHub, Inc. — the site is rebuilt on GitHub’s servers whenever a profile changes; no personal data beyond what is already public in the directory passes through that step.",
            ],
          },
          "Google, Cloudflare and GitHub are US companies certified under the Swiss-U.S. Data Privacy Framework and the EU-U.S. Data Privacy Framework, or process under the EU standard contractual clauses, which the Swiss Federal Council recognises as adequate safeguards; Brevo processes within the EU, whose level of protection Switzerland recognises as adequate. We do not sell data and do not pass it to anyone else, except where the law obliges us to.",
        ],
      },
      {
        id: "retention",
        heading: "How long we keep it",
        body: [
          "Your account and profile exist for as long as you keep them. When you delete your account — you can do this yourself in the profile editor — your profile, your pictures, your private data and your login are removed immediately; there is no waiting period. The public pages are rebuilt shortly after, so your entry disappears from the directory within minutes. Server logs expire on their own as described above.",
        ],
      },
      {
        id: "rights",
        heading: "Your rights",
        body: [
          "You may ask at any time what data we hold about you, have it corrected or deleted, restrict how it is processed, receive a copy in a common machine-readable format, or object to a processing. Most of this you can do yourself in the profile editor; for the rest, write to the address above. We answer within 30 days.",
          "If you believe we handle your data unlawfully, you may complain to the Swiss Federal Data Protection and Information Commissioner (FDPIC), or — where the GDPR applies — to the supervisory authority of your country of residence.",
        ],
      },
      {
        id: "changes",
        heading: "Changes to this policy",
        body: [
          "This policy describes the site as it is. When the site changes in a way that matters for your data — a new service, a new kind of processing — this page changes with it, and the date at the top moves.",
        ],
      },
    ],
  },
};

const de: Record<LegalPageId, LegalPageContent> = {
  impressum: {
    title: "Impressum",
    description: "Wer vscn.ch betreibt und wie du die Verantwortlichen erreichst.",
    updated: UPDATED,
    sections: [
      {
        id: "operator",
        heading: "Verantwortlich für diese Website",
        body: [
          `${e.domain} wird von ${e.responsible} als Privatperson betrieben. ${e.name} ist eine Community-Initiative, kein eingetragener Verein und keine Firma.`,
          `Kontakt: ${e.email}`,
        ],
      },
      {
        id: "content",
        heading: "Inhalte und Haftung",
        body: [
          "Die Texte auf dieser Website sind mit Sorgfalt geschrieben; eine Gewähr für Richtigkeit, Vollständigkeit und Aktualität wird nicht übernommen. Die Mitgliederprofile und die im Verzeichnis gezeigten Arbeiten werden von den Mitgliedern selbst verfasst und hochgeladen; jedes Mitglied ist für den eigenen Eintrag verantwortlich.",
          "Wenn du auf dieser Website Inhalte findest, die falsch oder veraltet sind oder nicht hierhergehören — etwa ein Bild von dir, das ohne deine Erlaubnis hochgeladen wurde —, schreib an die obige Adresse; die Sache wird zeitnah angeschaut.",
        ],
      },
      {
        id: "links",
        heading: "Externe Links",
        body: [
          "Mitgliederprofile verlinken auf Portfolios, Social-Media-Konten und Publikationen anderswo im Netz. Auf diese Seiten haben wir keinen Einfluss; für ihre Inhalte wird keine Verantwortung übernommen.",
        ],
      },
      {
        id: "copyright",
        heading: "Urheberrecht",
        body: [
          "Die Bilder im Verzeichnis gehören den Mitgliedern, die sie hochgeladen haben, oder den von ihnen genannten Rechteinhabern. Wer sie verwenden möchte, braucht deren Erlaubnis — die Profilseite eines Mitglieds sagt, wie es erreichbar ist. Die eigenen Texte und das Design der Website dürfen mit Quellenangabe zitiert werden.",
        ],
      },
    ],
  },

  contact: {
    title: "Kontakt",
    description: "So erreichst du die Menschen hinter VSCN — bei Fragen, Problemen mit der Website oder allem rund um deine Daten.",
    updated: UPDATED,
    sections: [
      {
        id: "general",
        heading: "Eine Adresse für alles",
        body: [
          `Fragen zum Netzwerk, Ideen, etwas auf der Website funktioniert nicht, ein Anliegen zu deinen Daten — alles geht an ${e.email}. Ein Mensch liest es, meist innerhalb weniger Tage.`,
        ],
      },
      {
        id: "problems",
        heading: "Ein Problem mit der Website melden",
        body: [
          "Wenn etwas nicht funktioniert, hilft am schnellsten, wenn du Folgendes mitschickst:",
          {
            list: [
              "die Adresse der Seite (aus der Browserzeile kopiert),",
              "was du gemacht hast und was stattdessen passiert ist,",
              "Browser und Gerät — zum Beispiel «Safari auf dem iPhone», «Chrome unter Windows»,",
              "einen Screenshot, falls du einen hast.",
            ],
          },
          "Wenn du dich nicht anmelden kannst oder deine Bestätigungs-E-Mail nie angekommen ist, nenn die Adresse, mit der du dich registriert hast. Schick nie dein Passwort.",
        ],
      },
      {
        id: "content",
        heading: "Inhalte, die nicht hierhergehören",
        body: [
          `Wenn dich ein Profil oder ein Bild im Verzeichnis betrifft — deine Arbeit wird ohne Erlaubnis gezeigt, oder es steht etwas Falsches über dich —, schreib an ${e.email} mit einem Link zur Seite. Der Inhalt wird entfernt oder korrigiert, während die Sache geklärt wird.`,
        ],
      },
      {
        id: "data",
        heading: "Deine Daten",
        body: [
          "Alles über dich kannst du selbst einsehen, ändern und löschen: Melde dich an und öffne dein Profil. Wenn du dort dein Konto löschst, ist es sofort weg. Für alles, was der Profil-Editor nicht abdeckt, oder um zu erfahren, was über dich gespeichert ist, nutz dieselbe Adresse — was dir zusteht, steht in der Datenschutzerklärung.",
        ],
      },
    ],
  },

  privacy: {
    title: "Datenschutzerklärung",
    description: "Welche Personendaten vscn.ch bearbeitet, wozu, wohin sie gehen und was du dagegen tun kannst.",
    updated: UPDATED,
    sections: [
      {
        id: "controller",
        heading: "Wer verantwortlich ist",
        body: [
          `Verantwortlich für die Bearbeitung von Personendaten auf ${e.domain} ist ${e.responsible}, erreichbar unter ${e.email}. «Wir» in dieser Erklärung meint ihn. VSCN wird derzeit privat betrieben und ist keine eingetragene Organisation.`,
          "Diese Erklärung richtet sich nach dem Schweizer Datenschutzgesetz (DSG). Soweit für dich die EU-Datenschutz-Grundverordnung (DSGVO) gilt, ist sie auch darauf ausgelegt.",
        ],
      },
      {
        id: "visiting",
        heading: "Besuch der Website",
        body: [
          "Die Website besteht aus statischen Seiten, die von Firebase Hosting, einem Dienst der Google LLC, ausgeliefert werden. Wenn du eine Seite öffnest, empfangen und protokollieren Googles Server die technischen Daten, die jeder Webserver sieht: deine IP-Adresse, die aufgerufene Seite, die Uhrzeit sowie Browser und Betriebssystem. Wir nutzen diese Protokolle nur, um die Website zu betreiben und Fehler zu finden; Google bewahrt sie für begrenzte Zeit auf (in der Regel 30 Tage) und löscht sie dann.",
          "Die Website setzt keine eigenen Cookies, betreibt keine Analyse-Tools und bindet weder Werbung noch Tracking ein. Schriften werden von unserer eigenen Website ausgeliefert, nicht von Dritten.",
        ],
      },
      {
        id: "turnstile",
        heading: "Bot-Schutz (Cloudflare Turnstile)",
        body: [
          "Um automatisierten Missbrauch von Registrierung, Anmeldung und Uploads fernzuhalten, nutzt die Website Cloudflare Turnstile, einen Dienst der Cloudflare, Inc. Wenn du eine Seite öffnest, die mit unserer Datenbank spricht, führt Turnstile in deinem Browser eine Prüfung durch; dabei bearbeitet Cloudflare technische Daten wie deine IP-Adresse und Merkmale deines Browsers, um einen Menschen von einem Skript zu unterscheiden. Cloudflare nutzt diese Daten nicht für Werbung. Das Ergebnis geht an Firebase App Check, das deinem Browser für begrenzte Zeit den Zugriff auf unsere Datenbank erlaubt. Auf unserer Seite wird aus diesem Schritt nichts über dich gespeichert.",
        ],
      },
      {
        id: "account",
        heading: "Ein Konto erstellen",
        body: [
          "Wenn du dich registrierst, speichert Firebase Authentication (Google) deine E-Mail-Adresse und dein Passwort in gehashter Form und schickt dir eine Bestätigungs-E-Mail. Dein Passwort selbst sehen wir nie. Dein Browser hält dich über seinen eigenen lokalen Speicher angemeldet (kein Cookie); Abmelden löscht ihn.",
          "Wird ein Konto erstellt, geht eine automatische Mitteilung mit der verwendeten E-Mail-Adresse an den Verantwortlichen, damit neue Registrierungen betreut werden können. Diese Mitteilung wird über Brevo (Sendinblue SAS, Paris, Frankreich) an ein privates Postfach des Verantwortlichen zugestellt und nur als gewöhnliche E-Mail aufbewahrt.",
        ],
      },
      {
        id: "profile",
        heading: "Dein Profil und deine Arbeiten",
        body: [
          "VSCN ist ein öffentliches Verzeichnis, darum ist das meiste, was du eingibst, für die Öffentlichkeit bestimmt. Was du eingibst, entscheidest du. Folgendes sehen alle Besucherinnen und Besucher, sobald deine E-Mail-Adresse bestätigt ist und du die Einrichtung abgeschlossen hast:",
          {
            list: [
              "dein Anzeigename, Mitgliedstyp, deine Rolle, Zugehörigkeit und dein Ort,",
              "deine Biografie, Sprachen, Fachgebiete und wofür du offen bist,",
              "Links zu deinem Portfolio und deinen Social-Media-Konten,",
              "dein Profilbild und die Arbeiten, die du hochlädst, mit ihren Bildunterschriften, Beschreibungen, Links und Schlagwörtern.",
            ],
          },
          "Folgendes ist privat — nur für dich und die Administration der Website sichtbar: deine E-Mail-Adresse, deine Telefonnummer, falls du eine angibst, deine Antworten aus der Einrichtung und ob du beim Netzwerk mithelfen möchtest.",
          "Bilder liegen in Firebase Cloud Storage (Google). Jedes hat eine feste Webadresse; wer die Adresse kennt, kann das Bild auch ohne die Website ansehen. Die Adresse ist nicht erratbar. Bilder, die du entfernst, werden kurz darauf von einem automatischen Durchlauf aus dem Speicher gelöscht.",
          "Suchmaschinen indexieren das Verzeichnis. Deine Profilseite kann darum unter deinem Namen in Suchergebnissen erscheinen, solange sie öffentlich ist.",
        ],
      },
      {
        id: "purpose",
        heading: "Wozu wir das bearbeiten, und auf welcher Grundlage",
        body: [
          "Wir bearbeiten deine Daten, um das Netzwerk zu betreiben, dem du beigetreten bist: um dein Profil im Verzeichnis zu zeigen, dich es bearbeiten zu lassen, dein Konto zu sichern und die Website am Laufen zu halten. Soweit die DSGVO gilt, ist die Grundlage die Vereinbarung, die du mit der Registrierung eingehst (Art. 6 Abs. 1 lit. b), unser berechtigtes Interesse an einer funktionierenden, missbrauchsfreien Website (Art. 6 Abs. 1 lit. f) und — für die Veröffentlichung deines Profils — deine eigene Entscheidung, es zu veröffentlichen, die du jederzeit zurücknehmen kannst.",
        ],
      },
      {
        id: "recipients",
        heading: "Wer sonst Daten erhält",
        body: [
          "Wir nutzen die folgenden Dienstleister, die Daten in unserem Auftrag bearbeiten und vertraglich gebunden sind, dies nur nach unseren Weisungen zu tun:",
          {
            list: [
              "Google LLC (Firebase Hosting, Authentication, Firestore, Cloud Storage, Cloud Functions) — Hosting, Konten, Datenbank, Bilder. Daten können auf Google-Servern ausserhalb der Schweiz bearbeitet werden, auch in den USA.",
              "Cloudflare, Inc. — Bot-Schutz (Turnstile) und die Weiterleitung von E-Mails an unsere Domain.",
              "Brevo (Sendinblue SAS, Frankreich) — Zustellung der administrativen Mitteilung bei der Erstellung eines Kontos. Bearbeitung in der EU.",
              "GitHub, Inc. — die Website wird auf GitHubs Servern neu gebaut, wenn sich ein Profil ändert; dabei fliessen keine Personendaten, die nicht bereits im Verzeichnis öffentlich sind.",
            ],
          },
          "Google, Cloudflare und GitHub sind US-Unternehmen, die unter dem Swiss-U.S. Data Privacy Framework und dem EU-U.S. Data Privacy Framework zertifiziert sind oder Daten unter den EU-Standardvertragsklauseln bearbeiten, die der Bundesrat als angemessene Garantie anerkennt; Brevo bearbeitet Daten in der EU, deren Schutzniveau die Schweiz als angemessen anerkennt. Wir verkaufen keine Daten und geben sie an niemanden sonst weiter, ausser wo uns das Gesetz dazu verpflichtet.",
        ],
      },
      {
        id: "retention",
        heading: "Wie lange wir sie behalten",
        body: [
          "Dein Konto und dein Profil bestehen, solange du sie behältst. Wenn du dein Konto löschst — das kannst du selbst im Profil-Editor —, werden dein Profil, deine Bilder, deine privaten Daten und dein Login sofort entfernt; es gibt keine Wartefrist. Die öffentlichen Seiten werden kurz darauf neu gebaut, dein Eintrag verschwindet also innerhalb von Minuten aus dem Verzeichnis. Server-Protokolle laufen wie oben beschrieben von selbst ab.",
        ],
      },
      {
        id: "rights",
        heading: "Deine Rechte",
        body: [
          "Du kannst jederzeit erfahren, welche Daten wir über dich haben, sie berichtigen oder löschen lassen, ihre Bearbeitung einschränken, eine Kopie in einem gängigen maschinenlesbaren Format erhalten oder einer Bearbeitung widersprechen. Das meiste davon kannst du selbst im Profil-Editor erledigen; für den Rest schreib an die obige Adresse. Wir antworten innerhalb von 30 Tagen.",
          "Wenn du der Ansicht bist, dass wir deine Daten unrechtmässig bearbeiten, kannst du dich beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) beschweren oder — soweit die DSGVO gilt — bei der Aufsichtsbehörde deines Wohnsitzlandes.",
        ],
      },
      {
        id: "changes",
        heading: "Änderungen dieser Erklärung",
        body: [
          "Diese Erklärung beschreibt die Website, wie sie ist. Ändert sich die Website in einer Weise, die für deine Daten von Bedeutung ist — ein neuer Dienst, eine neue Art der Bearbeitung —, ändert sich diese Seite mit, und das Datum oben rückt nach.",
        ],
      },
    ],
  },
};

export const legal: Record<Lang, Record<LegalPageId, LegalPageContent>> = { en, de };
