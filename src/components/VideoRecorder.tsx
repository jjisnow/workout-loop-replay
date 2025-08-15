import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Play, Square, Settings, Video, VideoOff, Pause, Download, Loader2, Maximize, Minimize } from 'lucide-react';
import { cn } from '@/lib/utils';
import { saveFramesAsVideo, getVideoCodecInfo } from '@/lib/videoUtils';
import { useToast } from '@/hooks/use-toast';

interface VideoRecorderProps {
  className?: string;
}

export const VideoRecorder: React.FC<VideoRecorderProps> = ({ className }) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [delaySeconds, setDelaySeconds] = useState(6);
  const [bufferSeconds, setBufferSeconds] = useState(15);
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [frameBuffer, setFrameBuffer] = useState<string[]>([]);
  const [currentDelayedFrame, setCurrentDelayedFrame] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();
  
  const delayedContainerRef = useRef<HTMLDivElement>(null);
  
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const delayedCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const captureFrame = useCallback(() => {
    if (isPaused || !liveVideoRef.current || !delayedCanvasRef.current) return;
    const canvas = delayedCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = liveVideoRef.current;
    
    if (ctx && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const frameData = canvas.toDataURL('image/jpeg', 0.8);
      
      setFrameBuffer(prevBuffer => {
        const newBuffer = [...prevBuffer, frameData];
        // Keep buffer at configured size, drop frames from front when full
        const maxFrames = bufferSeconds * 10; // 10 FPS
        if (newBuffer.length > maxFrames) {
          return newBuffer.slice(newBuffer.length - maxFrames);
        }
        return newBuffer;
      });
    }
  }, [bufferSeconds, isPaused]);

  const playDelayedFrames = useCallback(() => {
    if (isPaused) return;
    setFrameBuffer(prevBuffer => {
      const framesToDelay = delaySeconds * 10; // 10 FPS
      if (prevBuffer.length >= framesToDelay) {
        const delayedFrame = prevBuffer[prevBuffer.length - framesToDelay];
        setCurrentDelayedFrame(delayedFrame);
      }
      return prevBuffer;
    });
  }, [delaySeconds, isPaused]);

  const startStream = async () => {
    try {
      const videoConstraints = resolution === '1080p' 
        ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };
        
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          ...videoConstraints
        }, 
        audio: false 
      });
      
      streamRef.current = stream;
      
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        await liveVideoRef.current.play();
      }
      
      setIsStreaming(true);
      
      // Start capturing frames at 10 FPS
      captureIntervalRef.current = setInterval(captureFrame, 100);
      
      // Start delayed playback at 10 FPS
      playbackIntervalRef.current = setInterval(playDelayedFrames, 100);
      
    } catch (error) {
      console.error('Error accessing camera:', error);
    }
  };

  const stopStream = () => {
    pauseStream(); // This will clear intervals
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setIsStreaming(false);
    setIsPaused(false);
    setFrameBuffer([]);
    setCurrentDelayedFrame(null);
  };

  const pauseStream = () => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
    
    setIsPaused(true);
  };

  const resumeStream = () => {
    if (isStreaming) {
      // Restart capture and playback intervals
      captureIntervalRef.current = setInterval(captureFrame, 100);
      playbackIntervalRef.current = setInterval(playDelayedFrames, 100);
      setIsPaused(false);
    }
  };

  const toggleFullscreen = async () => {
    if (!delayedContainerRef.current) return;

    try {
      if (!isFullscreen) {
        if (delayedContainerRef.current.requestFullscreen) {
          await delayedContainerRef.current.requestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  };

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const saveCurrentBuffer = async () => {
    if (frameBuffer.length === 0) {
      toast({
        title: "No frames to save",
        description: "Start recording to build a frame buffer first.",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const codecInfo = getVideoCodecInfo();
      const filename = `workout-form-${timestamp}.${codecInfo.includes('MP4') ? 'mp4' : 'webm'}`;
      
      await saveFramesAsVideo({
        frames: frameBuffer,
        fps: 10,
        filename
      });

      toast({
        title: "Video saved successfully!",
        description: `Saved as ${filename} using ${codecInfo} codec.`,
      });
    } catch (error) {
      console.error('Error saving video:', error);
      toast({
        title: "Error saving video",
        description: "There was a problem saving your video. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  // Update delay buffer when delay changes
  useEffect(() => {
    if (isStreaming) {
      // Clear existing intervals and restart with new timing
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = setInterval(captureFrame, 100);
      }
      
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = setInterval(playDelayedFrames, 100);
      }
    }
  }, [delaySeconds, captureFrame, playDelayedFrames, isStreaming, isPaused]);

  return (
    <Card className={cn("p-6 shadow-card transition-smooth", className)}>
      <div className="space-y-6">
        {/* Video Display */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Live Feed */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-center">Live Feed</h3>
            <div className="relative aspect-video bg-secondary rounded-lg overflow-hidden">
              <video
                ref={liveVideoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
                style={{ display: isStreaming && !isPaused ? 'block' : 'none' }}
              />
              {(!isStreaming || isPaused) && (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
                      {isPaused ? (
                        <Pause className="w-8 h-8 text-primary" />
                      ) : (
                        <Video className="w-8 h-8 text-primary" />
                      )}
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {isPaused ? 'Camera paused' : 'Start camera to begin'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Delayed Feed */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-center flex-1">
                Delayed View ({delaySeconds}s behind)
              </h3>
              {currentDelayedFrame && (
                <Button
                  onClick={toggleFullscreen}
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                >
                  {isFullscreen ? (
                    <Minimize className="w-3 h-3" />
                  ) : (
                    <Maximize className="w-3 h-3" />
                  )}
                </Button>
              )}
            </div>
            <div 
              ref={delayedContainerRef}
              className={cn(
                "relative bg-secondary rounded-lg overflow-hidden transition-smooth",
                isFullscreen 
                  ? "fixed inset-0 z-50 bg-black rounded-none" 
                  : "aspect-video"
              )}
            >
              {currentDelayedFrame ? (
                <img
                  src={currentDelayedFrame}
                  alt="Delayed feed"
                  className="w-full h-full object-cover animate-fade-in"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 mx-auto rounded-full bg-accent/20 flex items-center justify-center">
                      <Settings className="w-8 h-8 text-accent animate-spin" />
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {isStreaming && !isPaused
                        ? frameBuffer.length > delaySeconds * 10 
                          ? 'Delayed feed active'
                          : 'Building delay buffer...'
                        : isPaused 
                          ? 'Feed paused'
                          : 'Waiting for camera'
                      }
                    </p>
                  </div>
                </div>
              )}
              
              {/* Fullscreen overlay controls */}
              {isFullscreen && (
                <div className="absolute top-4 right-4">
                  <Button
                    onClick={toggleFullscreen}
                    variant="secondary"
                    size="sm"
                    className="bg-black/50 backdrop-blur-sm"
                  >
                    <Minimize className="w-4 h-4 mr-2" />
                    Exit Fullscreen
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hidden canvas for frame capture */}
        <canvas ref={delayedCanvasRef} style={{ display: 'none' }} />

        {/* Controls */}
        <div className="space-y-4">
          {/* Camera Controls */}
          <div className="grid grid-cols-2 gap-3">
            {!isStreaming ? (
              <Button
                onClick={startStream}
                variant="fitness"
                size="lg"
                className="col-span-2"
              >
                <Video className="w-4 h-4 mr-2" />
                Start Camera
              </Button>
            ) : (
              <>
                <Button
                  onClick={isPaused ? resumeStream : pauseStream}
                  variant={isPaused ? "accent" : "secondary"}
                  size="lg"
                >
                  {isPaused ? (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4 mr-2" />
                      Pause
                    </>
                  )}
                </Button>
                <Button
                  onClick={stopStream}
                  variant="destructive"
                  size="lg"
                >
                  <VideoOff className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              </>
            )}
          </div>

          {/* Save Controls */}
          {frameBuffer.length > 0 && (
            <div className="space-y-3">
              <Button
                onClick={saveCurrentBuffer}
                variant="outline"
                size="lg"
                className="w-full"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving Video...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Save Current Buffer ({frameBuffer.length} frames)
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Video will be saved as {getVideoCodecInfo()} format
              </p>
            </div>
          )}

          {/* Delay Settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Delay (seconds)</label>
              <span className="text-sm text-accent font-semibold">{delaySeconds}s</span>
            </div>
            <input
              type="range"
              min="1"
              max="30"
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(Number(e.target.value))}
              className="w-full h-3 bg-secondary rounded-lg appearance-none cursor-pointer transition-smooth
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary 
                [&::-webkit-slider-thumb]:shadow-glow [&::-webkit-slider-thumb]:transition-smooth
                [&::-webkit-slider-thumb]:hover:scale-110"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1s</span>
              <span>15s</span>
              <span>30s</span>
            </div>
          </div>

          {/* Buffer Size Settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Buffer Size (seconds)</label>
              <span className="text-sm text-accent font-semibold">{bufferSeconds}s</span>
            </div>
            <input
              type="range"
              min="5"
              max="60"
              value={bufferSeconds}
              onChange={(e) => setBufferSeconds(Number(e.target.value))}
              className="w-full h-3 bg-secondary rounded-lg appearance-none cursor-pointer transition-smooth
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent 
                [&::-webkit-slider-thumb]:shadow-glow [&::-webkit-slider-thumb]:transition-smooth
                [&::-webkit-slider-thumb]:hover:scale-110"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5s</span>
              <span>30s</span>
              <span>60s</span>
            </div>
          </div>

          {/* Resolution Settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Video Resolution</label>
              <span className="text-sm text-accent font-semibold">{resolution}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              value={resolution === '1080p' ? 1 : 0}
              onChange={(e) => setResolution(e.target.value === '1' ? '1080p' : '720p')}
              className="w-full h-3 bg-secondary rounded-lg appearance-none cursor-pointer transition-smooth
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary 
                [&::-webkit-slider-thumb]:shadow-glow [&::-webkit-slider-thumb]:transition-smooth
                [&::-webkit-slider-thumb]:hover:scale-110"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>720p</span>
              <span>1080p</span>
            </div>
          </div>

          {/* Status */}
          {isStreaming && (
            <div className="text-center space-y-1">
              <div className={cn(
                "inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium transition-smooth",
                isPaused 
                  ? "bg-fitness-warning/20 text-fitness-warning"
                  : "bg-fitness-success/20 text-fitness-success"
              )}>
                <div className={cn(
                  "w-2 h-2 rounded-full transition-smooth",
                  isPaused 
                    ? "bg-fitness-warning"
                    : "bg-fitness-success animate-pulse"
                )} />
                <span>{isPaused ? 'Camera Paused' : 'Live Recording'}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Buffer: {frameBuffer.length} frames ({Math.round(frameBuffer.length / 10)}s)
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};