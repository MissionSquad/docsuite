# DocSuite Post-Processor Usage Guide

## Basic Usage

### Simple Function
```typescript
import DocSuite from './DocSuite'

// Simple function that adds metadata
function addMetadata(results: ExtractionResult[]): ExtractionResult[] {
  return results.map(result => ({
    ...result,
    contents: result.contents ? `[PROCESSED] ${result.contents}` : result.contents
  }))
}

DocSuite.setDocxPostProcessor(addMetadata)
```

### Class Method with Context
```typescript
class DocumentProcessor {
  private prefix: string
  
  constructor(prefix: string) {
    this.prefix = prefix
  }
  
  processResults(results: ExtractionResult[]): ExtractionResult[] {
    // This method uses 'this' context
    return results.map(result => ({
      ...result,
      contents: result.contents ? `${this.prefix}: ${result.contents}` : result.contents
    }))
  }
}

const processor = new DocumentProcessor('[COMPANY]')

// Option 1: Using bind
DocSuite.setDocxPostProcessor(processor.processResults.bind(processor))

// Option 2: Using arrow function
DocSuite.setDocxPostProcessor((results) => processor.processResults(results))

// Option 3: Using handler/context object
DocSuite.setDocxPostProcessor({
  handler: processor.processResults,
  context: processor
})
```

### Async Post-Processor
```typescript
async function enrichWithAPI(results: ExtractionResult[]): Promise<ExtractionResult[]> {
  // Async operations allowed
  const enriched = await Promise.all(
    results.map(async (result) => {
      if (result.contents) {
        const apiData = await fetchEnrichmentData(result.contents)
        return { ...result, contents: result.contents + '\n' + apiData }
      }
      return result
    })
  )
  return enriched
}

DocSuite.setPdfPostProcessor(enrichWithAPI)
```

### Multiple File Types
```typescript
const processor = new DocumentProcessor('[PROCESSED]')

// Set same processor for multiple types
DocSuite.setDocxPostProcessor({ handler: processor.processResults, context: processor })
DocSuite.setPptxPostProcessor({ handler: processor.processResults, context: processor })

// Or use generic setter
DocSuite.setPostProcessor('pdf', { handler: processor.processResults, context: processor })
```

### Clearing Post-Processors
```typescript
// Clear specific processor
DocSuite.clearPostProcessor('.docx')

// Clear all processors
DocSuite.clearAllPostProcessors()
