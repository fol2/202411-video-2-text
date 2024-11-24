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

// Add a context tracker
let previousContext = "";

export async function translateSRT(srtContent: string, targetLanguage: string): Promise<string> {
  try {
    // Parse SRT into blocks
    const blocks = parseSRT(srtContent);
    
    // Batch blocks for efficient translation (5 blocks at a time)
    const batchSize = 5;
    const translatedBlocks: SRTBlock[] = [];
    
    for (let i = 0; i < blocks.length; i += batchSize) {
      const batch = blocks.slice(i, i + batchSize);
      const textsToTranslate = batch.map(block => block.text).join('\n---\n');
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a professional subtitle translator. Follow these rules:
            - Maintain consistent translation of names, terms, and pronouns
            - Preserve the exact formatting and line breaks
            - Return ONLY the translated text separated by ---
            - Do not add any explanations or notes`
          },
          {
            role: "user",
            content: `Context from previous subtitles: ${previousContext}

            Translate the following subtitles to ${targetLanguage}:

${textsToTranslate}`
          }
        ],
        temperature: 0.3,
      });

      // Get translated texts and split them back into blocks
      const translatedTexts = response.choices[0].message.content?.split('---') || [];
      
      // Combine with original blocks
      batch.forEach((block, index) => {
        translatedBlocks.push({
          ...block,
          text: translatedTexts[index]?.trim() || block.text
        });
      });

      // Update context for next batch
      previousContext = `${batch.map(block => block.text).join(' ')}`.slice(-200); // Keep last 200 characters as context
    }

    // Reconstruct SRT file
    return reconstructSRT(translatedBlocks);
  } catch (error) {
    console.error('Translation error:', error);
    throw new Error('Failed to translate SRT file');
  }
} 