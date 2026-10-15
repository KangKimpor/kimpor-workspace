# Third-party notices

This app uses open-source software. `pnpm run licenses` saves the installed
dependency/version/license inventory in `docs/evidence/dependency-licenses.json`.
Source-path fields describe the audit machine, not application runtime paths.

- KaTeX 0.19.0, Khan Academy and contributors: MIT; bundled font notice/license
  files are included in its package. https://github.com/KaTeX/KaTeX
- web-push 3.6.7 (server only, unmodified): MPL-2.0. The upstream license notice is in
  docs/licenses/web-push-MPL-2.0.txt; upstream source:
  https://github.com/web-push-libs/web-push
- Inter Variable, Rasmus Andersson: SIL Open Font License 1.1.
  https://github.com/rsms/inter/blob/master/LICENSE.txt
- Noto Sans Khmer, The Noto Project Authors: SIL Open Font License 1.1.
  Bundled Khmer subset; license in docs/licenses/noto-sans-khmer-OFL-1.1.txt.
  https://github.com/notofonts/khmer
- Lucide icons, Lucide contributors: ISC license; original Feather icons by
  Cole Bemis: MIT license. https://lucide.dev/license
- caniuse-lite compatibility data: CC BY 4.0, caniuse contributors.
  https://github.com/browserslist/caniuse-lite
- axe-core (test tooling): MPL 2.0. https://github.com/dequelabs/axe-core
- Lighthouse CI (test tooling): Apache 2.0. Its parse-cache-control 1.0.1
  dependency labels its license "BSD"; the distributed LICENSE was reviewed
  as BSD-3-Clause, copyright Walmart and contributors. It is not shipped in
  the application. https://github.com/roryf/parse-cache-control
- Sharp image generation (build tooling): Apache 2.0. Its optional prebuilt
  libvips library is LGPL 3.0 or later, dynamically loaded only during asset
  generation. Sharp/libvips are not included in the browser or Windows app.
  https://github.com/libvips/libvips and https://sharp.pixelplumbing.com/install/

No GPL-only or commercial TipTap extension is used. Preserve upstream license
files when redistributing build tools. Review new license groups before shipping.

Urbanist Variable (@fontsource-variable/urbanist 5.3.0), SIL Open Font License 1.1. See docs/licenses/urbanist-OFL.txt.
