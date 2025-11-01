# DocSuite: Universal Document Text Extractor

DocSuite is a powerful and simple Node.js module for extracting text content from various document formats, including Microsoft Word (.docx), Excel (.xlsx), and PowerPoint (.pptx). It provides a unified, asynchronous API that returns structured, easy-to-process data for each document.

## Features

- **Multi-Format Support:** Extract text from `.docx`, `.xlsx`, `.pptx`, and `.pdf` files.
- **PDF Capabilities:** Extract text content, embedded images, and render full-page images from PDF documents.
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

### System Dependencies

**PDF support requires Poppler utilities to be installed on your system.** Without Poppler, DocSuite can still process `.docx`, `.xlsx`, and `.pptx` files, but PDF extraction will be unavailable.

#### Installing Poppler

**macOS:**
```bash
brew install poppler
```

**Ubuntu/Debian:**
```bash
sudo apt-get install poppler-utils
```

**Windows:**
Download and install from [Poppler for Windows](http://blog.alivate.com.au/poppler-windows/) or use Chocolatey:
```bash
choco install poppler
```

#### Verifying Installation

You can verify Poppler is installed correctly by running:
```bash
pdftotext -v
```

Or programmatically check within your application:
```typescript
import DocSuite from '@missionsquad/docsuite';

await DocSuite.checkDependencies();
// Logs: "Poppler dependency verified successfully." or a warning if not found
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
  // The type of content extracted: 'text', 'csv', 'image', or null (on error)
  type: 'text' | 'csv' | 'image' | null;

  // The name of the file being processed.
  fileName: string;

  // The 1-based index of the page, sheet, or slide.
  page: number;

  // The extracted content:
  // - For text/csv: the text string
  // - For images: base64 data URI (e.g., "data:image/jpeg;base64,...")
  // This property is omitted if an error occurs.
  contents?: string;

  // A string containing the error message if parsing fails. This property is omitted on success.
  error?: string;

  // For PDF images: indicates if this is a full-page render (true) or an embedded image (false)
  isFullPage?: boolean;
};
```

### File-Specific Behavior

- **`.docx` (Word Documents):** The entire document is treated as a single page (`page: 1`). The `mammoth` library does not support page-by-page extraction as page breaks are dynamic.
- **`.xlsx` (Excel Workbooks):** Each sheet in the workbook is returned as a separate `ExtractionResult` object. The `contents` will be the sheet's data formatted as a CSV string.
- **`.pptx` (PowerPoint Presentations):** Each slide is returned as a separate `ExtractionResult` object.
- **`.pdf` (PDF Documents):** Each page is processed individually. By default, text is extracted from each page. With options, you can also extract embedded images or render full pages as images.

---

## PDF Extraction Options

DocSuite provides advanced options for PDF processing:

### Basic PDF Text Extraction

```typescript
import DocSuite from '@missionsquad/docsuite';

const results = await DocSuite.extract('./document.pdf');

for (const result of results) {
  if (result.type === 'text') {
    console.log(`Page ${result.page}:`, result.contents);
  }
}
```

### Extracting Embedded Images

```typescript
const results = await DocSuite.extract('./document.pdf', {
  pdf: {
    imageFormat: 'jpeg' // Options: 'native', 'jpeg', 'png'
  }
});

for (const result of results) {
  if (result.type === 'image') {
    // result.contents is a base64 data URI
    console.log(`Image on page ${result.page}:`, result.contents);
  } else if (result.type === 'text') {
    console.log(`Text on page ${result.page}:`, result.contents);
  }
}
```

### Full-Page Image Rendering

For cases where you need a visual representation of each page (e.g., for AI vision models):

```typescript
const results = await DocSuite.extract('./document.pdf', {
  pdf: {
    fullPageImage: true,
    imageFormat: 'jpeg' // Format for full-page renders
  }
});

for (const result of results) {
  if (result.type === 'image' && result.isFullPage) {
    // High-quality full-page render at 150 DPI, scaled to 1080px width
    console.log(`Full page ${result.page} as image`);
  } else if (result.type === 'text') {
    console.log(`Text from page ${result.page}`);
  }
}
```

### Progress Tracking

Monitor extraction progress for long PDFs:

```typescript
const results = await DocSuite.extract('./large-document.pdf', {
  pdf: { fullPageImage: true },
  progressCallback: (event) => {
    if (event.type === 'embedding_page') {
      const { currentPage, totalPages } = event.data;
      console.log(`Processing page ${currentPage} of ${totalPages}`);
    }
  }
});
```

### PDF Extraction Types

The `PdfExtractionOptions` interface:

```typescript
type PdfExtractionOptions = {
  // Format for extracted images: 'native' preserves original format,
  // 'jpeg' and 'png' convert all images to that format
  imageFormat?: 'native' | 'jpeg' | 'png';
  
  // If true, renders each page as a high-quality image (150 DPI, 1080px width)
  fullPageImage?: boolean;
};
```

The `ExtractionOptions` interface:

```typescript
type ExtractionOptions = {
  // Override automatic extension detection
  extension?: string;
  
  // PDF-specific options
  pdf?: PdfExtractionOptions;
  
  // Callback for progress events during extraction
  progressCallback?: (event: { type: string; data: any }) => void;
};
```

---

## Advanced Features

### Post-Processors

DocSuite supports post-processing extracted content. See [README-PostProcessors.md](./README-PostProcessors.md) for detailed usage.

```typescript
// Add custom processing to results
DocSuite.setPdfPostProcessor((results) => {
  return results.map(result => ({
    ...result,
    contents: result.contents ? result.contents.toUpperCase() : result.contents
  }));
});
```

---

## API Reference Summary

### `DocSuite.extract(filePath: string, options?: ExtractionOptions): Promise<ExtractionResult[]>`

Main entry point for extracting content from any supported document format.

### `DocSuite.checkDependencies(): Promise<void>`

Verify that required system dependencies (Poppler) are installed.

### Format-Specific Methods

- `DocSuite.extractDocx(filePath: string): Promise<ExtractionResult[]>`
- `DocSuite.extractXlsx(filePath: string): Promise<ExtractionResult[]>`
- `DocSuite.extractPptx(filePath: string): Promise<ExtractionResult[]>`
- `DocSuite.extractPdf(filePath: string, options?: PdfExtractionOptions, progressCallback?: Function): Promise<ExtractionResult[]>`

### Post-Processor Configuration

- `DocSuite.setDocxPostProcessor(processor: PostProcessorInput): void`
- `DocSuite.setXlsxPostProcessor(processor: PostProcessorInput): void`
- `DocSuite.setPptxPostProcessor(processor: PostProcessorInput): void`
- `DocSuite.setPdfPostProcessor(processor: PostProcessorInput): void`
- `DocSuite.setPostProcessor(extension: string, processor: PostProcessorInput): void`
- `DocSuite.clearPostProcessor(extension: string): void`
- `DocSuite.clearAllPostProcessors(): void`

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
