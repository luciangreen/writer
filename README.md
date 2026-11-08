# Writer

Writer is the word processor in Lucian Office, inside [LucianOS](https://github.com/luciangreen/lucianos). You can describe what you want in plain English and get a draft that is proved to say what you described, at the year level you choose. You can also edit it as rich text, track changes, let the RetroMR character make edits you can undo, find new directions with **GL Inspire**, and teach it rewrite rules from examples with the **Chatbot App Authorer**.

The work is done by algorithms you can open and improve. Claude is optional and off by default: GL Inspire only offers it for inputs you switch on, and shows you exactly what would be sent first.

## Install

Writer is built on the [Lucian Office core](https://github.com/luciangreen/lucianoffice). Clone both into LucianOS's `apps` folder, side by side, and restart LucianOS:

```sh
cd lucianos/apps
git clone https://github.com/luciangreen/lucianoffice
git clone https://github.com/luciangreen/writer
```

Writer works in the browser on a computer or a phone.

## Using it

- **Describe it and Draft.**
  - Write statements and rules on the left and press **Draft**.
  - The Lucian Office Converter turns them into Prolog, proves the result, and writes it back as text at your year level, in three paragraphs: facts, rules and questions.
  - If it needs to know more, such as "What height counts as tall?", the question appears beside the description. Answers go into **Data**.
- **Data and Opinion** are your own sections, kept with the document.
- **The page** is a rich text editor:
  - paragraph or heading;
  - bold, italic, underline and links;
  - Undo and Redo, including Ctrl/Cmd+Z;
  - pasted text is cleaned to the same safe formatting.

  Typing is saved as one undoable step per pause.
- **Track changes**: tick it, and every change after that is kept for review.
  - The **Review** tab shows each changed paragraph word by word, with additions and deletions marked.
  - You can accept or reject one change or all of them.
  - Deleted paragraphs stay marked until you decide.
  - Accepting and rejecting can be undone too.
- **Year level** sets the level for drafts and for "make it year 5". The count under the toolbar shows how many sentences are still over the limits.
- **Tell Lucian** (or say it to the desktop character while Writer is in front):
  - "add a paragraph saying …", "add a heading …", "delete the last paragraph";
  - "replace good with great", "make it year 5", "draft it";
  - "inspire me", or "inspire me more about health";
  - "apply the casual rules";
  - "turn on track changes", "accept all changes", "reject all changes", "read it";
  - "what changed", and "undo that", which undoes only Lucian's last edit, even after you've typed elsewhere.
- **Save** writes `Name.writer.json` (a Lucian Office document) with its Prolog form, `Name.writer.pl`, beside it. **Export** writes plain text, Markdown or the Prolog form.

## GL Inspire

GL Inspire suggests inspiring keywords and new directions for the text.

- **Where the words come from:**
  - Grammar Logic (`grammar_logic_to_alg1`, run as a LucianOS Prolog job with the folders from your workflow settings, starting from the first word of the text);
  - your **bio**;
  - your **recent texts** (the newest .txt and .md files in a folder you choose).
- **How each word is scored** (shown, not hidden):

  | Part | Points |
  | --- | --- |
  | **new** | 1 ÷ how often the word appears in your inputs; words already in the text are never suggested |
  | **connected** | +2 for each word of the text it appears beside (up to 5); shared stems count too |
  | **positive** | +1 for a positive word; negative words are not suggested |
  | **links** | +1.5 for each other new word it appears beside (up to 5), so it opens a direction rather than a dead end |
  | **focus** | +3 when it is near the focus you asked for |

- **Buttons:**
  - **Inspire** adds the best ones to the page as inspiration notes, each with a direction ("Connect meditation to music, then follow it to enjoy").
  - **Undo** removes them.
  - The instruction field with **Do** takes requests such as "more about health", "only positive", "3 ideas" or "just from my bio".
- **Claude:** each input (the text so far, the bio, recent texts) has its own **send to Claude** switch, off by default. **Ask Claude too** sends only the inputs you switched on, labelled, through LucianOS's Claude settings, which show the text before it is sent. Claude's reply is shown separately and is not added to the page.

## Chatbot App Authorer

1. Give start and finish examples of a change you want (a "text gradient"), one per line: `start => finish`.
2. **Learn rules** works out the rewrite rules:
   - It lines up each pair word by word (longest common subsequence).
   - Each changed run becomes a rule "find → replace".
   - Rules seen in several examples are counted.
   - A rule that would also fire where an example didn't change gets a word of context, so it fires only where it should.
3. The rules are shown in a table. You can edit them and switch each one on or off.
4. They are **proved on your examples**: each start, rewritten, must give its finish. Any that don't are listed.
5. Use the rules:
   - **Try** rewrites a sentence. Inside LucianOS, the desktop character says the result too, so you can watch the effect live in RetroMR.
   - **Apply to the document** makes one undoable step.
   - **Save rules** keeps them by name, also as a Lucian Office document in `Documents/Lucian Office/Rules/`. Then "apply the casual rules" works from anywhere in Writer.

## Tests

```sh
npm test
```

The tests need the core beside Writer (`../lucianoffice`). They cover:

- GL Inspire's scores on sample texts (`test/fixtures`);
- the Authorer learning rules from example pairs, proving them and applying them to new text;
- track changes;
- safe rich text and exports;
- Writer's commands, including undoing only the character's edit.

GitHub Actions checks out the core beside Writer and runs them.

## Not yet

- Export to .docx and PDF.
- GL Inspire learning from which inspirations you keep.
- Authorer rules used as chatbot replies.
