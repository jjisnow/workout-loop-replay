import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Play, Square, Settings, Video, VideoOff, Pause, Download, Loader2, Maximize, Minimize, ChevronDown, RotateCcw, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { saveFramesAsVideo, getVideoCodecInfo, getSupportedCodecs } from '@/lib/videoUtils';
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
  const [selectedCodec, setSelectedCodec] = useState<'av1' | 'hevc' | 'h264' | 'vp9'>('av1');
  const [selectedContainer, setSelectedContainer] = useState<'mp4' | 'mkv' | 'webm'>('mp4');
  const [frameBuffer, setFrameBuffer] = useState<string[]>([]);
  const [currentDelayedFrame, setCurrentDelayedFrame] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [hasPermissions, setHasPermissions] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [supportedCodecs, setSupportedCodecs] = useState<string[]>([]);
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

  const checkCameraPermissions = async () => {
    try {
      const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
      const isGranted = permissionStatus.state === 'granted';
      const isDenied = permissionStatus.state === 'denied';
      setHasPermissions(isDenied ? false : isGranted ? true : null);
      return isGranted;
    } catch {
      // Fallback for browsers that don't support permissions API
      setHasPermissions(null);
      return null;
    }
  };

  const startStream = async () => {
    setErrorMessage('');
    
    try {
      // Check permissions first
      const hasPermission = await checkCameraPermissions();
      if (hasPermission === false) {
        setErrorMessage('Camera permission denied. Please allow camera access and try again.');
        return;
      }

      const videoConstraints = resolution === '1080p' 
        ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };
        
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: facingMode,
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
      setHasPermissions(true);
      setErrorMessage('');
      
      // Start capturing frames at 10 FPS
      captureIntervalRef.current = setInterval(captureFrame, 100);
      
      // Start delayed playback at 10 FPS
      playbackIntervalRef.current = setInterval(playDelayedFrames, 100);

      toast({
        title: "Camera started",
        description: "Ready to record your workout form!",
      });
      
    } catch (error: any) {
      console.error('Error accessing camera:', error);
      let errorMsg = 'Failed to access camera. ';
      
      if (error.name === 'NotAllowedError') {
        errorMsg += 'Please allow camera permissions and try again.';
        setHasPermissions(false);
      } else if (error.name === 'NotFoundError') {
        errorMsg += 'No camera found on this device.';
      } else if (error.name === 'NotReadableError') {
        errorMsg += 'Camera is already in use by another application.';
      } else {
        errorMsg += 'Please check your camera connection and try again.';
      }
      
      setErrorMessage(errorMsg);
      toast({
        title: "Camera Error",
        description: errorMsg,
        variant: "destructive"
      });
    }
  };

  const switchCamera = async () => {
    if (!isStreaming) return;
    
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);
    
    // Stop current stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    // Start new stream with new facing mode
    try {
      const videoConstraints = resolution === '1080p' 
        ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };
        
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: newFacingMode,
          ...videoConstraints
        }, 
        audio: false 
      });
      
      streamRef.current = stream;
      
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        await liveVideoRef.current.play();
      }
    } catch (error: any) {
      console.error('Error switching camera:', error);
      // Revert facing mode if switch failed
      setFacingMode(facingMode);
      
      let errorMsg = 'Failed to switch camera. ';
      if (error.name === 'NotFoundError') {
        errorMsg += 'The requested camera is not available.';
      } else {
        errorMsg += 'Please try again.';
      }
      
      toast({
        title: "Camera Switch Failed",
        description: errorMsg,
        variant: "destructive"
      });
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
      const fileExtension = selectedContainer === 'mkv' ? 'mkv' : 
                           selectedContainer === 'webm' ? 'webm' : 'mp4';
      const filename = `workout-form-${timestamp}.${fileExtension}`;
      
      const result = await saveFramesAsVideo({
        frames: frameBuffer,
        fps: 10,
        filename,
        codec: selectedCodec,
        container: selectedContainer
      });

      const codecDisplayName = result.codec === 'av1' ? 'AV1' :
                              result.codec === 'hevc' ? 'HEVC' :
                              result.codec === 'h264' ? 'H.264' :
                              result.codec === 'vp9' ? 'VP9' :
                              result.codec === 'vp8' ? 'VP8' :
                              result.codec.toUpperCase();

      toast({
        title: "Video saved successfully!",
        description: `Saved as ${result.filename} using ${codecDisplayName} (${result.container.toUpperCase()}) format.`,
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

  // Initialize codec support and permissions check on mount
  useEffect(() => {
    const initialize = async () => {
      // Check supported codecs
      const codecs = getSupportedCodecs();
      setSupportedCodecs(codecs.map(c => c.value));
      
      // Check camera permissions
      await checkCameraPermissions();
    };
    
    initialize();
    
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

  // Get platform-aware codec info
  const getCodecMessage = () => {
    return `Using ${selectedCodec.toUpperCase()} codec`;
  };

  return (
    <Card className={cn("p-3 sm:p-6 shadow-card transition-smooth", className)}>
      <div className="space-y-3 sm:space-y-6">
        
        {/* Error/Permission Alerts */}
        {errorMessage && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        
        {hasPermissions === false && !errorMessage && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Camera access is required to record your workout. Please allow camera permissions when prompted.
            </AlertDescription>
          </Alert>
        )}
        
        {/* Codec info for advanced users */}
        {isStreaming && supportedCodecs.length > 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {getCodecMessage()}. Supported formats: {supportedCodecs.join(', ').toUpperCase()}
            </AlertDescription>
          </Alert>
        )}
        {/* Video Display - Mobile Optimized */}
        <div className="space-y-3">
          {/* Delayed Feed - Primary focus on mobile */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                Delayed View ({delaySeconds}s)
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
                  ? "fixed inset-4 z-40 bg-black rounded-lg" 
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
                    <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-full bg-accent/20 flex items-center justify-center">
                      <Settings className="w-6 h-6 sm:w-8 sm:h-8 text-accent animate-spin" />
                    </div>
                    <p className="text-muted-foreground text-xs sm:text-sm">
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

          {/* Live Feed - Smaller on mobile */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Live Feed</h3>
            <div className="relative aspect-video sm:aspect-[4/3] bg-secondary rounded-lg overflow-hidden">
              <video
                ref={liveVideoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
                style={{ display: isStreaming && !isPaused ? 'block' : 'none' }}
              />
              {(!isStreaming || isPaused) && (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center space-y-1 sm:space-y-2">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
                      {isPaused ? (
                        <Pause className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                      ) : (
                        <Video className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs sm:text-sm">
                      {isPaused ? 'Camera paused' : 'Start camera to begin'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hidden canvas for frame capture */}
        <canvas ref={delayedCanvasRef} style={{ display: 'none' }} />

        {/* Controls - Mobile Optimized */}
        <div className="space-y-3">
          {/* Camera Controls */}
          <div className="space-y-2">
            {!isStreaming ? (
              <Button
                onClick={startStream}
                variant="fitness"
                size="lg"
                className="w-full"
                disabled={hasPermissions === false}
              >
                <Video className="w-4 h-4 mr-2" />
                {hasPermissions === false ? 'Camera Access Required' : 'Start Camera'}
              </Button>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
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
                  onClick={switchCamera}
                  variant="outline"
                  size="lg"
                  title={`Switch to ${facingMode === 'user' ? 'rear' : 'front'} camera`}
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
                <Button
                  onClick={stopStream}
                  variant="destructive"
                  size="lg"
                >
                  <VideoOff className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              </div>
            )}
          </div>

          {/* Quick Settings - Always visible */}
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-secondary/50 rounded-lg p-2">
              <p className="text-xs text-muted-foreground">Delay</p>
              <p className="text-lg font-semibold text-accent">{delaySeconds}s</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2">
              <p className="text-xs text-muted-foreground">Quality</p>
              <p className="text-lg font-semibold text-primary">{resolution}</p>
            </div>
          </div>

          {/* Status */}
          {isStreaming && (
            <div className="text-center">
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
                <span>{isPaused ? 'Paused' : 'Recording'}</span>
                <span className="text-xs opacity-70">• {Math.round(frameBuffer.length / 10)}s</span>
              </div>
            </div>
          )}

          {/* Save Controls */}
          {frameBuffer.length > 0 && (
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
                  Saving...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Save Video ({Math.round(frameBuffer.length / 10)}s)
                </>
              )}
            </Button>
          )}

          {/* Advanced Settings - Collapsible */}
          <Collapsible open={showSettings} onOpenChange={setShowSettings}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <span className="text-sm">Advanced Settings</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", showSettings && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 mt-3">
              {/* Delay Settings */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Delay</label>
                  <span className="text-sm text-accent font-semibold">{delaySeconds}s</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value))}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer transition-smooth
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary 
                    [&::-webkit-slider-thumb]:transition-smooth"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1s</span>
                  <span>30s</span>
                </div>
              </div>

              {/* Buffer Size Settings */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Buffer Size</label>
                  <span className="text-sm text-accent font-semibold">{bufferSeconds}s</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="60"
                  value={bufferSeconds}
                  onChange={(e) => setBufferSeconds(Number(e.target.value))}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer transition-smooth
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent 
                    [&::-webkit-slider-thumb]:transition-smooth"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>5s</span>
                  <span>60s</span>
                </div>
              </div>

              {/* Resolution Settings */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Resolution</label>
                  <span className="text-sm text-accent font-semibold">{resolution}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  value={resolution === '1080p' ? 1 : 0}
                  onChange={(e) => setResolution(e.target.value === '1' ? '1080p' : '720p')}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer transition-smooth
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary 
                    [&::-webkit-slider-thumb]:transition-smooth"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>720p</span>
                  <span>1080p</span>
                </div>
              </div>

              {/* Codec Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Video Codec</label>
                <div className="grid grid-cols-2 gap-2">
                  {getSupportedCodecs().map((codec) => (
                    <Button
                      key={codec.value}
                      onClick={() => setSelectedCodec(codec.value as any)}
                      variant={selectedCodec === codec.value ? 'fitness' : codec.supported ? 'outline' : 'secondary'}
                      size="sm"
                      className="text-xs"
                      disabled={!codec.supported}
                      title={!codec.supported ? 'Not supported in this browser' : ''}
                    >
                      {codec.label}
                      {!codec.supported && ' ❌'}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Container Format Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Container Format</label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    onClick={() => setSelectedContainer('mp4')}
                    variant={selectedContainer === 'mp4' ? 'fitness' : 'outline'}
                    size="sm"
                    className="text-xs"
                  >
                    MP4
                  </Button>
                  <Button
                    onClick={() => setSelectedContainer('mkv')}
                    variant={selectedContainer === 'mkv' ? 'fitness' : 'outline'}
                    size="sm"
                    className="text-xs"
                  >
                    MKV
                  </Button>
                  <Button
                    onClick={() => setSelectedContainer('webm')}
                    variant={selectedContainer === 'webm' ? 'fitness' : 'outline'}
                    size="sm"
                    className="text-xs"
                  >
                    WebM
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Videos saved as {selectedCodec.toUpperCase()}/{selectedContainer.toUpperCase()} format
              </p>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </Card>
  );
};