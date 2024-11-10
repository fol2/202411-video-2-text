# vid2cleantxt-Web

![vid2cleantxt Web Interface](https://user-images.githubusercontent.com/74869040/131500291-ed0a9d7f-8be7-4f4b-9acf-c360cfd46f1f.png)

**vid2cleantxt-Web**: A web-based platform leveraging [transformers-based](https://huggingface.co/facebook/wav2vec2-large-960h-lv60-self) models to convert speech-based video files into clean, readable text through an intuitive web interface. Experience robust speech transcription enhanced by [OpenAI's Whisper](https://openai.com/blog/whisper/) model.

## Table of Contents

- [Features](#features)
- [Demo](#demo)
- [Installation](#installation)
- [Usage](#usage)
- [Technologies Used](#technologies-used)
- [Contributing](#contributing)
- [License](#license)
- [Architecture Overview](#architecture-overview)
- [Component Descriptions](#component-descriptions)
- [Advanced Usage](#advanced-usage)
- [FAQ](#faq)
- [Roadmap](#roadmap)
- [Troubleshooting](#troubleshooting)

## Features

- **User-Friendly Interface**: Upload and manage your video files effortlessly.
- **Real-Time Transcription**: Convert audio from videos to text using advanced ASR models.
- **Keyword Extraction**: Automatically extract key terms and phrases from transcriptions.
- **Search & Summarize**: Easily search through transcriptions and generate summaries.
- **Download Options**: Export transcriptions and keywords in various formats.

## Installation

### Prerequisites

- Python 3.8+
- [FFmpeg](https://ffmpeg.org/) installed and added to PATH.

### Clone the Repository
```
git clone https://github.com/pszemraj/vid2cleantxt.git
cd vid2cleantxt
```

### Install Dependencies
```
pip install -r requirements.txt
```

### Run the Web Interface
```
python app.py
```

## Usage

1. **Upload Video**: Use the web interface to upload your video files.
2. **Transcribe**: Click the transcribe button to convert audio to text.
3. **View Results**: Access the transcriptions and keywords through the interface.
4. **Download**: Export the results in your preferred format.

## Technologies Used

- **Backend**: Flask, Python
- **Frontend**: HTML, CSS, JavaScript
- **ASR Models**: Hugging Face Transformers, OpenAI Whisper
- **Others**: FFmpeg, pandas, numpy

## Architecture Overview

### Overview

vid2cleantxt-Web is structured into **Frontend** and **Backend** components, facilitating seamless video transcription through an interactive web interface.

### Frontend

- **Framework**: Built with **Next.js** and **React** for dynamic and responsive user interfaces.
- **UI Library**: Utilizes [Radix UI](https://radix-ui.com/) for accessible and customizable UI components.
- **State Management**: Implements React hooks and context for managing application state and progress tracking.
- **TypeScript**: Ensures type safety and robust code through TypeScript integration.

### Backend

- **API Routes**: Developed using **Next.js API Routes** to handle transcription requests and manage server-side processes.
- **Python Integration**: Leverages Python scripts (`transcribe_script.py` and `youtube_download.py`) for video processing and transcription, interfacing through child processes.
- **Server-Sent Events (SSE)**: Facilitates real-time communication between the server and client for progress updates and transcription completion notifications.
- **Caching**: Implements caching mechanisms for models and dependencies to optimize performance and reduce load times.

### Data Flow

1. **Video Upload**: Users upload video files or provide YouTube links through the frontend interface.
2. **Processing Request**: The frontend sends a POST request to the `/api/transcribe` endpoint with the video data.
3. **Transcription Workflow**:
   - For uploaded files, the backend validates file size and initiates the transcription process.
   - For YouTube links, the backend downloads the video using `youtube_download.py` before transcription.
4. **Progress Updates**: Transcription progress and logs are streamed back to the frontend via SSE, providing real-time feedback to users.
5. **Completion**: Upon successful transcription, the backend sends the transcription results, which are then displayed and downloadable in the frontend.

## Component Descriptions

### `src/components/ui/tabs.tsx`

Implements the tabbed navigation using Radix UI’s `Tabs` component, allowing users to switch between different sections such as Upload and History.

### `src/components/template/video-transcription.tsx`

Handles the core functionality of video transcription, including file uploads, YouTube link parsing, progress tracking, and displaying transcription results. Utilizes custom hooks for managing SSE connections and state updates.

### `src/app/api/transcribe/route.ts`

Manages the transcription API endpoint. Orchestrates the transcription process by interfacing with Python scripts, handling file validations, streaming progress updates, and returning final transcription results.

## Advanced Usage

### Handling Large Files

The application is configured to handle large video files up to 100MB. Ensure that your environment meets the necessary memory and processing requirements for handling large transcriptions.

### Customizing Transcription Parameters

You can modify transcription parameters such as language selection and chunk length by updating the `.env` file:

## FAQ

**Q1: What file formats are supported for transcription?**  
*A1: Currently, vid2cleantxt-Web supports MP4, MOV, and AVI formats. Future updates may include additional formats.*

**Q2: How long does the transcription process take?**  
*A2: The transcription time depends on the video length and your system's processing power. Typically, a 5-minute video takes approximately 2-3 minutes to transcribe.*

**Q3: Can I transcribe multiple videos simultaneously?**  
*A3: Currently, the application handles one transcription process at a time. Support for multiple simultaneous transcriptions is planned for future releases.*

## Roadmap

- **v1.1**:
  - Support additional video formats (MKV, WMV).
  - Implement multi-language transcription.
  - Enhance UI with more customization options.

- **v1.2**:
  - Add support for batch uploads and transcriptions.
  - Integrate cloud storage options for saving transcriptions.
  - Optimize transcription speed and accuracy.

- **v2.0**:
  - Mobile-friendly interface.
  - Real-time collaboration features.
  - Advanced analytics and reporting on transcription data.

## Troubleshooting

**Issue:** _Transcription fails with a "Payload Too Large" error._  
**Solution:** Ensure that your video file size does not exceed 100MB. If it does, consider compressing the video or splitting it into smaller segments before uploading.

**Issue:** _Unable to download FFmpeg._  
**Solution:** Verify that FFmpeg is correctly installed and added to your system's PATH. You can install FFmpeg by following the instructions on the [official website](https://ffmpeg.org/download.html).

**Issue:** _Python environment check failed._  
**Solution:** Make sure all required Python packages are installed by running `pip install -r requirements.txt`. Additionally, ensure that your Python version is 3.8 or higher.

## Contributing

Contributions are welcome! Please read the [contributing guidelines](CONTRIBUTING.md) first.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
