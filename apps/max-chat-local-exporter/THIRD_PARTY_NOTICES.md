# Third-party components

MAX Chat Local Exporter includes the following local-only browser components:

- Tesseract.js 7.0.0, Apache-2.0, https://github.com/naptha/tesseract.js
- tesseract.js-core 7.0.0, Apache-2.0, https://github.com/naptha/tesseract.js-core
- Tesseract `rus` and `eng` trained data, Apache-2.0, https://github.com/tesseract-ocr/tessdata
- fflate 0.8.2, MIT, https://github.com/101arrowz/fflate

Bundled license texts are stored in the corresponding `vendor` directories. These files, WebAssembly modules and language models are loaded from the extension package; no OCR CDN or external recognition service is used.

The expected hashes of all executable and model assets are pinned in `vendor/SHA256SUMS` and checked by CI. The generated WebAssembly loader contains long embedded base64 data, so the text secret-pattern scan excludes that one pinned file after its hash is verified.
