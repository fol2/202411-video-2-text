import vid2cleantxt
import os
import tempfile
import yt_dlp
import sys
import torch

def setup_environment():
    """Setup required packages and environment"""
    try:
        # Install required packages
        os.system('python3 -m pip install unidecode')
        os.system('python3 -m pip install neuspell')
        
        # Download NeuSpell model
        import neuspell
        neuspell.seq_modeling.downloads.download_pretrained_model("scrnnelmo-probwordnoise")
    except Exception as e:
        print(f"Warning: Error setting up environment: {e}")

def main():
    # Setup environment first
    setup_environment()
    
    # Disable torchvision warnings
    import warnings
    warnings.filterwarnings('ignore', category=UserWarning)
    
    # Determine device to use
    if torch.backends.mps.is_available():
        device = torch.device("mps")
        print("\nUsing MPS (GPU) for transcription")
    else:
        device = torch.device("cpu")
        print("\nUsing CPU for transcription")
    
    import torch
    if not torch.backends.mps.is_available():
        if not torch.backends.mps.is_built():
            print("MPS not available because the current PyTorch install was not built with MPS enabled.")
        else:
            print("MPS not available because the current MacOS version is not 12.3+ and/or you do not have an MPS-enabled device on this machine.")
    else:
        print("MPS is available.")
    
    # Load your model
    model = YourModelClass().to(device)
    
    # Example YouTube URL
    youtube_url = "https://www.youtube.com/watch?v=P3ouE_CCzNA"
    
    # Create a temporary directory
    temp_dir = tempfile.mkdtemp()
    input_dir = os.path.join(temp_dir, 'input')
    os.makedirs(input_dir, exist_ok=True)
    
    # Download video using yt-dlp with progress display
    print(f"\nDownloading video from: {youtube_url}")
    
    ydl_opts = {
        'format': 'best',
        'outtmpl': os.path.join(input_dir, 'video.mp4'),
        'progress_hooks': [lambda d: print(f"\rDownload Progress: {d['_percent_str']}", end='')]
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([youtube_url])
    
    print("\n\nStarting transcription...")
    
    try:
        # Configure logging to be less verbose
        import logging
        logging.getLogger('transformers').setLevel(logging.ERROR)
        logging.getLogger('pytorch_pretrained_bert').setLevel(logging.ERROR)
        
        text_output_dir, metadata_output_dir = vid2cleantxt.transcribe.transcribe_dir(
            input_dir=input_dir,
            model_id="openai/whisper-large-v3",
            chunk_length=30,
            device=device  # Pass the device to the function if supported
        )
        
        print(f"\nTranscription completed!")
        print(f"Text output directory: {text_output_dir}")
        
        # Read the first transcription file from results_SC_pipeline
        results_dir = os.path.join(text_output_dir, 'results_SC_pipeline')
        if os.path.exists(results_dir):
            files = [f for f in os.listdir(results_dir) if f.endswith('.txt')]
            if files:
                with open(os.path.join(results_dir, files[0]), 'r') as f:
                    print("\nTranscription result:")
                    print(f.read())
        else:
            print(f"\nWarning: Results directory not found at {results_dir}")
            
    except Exception as e:
        print(f"\nError during transcription: {str(e)}", file=sys.stderr)
        raise
    finally:
        # Cleanup
        try:
            import shutil
            shutil.rmtree(temp_dir)
        except Exception as e:
            print(f"Warning: Error cleaning up temporary directory: {e}")

    # When creating tensors
    x = torch.ones(5, device=device)

    # During inference or training
    output = model(input_tensor.to(device))

if __name__ == "__main__":
    main()