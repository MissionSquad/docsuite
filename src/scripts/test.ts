import path from 'path';
import fs from 'fs/promises';
import { DocSuite, ExtractionResult } from '../DocSuite';

const testPostProcessors = async () => {
  console.log('\n\n########################################');
  console.log('  [*] Testing Post-Processors');
  console.log('########################################');

  const docsDirectory = path.resolve(__dirname, '..', '..', 'docs');
  const testFile = 'Heights Labs China Fentanyl Research.pdf'
  const testFilePath = path.join(docsDirectory, testFile);

  // --- Test 1: Simple function post-processor ---
  console.log('\n--- Test 1: Simple function post-processor ---');
  const addMetadata = (results: ExtractionResult[]): ExtractionResult[] => {
    return results.map(result => ({
      ...result,
      contents: result.contents ? `[PROCESSED] ${result.contents}` : result.contents
    }));
  };
  DocSuite.setDocxPostProcessor(addMetadata);
  let results = await DocSuite.extract(testFilePath);
  console.log(results[0].contents);
  DocSuite.clearAllPostProcessors();

  // --- Test 2: Class method with context ---
  console.log('\n--- Test 2: Class method with context ---');
  class DocumentProcessor {
    private prefix: string;
    constructor(prefix: string) {
      this.prefix = prefix;
    }
    processResults(results: ExtractionResult[]): ExtractionResult[] {
      return results.map(result => ({
        ...result,
        contents: result.contents ? `${this.prefix}: ${result.contents}` : result.contents
      }));
    }
  }
  const processor = new DocumentProcessor('[COMPANY]');
  DocSuite.setDocxPostProcessor({
    handler: processor.processResults,
    context: processor
  });
  results = await DocSuite.extract(testFilePath);
  console.log(results[0].contents);
  DocSuite.clearAllPostProcessors();

  // --- Test 3: Async post-processor ---
  console.log('\n--- Test 3: Async post-processor ---');
  const enrichWithAPI = async (results: ExtractionResult[]): Promise<ExtractionResult[]> => {
    await new Promise(resolve => setTimeout(resolve, 50)); // Simulate async call
    return results.map(result => ({
      ...result,
      contents: result.contents ? `[ASYNC] ${result.contents}` : result.contents
    }));
  };
  DocSuite.setDocxPostProcessor(enrichWithAPI);
  results = await DocSuite.extract(testFilePath);
  console.log(results[0].contents);
  DocSuite.clearAllPostProcessors();

  // --- Test 4: Post-processor error handling ---
  console.log('\n--- Test 4: Post-processor error handling ---');
  const errorProcessor = () => {
    throw new Error('Something went wrong in the processor');
  };
  DocSuite.setDocxPostProcessor(errorProcessor);
  results = await DocSuite.extract(testFilePath);
  console.log(results[0].error);
  DocSuite.clearAllPostProcessors();
};

(async () => {
  console.log('Starting DocSuite test script...');

  const docsDirectory = path.resolve(__dirname, '..', '..', 'docs');

  try {
    const files = await fs.readdir(docsDirectory);

    for (const file of files) {
      const filePath = path.join(docsDirectory, file);
      
      if (file.startsWith('.')) {
        continue;
      }

      console.log(`\n========================================`);
      console.log(`  [*] Testing: ${file}`);
      console.log(`========================================`);

      try {
        const results: ExtractionResult[] = await DocSuite.extract(filePath);
        console.log('--- Extraction Results ---');
        for (const result of results) {
          if (result.error) {
            console.error(`  -> Error on page ${result.page}: ${result.error}`);
          } else {
            console.log(`  -> Page/Sheet/Slide: ${result.page}`);
            console.log('  --- Contents ---');
            console.log(result.contents);
            console.log('  ----------------\n');
          }
        }
        console.log('--- End of Results ---');
      } catch (error) {
        console.error(`[!] A critical, unexpected error occurred while processing ${file}:`, (error as Error).message);
      }
    }

    // Run post-processor tests
    await testPostProcessors();

  } catch (error) {
    console.error('[!] Failed to read the docs directory:', error);
  }

  console.log('\nDocSuite test script finished.');
})();
