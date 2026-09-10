"use client";

import React, { useState } from "react";
import { Upload, Video, Wand2, Type, Sparkles, Loader2, Play, Download, Settings, FileText, Scissors } from "lucide-react";

interface Clip {
  id: string;
  title: string;
  start_time: number;
  end_time: number;
  transcript: string;
  score: number;
  breakdown: { hook: number; flow: number; value: number; trend: number; };
}

interface Segment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [analyzeState, setAnalyzeState] = useState<"idle" | "analyzing" | "done">("idle");
  const [progress, setProgress] = useState(0);
  
  const [fileId, setFileId] = useState<string | null>(null);
  const [originalVideoUrl, setOriginalVideoUrl] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  
  // Tabs
  const [activeTab, setActiveTab] = useState<"feed" | "studio">("feed");

  // Settings
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [subtitles, setSubtitles] = useState(true);
  const [subtitleStyle, setSubtitleStyle] = useState("tiktok");
  const [targetDuration, setTargetDuration] = useState("30");
  const [searchQuery, setSearchQuery] = useState("");
  const [contentType, setContentType] = useState("podcast");
  const [framingMode, setFramingMode] = useState("smart");

  // Creator Studio State
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([]);
  const [customRenderStart, setCustomRenderStart] = useState<number>(0);
  const [customRenderEnd, setCustomRenderEnd] = useState<number>(0);

  // Rendering state
  const [renderingClipId, setRenderingClipId] = useState<string | null>(null);
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setAnalyzeState("analyzing");
    setProgress(0);
    
    const interval = setInterval(() => {
      setProgress(p => Math.min(p + 1, 98));
    }, 500);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("target_duration", targetDuration);
    formData.append("content_type", contentType);
    if (searchQuery.trim()) {
      formData.append("search_query", searchQuery.trim());
    }

    try {
      const response = await fetch("http://localhost:8000/api/analyze", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      
      if (data.status === "success") {
        setClips(data.clips);
        setSegments(data.segments);
        setFileId(data.file_id);
        setOriginalVideoUrl(`http://localhost:8000${data.video_url}`);
        setAnalyzeState("done");
      } else {
        const errorMsg = data.message || (data.detail ? JSON.stringify(data.detail) : "Unknown error");
        alert("Analysis failed: " + errorMsg);
        setAnalyzeState("idle");
      }
    } catch (error) {
      console.error(error);
      alert("Error connecting to backend server.");
      setAnalyzeState("idle");
    } finally {
      clearInterval(interval);
    }
  };

  const handleRender = async (clipId: string, start: number, end: number) => {
    if (!fileId) return;
    setRenderingClipId(clipId);

    const formData = new FormData();
    formData.append("file_id", fileId);
    formData.append("start_time", start.toString());
    formData.append("end_time", end.toString());
    formData.append("aspect_ratio", aspectRatio);
    formData.append("subtitles", subtitles.toString());
    formData.append("subtitle_style", subtitleStyle);
    formData.append("content_type", contentType);
    formData.append("framing_mode", framingMode);

    try {
      const response = await fetch("http://localhost:8000/api/clip", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      
      if (data.status === "success") {
        setDownloadUrls(prev => ({ ...prev, [clipId]: `http://localhost:8000${data.output_url}` }));
      } else {
        const errorMsg = data.message || (data.detail ? JSON.stringify(data.detail) : "Unknown error");
        alert("Render failed: " + errorMsg);
      }
    } catch (error) {
      console.error(error);
      alert("Error connecting to backend server.");
    } finally {
      setRenderingClipId(null);
    }
  };

  const toggleSegment = (seg: Segment) => {
    setSelectedSegmentIds(prev => {
      if (prev.includes(seg.id)) {
        return prev.filter(id => id !== seg.id);
      } else {
        return [...prev, seg.id].sort((a, b) => a - b);
      }
    });
  };

  // Compute selected time range
  const customStart = selectedSegmentIds.length > 0 ? segments.find(s => s.id === selectedSegmentIds[0])?.start : 0;
  const customEnd = selectedSegmentIds.length > 0 ? segments.find(s => s.id === selectedSegmentIds[selectedSegmentIds.length-1])?.end : 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans overflow-x-hidden">
      <header className="border-b border-gray-800 bg-black/50 sticky top-0 z-50 backdrop-blur-xl px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">ClipAI <span className="text-gray-500 font-normal">Creator</span></h1>
        </div>
        {analyzeState === "done" && (
          <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
            <button onClick={() => setActiveTab("feed")} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'feed' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-white'}`}>Viral Feed</button>
            <button onClick={() => setActiveTab("studio")} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'studio' ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-white'}`}>Creator Studio</button>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 flex flex-col xl:flex-row gap-8">
        
        {/* Left Column: Input / Settings */}
        <div className="w-full xl:w-80 flex-shrink-0 flex flex-col gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2"><Upload className="w-4 h-4 text-purple-400"/> Source Video</h2>
            
            {analyzeState === "idle" && (
              <div className="space-y-4">
                <div 
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  onClick={() => document.getElementById('file-upload')?.click()}
                  className="border-2 border-dashed border-gray-700 hover:border-purple-500/50 bg-black/50 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors text-center"
                >
                  <input 
                    type="file" 
                    id="file-upload" 
                    className="hidden" 
                    accept="video/*" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) setFile(e.target.files[0]);
                    }} 
                  />
                  <Video className="w-8 h-8 text-gray-500 mb-3" />
                  {file ? <p className="text-sm font-medium text-purple-400">{file.name}</p> : <p className="text-sm text-gray-400">Click or drag video here</p>}
                </div>
                
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Content Type</label>
                  <select 
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value)}
                    suppressHydrationWarning={true}
                    className="w-full bg-black border border-gray-800 rounded-lg p-2 text-sm text-gray-300 focus:outline-none focus:border-purple-500 mb-4"
                  >
                    <option value="podcast">Podcast / Interview</option>
                    <option value="trailer">Game Trailer / Action</option>
                  </select>
                  
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Auto-Clip Duration</label>
                  <select 
                    value={targetDuration}
                    onChange={(e) => setTargetDuration(e.target.value)}
                    suppressHydrationWarning={true}
                    className="w-full bg-black border border-gray-800 rounded-lg p-2 text-sm text-gray-300 focus:outline-none focus:border-purple-500"
                  >
                    <option value="15">&lt; 30 Seconds (Short)</option>
                    <option value="30">&gt; 30 Seconds (Medium)</option>
                    <option value="60">&gt; 60 Seconds (Long)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Topic / Keywords (Optional)</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g. skincare routine, funny jokes..."
                    className="w-full bg-black border border-gray-800 rounded-lg p-2 text-sm text-gray-300 focus:outline-none focus:border-purple-500 placeholder-gray-700"
                  />
                </div>
                
                <button 
                  onClick={handleAnalyze}
                  disabled={!file}
                  className={`w-full py-3 rounded-lg font-medium flex justify-center items-center gap-2 ${file ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
                >
                  <Wand2 className="w-4 h-4" /> Analyze Video
                </button>
              </div>
            )}

            {analyzeState === "analyzing" && (
              <div className="mt-4 p-4 bg-purple-900/20 border border-purple-500/20 rounded-xl text-center">
                <Loader2 className="w-6 h-6 text-purple-400 animate-spin mx-auto mb-2" />
                <p className="text-sm font-medium text-purple-300">AI is watching...</p>
                <div className="w-full h-1 bg-gray-800 rounded-full mt-3 overflow-hidden">
                  <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2"><Settings className="w-4 h-4 text-blue-400"/> Render Template</h2>
            <div className="space-y-5">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Aspect Ratio</label>
                <div className="grid grid-cols-3 gap-2">
                  {['9:16', '1:1', '16:9'].map(ratio => (
                    <button key={ratio} onClick={() => setAspectRatio(ratio)} className={`py-2 rounded-lg text-xs font-medium border ${aspectRatio === ratio ? 'bg-blue-500/20 border-blue-500 text-white' : 'bg-black border-gray-800 text-gray-400'}`}>{ratio}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Framing Mode</label>
                <select 
                  value={framingMode}
                  onChange={(e) => setFramingMode(e.target.value)}
                  suppressHydrationWarning={true}
                  className="w-full bg-black border border-gray-800 rounded-lg p-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                >
                  <option value="smart">Smart Auto-Frame (Zoom out if wide)</option>
                  <option value="fill">Fill Screen (Crop to ratio)</option>
                  <option value="fit">Fit Screen (Padded bounds)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Dynamic Subtitles</label>
                <div className="flex gap-2">
                  <button onClick={() => setSubtitles(true)} className={`flex-1 py-2 rounded-lg text-xs font-medium border ${subtitles ? 'bg-blue-500/20 border-blue-500 text-white' : 'bg-black border-gray-800 text-gray-400'}`}>Word-by-Word</button>
                  <button onClick={() => setSubtitles(false)} className={`flex-1 py-2 rounded-lg text-xs font-medium border ${!subtitles ? 'bg-gray-800 border-gray-700 text-white' : 'bg-black border-gray-800 text-gray-400'}`}>Off</button>
                </div>
                {subtitles && (
                  <div className="mt-3 space-y-2">
                    <label className="text-xs text-gray-400">Subtitle Style</label>
                    <select value={subtitleStyle} onChange={(e) => setSubtitleStyle(e.target.value)} className="w-full bg-black border border-gray-800 rounded-lg p-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500">
                      <option value="tiktok">CapCut Bold (Centered)</option>
                      <option value="yellow">Yellow Pop</option>
                      <option value="white">Classic White</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Feed or Studio */}
        <div className="flex-1 flex flex-col gap-6">
          {analyzeState === "idle" && (
            <div className="h-full border-2 border-dashed border-gray-800 rounded-3xl flex flex-col items-center justify-center text-center p-12 bg-gray-900/20 min-h-[400px]">
              <Sparkles className="w-12 h-12 text-gray-700 mb-4" />
              <h3 className="text-xl font-medium text-gray-300 mb-2">Upload a video to discover viral moments</h3>
              <p className="text-gray-500 max-w-sm">Our AI analyzes the transcript and visual flow to pinpoint the most engaging 15-60s clips, perfectly formatted for TikTok and Reels.</p>
            </div>
          )}

          {analyzeState === "done" && activeTab === "feed" && (
            <div className="space-y-6 pb-20">
              <div className="flex justify-between items-end mb-8 border-b border-gray-800 pb-4">
                <div><h2 className="text-2xl font-bold">Top Viral Clips</h2><p className="text-gray-400">Found {clips.length} high-potential moments.</p></div>
              </div>
              {clips.map((clip, index) => (
                <div key={clip.id} className="bg-[#141414] border border-gray-800 rounded-2xl p-6 flex flex-col xl:flex-row gap-6 shadow-xl">
                  {/* Score */}
                  <div className="w-full xl:w-32 flex flex-row xl:flex-col gap-4 flex-shrink-0">
                    <div className="text-4xl font-bold text-green-400">{clip.score}<span className="text-lg text-gray-600">/100</span></div>
                  </div>
                  {/* Preview */}
                  <div className="w-full xl:w-[220px] h-[380px] bg-black rounded-xl overflow-hidden relative flex-shrink-0 border border-gray-800">
                    {originalVideoUrl && <video src={`${originalVideoUrl}#t=${clip.start_time},${clip.end_time}`} className="w-full h-full object-cover opacity-80" controls controlsList="nodownload nofullscreen" />}
                  </div>
                  {/* Content */}
                  <div className="flex-1 flex flex-col">
                    <h3 className="text-lg font-bold mb-1">#{index + 1} {clip.title}</h3>
                    <p className="text-sm text-gray-500 mb-4">[{clip.start_time.toFixed(1)}s - {clip.end_time.toFixed(1)}s]</p>
                    <div className="bg-black/50 rounded-xl p-4 border border-gray-800/50 flex-1 overflow-y-auto mb-6 text-sm text-gray-300 leading-relaxed max-h-[180px]">{clip.transcript}</div>
                    <div className="flex gap-3 mt-auto">
                      {downloadUrls[clip.id] ? (
                        <a href={downloadUrls[clip.id]} download className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-lg font-medium"><Download className="w-4 h-4" /> Download HD</a>
                      ) : (
                        <button onClick={() => handleRender(clip.id, clip.start_time, clip.end_time)} disabled={renderingClipId !== null} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium ${renderingClipId === clip.id ? 'bg-purple-600/50 text-white cursor-wait' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}>
                          {renderingClipId === clip.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} {renderingClipId === clip.id ? 'Rendering...' : 'Render Clip'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {analyzeState === "done" && activeTab === "studio" && (
            <div className="flex flex-col h-full bg-[#141414] border border-gray-800 rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-800 bg-black/20 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2"><Scissors className="w-5 h-5 text-purple-400"/> Interactive Transcript</h2>
                  <p className="text-sm text-gray-400">Click on sentences to build a custom clip.</p>
                </div>
                {selectedSegmentIds.length > 0 && (
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Clip Duration</p>
                      <p className="text-lg font-mono font-bold text-white">{((customEnd || 0) - (customStart || 0)).toFixed(1)}s</p>
                    </div>
                    {downloadUrls["custom"] ? (
                        <a href={downloadUrls["custom"]} download className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-lg font-medium"><Download className="w-4 h-4" /> Download Custom Clip</a>
                      ) : (
                        <button onClick={() => handleRender("custom", customStart || 0, customEnd || 0)} disabled={renderingClipId !== null} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium ${renderingClipId === "custom" ? 'bg-purple-600/50 text-white cursor-wait' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}>
                          {renderingClipId === "custom" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Render Custom Clip
                        </button>
                    )}
                  </div>
                )}
              </div>
              <div className="p-6 overflow-y-auto flex-1 h-[600px]">
                <div className="max-w-3xl mx-auto leading-loose text-lg">
                  {segments.map(seg => {
                    const isSelected = selectedSegmentIds.includes(seg.id);
                    return (
                      <span 
                        key={seg.id} 
                        onClick={() => toggleSegment(seg)}
                        className={`inline cursor-pointer transition-colors px-1 rounded ${
                          isSelected 
                            ? 'bg-purple-500/30 text-white' 
                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                        }`}
                      >
                        {seg.text}{' '}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
