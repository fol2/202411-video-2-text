import os
import tempfile
import json
import yt_dlp
import sys

def setup_dirs():
    try:
        temp_dir = tempfile.mkdtemp()
        input_dir = os.path.join(temp_dir, 'input')
        output_dir = os.path.join(temp_dir, 'output')
        os.makedirs(input_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        return input_dir, output_dir
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

def download_video(url, output_path):
    ydl_opts = {
        'format': 'best',  # Download best quality video
        'outtmpl': output_path,
        'quiet': True,
        'no_warnings': True,
        'progress_hooks': [lambda d: None],
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
            
        if os.path.exists(output_path):
            print("JSON_OUTPUT_START")
            print(json.dumps({'success': True, 'file': output_path}))
            print("JSON_OUTPUT_END")
            return True
                
        print(f"Error: No output file found at {output_path}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Error downloading: {str(e)}", file=sys.stderr)
        return False

if __name__ == "__main__":
    try:
        command = sys.argv[1]
        
        if command == "setup":
            input_dir, output_dir = setup_dirs()
            print(json.dumps({'input_dir': input_dir, 'output_dir': output_dir}))
        
        elif command == "download":
            if len(sys.argv) < 4:
                print("Error: Missing arguments for download", file=sys.stderr)
                sys.exit(1)
                
            output_path = sys.argv[2]
            url = sys.argv[3]
            
            success = download_video(url, output_path)
            if not success:
                sys.exit(1)
            
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)