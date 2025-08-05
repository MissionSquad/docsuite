import fs from 'fs/promises'
import path from 'path'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import PptxParser from 'node-pptx-parser'
import { Poppler } from 'node-poppler'
import sharp from 'sharp'
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
  isFullPage?: boolean
}

export type PdfExtractionOptions = {
  imageFormat?: 'native' | 'jpeg' | 'png'
  fullPageImage?: boolean
}

export type ExtractionOptions = {
  extension?: string
  pdf?: PdfExtractionOptions
  progressCallback?: (event: { type: string; data: any }) => void
}

export class DocSuite {
  // Add this as the first private static member
  static #postProcessors = new Map<string, PostProcessorContext>()
  /* ---------- public API ---------- */

  /** Generic entry point – routes to the correct parser by file extension. */
  static async extract(
    filePath: string,
    options?: ExtractionOptions
  ): Promise<ExtractionResult[]> {
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
        results = await DocSuite.extractPdf(filePath, options?.pdf, options?.progressCallback)
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
  static async extractPdf(
    filePath: string,
    options: PdfExtractionOptions = {},
    progressCallback?: (event: { type: string; data: any }) => void
  ): Promise<ExtractionResult[]> {
    const { imageFormat = 'native', fullPageImage = false } = options // Default to native
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
        if (progressCallback) {
          progressCallback({
            type: 'embedding_page',
            data: { currentPage: pageNum, totalPages: pageCount }
          })
        }
        const pageResults: ExtractionResult[] = []

        // START: New Full-Page Image Logic
        if (fullPageImage) {
          // Use a stable, non-randomized local temp directory to avoid environmental issues.
          const localTmpRoot = path.resolve(__dirname, '..', '.tmp');
          await fs.mkdir(localTmpRoot, { recursive: true });
          
          // Use a predictable but unique filename within the stable temp directory.
          const outputPrefix = path.join(localTmpRoot, `cairo-output-${randomBytes(8).toString('hex')}-p${pageNum}`);
          
          try {
            await poppler.pdfToCairo(filePath, outputPrefix, {
              firstPageToConvert: pageNum,
              lastPageToConvert: pageNum,
              jpegFile: true,
              jpegOptions: 'quality=95,progressive=n,optimize=n',
              resolutionXYAxis: 150,
              scalePageTo: 1080,
              cropBox: true,
              singleFile: true,
              antialias: 'good'
            })

            const jpegPath = `${outputPrefix}.jpg`;
            
            // The external tool might fail silently. We must verify the file was created.
            try {
              await fs.access(jpegPath);
            } catch (e) {
              throw new Error('pdftocairo failed to create output file.');
            }

            const imageBuffer = await fs.readFile(jpegPath);
            await fs.rm(jpegPath, { force: true }); // Clean up immediately

            if (imageBuffer.length > 0) {
              const reEncodedBuffer = await sharp(imageBuffer)
                .jpeg({
                  quality: 90,
                  progressive: false, // Force baseline JPEG
                  mozjpeg: true // Use mozjpeg encoder for better compatibility
                })
                .toColorspace('srgb') // Force sRGB color space
                .toBuffer()
              const base64Image = reEncodedBuffer.toString('base64')
              pageResults.push({
                type: 'image',
                fileName,
                page: pageNum,
                contents: `data:image/jpeg;base64,${base64Image}`,
                isFullPage: true // Signal this is a full-page image
              })
            }
          } catch (cairoError) {
            const errorMessage = `pdfToCairo failed for page ${pageNum}. The PDF may be incompatible or the environment may have an issue with the Poppler binary.`;
            console.error(errorMessage, { originalError: cairoError });
            pageResults.push({
              type: null,
              fileName,
              page: pageNum,
              error: errorMessage,
            });
          }
        }
        // END: New Full-Page Image Logic
        
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
          const localTmpRoot = path.resolve(__dirname, '..', '.tmp');
          await fs.mkdir(localTmpRoot, { recursive: true });
          
          const imagePrefix = path.join(localTmpRoot, `pdf-images-${randomBytes(8).toString('hex')}-p${pageNum}`);
          
          try {
            const imageOptions: any = {
              firstPageToConvert: pageNum,
              lastPageToConvert: pageNum
            }

            switch (imageFormat) {
              case 'native':
                imageOptions.allFiles = true
                break
              case 'png':
                imageOptions.pngFile = true
                break
              case 'jpeg':
              default:
                imageOptions.jpegFile = true
                break
            }

            await poppler.pdfImages(filePath, imagePrefix, imageOptions);

            const files = await fs.readdir(localTmpRoot);
            const imageFiles = files.filter((f) => f.startsWith(path.basename(imagePrefix)));

            for (const imageFile of imageFiles) {
              const imagePath = path.join(localTmpRoot, imageFile);
              const imageBuffer = await fs.readFile(imagePath);
              await fs.rm(imagePath, { force: true }); // Clean up immediately

              if (imageBuffer.length === 0) {
                console.log({ level: 'warn', msg: `Skipping empty image file extracted from PDF: ${imageFile}` })
                continue // Skip empty/corrupted files
              }
              const base64Image = imageBuffer.toString('base64')
              const imageExtension = path.extname(imageFile).slice(1).toLowerCase()
              
              let mimeType = 'image/jpeg' // Default
              switch (imageExtension) {
                case 'png':
                  mimeType = 'image/png'
                  break
                case 'jpg':
                case 'jpeg':
                  mimeType = 'image/jpeg'
                  break
                case 'tif':
                case 'tiff':
                  mimeType = 'image/tiff'
                  break
                case 'jp2':
                  mimeType = 'image/jp2'
                  break
              }

              pageResults.push({
                type: 'image',
                fileName,
                page: pageNum,
                contents: `data:${mimeType};base64,${base64Image}`
              })
            }
          } finally {
            // The individual files are cleaned up as they are processed.
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
