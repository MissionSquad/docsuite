# DocSuite: Universal Document Text Extractor

DocSuite is a powerful and simple Node.js module for extracting text content from various document formats, including Microsoft Word (.docx), Excel (.xlsx), and PowerPoint (.pptx). It provides a unified, asynchronous API that returns structured, easy-to-process data for each document.

## Features

- **Multi-Format Support:** Extract text from `.docx`, `.xlsx`, and `.pptx` files.
- **Structured Output:** Instead of a single block of text, DocSuite returns an array of objects, where each object represents a page, sheet, or slide.
- **Robust Error Handling:** The module captures parsing errors gracefully and returns them as part of the structured response, preventing crashes.
- **Simple API:** A single `extract` method serves as the entry point for all supported file types.
- **TypeScript Native:** Built with TypeScript, providing strong typing for all methods and data structures.

---

## Installation

You can add DocSuite to your project using npm or yarn.

```bash
npm install @missionsquad/docsuite
# or
yarn add @missionsquad/docsuite
```

---

## Quick Start

Here's a basic example of how to use DocSuite to extract text from a file:

```typescript
import DocSuite, { ExtractionResult } from '@missionsquad/docsuite';

const filePath = './docs/Research Doc.docx';

(async () => {
  const results: ExtractionResult[] = await DocSuite.extract(filePath);

  for (const result of results) {
    if (result.error) {
      console.error(`[!] Error processing ${result.fileName} on page ${result.page}:`);
      console.error(result.error);
    } else {
      console.log(`--- Page/Sheet/Slide ${result.page} of ${result.fileName} ---`);
      console.log(result.contents);
    }
  }
})();
```

---

## API Reference

### `DocSuite.extract(filePath: string): Promise<ExtractionResult[]>`

This is the main entry point for the module. It automatically detects the file type based on its extension and routes it to the appropriate parser.

- **`filePath`**: The absolute or relative path to the document file.
- **Returns**: A `Promise` that resolves to an array of `ExtractionResult` objects.

### The `ExtractionResult` Object

This is the core data structure returned by the `extract` method.

```typescript
type ExtractionResult = {
  // The name of the file being processed.
  fileName: string;

  // The 1-based index of the page, sheet, or slide.
  page: number;

  // The extracted text content. This property is omitted if an error occurs.
  contents?: string;

  // A string containing the error message if parsing fails. This property is omitted on success.
  error?: string;
};
```

### File-Specific Behavior

- **`.docx` (Word Documents):** The entire document is treated as a single page (`page: 1`). The `mammoth` library does not support page-by-page extraction as page breaks are dynamic.
- **`.xlsx` (Excel Workbooks):** Each sheet in the workbook is returned as a separate `ExtractionResult` object. The `contents` will be the sheet's data formatted as a CSV string.
- **`.pptx` (PowerPoint Presentations):** Each slide is returned as a separate `ExtractionResult` object.

---

## Development

To test the module, a test script is included in the `scripts` directory. This script will process all documents in the `docs` directory and print the structured output or any errors to the console.

### Running Tests

1.  **Install development dependencies:**
    You will need `ts-node` to run the script directly.
    ```bash
    npm install -D ts-node
    # or
    yarn add -D ts-node
    ```

2.  **Execute the test script:**
    ```bash
    npx ts-node src/scripts/test.ts
