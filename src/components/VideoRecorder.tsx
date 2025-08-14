import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Play, Square, Settings, Video, VideoOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoRecorderProps {
  className?: string;
}

export const VideoRecorder: React.FC<VideoRecorderProps> = ({ className }) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [delaySeconds, setDelaySeconds] = useState(3);
  const [frameBuffer, setFrameBuffer] = useState<string[]>([]);
  const [currentDelayedFrame, setCurrentDelayedFrame] = useState<string | null>(null);
  
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const delayedCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const captureFrame = useCallback(() => {
    if (liveVideoRef.current && delayedCanvasRef.current) {
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
          // Keep buffer size reasonable (max 30 seconds at 10fps = 300 frames)
          const maxFrames = Math.max(delaySeconds * 10, 30);
          return newBuffer.slice(-maxFrames);
        });
      }
    }
  }, [delaySeconds]);

  const playDelayedFrames = useCallback(() => {
    setFrameBuffer(prevBuffer => {
      const framesToDelay = delaySeconds * 10; // 10 FPS
      if (prevBuffer.length >= framesToDelay) {
        const delayedFrame = prevBuffer[prevBuffer.length - framesToDelay];
        setCurrentDelayedFrame(delayedFrame);
      }
      return prevBuffer;
    });
  }, [delaySeconds]);

  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
    
    setIsStreaming(false);
    setFrameBuffer([]);
    setCurrentDelayedFrame(null);
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
  }, [delaySeconds, captureFrame, playDelayedFrames, isStreaming]);

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
                style={{ display: isStreaming ? 'block' : 'none' }}
              />
              {!isStreaming && (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
                      <Video className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-muted-foreground text-sm">Start camera to begin</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Delayed Feed */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-center">
              Delayed View ({delaySeconds}s behind)
            </h3>
            <div className="relative aspect-video bg-secondary rounded-lg overflow-hidden">
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
                      {isStreaming ? 'Building delay buffer...' : 'Waiting for camera'}
                    </p>
                  </div>
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
          <div className="flex gap-3">
            {!isStreaming ? (
              <Button
                onClick={startStream}
                variant="fitness"
                size="lg"
                className="flex-1"
              >
                <Video className="w-4 h-4 mr-2" />
                Start Camera
              </Button>
            ) : (
              <Button
                onClick={stopStream}
                variant="destructive"
                size="lg"
                className="flex-1"
              >
                <VideoOff className="w-4 h-4 mr-2" />
                Stop Camera
              </Button>
            )}
          </div>

          {/* Delay Settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Delay (seconds)</label>
              <span className="text-sm text-accent font-semibold">{delaySeconds}s</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
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
              <span>5s</span>
              <span>10s</span>
            </div>
          </div>

          {/* Status */}
          {isStreaming && (
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-fitness-success/20 text-fitness-success">
                <div className="w-2 h-2 rounded-full bg-fitness-success animate-pulse" />
                <span className="text-sm font-medium">Live Recording</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Buffer: {frameBuffer.length} frames
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};