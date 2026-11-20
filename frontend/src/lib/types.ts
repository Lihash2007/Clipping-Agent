export interface ProjectItem {
  project_id: string;
  file_id: string;
  title: string;
  content_type: string;
  source_url?: string;
  video_url: string;
  clips: Clip[];
  segments?: Segment[];
  rendered_clips?: Record<string, string>;
  created_at: number;
}

export interface SocialPackage {
  title: string;
  hook_sentence: string;
  caption: string;
  hashtags: string[];
  why_viral: string;
}

export interface Clip {
  id: string;
  title: string;
  start_time: number;
  end_time: number;
  transcript: string;
  score: number;
  breakdown: {
    hook: number;
    flow: number;
    value: number;
    trend: number;
  };
  social?: SocialPackage;
  layout_type?: string;
  layout_description?: string;
  suggested_layout?: string;
  duration_tag?: string;
  hook_sentence?: string;
  punchline_sentence?: string;
  duration_seconds?: number;
}

export interface WordItem {
  word: string;
  start: number;
  end: number;
  emoji?: string;
  color?: string;
}

export interface Segment {
  id: number;
  start: number;
  end: number;
  text: string;
  words?: WordItem[];
}

export interface JobStatus {
  job_id: string;
  type: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  stage: string;
  result?: any;
  error?: string;
}

export interface BrandKitSettings {
  watermarkEnabled: boolean;
  watermarkText: string;
  watermarkPosition: "top_right" | "top_left" | "bottom_right" | "bottom_left";
  watermarkOpacity: number;
  defaultSubtitleStyle: string;
  defaultSubtitleSize: number;
  defaultSubtitlePlacement: "bottom_safe" | "center" | "divider" | "top";
  defaultStackedRatio: number;
  defaultUnsharp: boolean;
  defaultAudioDenoise: boolean;
  defaultFps: number;
}
