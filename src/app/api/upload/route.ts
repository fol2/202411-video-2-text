import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { mkdir } from 'fs/promises'
import { randomUUID } from 'crypto'

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 // 2GB instead of 500MB

export async function POST(request: NextRequest) {
  console.log('🟢 Starting file upload process')
  
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const language = formData.get('language') as string || 'auto'

    if (!file) {
      console.log('🔴 No file provided in request')
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      console.log('🔴 File size exceeds limit')
      return NextResponse.json(
        { error: 'File size exceeds 2GB limit' },
        { status: 400 }
      )
    }

    // Validate file type
    const validTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
    if (!validTypes.includes(file.type)) {
      console.log('🔴 Invalid file type:', file.type)
      return NextResponse.json(
        { error: 'Invalid file type. Please upload MP4, WebM, OGG, or MOV files only.' },
        { status: 400 }
      )
    }

    // Create unique ID for this upload
    const uploadId = randomUUID()
    const uploadDir = join(process.cwd(), 'temp_uploads', uploadId)
    
    // Create upload directory
    console.log('🟢 Creating upload directory:', uploadDir)
    await mkdir(uploadDir, { recursive: true })

    // Generate safe filename
    const fileExt = file.name.split('.').pop()
    const safeFileName = `video.${fileExt}`
    const filePath = join(uploadDir, safeFileName)

    // Write file to disk
    console.log('🟢 Writing file to:', filePath)
    const bytes = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(bytes))

    console.log('🟢 File upload complete')

    // Return success response with uploadId
    return NextResponse.json({ 
      success: true, 
      uploadId,
      message: 'File uploaded successfully'
    })

  } catch (error) {
    console.log('🔴 Error during upload:', error)
    return NextResponse.json(
      { error: 'Internal server error during upload' },
      { status: 500 }
    )
  }
} 