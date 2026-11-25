# Kitab sources (the extension store)

The source store for [Kitab](https://github.com/mrboora04/Kitab): small, safe recipes that let the app find **free, public books** on the web. One link, like a Mihon extension repository.

## Add it in Kitab

It is already built in. To add it by hand: **Browse → Add sources → Source lists → Add**, and paste

```
https://raw.githubusercontent.com/mrboora04/kitab-sources/main/index.json
```

Then tap the arrow next to a source. It shows up under **Browse → Your sources**.

## What is in here

| Source | What it reads | Books |
|---|---|---|
| Free Scanned Books | archive.org | Scanned books anyone can read free on the Internet Archive (no lending-library items), in any language |
| Open Library | openlibrary.org, archive.org | Public-domain books (first published by 1930) in any language; Kitab picks a copy that is free to download |
| OpenStax Textbooks | openstax.org | Free, openly licensed college and school textbooks (PDF), in English, Spanish and Polish |
| Wikisource | en.wikisource.org | Free texts (novels, short stories, poems, plays), exported as EPUB |
| Wikisource in French, German, Spanish, Italian, Portuguese and Russian | xx.wikisource.org | The same, from each language's own Wikisource |
| African Storybook | africanstorybook.org | 3,000+ openly licensed picture storybooks for children in 150+ languages, by language and reading level (EPUB). Needs Kitab 1.22 |

Project Gutenberg (through Gutendex) is built into Kitab itself, so it is not repeated here.

## Catalogs: whole libraries, sorted

Some libraries have no search a reader app can use, only one long list on their website. For those, a script in
[`tools/catalogs/`](tools/catalogs) reads the list every day, tidies it (fixes garbled titles, names the languages,
labels reading levels) and writes it to [`catalogs/`](catalogs). A source of type `catalog` points Kitab at that file;
Kitab searches it and builds its shelves on the phone, and every book still downloads straight from the library.
This repository hosts lists of books, never the books themselves.

## Checked every day

Every day a [GitHub workflow](.github/workflows/daily-check.yml) runs each source the way the app does (Kitab's own
recipe code, loaded from the Kitab repository): it opens every list, searches, and downloads the first bytes of a real book.
The result is written to [`status.json`](status.json), which Kitab reads to mark a source that is not working right now.
When a source breaks, an issue is opened here; it closes itself when the source works again.

Run it yourself: `npm install && node tools/live-check.mjs` (add a source id to check just that one).

## Why it is safe

Mihon extensions are real Android programs, so they have to be signed and trusted. Kitab sources are **not programs**. A source is a JSON recipe that says *which addresses to ask* and *where in the answer the title, cover and download links are*. Kitab runs the recipe itself, so a source:

- **cannot run code** on your phone or touch other apps or files;
- **can only contact the websites it lists** (`hosts`). Anything else is stopped, including redirects and download links;
- is **checked against a checksum** in `index.json` before it is installed, so a changed file is refused;
- must say what kind of books it offers (`license`), and sources with adult content are refused.

Kitab only supports sources of books that are free to read: public domain, open access, or openly licensed. Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing one.

## Make your own repository

A repository is just a folder with an `index.json` and the source files it lists, hosted anywhere over https (GitHub works). Copy this repository, add your sources in `sources/`, run `node tools/build-index.mjs`, and share the link to your `index.json`. The format is in [SOURCE_FORMAT.md](SOURCE_FORMAT.md).

## Disclaimer

Kitab and this repository host no books. Sources only point at websites that publish them. Whether a book is free to read where you live is for you to check.
