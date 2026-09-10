import os
import cv2
import whisper
import torch
import torchvision.transforms as transforms
import ffmpeg
import sys
import numpy as np

try:
    from sentence_transformers import SentenceTransformer, util
    TRANSCRIPT_SEARCH_ENABLED = True
except ImportError:
    TRANSCRIPT_SEARCH_ENABLED = False

# Add custom_model directory to path to import the model
sys.path.append(os.path.join(os.path.dirname(__file__), 'custom_model'))
from train import SimpleObjectDetector

print("Loading Whisper model...")
whisper_model = whisper.load_model("base")

print("Loading Custom Detection model (Spatial)...")
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
custom_model = SimpleObjectDetector(num_classes=10).to(device)
weights_path = os.path.join(os.path.dirname(__file__), "weights", "custom_detector.pth")
if os.path.exists(weights_path):
    custom_model.load_state_dict(torch.load(weights_path, map_location=device, weights_only=True))
    custom_model.eval()
else:
    print("WARNING: Custom weights not found.")

if TRANSCRIPT_SEARCH_ENABLED:
    print("Loading Semantic Text model...")
    semantic_model = SentenceTransformer('all-MiniLM-L6-v2')
    print("Loading NLP Hook Detection model...")
    from transformers import pipeline
    hook_model = pipeline("zero-shot-classification", model="typeform/distilbert-base-uncased-mnli")

# Preprocessing transforms for spatial inference
transform = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

def transcribe_and_save(video_path, output_srt_path=None):
    """Generates an SRT file and returns the list of segment dicts."""
    print(f"Extracting audio and generating subtitles for {video_path}")
    result = whisper_model.transcribe(video_path, word_timestamps=True)
    if output_srt_path:
        with open(output_srt_path, "w", encoding="utf-8") as srt:
            for i, segment in enumerate(result["segments"]):
                start_time = _format_timestamp(segment["start"])
                end_time = _format_timestamp(segment["end"])
                text = segment["text"].strip()
                srt.write(f"{i + 1}\n{start_time} --> {end_time}\n{text}\n\n")
    return result["segments"]

def _format_timestamp(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

def _format_ass_timestamp(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 100) # ASS is 2 digits for millis
    return f"{hours}:{minutes:02d}:{secs:02d}.{millis:02d}"

def generate_ass_subtitles(segments, output_ass_path, style="tiktok"):
    """Generates an Advanced SubStation Alpha file with word-by-word CapCut bouncy animations."""
    style_configs = {
        "tiktok": {
            "font": "Arial Black",
            "size": 26,
            "primary": "&H00FFFFFF", # White
            "secondary": "&H0000FFFF", # Yellow highlight
            "outline": "&H00000000", # Black
            "margin_v": 75 # Center-ish
        },
        "yellow": {
            "font": "Arial Black",
            "size": 26,
            "primary": "&H00FFFFFF",
            "secondary": "&H0000FFFF",
            "outline": "&H00000000",
            "margin_v": 75
        },
        "white": {
            "font": "Arial Black",
            "size": 26,
            "primary": "&H00FFFFFF",
            "secondary": "&H00FFFFFF",
            "outline": "&H00000000",
            "margin_v": 75
        }
    }
    config = style_configs.get(style, style_configs["tiktok"])
    
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{config['font']},{config['size']},{config['primary']},{config['secondary']},{config['outline']},&H00000000,-1,0,0,0,100,100,0,0,1,3,2,5,10,10,{config['margin_v']},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    with open(output_ass_path, "w", encoding="utf-8") as f:
        f.write(header)
        for seg in segments:
            if "words" not in seg or not seg["words"]:
                continue
                
            words = seg["words"]
            num_words = len(words)
            
            for i, active_word in enumerate(words):
                # Calculate contiguous timestamps so text stays on screen seamlessly
                start = active_word["start"] if i > 0 else seg["start"]
                end = words[i+1]["start"] if i < num_words - 1 else seg["end"]
                
                # Minimum duration safeguard
                if end <= start: end = start + 0.1
                
                ass_start = _format_ass_timestamp(start)
                ass_end = _format_ass_timestamp(end)
                
                # Gamification: Emoji mapping
                emoji_map = {
                    "money": "💰", "cash": "💸", "secret": "🤫", "fire": "🔥", 
                    "crazy": "🤯", "love": "❤️", "time": "⏳", "wow": "😲",
                    "important": "🚨", "growth": "📈", "stop": "🛑"
                }
                
                dialogue_parts = []
                for j, w in enumerate(words):
                    text = w["word"].strip()
                    
                    # Check for emoji insertion
                    clean_text = ''.join(e for e in text.lower() if e.isalnum())
                    emoji_suffix = emoji_map.get(clean_text, "")
                    
                    if j == i:
                        # Pop animation: scale up to 120 instantly, then shrink to 110 over 100ms
                        dialogue_parts.append(f"{{\\c{config['secondary']}\\fscx120\\fscy120\\t(0,100,\\fscx110\\fscy110)}}{text}{emoji_suffix}{{\\r}}")
                    else:
                        dialogue_parts.append(text + emoji_suffix)
                
                dialogue_text = " ".join(dialogue_parts)
                f.write(f"Dialogue: 0,{ass_start},{ass_end},Default,,0,0,0,,{dialogue_text}\n")
            
    return output_ass_path

def get_tracking_crop_filter(video_path, aspect_ratio_str, start_time=None, end_time=None):
    """Returns a dynamic ffmpeg crop/zoom string using OpenCV face detection."""
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    w_ratio, h_ratio = map(int, aspect_ratio_str.split(':'))
    
    if w_ratio < h_ratio: 
        crop_height = height
        crop_width = int(height * (w_ratio / h_ratio))
    elif w_ratio > h_ratio: 
        crop_width = width
        crop_height = int(width * (h_ratio / w_ratio))
    else: 
        crop_width = crop_height = min(width, height)
        
    crop_width = min(crop_width, width)
    crop_height = min(crop_height, height)

    centers_x, centers_y = [], []
    
    if start_time is not None:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(start_time * fps))
        
    frame_count = 0
    max_frames = 100 if end_time is None else int((end_time - start_time) * fps)
    
    # Load standard OpenCV Haar cascade for face detection
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    
    while cap.isOpened() and frame_count < max_frames:
        ret, frame = cap.read()
        if not ret: break
        
        # Sample every 10 frames to save compute
        if frame_count % 10 == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(50, 50))
            if len(faces) > 0:
                # Pick the largest face detected
                faces = sorted(faces, key=lambda f: f[2]*f[3], reverse=True)
                x, y, w, h = faces[0]
                centers_x.append(x + w / 2)
                centers_y.append(y + h / 2)
                
        frame_count += 1
    cap.release()
    
    if not centers_x:
        avg_x, avg_y = width / 2, height / 2
    else:
        avg_x = sum(centers_x) / len(centers_x)
        avg_y = sum(centers_y) / len(centers_y)
        
    crop_x = int(max(0, min(avg_x - crop_width / 2, width - crop_width)))
    crop_y = int(max(0, min(avg_y - crop_height / 2, height - crop_height)))
    
    return f"crop={crop_width}:{crop_height}:{crop_x}:{crop_y}"

def analyze_video_for_clips(video_path, target_duration=30.0, search_query=None, content_type="podcast"):
    """
    Transcribes the video and chunks it into coherent 'viral moments'.
    Generates heuristic scores, titles, and transcript snippets for each clip.
    If search_query is provided, scores clips based on semantic relevance to the query.
    If content_type is 'trailer', scores purely by audio energy.
    """
    srt_path = video_path.replace(".mp4", ".srt")
    json_path = video_path.replace(".mp4", ".json")
    
    segments = transcribe_and_save(video_path, srt_path)
    
    if not segments and content_type != "trailer":
        return [], []
        
    # Cache the rich whisper segments (with word-level timestamps) to disk
    import json
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(segments, f)
        
    clips = []
    current_clip = []
    current_start = segments[0]['start']
    
    # Pre-encode search query if provided
    query_embedding = None
    if search_query and search_query.strip() and TRANSCRIPT_SEARCH_ENABLED:
        query_embedding = semantic_model.encode(search_query.strip())
    
    clips = []
    
    from moviepy import VideoFileClip
    try:
        vid_clip = VideoFileClip(video_path)
    except Exception:
        vid_clip = None

    if content_type == "trailer":
        # Chunk purely by time, score purely by audio energy
        clips = []
        if vid_clip:
            total_duration = vid_clip.duration
            num_clips = max(1, int(total_duration // target_duration))
            for i in range(num_clips):
                c_start = i * target_duration
                c_end = min((i + 1) * target_duration, total_duration)
                
                audio_score = 50
                if vid_clip.audio:
                    try:
                        sub_audio = vid_clip.audio.subclip(c_start, c_end)
                        audio_array = sub_audio.to_soundarray(fps=16000)
                        if audio_array is not None and len(audio_array) > 0:
                            rms = np.sqrt(np.mean(audio_array**2))
                            audio_score = min(100, int(rms * 100 * 100))
                    except Exception:
                        pass
                        
                clips.append({
                    "id": str(i + 1),
                    "title": f"Action Scene {i+1}",
                    "start_time": c_start,
                    "end_time": c_end,
                    "transcript": "Trailer Action Segment",
                    "score": audio_score,
                    "breakdown": {
                        "hook": audio_score,
                        "flow": audio_score,
                        "value": audio_score,
                        "trend": audio_score
                    }
                })
            vid_clip.close()
        clips.sort(key=lambda x: x["score"], reverse=True)
        return clips[:5], segments

    if TRANSCRIPT_SEARCH_ENABLED:
        # Dynamic Semantic Windowing & NLP Hook Detection
        scored_segments = []
        labels = ["Controversial", "Curiosity Gap", "Educational", "Boring"]
        
        print("Evaluating segments for Virality Score...")
        for i, seg in enumerate(segments):
            text = seg['text'].strip()
            
            if query_embedding is not None:
                # 1. Semantic Match
                seg_emb = semantic_model.encode(text)
                sim = util.cos_sim(query_embedding, seg_emb).item()
            else:
                # 1. NLP Hook Detection
                heuristic = 0.0
                if "?" in text: heuristic += 0.2
                if "!" in text: heuristic += 0.1
                try:
                    result = hook_model(text, labels)
                    hook_score = sum(s for l, s in zip(result['labels'], result['scores']) if l in ["Controversial", "Curiosity Gap"])
                    hook_score -= sum(s for l, s in zip(result['labels'], result['scores']) if l == "Boring")
                except Exception:
                    hook_score = 0.0
                sim = hook_score + heuristic
                
            scored_segments.append((i, sim))
            
        # Sort segments by highest relevance/hook score
        scored_segments.sort(key=lambda x: x[1], reverse=True)
        
        used_indices = set()
        for anchor_idx, sim in scored_segments:
            if len(clips) >= 5: break
            if anchor_idx in used_indices: continue
            
            # 2. Expand outwards to reach target_duration (minimum bound constraint)
            start_idx = anchor_idx
            end_idx = anchor_idx
            current_duration = segments[end_idx]['end'] - segments[start_idx]['start']
            
            # Alternating backwards and forwards expansion
            while current_duration < target_duration:
                expanded = False
                if end_idx < len(segments) - 1 and (end_idx + 1) not in used_indices:
                    end_idx += 1
                    expanded = True
                elif start_idx > 0 and (start_idx - 1) not in used_indices:
                    start_idx -= 1
                    expanded = True
                    
                current_duration = segments[end_idx]['end'] - segments[start_idx]['start']
                if not expanded:
                    break
                    
            for i in range(start_idx, end_idx + 1):
                used_indices.add(i)
                
            current_clip = segments[start_idx:end_idx+1]
            title = current_clip[0]['text'][:50].strip() + "..."
            full_text = " ".join([s['text'].strip() for s in current_clip])
            
            # 3. Audio Energy Analysis
            audio_score = 50
            if vid_clip and vid_clip.audio:
                try:
                    c_start = current_clip[0]['start']
                    c_end = current_clip[-1]['end']
                    # Ensure end > start before subclip
                    if c_end > c_start + 0.1:
                        sub_audio = vid_clip.audio.subclip(c_start, c_end)
                        audio_array = sub_audio.to_soundarray(fps=16000)
                        if audio_array is not None and len(audio_array) > 0:
                            rms = np.sqrt(np.mean(audio_array**2))
                            # Normalize RMS amplitude to a score 0-100
                            audio_score = min(100, int(rms * 100 * 100))
                except Exception as e:
                    print(f"Audio energy analysis failed: {e}")
                    
            # Combine NLP Score and Audio Energy
            base_score = int(max(0, min(100, (sim + 0.2) * 60 + (audio_score / 100) * 40)))
            
            clips.append({
                "id": str(len(clips) + 1),
                "title": title,
                "start_time": current_clip[0]['start'],
                "end_time": current_clip[-1]['end'],
                "transcript": full_text,
                "score": base_score,
                "breakdown": {
                    "hook": min(100, base_score + np.random.randint(-5, 5)),
                    "flow": min(100, audio_score),
                    "value": min(100, base_score + np.random.randint(-5, 5)),
                    "trend": min(100, base_score + np.random.randint(-5, 5))
                }
            })
            
    else:
        # Fallback to standard virality chunking
        current_clip = []
        if segments:
            current_start = segments[0]['start']
            for seg in segments:
                current_clip.append(seg)
                if seg['end'] - current_start >= target_duration or seg == segments[-1]:
                    title = current_clip[0]['text'][:50].strip() + "..."
                    word_count = sum(len(s['text'].split()) for s in current_clip)
                    base_score = min(99, max(60, 60 + int((word_count / 40) * 40)))
                    full_text = " ".join([s['text'].strip() for s in current_clip])
                    
                    clips.append({
                        "id": str(len(clips) + 1),
                        "title": title,
                        "start_time": current_clip[0]['start'],
                        "end_time": current_clip[-1]['end'],
                        "transcript": full_text,
                        "score": base_score,
                        "breakdown": {
                            "hook": min(100, base_score + np.random.randint(-5, 5)),
                            "flow": min(100, base_score + np.random.randint(-5, 5)),
                            "value": min(100, base_score + np.random.randint(-5, 5)),
                            "trend": min(100, base_score + np.random.randint(-5, 5))
                        }
                    })
                    current_clip = []
                    if seg != segments[-1]:
                        current_start = segments[segments.index(seg) + 1]['start']
                        
    if vid_clip:
        vid_clip.close()
                        
    # Sort clips by score descending
    clips.sort(key=lambda x: x["score"], reverse=True)
    return clips[:5], segments # Return top 5 clips, and the raw segments for Creator Studio

def process_video_pipeline(input_path, output_path, start_time, end_time, aspect_ratio, generate_subs, subtitle_style="yellow", content_type="podcast", framing_mode="smart"):
    """Runs the full transcript-first video processing pipeline with cinematic smooth tracking."""
    import mediapipe as mp
    from moviepy import VideoFileClip
    import cv2
    import numpy as np
    
    print(f"Applying processing for {input_path} (Type: {content_type})...")
    clip = VideoFileClip(input_path).subclipped(start_time, end_time)
    
    w_ratio, h_ratio = map(int, aspect_ratio.split(':'))
    width, height = clip.size
    
    if w_ratio < h_ratio: 
        crop_height = height
        crop_width = int(height * (w_ratio / h_ratio))
    elif w_ratio > h_ratio: 
        crop_width = width
        crop_height = int(width * (h_ratio / w_ratio))
    else: 
        crop_width = crop_height = min(width, height)

    if content_type == "trailer" or framing_mode == "fit":
        # Game Trailer Mode / Fit Mode: Blurred Background Padding
        def blur_and_pad(get_frame, t):
            frame = get_frame(t)
            h, w = frame.shape[:2]
            
            # Scale video to fit width (assuming 9:16 portrait target)
            new_w = crop_width
            new_h = int(h * (crop_width / w))
            
            if new_h > crop_height:
                new_h = crop_height
                new_w = int(w * (crop_height / h))
                
            resized = cv2.resize(frame, (new_w, new_h))
            
            # Create blurred background
            bg = cv2.resize(frame, (crop_width, crop_height))
            bg = cv2.GaussianBlur(bg, (99, 99), 30)
            
            # Composite
            y_offset = (crop_height - new_h) // 2
            x_offset = (crop_width - new_w) // 2
            
            # Ensure boundaries are respected
            y_end = min(y_offset + new_h, crop_height)
            x_end = min(x_offset + new_w, crop_width)
            
            bg[y_offset:y_end, x_offset:x_end] = resized[:(y_end-y_offset), :(x_end-x_offset)]
            return bg
            
        cropped_clip = clip.transform(blur_and_pad)
        
    else:
        # Podcast / Action Tracking Mode
        mp_face_detection = mp.solutions.face_detection
        face_detection = mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5)
    
        class AdvancedTracker:
            def __init__(self):
                self.current_x = width / 2
                self.current_y = height / 2
                self.alpha = 0.05 
                self.prev_gray = None
                self.zoom_factor = 1.0 # Dynamic zoom
                
                # Sticky Split-Screen variables
                self.locked_split_screen = False
                self.lock_x1, self.lock_y1 = None, None
                self.lock_x2, self.lock_y2 = None, None
                
            def process_frame(self, get_frame, t):
                frame = get_frame(t)
                gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
                # 1. Smart Auto-Framing Logic
                target_zoom = 1.0
                results = face_detection.process(frame)
                
                if results.detections and framing_mode == "smart":
                    min_x = min(d.location_data.relative_bounding_box.xmin for d in results.detections)
                    max_x = max(d.location_data.relative_bounding_box.xmin + d.location_data.relative_bounding_box.width for d in results.detections)
                    action_width = (max_x - min_x) * width
                    
                    if action_width > crop_width * 0.8:
                        target_zoom = min(1.0, crop_width / (action_width * 1.2))
                
                if t < 2.0 and framing_mode != "smart":
                    target_zoom = 1.2 # Impact zoom for first 2 seconds only if not smart mode
                    
                self.zoom_factor = 0.05 * target_zoom + 0.95 * self.zoom_factor
                
                cw = int(crop_width / self.zoom_factor)
                ch = int(crop_height / self.zoom_factor)
                
                # 2. Sticky Multi-Speaker Split Screen
                if results.detections and len(results.detections) >= 2:
                    self.locked_split_screen = True
                    faces = sorted(results.detections, key=lambda d: d.location_data.relative_bounding_box.xmin)
                    f1, f2 = faces[0].location_data.relative_bounding_box, faces[1].location_data.relative_bounding_box
                    
                    t_x1, t_y1 = int((f1.xmin + f1.width / 2) * width), int((f1.ymin + f1.height / 2) * height)
                    t_x2, t_y2 = int((f2.xmin + f2.width / 2) * width), int((f2.ymin + f2.height / 2) * height)
                    
                    if self.lock_x1 is None:
                        self.lock_x1, self.lock_y1 = t_x1, t_y1
                        self.lock_x2, self.lock_y2 = t_x2, t_y2
                    else:
                        # Very slow median smoothing for lock
                        self.lock_x1 = 0.02 * t_x1 + 0.98 * self.lock_x1
                        self.lock_y1 = 0.02 * t_y1 + 0.98 * self.lock_y1
                        self.lock_x2 = 0.02 * t_x2 + 0.98 * self.lock_x2
                        self.lock_y2 = 0.02 * t_y2 + 0.98 * self.lock_y2
                
                if self.locked_split_screen and self.lock_x1 is not None:
                    half_ch = ch // 2
                    c_x1 = int(max(0, min(self.lock_x1 - cw / 2, width - cw)))
                    c_y1 = int(max(0, min(self.lock_y1 - half_ch / 2, height - half_ch)))
                    c_x2 = int(max(0, min(self.lock_x2 - cw / 2, width - cw)))
                    c_y2 = int(max(0, min(self.lock_y2 - half_ch / 2, height - half_ch)))
                    
                    crop1 = frame[c_y1:c_y1+half_ch, c_x1:c_x1+cw]
                    crop2 = frame[c_y2:c_y2+half_ch, c_x2:c_x2+cw]
                    
                    crop1 = cv2.resize(crop1, (crop_width, crop_height // 2))
                    crop2 = cv2.resize(crop2, (crop_width, crop_height - (crop_height // 2)))
                    final_crop = np.vstack([crop1, crop2])
                    self.prev_gray = gray
                    return final_crop

                elif results.detections:
                    # Standard Single Face Tracking
                    largest_face = max(results.detections, key=lambda d: d.location_data.relative_bounding_box.width * d.location_data.relative_bounding_box.height)
                    bbox = largest_face.location_data.relative_bounding_box
                    target_x = int((bbox.xmin + bbox.width / 2) * width)
                    target_y = int((bbox.ymin + bbox.height / 2) * height)
                else:
                    # 3. Motion Saliency Fallback (Documentaries/B-Roll)
                    target_x, target_y = self.current_x, self.current_y
                    if self.prev_gray is not None:
                        diff = cv2.absdiff(gray, self.prev_gray)
                        _, thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
                        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                        if contours:
                            largest_contour = max(contours, key=cv2.contourArea)
                            if cv2.contourArea(largest_contour) > 500:
                                M = cv2.moments(largest_contour)
                                if M["m00"] != 0:
                                    target_x = int(M["m10"] / M["m00"])
                                    target_y = int(M["m01"] / M["m00"])
                
                self.prev_gray = gray
                self.current_x = self.alpha * target_x + (1 - self.alpha) * self.current_x
                self.current_y = self.alpha * target_y + (1 - self.alpha) * self.current_y
            
                # 4. Smart Padding & Cropping
                pad_x = max(0, cw - width)
                pad_y = max(0, ch - height)
                
                if pad_x > 0 or pad_y > 0:
                    bg = cv2.resize(frame, (width + pad_x, height + pad_y))
                    bg = cv2.GaussianBlur(bg, (99, 99), 30)
                    bg[pad_y//2 : pad_y//2 + height, pad_x//2 : pad_x//2 + width] = frame
                    padded_frame = bg
                else:
                    padded_frame = frame
                    
                c_x = int(self.current_x) + pad_x // 2
                c_y = int(self.current_y) + pad_y // 2
                
                crop_x = int(max(0, min(c_x - cw // 2, width + pad_x - cw)))
                crop_y = int(max(0, min(c_y - ch // 2, height + pad_y - ch)))
                
                final_crop = padded_frame[crop_y:crop_y+ch, crop_x:crop_x+cw]
                
                if final_crop.shape[0] != crop_height or final_crop.shape[1] != crop_width:
                    final_crop = cv2.resize(final_crop, (crop_width, crop_height))
                    
                return final_crop
                
        tracker = AdvancedTracker()
        cropped_clip = clip.transform(tracker.process_frame)
    
    temp_cropped_path = input_path.replace(".mp4", "_cropped_temp.mp4")
    # Write cropped video with high bitrate for quality
    cropped_clip.write_videofile(temp_cropped_path, codec="libx264", audio_codec="aac", fps=clip.fps, bitrate="15000k", preset="fast", logger=None)
    clip.close()
    
    # 2. Add Dynamic Bouncy Subtitles via FFmpeg
    in_stream = ffmpeg.input(temp_cropped_path)
    video_stream = in_stream.video
    audio_stream = in_stream.audio
    
    if generate_subs:
        json_path = input_path.replace(".mp4", ".json")
        if os.path.exists(json_path):
            import json
            with open(json_path, "r", encoding="utf-8") as f:
                segments = json.load(f)
        else:
            segments = transcribe_and_save(input_path, None)
            
        # Filter segments to only those within our temporal window to avoid creating massive ASS files
        trimmed_segments = []
        for seg in segments:
            if seg["end"] > start_time and seg["start"] < end_time:
                # Adjust timestamps relative to the trim start
                adjusted_seg = dict(seg)
                adjusted_seg["start"] = max(0, seg["start"] - start_time)
                adjusted_seg["end"] = seg["end"] - start_time
                if "words" in seg:
                    adjusted_seg["words"] = []
                    for w in seg["words"]:
                        if w["end"] > start_time and w["start"] < end_time:
                            adj_w = dict(w)
                            adj_w["start"] = max(0, w["start"] - start_time)
                            adj_w["end"] = w["end"] - start_time
                            adjusted_seg["words"].append(adj_w)
                trimmed_segments.append(adjusted_seg)
                
        ass_path = input_path.replace(".mp4", ".ass")
        generate_ass_subtitles(trimmed_segments, ass_path, style=subtitle_style)
        
        backend_dir = os.path.dirname(__file__)
        ass_path_rel = os.path.relpath(ass_path, start=backend_dir).replace('\\', '/')
        video_stream = video_stream.filter('ass', ass_path_rel)
        
    print(f"Running ffmpeg to output {output_path}...")
    # Use crf=18 for high visual quality
    out = ffmpeg.output(video_stream, audio_stream, output_path, vcodec='libx264', acodec='copy', crf=18, preset='fast')
    out.run(overwrite_output=True, capture_stderr=True, capture_stdout=True)
    
    if os.path.exists(temp_cropped_path):
        os.remove(temp_cropped_path)
        
    print("Processing complete!")
    return output_path

