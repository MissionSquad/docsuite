import path from 'path';
import fs from 'fs/promises';
import DocSuite, { ExtractionResult } from '../DocSuite';

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
        // This top-level catch is now less likely to be hit for parsing errors,
        // but remains as a safeguard for unexpected issues.
        console.error(`[!] A critical, unexpected error occurred while processing ${file}:`, (error as Error).message);
      }
    }
  } catch (error) {
    console.error('[!] Failed to read the docs directory:', error);
  }

  console.log('DocSuite test script finished.');
})();
