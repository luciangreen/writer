# Writer

Writer is the word processor in Lucian Office, inside [LucianOS](https://github.com/luciangreen/lucianos). You can describe what you want in plain English and get a draft that is proved to say what you described, at the year level you choose. You can also edit it as rich text, track changes, let the RetroMR character make edits you can undo, find new directions with the **GL Inspire** plug-in, and teach it rewrite rules from examples with the **Chatbot App Authorer** plug-in.

The work is done by algorithms you can open and improve. Claude is optional and off by default: GL Inspire only offers it for inputs you switch on, and shows you exactly what would be sent first.

## Install

Writer is built on the [Lucian Office core](https://github.com/luciangreen/lucianoffice). Clone both into LucianOS's `apps` folder, side by side, and restart LucianOS:

```sh
cd lucianos/apps
git clone https://github.com/luciangreen/lucianoffice
git clone https://github.com/luciangreen/writer
git clone https://github.com/luciangreen/glinspire          # optional: the GL Inspire tab
git clone https://github.com/luciangreen/chatbotappauthor   # optional: the Authorer tab
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

## GL Inspire and the Chatbot App Authorer

These two are Lucian Office plug-ins, each in its own repo. Install them beside Writer in `lucianos/apps` and their tabs appear in Writer:

- [**GL Inspire**](https://github.com/luciangreen/glinspire) (`apps/glinspire`) suggests inspiring keywords and new directions for the text. It scores words in the open from Grammar Logic, your bio and your recent texts. "inspire me" and "inspire me more about health" work in Writer, and **Undo** takes its suggestions back on their own.
- [**Chatbot App Authorer**](https://github.com/luciangreen/chatbotappauthor) (`apps/chatbotappauthor`) learns rewrite rules from start and finish examples, shows and proves them, and applies them to the document. "apply the casual rules" works in Writer.

Without them, Writer works as before, minus those tabs. "replace good with great" is Writer's own.

## Tests

```sh
npm test
```

The tests need the core beside Writer (`../lucianoffice`). They cover:

- find and replace keeping case and whole words;
- track changes;
- safe rich text and exports;
- Writer's commands, including undoing only the character's edit.

GitHub Actions checks out the core beside Writer and runs them.

## Not yet

- Export to .docx and PDF.

## Inputs and outputs

`io/ios.txt` lists 200 inputs and the outputs they give, from real runs of this repo's functions (the list of functions is in `io/cases.mjs`; the inputs come from a fixed seed, so they are the same every time). `npm test` runs them again and fails if any output changes. If a change is meant, run `npm run ios` to write the new outputs and check the diff.
