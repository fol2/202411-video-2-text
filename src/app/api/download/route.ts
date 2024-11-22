import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const filePath = searchParams.get('path');
  const type = searchParams.get('type');

  if (!filePath || !type) {
    return new NextResponse('Missing path or type parameter', { status: 400 });
  }

  try {
    // Construct the absolute path
    const fullPath = join(process.cwd(), filePath);
    
    // Debug logging
    console.log('Attempting to read file:', {
      requestedPath: filePath,
      fullPath,
      exists: existsSync(fullPath)
    });

    // Security check to ensure the path is within temp_uploads
    if (!fullPath.includes('temp_uploads') || !fullPath.startsWith(process.cwd())) {
      return new NextResponse('Invalid path', { status: 403 });
    }

    // Check if file exists
    if (!existsSync(fullPath)) {
      return new NextResponse(`File not found: ${filePath}`, { status: 404 });
    }

    const content = await readFile(fullPath, 'utf-8');
    const filename = fullPath.split('/').pop() || 'subtitles.srt';

    return new NextResponse(content, {
      headers: {
        'Content-Type': type === 'srt' ? 'application/x-subrip' : 'text/plain',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return new NextResponse(
      `Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`, 
      { status: 500 }
    );
  }
} 