import fs from 'fs/promises'
import path from 'path'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import PptxParser from 'node-pptx-parser'
import { Poppler } from 'node-poppler'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'

/**
 * Function that processes extraction results
 * @param results - Array of extraction results from the parser
 * @returns Modified extraction results (can be async)
 */
export type PostProcessor = (results: ExtractionResult[]) => ExtractionResult[] | Promise<ExtractionResult[]>

/**
 * Input type for setting post-processors
 * Can be either:
 * - A simple function (PostProcessor)
 * - An object with handler function and optional context
 */
export type PostProcessorInput =
  | PostProcessor
  | {
      handler: PostProcessor
      context?: any
    }

/**
 * Internal storage format for post-processors
 */
interface PostProcessorContext {
  processor: PostProcessor
  context?: any
}

export type ExtractionResult = {
  type: 'text' | 'csv' | 'image' | null
  fileName: string
  page: number // Represents the sheet number, slide number, or page number
  contents?: string
  error?: string
}

export class DocSuite {
  // Add this as the first private static member
  static #postProcessors = new Map<string, PostProcessorContext>()
  /* ---------- public API ---------- */

  /** Generic entry point – routes to the correct parser by file extension. */
  static async extract(filePath: string, options?: { extension?: string }): Promise<ExtractionResult[]> {
    const ext = options?.extension ? options.extension.toLowerCase() : DocSuite.#ext(filePath)
    let results: ExtractionResult[]

    switch (ext) {
      case '.docx':
        results = await DocSuite.extractDocx(filePath)
        break
      case '.xlsx':
      case '.xls':
        results = await DocSuite.extractXlsx(filePath)
        break
      case '.pptx':
        results = await DocSuite.extractPptx(filePath)
        break
      case '.pdf':
        results = await DocSuite.extractPdf(filePath)
        break
      default:
        results = [
          {
            type: null,
            fileName: path.basename(filePath),
            page: 1,
            error: `DocSuite: unsupported extension "${ext}"`
          }
        ]
    }

    // Apply post-processor based on extension
    return await this.#applyPostProcessor(ext, results)
  }

  /** Extract raw text from a modern Word document (.docx). */
  static async extractDocx(filePath: string): Promise<ExtractionResult[]> {
    const fileName = path.basename(filePath)
    let results: ExtractionResult[]

    try {
      const { value } = await mammoth.extractRawText({ path: filePath })
      results = [
        {
          type: 'text',
          fileName,
          page: 1,
          contents: value.trim()
        }
      ]
    } catch (e) {
      const error = e instanceof Error ? e.message : 'An unknown error occurred while parsing the .docx file.'
      results = [
        {
          type: null,
          fileName,
          page: 1,
          error
        }
      ]
    }

    return results
  }

  /** Extract text (as CSV per sheet) from Excel workbooks (.xls/.xlsx). */
  static async extractXlsx(filePath: string): Promise<ExtractionResult[]> {
    const fileName = path.basename(filePath)
    const ext = DocSuite.#ext(filePath) // Get actual extension (.xlsx or .xls)
    let results: ExtractionResult[]

    try {
      const wb = XLSX.readFile(filePath, { cellText: true, cellFormula: true, cellDates: true, cellNF: true })
      results = wb.SheetNames.map((name, index) => ({
        type: 'csv' as const,
        fileName,
        page: index + 1,
        contents: XLSX.utils.sheet_to_csv(wb.Sheets[name])
      }))
    } catch (e) {
      const error = e instanceof Error ? e.message : 'An unknown error occurred while parsing the .xlsx file.'
      results = [
        {
          type: null,
          fileName,
          page: 1,
          error
        }
      ]
    }

    return results
  }

  /** Extract slide text from a PowerPoint file (.pptx). */
  static async extractPptx(filePath: string): Promise<ExtractionResult[]> {
    const fileName = path.basename(filePath)
    let results: ExtractionResult[]

    try {
      const parser = new PptxParser(filePath)
      const slides = await parser.extractText()
      results = slides.map((slide, index) => ({
        type: 'text' as const,
        fileName,
        page: index + 1,
        contents: slide.text.join('\n')
      }))
    } catch (e) {
      const error = e instanceof Error ? e.message : 'An unknown error occurred while parsing the .pptx file.'
      results = [
        {
          type: null,
          fileName,
          page: 1,
          error
        }
      ]
    }

    return results
  }

  /** Extract text and images from PDF files (.pdf). */
  static async extractPdf(filePath: string): Promise<ExtractionResult[]> {
    const fileName = path.basename(filePath)
    const poppler = new Poppler()

    try {
      // Get page count
      const info = await poppler.pdfInfo(filePath)
      const pageCountMatch = (typeof info === 'string') ? info.match(/Pages:\s+(\d+)/) : ''
      const pageCount = pageCountMatch ? parseInt(pageCountMatch[1]) : 0
      if (pageCount === 0) {
        return [
          {
            type: null,
            fileName,
            page: 1,
            error: 'Unable to determine PDF page count'
          }
        ]
      }

      const results: ExtractionResult[] = []

      // Process each page
      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const pageResults: ExtractionResult[] = []
        try {
          // 1. Extract text from the page
          const text = await poppler.pdfToText(filePath, undefined, {
            firstPageToConvert: pageNum,
            lastPageToConvert: pageNum
          })

          if (text.trim().length > 0) {
            pageResults.push({
              type: 'text',
              fileName,
              page: pageNum,
              contents: text.trim()
            })
          }

          // 2. Extract images from the page
          const tempDir = path.join(tmpdir(), `docsuite-pdf-${randomBytes(8).toString('hex')}`)
          await fs.mkdir(tempDir, { recursive: true })

          try {
            const imagePrefix = path.join(tempDir, 'img')
            await poppler.pdfImages(filePath, imagePrefix, {
              firstPageToConvert: pageNum,
              lastPageToConvert: pageNum,
              pngFile: true // Use PNG for better quality/compatibility
            })

            const files = await fs.readdir(tempDir)
            const imageFiles = files.filter((f) => f.startsWith('img-'))

            for (const imageFile of imageFiles) {
              const imagePath = path.join(tempDir, imageFile)
              const imageBuffer = await fs.readFile(imagePath)
              const base64Image = imageBuffer.toString('base64')
              const imageExtension = path.extname(imageFile).slice(1)
              const mimeType = imageExtension === 'png' ? 'image/png' : 'image/jpeg' // Assuming jpeg for others

              pageResults.push({
                type: 'image',
                fileName,
                page: pageNum,
                contents: `data:${mimeType};base64,${base64Image}`
              })
            }
          } finally {
            // Clean up temp directory
            await fs.rm(tempDir, { recursive: true, force: true })
          }

          // 3. Handle pages with no content
          if (pageResults.length === 0) {
            pageResults.push({
              type: 'text',
              fileName,
              page: pageNum,
              contents: ''
            })
          }
          
          results.push(...pageResults)

        } catch (pageError) {
          // Error processing individual page
          const error = pageError instanceof Error ? pageError.message : `Error processing page ${pageNum}`
          results.push({
            type: null,
            fileName,
            page: pageNum,
            error
          })
        }
      }

      return results
    } catch (e) {
      const error = e instanceof Error ? e.message : 'An unknown error occurred while parsing the .pdf file.'
      return [
        {
          type: null,
          fileName,
          page: 1,
          error
        }
      ]
    }
  }

  /* ---------- post-processor configuration ---------- */

  /**
   * Set a post-processor for DOCX files
   * @param input - Function or object with handler and context
   */
  static setDocxPostProcessor(input: PostProcessorInput): void {
    this.#setPostProcessor('.docx', input)
  }

  /**
   * Set a post-processor for XLSX/XLS files
   * @param input - Function or object with handler and context
   */
  static setXlsxPostProcessor(input: PostProcessorInput): void {
    this.#setPostProcessor('.xlsx', input)
    this.#setPostProcessor('.xls', input)
  }

  /**
   * Set a post-processor for PPTX files
   * @param input - Function or object with handler and context
   */
  static setPptxPostProcessor(input: PostProcessorInput): void {
    this.#setPostProcessor('.pptx', input)
  }

  /**
   * Set a post-processor for PDF files
   * @param input - Function or object with handler and context
   */
  static setPdfPostProcessor(input: PostProcessorInput): void {
    this.#setPostProcessor('.pdf', input)
  }

  /**
   * Generic setter for any file extension
   * @param extension - File extension (with or without leading dot)
   * @param input - Function or object with handler and context
   */
  static setPostProcessor(extension: string, input: PostProcessorInput): void {
    // Ensure extension has leading dot
    const ext = extension.startsWith('.') ? extension : `.${extension}`
    this.#setPostProcessor(ext.toLowerCase(), input)
  }

  /**
   * Clear a specific post-processor
   * @param extension - File extension to clear
   */
  static clearPostProcessor(extension: string): void {
    const ext = extension.startsWith('.') ? extension : `.${extension}`
    this.#postProcessors.delete(ext.toLowerCase())
  }

  /**
   * Clear all post-processors
   */
  static clearAllPostProcessors(): void {
    this.#postProcessors.clear()
  }

  /* ---------- private helpers ---------- */

  /**
   * Internal method to set a post-processor
   */
  static #setPostProcessor(extension: string, input: PostProcessorInput): void {
    if (typeof input === 'function') {
      this.#postProcessors.set(extension, { processor: input })
    } else {
      this.#postProcessors.set(extension, {
        processor: input.handler,
        context: input.context
      })
    }
  }

  /**
   * Apply post-processor if one exists for the given extension
   */
  static async #applyPostProcessor(ext: string, results: ExtractionResult[]): Promise<ExtractionResult[]> {
    const config = this.#postProcessors.get(ext)
    if (!config) {
      return results
    }

    try {
      // Call the processor with proper context
      const processed = config.context
        ? await config.processor.call(config.context, results)
        : await config.processor(results)

      return processed
    } catch (error) {
      // If post-processor fails, add error to first result and return original
      console.error(`Post-processor for ${ext} failed:`, error)
      if (results.length > 0) {
        results[0].error = `Post-processor error: ${error instanceof Error ? error.message : String(error)}`
      }
      return results
    }
  }

  static #ext(p: string): string {
    return path.extname(p).toLowerCase()
  }
}
