import vid2cleantxt
import json
import os
import sys
import logging

try:
    # Configure logging to suppress warnings
    logging.getLogger('transformers').setLevel(logging.ERROR)
    logging.getLogger('pytorch_pretrained_bert').setLevel(logging.ERROR)
    
    # Set environment variable to limit token generation
    os.environ['WHISPER_MAX_NEW_TOKENS'] = '440'
    
    input_dir = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else "auto"
    
    print(f"Starting transcription for directory: {input_dir}", file=sys.stderr)
    print(f"Source language: {language if language != 'auto' else 'Auto-detect'}", file=sys.stderr)
    
    text_output_dir, metadata_output_dir = vid2cleantxt.transcribe.transcribe_dir(
        input_dir=input_dir,
        model_id="openai/whisper-large-v3",
        chunk_length=30,
    )

    print("JSON_OUTPUT_START")
    print(json.dumps({
        "text_output_dir": text_output_dir,
        "metadata_output_dir": metadata_output_dir,
        "detected_language": language
    }))
    print("JSON_OUTPUT_END")

except Exception as e:
    print(f"Error during transcription: {str(e)}", file=sys.stderr)
    sys.exit(1) 