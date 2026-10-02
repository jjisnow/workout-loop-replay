import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Play, Settings, Video, VideoOff, Pause, Download, Loader2, Maximize, Minimize, ChevronDown, RotateCcw, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { saveFramesAsVideo, getResolvedFormat, getSupportedCodecs, type VideoCodec, type VideoContainer } from '@/lib/videoUtils';
import { useToast } from '@/hooks/use-toast';
import { useDelayedCamera, type Resolution } from '@/hooks/useDelayedCamera';

interface VideoRecorderProps { className?: string }

export const VideoRecorder: React.FC<VideoRecorderProps> = ({ className }) => {
  const [delaySeconds, setDelaySeconds] = useState(6);
  const [bufferSeconds, setBufferSeconds] = useState(15);
  const [selectedCodec, setSelectedCodec] = useState<VideoCodec>('auto');
  const [selectedContainer, setSelectedContainer] = useState<VideoContainer>('auto');
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const delayedContainerRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const { toast } = useToast();
  const camera = useDelayedCamera(delaySeconds, bufferSeconds);
  const { isStreaming, isStarting, isPaused, resolution, facingMode, errorMessage, hasDelayedFrame,
    stats, actualResolution, liveVideoRef, delayedCanvasRef, pauseStream, resumeStream, switchCamera } = camera;
  const codecs = useMemo(() => getSupportedCodecs(), []);
  const format = useMemo(() => getResolvedFormat(selectedCodec, selectedContainer), [selectedCodec, selectedContainer]);
  const startStream = () => { void camera.startStream(); };
  const stopStream = () => { exportRef.current?.abort(); camera.stopStream(); };
  const changeDelay = (seconds: number) => {
    setDelaySeconds(seconds);
    setBufferSeconds(current => Math.max(current, seconds));
  };
  const changeBuffer = (seconds: number) => {
    setBufferSeconds(seconds);
    setDelaySeconds(current => Math.min(current, seconds));
  };

  useEffect(() => {
    mountedRef.current = true;
    const fullscreen = () => setIsFullscreen(document.fullscreenElement === delayedContainerRef.current && !!document.fullscreenElement);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsFullscreen(false); };
    const hidden = () => { if (document.hidden) exportRef.current?.abort(); };
    const pagehide = () => exportRef.current?.abort();
    document.addEventListener('fullscreenchange', fullscreen);
    document.addEventListener('keydown', escape);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', pagehide);
    return () => {
      mountedRef.current = false;
      exportRef.current?.abort();
      document.removeEventListener('fullscreenchange', fullscreen);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', pagehide);
    };
  }, []);

  const toggleFullscreen = async () => {
    const target = delayedContainerRef.current;
    if (!target) return;
    try {
      if (isFullscreen) {
        if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
        setIsFullscreen(false);
      } else if (target.requestFullscreen) {
        await target.requestFullscreen();
        setIsFullscreen(document.fullscreenElement === target);
      } else { setIsFullscreen(true); } // CSS fullscreen for browsers without this API
    } catch {
      setIsFullscreen(true); // a denied native request still has a working in-page fallback
    }
  };

  const saveCurrentBuffer = async () => {
    if (exportRef.current) return;
    const frames = camera.getFramesForExport();
    if (!frames.length) return;
    const controller = new AbortController();
    exportRef.current = controller;
    setIsSaving(true);
    setSaveProgress(0);
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const result = await saveFramesAsVideo({
        frames, filename: `workout-form-${timestamp}`, codec: selectedCodec, container: selectedContainer,
        signal: controller.signal, onProgress: progress => { if (mountedRef.current) setSaveProgress(progress); },
      });
      if (mountedRef.current) toast({ title: 'Video download started', description: `${result.filename} (${result.codec.toUpperCase()}). Tap Resume to continue.` });
    } catch (error) {
      if (mountedRef.current && !controller.signal.aborted) toast({ title: 'Could not export video', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      exportRef.current = null;
      if (mountedRef.current) setIsSaving(false);
    }
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



        {/* Codec info for advanced users */}
        {isStreaming && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Capture targets 10 fps. {format ? `Export: ${format.displayName}.` : 'Video export is unavailable in this browser.'}
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
              {hasDelayedFrame && (
                <Button
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
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
              <canvas
                ref={delayedCanvasRef}
                aria-label={`Camera view delayed by ${delaySeconds} seconds`}
                className={cn('w-full h-full object-contain', !hasDelayedFrame && 'hidden')}
              />
              {!hasDelayedFrame && (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-full bg-accent/20 flex items-center justify-center">
                      <Settings className="w-6 h-6 sm:w-8 sm:h-8 text-accent animate-spin" />
                    </div>
                    <p className="text-muted-foreground text-xs sm:text-sm">
                      {isStreaming && !isPaused
                        ? stats.megabytes > 60 && stats.seconds < delaySeconds
                          ? 'Buffer memory limit reached. Lower resolution or delay.'
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
                disabled={isStarting || isSaving}
              >
                <Video className="w-4 h-4 mr-2" />
                {isStarting ? 'Starting camera…' : 'Start Camera'}
              </Button>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <Button
                  disabled={isSaving || isStarting}
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
                  disabled={isSaving || isStarting}
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
              {actualResolution && <p className="text-xs text-muted-foreground">{actualResolution}</p>}
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
                <span className="text-xs opacity-70">• {stats.seconds.toFixed(1)}s</span>
              </div>
            </div>
          )}

          {isStarting && <Button onClick={stopStream} variant="secondary" className="w-full">Cancel camera request</Button>}
          {/* Save Controls */}
          {stats.frames > 0 && (
            <Button
              onClick={saveCurrentBuffer}
              variant="outline"
              size="lg"
              className="w-full"
              disabled={isSaving || !format || isStarting}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exporting {Math.round(saveProgress * 100)}%
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Save Video ({stats.seconds.toFixed(1)}s)
                </>
              )}
            </Button>
          )}

          {isSaving && <Button onClick={() => exportRef.current?.abort()} variant="secondary" className="w-full">Cancel export</Button>}
          {isPaused && !isSaving && <p className="text-xs text-muted-foreground text-center">Resume starts a fresh delay buffer. Saving pauses capture.</p>}
          <p className="text-xs text-muted-foreground text-center">{stats.megabytes.toFixed(1)} MB buffered · video only · keep this tab visible</p>

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
                  <label htmlFor="delay-setting" className="text-sm font-medium">Delay</label>
                  <span className="text-sm text-accent font-semibold">{delaySeconds}s</span>
                </div>
                <input id="delay-setting"
                  type="range"
                  min="1"
                  max="30"
                  value={delaySeconds}
                  onChange={(e) => changeDelay(Number(e.target.value))}
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
                  <label htmlFor="buffer-setting" className="text-sm font-medium">Buffer Size</label>
                  <span className="text-sm text-accent font-semibold">{bufferSeconds}s</span>
                </div>
                <input id="buffer-setting"
                  type="range"
                  min="5"
                  max="60"
                  value={bufferSeconds}
                  onChange={(e) => changeBuffer(Number(e.target.value))}
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
                  <label htmlFor="resolution-setting" className="text-sm font-medium">Resolution</label>
                  <span className="text-sm text-accent font-semibold">{resolution}</span>
                </div>
                <input id="resolution-setting"
                  type="range"
                  min="0"
                  max="1"
                  value={resolution === '1080p' ? 1 : 0}
                  disabled={isStarting || isSaving}
                  onChange={(e) => camera.changeResolution((e.target.value === '1' ? '1080p' : '720p') as Resolution)}
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
                  <Button onClick={() => setSelectedCodec('auto')} variant={selectedCodec === 'auto' ? 'fitness' : 'outline'} size="sm">Auto</Button>
                  {codecs.map((codec) => (
                    <Button
                      key={codec.value}
                      onClick={() => setSelectedCodec(codec.value)}
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
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => setSelectedContainer('auto')} variant={selectedContainer === 'auto' ? 'fitness' : 'outline'} size="sm">Auto</Button>
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
                {format ? `Will export as ${format.displayName}. Unsupported preferences fall back to an available format.` : 'Video export is unavailable in this browser.'}
              </p>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </Card>
  );
};
