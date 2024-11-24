import { NextRequest, NextResponse } from 'next/server';
import { translateSRT, TranslationProgress } from '@/lib/translation/translateSRT';

// Add simple server-side logger
const logger = {
  debug: (...args: any[]) => console.debug('[Translate API]', ...args),
  info: (...args: any[]) => console.info('[Translate API]', ...args),
  error: (...args: any[]) => console.error('[Translate API]', ...args)
};

export async function POST(request: NextRequest) {
  const controller = new AbortController();
  const { signal } = controller;

  try {
    const data = await request.json();
    const { srtContent, targetLanguage } = data;

    logger.info('Starting translation:', { targetLanguage });

    if (!srtContent || !targetLanguage) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const encoder = new TextEncoder();

          const translatedSRT = await translateSRT(
            srtContent, 
            targetLanguage,
            (progress: TranslationProgress) => {
              logger.debug('Translation progress:', progress);
              const data = `data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`;
              controller.enqueue(encoder.encode(data));
            },
            signal
          );

          logger.info('Translation completed successfully');
          
          const finalData = `data: ${JSON.stringify({ 
            type: 'complete', 
            translatedContent: translatedSRT 
          })}\n\n`;
          
          controller.enqueue(encoder.encode(finalData));
          controller.close();
        } catch (error) {
          logger.error('Translation error:', error);
          const errorData = `data: ${JSON.stringify({ 
            type: 'error', 
            error: 'Translation failed' 
          })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
          controller.close();
        }
      },
      cancel() {
        logger.info('Translation cancelled');
        controller.abort();
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    logger.error('Request error:', error);
    return NextResponse.json(
      { error: 'Translation failed' },
      { status: 500 }
    );
  }
}

export const runtime = 'edge';