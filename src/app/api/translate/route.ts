import { NextRequest, NextResponse } from 'next/server';
import { translateSRT } from '@/lib/translation/translateSRT';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { srtContent, targetLanguage } = data;

    if (!srtContent || !targetLanguage) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const translatedSRT = await translateSRT(srtContent, targetLanguage);

    return NextResponse.json({
      translatedContent: translatedSRT
    });

  } catch (error) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: 'Translation failed' },
      { status: 500 }
    );
  }
} 