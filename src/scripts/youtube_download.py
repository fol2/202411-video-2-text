import os
import tempfile
import json
import yt_dlp
import sys
import time

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
    start_time = time.time()
    
    def progress_hook(d):
        if d['status'] == 'downloading':
            total_bytes = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            if total_bytes > 0:
                downloaded = d.get('downloaded_bytes', 0)
                progress = (downloaded / total_bytes) * 100
                speed = d.get('speed', 0)
                eta = d.get('eta', 0)
                elapsed = int(time.time() - start_time)
                
                if speed:
                    speed_mb = speed / (1024 * 1024)
                    speed_str = f"{speed_mb:.2f}MiB/s"
                else:
                    speed_str = "N/A"
                
                eta_str = f"{eta//60:02d}:{eta%60:02d}" if eta else "00:00"
                elapsed_str = f"{elapsed//60:02d}:{elapsed%60:02d}"
                
                print(f"PROGRESS:{progress:.1f}|{speed_str}|{eta_str}|{elapsed_str}", 
                      file=sys.stderr)

    ydl_opts = {
        'format': 'best',
        'outtmpl': output_path,
        'progress_hooks': [progress_hook],
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