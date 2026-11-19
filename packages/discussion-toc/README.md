# Discussion table of contents

Enable this addon alongside the default UI. Discussion bodies with at least two nonempty headings automatically receive a directory. Markdown `#` through `######` and rendered HTML headings are supported; bold paragraphs do not count as headings. The post title and comments are excluded.

Desktop layouts (1000px and wider) show a sticky sidebar directory with the current section highlighted. Narrower layouts show a floating, collapsible directory. Both have shortcuts to the start/end of the article. Navigation jumps instantly to avoid downloading lazy images in every intervening section.

Existing heading IDs are preserved, including the default Markdown renderer's encoded Chinese IDs. Missing/duplicate IDs are assigned unique fallbacks. Links support reload, copying, and browser back/forward. Directory labels use plain text, never HTML from the post. Long directories scroll internally; the mobile panel closes after navigation, on Escape, or on an outside click.

This is a frontend-only feature: original Markdown and stored images are not changed. Disabling the addon restores the ordinary discussion layout. The template only adds two `data-` markers for layout/sidebar placement.

The browser regression check is `test/hgnu-discussion-toc.cjs` (requires Playwright with Chromium). Run it against the restored HGNU test site using `HGNUOJ_TEST_URL`, optionally setting `HGNUOJ_TOC_REPORT_DIR` for JSON/screenshots. It validates desktop/mobile/tablet jumps, sticky placement, copied Chinese fragments, reload/back, shortcuts, nested/duplicate headings, safe labels and repeated partial refresh. Its content fixtures only modify the browser DOM.
