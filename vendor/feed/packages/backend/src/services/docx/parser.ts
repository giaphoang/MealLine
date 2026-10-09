// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import docx4js from 'docx4js';
import { STYLE_BOUNDARY, TextSegment, DocxParseResult, TranslatedSegment, ElementPosition } from './types';
import StyleManager from './StyleManager';

class DocxParser {
  /**
   * Extracts text segments from a DOCX file
   * @param buffer A buffer containing the DOCX file
   * @returns An array of text segments with metadata
   */
  async extractText(buffer: Buffer): Promise<DocxParseResult> {
    try {
      // Load the document using docx4js
      const doc = await docx4js.load(buffer);
      const segments: TextSegment[] = [];
      let paragraphCount = 0;
      let wordCount = 0;
      let charCount = 0;
      
      // Simple counter to give unique IDs to segments
      let segmentCounter = 0;

      console.log('DocxParser: Document loaded, starting text extraction');

      // Direct approach - use content to find all text nodes
      const content = doc.officeDocument.content;
      
      // Find all paragraphs first to count them
      const paragraphs = content('w\\:p');
      paragraphCount = paragraphs.length;
      console.log(`DocxParser: Found ${paragraphCount} paragraphs`);
      
      // Process text at paragraph level to maintain context
      paragraphs.each((paragraphIndex: number, paragraph: any) => {
        // Process each paragraph to group text elements properly
        const paragraphContent = content(paragraph);
        const textRuns = paragraphContent.find('w\\:r');
        
        if (textRuns.length === 0) return; // Skip empty paragraphs
        
        // Variables to track the paragraph's composite text
        let paragraphText = '';
        let paragraphElementIds: string[] = [];
        let lastRunStyle = '';
          let needsDebugLog = false; // Flag to enable extra logging for problematic patterns
        
        // Track information about spaces at style boundaries
        const runSpaceInfo: { endsWithSpace: boolean; startsWithSpace: boolean; index: number }[] = [];
        
        // First pass: collect information about spaces in each run
        textRuns.each((runIndex: number, run: any) => {
          const runElement = content(run);
          const textElement = runElement.find('w\\:t');
          
          if (textElement.length === 0) return; // Skip runs without text
          
          const textContent = textElement.text();
          if (!textContent || textContent.trim().length === 0) return; // Skip empty text
          
          runSpaceInfo.push({
            endsWithSpace: textContent.endsWith(' '),
            startsWithSpace: textContent.startsWith(' '),
            index: runIndex
          });
        });
        
        // Second pass: process and join text runs with space awareness
        textRuns.each((runIndex: number, run: any) => {
          const runElement = content(run);
          const textElement = runElement.find('w\\:t');
          
          if (textElement.length === 0) return; // Skip runs without text
          
          // Determine the run's style (simplified hash of formatting properties)
          const styleProperties = runElement.find('w\\:rPr').html() || '';
          const currentRunStyle = styleProperties.replace(/\s+/g, '');
          
          // Extract the text content
          let textContent = textElement.text();
          if (!textContent || textContent.trim().length === 0) return; // Skip empty text
          
          // Generate a unique ID for this text element
          const elementId = `elem-p${paragraphIndex}-r${runIndex}`;
          paragraphElementIds.push(elementId);
          
          // Determine if we should add a style boundary marker
          const addStyleBoundary = paragraphText && currentRunStyle !== lastRunStyle;
          
          // Check if we need to preserve a space at the boundary
          let preserveSpace = false;
          const currentRunInfo = runSpaceInfo.find(info => info.index === runIndex);
          const prevRunInfo = runIndex > 0 ? runSpaceInfo.find(info => info.index === runIndex - 1) : null;
          
          // Check if the textElement has xml:space="preserve" attribute
          const hasPreserveAttr = textElement.attr('xml:space') === 'preserve';
          
          // If the previous run ended with a space or this run starts with a space, we need to preserve it
          if (prevRunInfo && prevRunInfo.endsWithSpace) {
            preserveSpace = true;
          } else if (currentRunInfo && currentRunInfo.startsWithSpace && !hasPreserveAttr) {
            // Only modify the textContent if xml:space="preserve" is NOT present
            preserveSpace = true;
          }
          
          // Add a style boundary marker if needed
          if (addStyleBoundary) {
            // If there's already text and the style changed, add a boundary marker
            paragraphText += STYLE_BOUNDARY;
          }
          
          // If we need to preserve a space at the boundary, add it
          if (preserveSpace && addStyleBoundary) {
            // Add the space explicitly to the text
            paragraphText += ' ';
          }
          
          // Check for patterns we need to debug
          if (paragraphText.includes('# of') || textContent.includes('# of')) {
            needsDebugLog = true;
            console.log(`DocxParser: Processing potential problematic pattern: '${paragraphText}' + '${textContent}'`);
          }
          
          // Add this run's text to the paragraph text
          // Determine if we need to add a space between runs
          let shouldAddSpace = paragraphText && !paragraphText.endsWith(' ') && 
              textContent && !textContent.startsWith(' ') &&
              // Don't add spaces after special characters
              !paragraphText.endsWith('#') && 
              !paragraphText.endsWith('-') && 
              !paragraphText.endsWith('/');
          
          // Word boundary detection: Check if previous run ends with a single letter
          // and current run continues what appears to be the same word
          if (shouldAddSpace) {
            // Check if we're in the middle of a word (like "i" + "n")
            // Test if previous content ends with a space followed by a single letter
            const prevLetterMatch = paragraphText.match(/\s([a-zA-Z])$/); 
            if (prevLetterMatch && 
                textContent.length > 0 && 
                /^[a-zA-Z]/.test(textContent)) {
              // We're likely in the middle of a word, don't add space
              shouldAddSpace = false;
              if (needsDebugLog) {
                console.log(`DocxParser: Detected word boundary across runs: '${paragraphText}' + '${textContent}'`);
              }
            }
          }
          
          // Add space if needed
          if (shouldAddSpace) {
            paragraphText += ' ';
            if (needsDebugLog) {
              console.log(`DocxParser: Added connecting space between runs`);
            }
          }
          
          paragraphText += textContent;
          
          // Remember this run's style for the next comparison
          lastRunStyle = currentRunStyle;
        });
        
        // Only create a segment if we have text
        if (paragraphText && paragraphText.trim().length > 0) {
          // Fix common problematic patterns with inconsistent spaces
          // Standardize spacing around # of
          if (paragraphText.includes('# of') || paragraphText.includes('#of')) {
            const originalText = paragraphText;
            paragraphText = paragraphText.replace(/#\s*of/g, '# of');
            console.log(`DocxParser: Fixed '# of' pattern: '${originalText}' → '${paragraphText}'`);
          }
          segmentCounter++;
          const id = `seg-${segmentCounter}`;
          
          // Check if the paragraph ends with a space that should be preserved
          const lastRunInfo = runSpaceInfo.length > 0 ? runSpaceInfo[runSpaceInfo.length - 1] : null;
          const hasTrailingSpace = lastRunInfo ? lastRunInfo.endsWithSpace : false;
          
          // Collect position information for this segment by processing paragraph runs
          const positions: ElementPosition[] = [];
          textRuns.each((runIdx: number, runElement: any) => {
            const runContent = content(runElement);
            const textElement = runContent.find('w\\:t');
            if (textElement.length > 0 && textElement.text() && textElement.text().trim().length > 0) {
              positions.push({
                paragraphIndex,
                runIndex: runIdx,
                textElementIndex: 0 // Assuming single text element per run for now
              });
            }
          });
          
          // Store the segment with all relevant information including positions
          segments.push({
            id,
            text: paragraphText,
            xpath: `para-${paragraphIndex}`,
            elementIds: paragraphElementIds,
            hasTrailingSpace, // Track if this segment had a trailing space
            positions, // Position information for direct targeting
            paragraphIndex // Primary paragraph index
          });
          
          // Update word count (rough estimate)
          // Remove style boundary markers before counting words
          const cleanText = StyleManager.convertBoundariesToMarkers(paragraphText).replace(/·/g, '');
          const words = cleanText.split(/\s+/).filter(Boolean).length;
          wordCount += words;
          
          // Update character count (excluding markers)
          charCount += cleanText.length;
          
          // Debug log
          console.log(`DocxParser: Paragraph ${paragraphIndex}, Segment ${segmentCounter}: '${cleanText.substring(0, 50)}${cleanText.length > 50 ? '...' : ''}' (${words} words, ${paragraphElementIds.length} elements)`);  
          if (hasTrailingSpace) {
            console.log(`DocxParser: Segment ${segmentCounter} has trailing space that will be preserved.`);
          }
        }
      });
      
      console.log(`DocxParser: Extracted ${segments.length} text segments, ${wordCount} words, ${charCount} characters`);

      return {
        segments,
        metadata: {
          paragraphCount,
          wordCount,
          charCount
        }
      };
    } catch (error) {
      console.error('Error parsing DOCX file:', error);
      throw new Error('Failed to parse DOCX file');
    }
  }

  /**
   * Creates a translated version of a DOCX file with partial translation support
   * @param originalBuffer The original DOCX file as a buffer
   * @param allSegments All segments from document (for position reference)
   * @param translatedSegments Array of translated text segments (only segments that were processed)
   * @returns A buffer containing the translated DOCX file
   */
  async createTranslatedDocument(
    originalBuffer: Buffer, 
    allSegments: TextSegment[], 
    translatedSegments: TranslatedSegment[]
  ): Promise<Buffer> {
    try {
      // Create maps for quick lookup of translated segments by segment ID
      const translationByIdMap = new Map<string, string>();
      const segmentByIdMap = new Map<string, TranslatedSegment>();
      
      for (const segment of translatedSegments) {
        translationByIdMap.set(segment.id, segment.translatedText);
        segmentByIdMap.set(segment.id, segment);
      }

      // Create a copy of the buffer to avoid modifying the original
      const copyBuffer = Buffer.from(originalBuffer);
      
      // Load the original document
      const doc = await docx4js.load(copyBuffer);
      
      console.log('DocxParser: Starting position-based document modification with', translatedSegments.length, 'segments');
      
      // Process using position-based targeting
      const content = doc.officeDocument.content;
      const paragraphs = content('w\\:p');
      console.log(`DocxParser: Processing ${paragraphs.length} paragraphs for position-based translation`);
      
      let textElementsReplaced = 0;
      
      // Use position-based replacement with partial translation support
      const positionBasedSuccess = await this.applyPositionBasedTranslationsWithPartialSupport(
        content, paragraphs, segmentByIdMap, translationByIdMap
      );
      
      console.log(`DocxParser: Position-based approach replaced ${positionBasedSuccess.successful} of ${translatedSegments.length} segments`);
      console.log(`DocxParser: ${positionBasedSuccess.failed} segments failed gracefully and remain in original language`);
      textElementsReplaced = positionBasedSuccess.successful;
      
      console.log(`DocxParser: Partial translation completed - document contains mix of translated and original text`);
      
      // The docx4js library requires saving to a file first, then reading it back
      // Create a temporary file with a unique name
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const crypto = require('crypto');
      
      // Generate a unique filename in the system temp directory
      const tempFilename = path.join(
        os.tmpdir(), 
        `docx-translation-${crypto.randomBytes(8).toString('hex')}.docx`
      );
      
      console.log(`DocxParser: Saving to temporary file: ${tempFilename}`);
      
      // Save the document to the temporary file
      await doc.save(tempFilename);
      
      // Read the file into a buffer
      const translatedBuffer = fs.readFileSync(tempFilename);
      
      // Delete the temporary file immediately
      fs.unlinkSync(tempFilename);
      
      console.log(`DocxParser: Document saved, buffer size: ${translatedBuffer.byteLength} bytes, temp file cleaned up`);
      
      // Return the buffer directly
      return translatedBuffer;
    } catch (error) {
      console.error('Error creating translated document:', error);
      throw new Error('Failed to create translated document');
    }
  }

  /**
   * Apply translations using position-based targeting with partial translation support
   * @param content Document content selector
   * @param paragraphs Paragraph elements
   * @param segmentByIdMap Map of segments by ID 
   * @param translationByIdMap Map of translations by segment ID
   * @returns Object with successful and failed replacement counts
   */
  private async applyPositionBasedTranslationsWithPartialSupport(
    content: any,
    paragraphs: any,
    segmentByIdMap: Map<string, TranslatedSegment>,
    translationByIdMap: Map<string, string>
  ): Promise<{ successful: number; failed: number }> {
    let successful = 0;
    let failed = 0;
    
    try {
      // Process each translated segment individually with graceful failure handling
      for (const [segmentId, translatedSegment] of segmentByIdMap) {
        try {
          if (!translatedSegment.positions || translatedSegment.positions.length === 0) {
            console.warn(`DocxParser: Segment ${segmentId} has no position information, failing gracefully`);
            failed++;
            continue;
          }
          
          console.log(`DocxParser: Processing segment ${segmentId} with ${translatedSegment.positions.length} positions`);
          
          let segmentSuccess = false;
          
          // Handle segments with style boundaries (multi-run)
          if (translatedSegment.translatedText.includes(STYLE_BOUNDARY)) {
            const translatedParts = StyleManager.splitAtBoundaries(translatedSegment.translatedText);
            console.log(`DocxParser: Split segment ${segmentId} into ${translatedParts.length} parts`);
            
            let partSuccessCount = 0;
            // Apply each part to its corresponding position
            for (let i = 0; i < Math.min(translatedParts.length, translatedSegment.positions.length); i++) {
              const position = translatedSegment.positions[i];
              const translatedPart = translatedParts[i];
              
              if (translatedPart && translatedPart.trim().length > 0) {
                const partSuccess = this.replaceTextAtPosition(content, paragraphs, position, translatedPart);
                if (partSuccess) {
                  partSuccessCount++;
                  console.log(`DocxParser: Replaced text at p${position.paragraphIndex}:r${position.runIndex} with: '${translatedPart.substring(0, 30)}${translatedPart.length > 30 ? '...' : ''}'`);
                }
              }
            }
            
            // Consider segment successful if at least one part was replaced
            segmentSuccess = partSuccessCount > 0;
          } else {
            // No style boundaries - put all text in first position, clear others
            const firstPosition = translatedSegment.positions[0];
            const replaceSuccess = this.replaceTextAtPosition(content, paragraphs, firstPosition, translatedSegment.translatedText);
            if (replaceSuccess) {
              segmentSuccess = true;
              console.log(`DocxParser: Replaced text at p${firstPosition.paragraphIndex}:r${firstPosition.runIndex} with: '${translatedSegment.translatedText.substring(0, 50)}${translatedSegment.translatedText.length > 50 ? '...' : ''}'`);
              
              // Clear text from remaining positions
              for (let i = 1; i < translatedSegment.positions.length; i++) {
                const position = translatedSegment.positions[i];
                this.replaceTextAtPosition(content, paragraphs, position, '');
              }
            }
          }
          
          if (segmentSuccess) {
            successful++;
          } else {
            failed++;
            console.warn(`DocxParser: Segment ${segmentId} failed to replace, original text preserved`);
          }
          
        } catch (segmentError) {
          failed++;
          console.error(`DocxParser: Error processing segment ${segmentId}:`, segmentError);
          console.warn(`DocxParser: Segment ${segmentId} failed gracefully, original text preserved`);
        }
      }
      
      console.log(`DocxParser: Partial translation results - ${successful} segments successful, ${failed} segments failed gracefully`);
      return { successful, failed };
      
    } catch (error) {
      console.error('DocxParser: Critical error in position-based translation:', error);
      return { successful, failed };
    }
  }

  /**
   * Replace text at a specific position in the document
   * @param content Document content selector
   * @param paragraphs Paragraph elements
   * @param position Position information
   * @param newText Text to replace with
   * @returns true if replacement was successful
   */
  private replaceTextAtPosition(
    content: any,
    paragraphs: any,
    position: ElementPosition,
    newText: string
  ): boolean {
    try {
      // Navigate directly to the target element using position
      const targetParagraph = paragraphs.eq(position.paragraphIndex);
      if (targetParagraph.length === 0) {
        console.warn(`DocxParser: Paragraph ${position.paragraphIndex} not found`);
        return false;
      }
      
      const runs = targetParagraph.find('w\\:r');
      const targetRun = runs.eq(position.runIndex);
      if (targetRun.length === 0) {
        console.warn(`DocxParser: Run ${position.runIndex} not found in paragraph ${position.paragraphIndex}`);
        return false;
      }
      
      const textElements = content(targetRun).find('w\\:t');
      const targetTextElement = textElements.eq(position.textElementIndex || 0);
      if (targetTextElement.length === 0) {
        console.warn(`DocxParser: Text element not found at p${position.paragraphIndex}:r${position.runIndex}`);
        return false;
      }
      
      // Replace the text
      targetTextElement.text(newText);
      return true;
      
    } catch (error) {
      console.error(`DocxParser: Error replacing text at position p${position.paragraphIndex}:r${position.runIndex}:`, error);
      return false;
    }
  }


}

export default DocxParser;
