import { OpenAI } from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface SRTBlock {
  id: number;
  timeCode: string;
  text: string;
}

// Parse SRT content into blocks
const parseSRT = (srtContent: string): SRTBlock[] => {
  const blocks = srtContent.trim().split('\n\n');
  return blocks.map(block => {
    const [id, timeCode, ...textLines] = block.split('\n');
    return {
      id: parseInt(id),
      timeCode,
      text: textLines.join('\n')
    };
  });
};

// Reconstruct SRT from blocks
const reconstructSRT = (blocks: SRTBlock[]): string => {
  return blocks.map(block => 
    `${block.id}\n${block.timeCode}\n${block.text}`
  ).join('\n\n');
};

// Add this interface for progress tracking
export interface TranslationProgress {
  currentChunk: number;
  totalChunks: number;
  percentComplete: number;
  model: string;
}

export async function translateSRT(
  srtContent: string, 
  targetLanguage: string,
  onProgress?: (progress: TranslationProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  try {
    const blocks = parseSRT(srtContent);
    const batchSize = 5; // Keep batch size of 5
    const totalChunks = Math.ceil(blocks.length / batchSize);
    const translatedBlocks: SRTBlock[] = [];
    const model = "gpt-4o-mini";
    
    let contextWindow = "";
    
    for (let i = 0; i < blocks.length; i += batchSize) {
      if (signal?.aborted) {
        throw new Error('Translation aborted');
      }

      const currentChunk = Math.floor(i / batchSize) + 1;
      const percentComplete = Math.round((currentChunk / totalChunks) * 100);
      
      onProgress?.({
        currentChunk,
        totalChunks,
        percentComplete,
        model
      });

      const batch = blocks.slice(i, i + batchSize);
      // Format the input to preserve SRT structure
      const textsToTranslate = batch.map(block => 
        `${block.id}\n${block.timeCode}\n${block.text}`
      ).join('\n\n');
      
      const response = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: `You are a precise subtitle translator specializing in ${targetLanguage}. Critical requirements:

1. FORMAT: Maintain exact SRT format for each subtitle:
   <number>
   <timecode>
   <translated_text>

2. NUMBERING: Keep original subtitle numbers unchanged
3. TIMECODES: Keep all timecodes exactly as provided
4. STYLE: 
   - Maintain consistent translation style throughout
   - Use natural ${targetLanguage} expressions
   - Keep the same level of formality
5. CONTENT:
   - Preserve names, numbers, and technical terms
   - Match the timing constraints of each subtitle
   - Maintain the original meaning while being culturally appropriate
6. CONTEXT: Consider previous translations for consistency

Translate ONLY the text portions while keeping numbers and timecodes unchanged.
Return the complete SRT-formatted translations with exact original formatting.`
          },
          {
            role: "user",
            content: `Previous context for consistency: ${contextWindow}

Translate these subtitles to ${targetLanguage}, maintaining exact SRT format:

${textsToTranslate}`
          }
        ],
        temperature: 0.1, // Lower temperature for more consistency
      });

      const translatedContent = response.choices[0].message.content?.trim() || '';
      const translatedBatch = translatedContent.split('\n\n').map(block => {
        const [id, timeCode, ...textLines] = block.split('\n');
        return {
          id: parseInt(id),
          timeCode,
          text: textLines.join('\n')
        };
      });
      
      translatedBlocks.push(...translatedBatch);

      // Update context window with last two translated blocks for better continuity
      contextWindow = translatedBatch.slice(-2)
        .map(block => block.text)
        .join('\n');
    }

    return reconstructSRT(translatedBlocks);
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
} 