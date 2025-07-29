import fs from 'fs/promises'
import path from 'path'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import PptxParser from 'node-pptx-parser'

export type ExtractionResult = {
  fileName: string
  page: number // Represents the sheet number, slide number, or page number
  contents?: string
  error?: string
}

export default class DocSuite {
  /* ---------- public API ---------- */

  /** Generic entry point – routes to the correct parser by file extension. */
  static async extract(filePath: string): Promise<ExtractionResult[]> {
    const ext = DocSuite.#ext(filePath)
    switch (ext) {
      case '.docx':
        return DocSuite.extractDocx(filePath)
      case '.xlsx':
      case '.xls':
        return DocSuite.extractXlsx(filePath)
      case '.pptx':
        return DocSuite.extractPptx(filePath)
      default:
        return [
          {
            fileName: path.basename(filePath),
            page: 1,
            error: `DocSuite: unsupported extension “${ext}”`,
          },
        ]
    }
  }

  /** Extract raw text from a modern Word document (.docx). */
  static async extractDocx(filePath: string): Promise<ExtractionResult[]> {
    const fileName = path.basename(filePath)
    try {
      const { value } = await mammoth.extractRawText({ path: filePath })
      return [
        {
          fileName,
          page: 1,
          contents: value.trim(),
        },
      ]
    } catch (e) {
      const error = e instanceof Error ? e.message : 'An unknown error occurred while parsing the .docx file.'
      return [
        {
          fileName,
          page: 1,
          error,
        },
      ]
    }
  }

  /** Extract text (as CSV per sheet) from Excel workbooks (.xls/.xlsx). */
  static async extractXlsx(filePath: string): Promise<ExtractionResult[]> {
    const fileName = path.basename(filePath)
    try {
      const wb = XLSX.readFile(filePath, { cellText: true, cellFormula: true, cellDates: true, cellNF: true })
      return wb.SheetNames.map((name, index) => ({
        fileName,
        page: index + 1, // 1-based page number for the sheet
        contents: XLSX.utils.sheet_to_csv(wb.Sheets[name]),
      }))
    } catch (e) {
      const error = e instanceof Error ? e.message : 'An unknown error occurred while parsing the .xlsx file.'
      return [
        {
          fileName,
          page: 1,
          error,
        },
      ]
    }
  }

  /** Extract slide text from a PowerPoint file (.pptx). */
  static async extractPptx(filePath: string): Promise<ExtractionResult[]> {
    const fileName = path.basename(filePath)
    try {
      const parser = new PptxParser(filePath)
      const slides = await parser.extractText() // [{ id, text: string[] }]
      return slides.map((slide, index) => ({
        fileName,
        page: index + 1, // 1-based page number for the slide
        contents: slide.text.join('\n'),
      }))
    } catch (e) {
      const error = e instanceof Error ? e.message : 'An unknown error occurred while parsing the .pptx file.'
      return [
        {
          fileName,
          page: 1,
          error,
        },
      ]
    }
  }

  /* ---------- private helpers ---------- */

  static #ext(p: string): string {
    return path.extname(p).toLowerCase()
  }
}
