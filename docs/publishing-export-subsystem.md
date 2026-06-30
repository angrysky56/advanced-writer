# Publish & Ship — Design Spec

**Status:** Draft for approval · **Owner:** Ty · **Date:** 2026-06-29

> **Design law:** the user knows nothing about publishing, and never has to.
> No "EPUB," no "trim size," no "BISAC," no "Shunn," no "WeasyPrint." They make
> at most two plain choices; the system makes every professional decision for
> them and hands back finished files **plus a plain-language guide to actually
> get it out into the world.**

---

## 1. Who this is for

Someone who finished a story in advanced-writer and wants to **sell it or share it like a pro** — without learning anything about publishing. They don't know what an EPUB is. They shouldn't have to. They should be able to think *"I wrote a novel and I want to sell it on Amazon,"* press a button, and get exactly what they need plus instructions a first-timer can follow.

---

## 2. The entire user experience

Two questions, in plain words:

**1. What did you make?**
- A novel / book
- A short story
- A children's / picture book *(later)*
- A movie or TV script
- Not sure → *the system guesses from the project and confirms*

**2. What do you want to do with it?**
- **Sell it on Amazon** → e-book + paperback files + a ready-to-paste store listing + a "how to upload to Amazon" walkthrough
- **Send it to agents / publishers** → the exact manuscript format professionals expect
- **Just give me a nice copy to share** → a clean, good-looking PDF and e-book
- **Make it a proper screenplay** → industry-standard script PDF

Press **Make it.** That's it.

Behind that button the system: structures the book into chapters, builds the title and copyright pages and table of contents, picks professional fonts/margins/sizes, writes a first-draft back-cover blurb and the Amazon keywords/categories *for them to tweak*, generates the files, checks them for errors, and produces a **step-by-step ship-it guide** ("Go to kdp.amazon.com → Create → upload this file → paste this description → …").

The output is a single tidy folder: **the files to upload, the words to paste, and the instructions.** Nothing they need to understand — just follow along.

---

## 3. What "professional" means — and that we do it invisibly

The value is that all the things that get amateurs rejected or look homemade are handled automatically:

- Real chapters, a proper **title page, copyright page, and table of contents**.
- Correct **fonts, margins, and page sizing** for the destination (a sellable paperback, a submittable manuscript, or a script that reads at one page per minute).
- A **back-cover blurb** and **store keywords/categories** drafted by the copilot (it already knows the story) for the user to approve — these are what make a book *findable*, and most beginners get them wrong or skip them.
- Files **validated before handoff**, so the upload doesn't bounce.
- A **plain-language walkthrough** for the chosen destination, because a perfect file is useless if you don't know how to get it onto the store.

The user sees: *"Here's your e-book, your paperback, your description, and how to put it on Amazon."* They never see the machinery.

---

## 4. The copilot does the hard/boring parts

Instead of a form full of fields the user won't understand, the **copilot interviews gently and fills things in**, then shows a simple confirmation:

- It drafts the **blurb**, suggests **keywords and categories**, proposes the **author name** and **title treatment**, even offers a **simple cover** *(later phase)* — all editable in plain language ("make the blurb punchier," "use my pen name").
- Anything it can infer from the story, it pre-fills. The user approves or nudges; they never face blank jargon fields.

---

## 5. Destinations (what each "do with it" produces)

Plain-language label → what they actually get (jargon hidden):

| They pick… | They receive (in the folder) |
|---|---|
| **Sell on Amazon** | An e-book file + a paperback file, both upload-ready; a description + keywords + categories sheet to paste; a "How to publish on Amazon" walkthrough. |
| **Send to agents/publishers** | A correctly-formatted submission manuscript + a short "how to submit" note. |
| **A nice copy to share** | A clean, attractive PDF and an e-book, ready to email or read anywhere. |
| **A proper screenplay** | An industry-standard script PDF (and an editable script file), plus a note on page count / length. |

Each destination is internally a **profile** with all the professional settings baked in. New destinations or genres later = new profiles, same one-button experience.

---

## 6. The one honest caveat we must handle gently

A "script" needs to be *written* as a script (scene headings + dialogue), and right now the engine writes **prose** even for screenplay projects. So when someone asks to turn a prose story into a screenplay, the system will **offer to adapt it into script form first** (an automatic rewrite pass), in plain language: *"Your story is written as a novel. Want me to turn it into a screenplay? It'll re-stage your scenes as a script."* New script projects can be written natively as scripts from the start.

---

## 7. Defaults the system chooses (so the user never decides)

These are **builder decisions, already made** — changeable later in an optional "advanced" view, but invisible by default:

- **Paperback size & look:** 6×9 with professional margins and a clean classic book font. Sensible, sellable, standard.
- **E-book:** the format Amazon and other stores accept, validated automatically.
- **Submission format:** the long-standing standard agents expect.
- **Screenplay:** the industry layout (Courier, standard margins, one-page-per-minute), with a built-in length check.
- **Print/PDF engine:** the lightweight, no-heavy-install option (HTML/CSS-based), so the whole thing stays simple to run.
- **Metadata:** copilot-drafted, user-approved.

If a user truly wants control, an "Advanced" toggle exposes size/font/format — but the default path requires zero knowledge.

---

## 8. How it fits the existing app

- A single **"Publish / Ship it"** panel in the Studio: two dropdowns (what / where) and a **Make it** button. Long renders run as background jobs (same pattern as drafting).
- Or fully copilot-driven: *"make my novel ready to sell on Amazon"* → it asks the couple of plain questions, then produces the bundle.
- Works off any finished draft version; output lands in a per-project `publish/` folder the user can open.

---

## 9. Under the hood (for builders — users never see this)

- **Prose → Pandoc** for the e-book, paperback PDF, and submission manuscript (handles chapters, table of contents, metadata natively).
- **Script → Fountain** plain-text screenplay → industry PDF and an editable Final Draft file (`screenplain`/`afterwriting`, which also gives the page-count/timing check).
- **Validation** before handoff (e.g., epubcheck) so uploads don't get rejected.
- **Profiles** = small configs encoding each destination's professional spec; the engine is shared.
- Tooling is all free and scriptable; the only "heavy" option (LaTeX) is deliberately avoided in favor of a lighter HTML/CSS PDF path.
- References: KDP accepts the standard e-book format for reflowable books ([KDP formats](https://kdp.amazon.com/help?topicId=G200634390)); script export via [screenplain](https://www.linuxlinks.com/screenplain-write-screenplay-fountain/) / [afterwriting](https://afterwriting.com/).

---

## 10. Build order

- **Phase 1 — "A nice copy to share."** The simplest win: any finished story → a clean PDF + e-book, with auto chapters, title page, and table of contents. Proves the whole pipe end-to-end with zero user input.
- **Phase 2 — "Sell it on Amazon."** Adds the paperback file, the copilot-drafted blurb/keywords/categories sheet, file validation, and the step-by-step Amazon walkthrough. The marquee feature.
- **Phase 3 — "Send it to agents" + "A proper screenplay."** Submission format; native script drafting + the prose→script adaptation offer.
- **Phase 4 — Polish.** Simple AI covers, more book sizes/genres, children's books, series handling.

---

## 11. The only things I still need from you

Plain questions, no jargon:

1. For Phase 1, is *"give me a nice shareable e-book + PDF of any finished story, one button, no questions"* the right first thing to build?
2. Should the **copilot auto-write the blurb and Amazon keywords** by default (you approve), or only when asked?
3. Do you want a **simple auto-generated cover** in early, or treat covers as later polish?

Everything else, I'll decide with good defaults so your users never have to.
