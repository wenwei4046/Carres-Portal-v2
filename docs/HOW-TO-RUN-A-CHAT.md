# How to run a chat — Jess's two prompts

> Every piece of work in this repo happens in one of TWO kinds of chat. Each has one
> paste-ready prompt below. Nothing else needs to be remembered.
>
> **① PLAN chat** — Jess pastes a ChatGPT design conversation. The chat studies it against
> the live system, lists what already exists / what conflicts / what is genuinely new, asks
> her the decisions only she can make, then writes CARDS. It never writes code.
>
> **② BUILD chat** — does ONE card, ships it, marks it ✅. It never redesigns.

---

## The four laws every chat must read (they outrank any pasted text)

| File | Settles |
|---|---|
| `docs/ACTION-FLOW-STANDARD.md` | how actions are computed, when they appear/close, which shows first |
| `docs/COPY-STANDARD.md` | every visible word — the dictionary, the audit table, the banned words |
| `docs/UI-KIT.md` | the shell: colour, spacing, icons, components |
| `docs/execution-queues-index.md` | every line, every card, what is shipped, the lane rules |

**One concern, one file. When Jess re-rules something, the old text is DELETED and
overwritten — never annotated "superseded", never two versions side by side.**

---

## ① PLAN chat — paste this, then paste the ChatGPT conversation underneath

```
You are integrating an outside design conversation into a live ERP.

FIRST, read these and treat them as law that outranks anything I paste:
  docs/ACTION-FLOW-STANDARD.md
  docs/COPY-STANDARD.md
  docs/UI-KIT.md
  docs/execution-queues-index.md
  the queue doc for the module we are discussing (from the index)

Then read the conversation I paste below and answer THREE questions, in this order,
each backed by evidence from THIS repo and THIS database — never from the pasted text:

  1. ALREADY BUILT — what does the system already do? Name the file, table or PR.
     Anything already built is forbidden to rebuild. Expect most of it to be here.
  2. CONFLICTS — what fights the four laws, a decision I already locked, or the real
     data? For each: quote the conflict, say which side wins and why, and if it is a
     business call, ASK me. Verify money and data claims against the live database
     before repeating them.
  3. GENUINELY NEW — only what is left. This is the real work.

Then:
  - Ask me the decisions only I can make. ONE recommended default each, never a menu
    of options. Do not guess and do not build on a guess.
  - After I answer, write the work as CARDS in the module's queue doc (create the doc
    if the line does not exist yet), and update docs/execution-queues-index.md.
    Every card states: what ALREADY EXISTS (never rebuild) · what to touch · DONE WHEN ·
    its lane · whether it needs a migration.
  - Fix every contradiction you found by OVERWRITING or DELETING the old text. Never
    write "superseded", never leave two versions.
  - Finish with a contradiction scan across the docs you touched, and report it.

Rules:
  - Do NOT write application code in this chat. Docs and cards only.
  - Do NOT invent business policy. If it is a business decision, it is my call.
  - If something in the pasted text is already law here, say so and move on.
  - Reply in Chinese; anything I need to copy elsewhere in English.
```

## ② BUILD chat — paste this, change the card id

```
Read docs/execution-queues-index.md and resolve card <ID> by its LETTER — the card may
live in a different doc than you expect. Then read that card and these four laws:
docs/ACTION-FLOW-STANDARD.md, docs/COPY-STANDARD.md, docs/UI-KIT.md, and the card's own
queue doc.

Do card <ID> ONLY. Build it, test it, create the PR, merge, deploy from the main tip,
then mark <ID> ✅ in its doc with the PR number.

  - Do not touch any other card.
  - Do not redesign anything marked ALREADY EXISTS.
  - If you find a defect outside this card, do not fix it: write it into the card that
    owns it, with the exact file and line.
  - Any word you put on screen must already exist in docs/COPY-STANDARD.md. If it does
    not, stop and ask me — do not invent one.
  - Deploy law: merge to main first, deploy from the main tip, both Pages projects,
    then poll all four canonical URLs until they converge.
  - Reply in Chinese.
```

---

## Why this works

- **Nothing depends on a chat remembering.** The four laws are files; the prompts make the
  chat read them before it thinks. A fresh chat with no memory behaves the same as one that
  has been running for hours.
- **The pasted design is treated as INPUT, not instruction.** Most of what an outside
  conversation proposes is already built here; the three-question pass is what stops the
  same thing being built twice.
- **Jess only ever answers business questions.** Implementation detail is derived; wording
  is already law; the only thing that stops the work is a decision about how Carres runs.
- **One card, one chat, one PR, one deploy.** A chat that goes wrong is closed and reopened
  with the same prompt — the docs are the memory, the chat is disposable.
