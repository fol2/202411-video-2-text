import { NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const PYTHON_PATH = process.env.PYTHON_PATH || 'python'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const youtubeLink = formData.get('youtubeLink') as string

    if (!file && !youtubeLink) {
      return NextResponse.json(
        { error: 'Either file or YouTube link is required' },
        { status: 400 }
      )
    }

    // Create temporary directories
    const inputDir = join(process.cwd(), 'tmp', 'input')
    const outputDir = join(process.cwd(), 'tmp', 'output')
    
    await execAsync(`mkdir -p ${inputDir} ${outputDir}`)

    if (file) {
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      const filePath = join(inputDir, file.name)
      await writeFile(filePath, buffer)
    } else if (youtubeLink) {
      await execAsync(`yt-dlp -o "${inputDir}/%(title)s.%(ext)s" ${youtubeLink}`)
    }

    // Run transcription using Python script
    const pythonScript = `
import vid2cleantxt
text_output_dir, metadata_output_dir = vid2cleantxt.transcribe.transcribe_dir(
    input_dir="${inputDir}",
    output_dir="${outputDir}",
    model_id="openai/whisper-base.en",
    chunk_length=30
)
print(text_output_dir)
    `
    const { stdout: outputDir } = await execAsync(`${PYTHON_PATH} -c "${pythonScript}"`)
    
    // Read the transcription file
    const transcriptionFiles = await execAsync(`find ${outputDir.trim()} -name "*.txt"`)
    const transcriptionPath = transcriptionFiles.stdout.trim().split('\n')[0]
    const transcription = await execAsync(`cat ${transcriptionPath}`)

    // Cleanup
    await execAsync(`rm -rf ${inputDir} ${outputDir}`)

    return NextResponse.json({ transcription: transcription.stdout })
  } catch (error) {
    console.error('Transcription error:', error)
    return NextResponse.json(
      { error: 'Failed to process transcription' },
      { status: 500 }
    )
  }
} 