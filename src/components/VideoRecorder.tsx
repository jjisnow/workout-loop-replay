import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Play, Square, RotateCcw, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoRecorderProps {
  className?: string;
}

export const VideoRecorder: React.FC<VideoRecorderProps> = ({ className }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [delaySeconds, setDelaySeconds] = useState(3);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' }, 
        audio: false 
      });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks: BlobPart[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(blob);
        setRecordedVideo(videoUrl);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playWithDelay = () => {
    if (recordedVideo && videoRef.current) {
      setIsPlaying(true);
      
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play();
        }
      }, delaySeconds * 1000);
    }
  };

  const resetVideo = () => {
    setRecordedVideo(null);
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <Card className={cn("p-6 shadow-card transition-smooth", className)}>
      <div className="space-y-6">
        {/* Video Display */}
        <div className="relative aspect-video bg-secondary rounded-lg overflow-hidden">
          {recordedVideo ? (
            <video
              ref={videoRef}
              src={recordedVideo}
              className="w-full h-full object-cover"
              loop
              onEnded={() => setIsPlaying(false)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
                  <Play className="w-8 h-8 text-primary" />
                </div>
                <p className="text-muted-foreground">Record your workout to review form</p>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-4">
          {/* Recording Controls */}
          <div className="flex gap-3">
            {!isRecording ? (
              <Button
                onClick={startRecording}
                variant="fitness"
                size="lg"
                className="flex-1"
              >
                <div className="w-4 h-4 rounded-full bg-white mr-2" />
                Start Recording
              </Button>
            ) : (
              <Button
                onClick={stopRecording}
                variant="destructive"
                size="lg"
                className="flex-1"
              >
                <Square className="w-4 h-4 mr-2 fill-current" />
                Stop Recording
              </Button>
            )}
          </div>

          {/* Playback Controls */}
          {recordedVideo && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <Button
                  onClick={playWithDelay}
                  variant="accent"
                  size="lg"
                  className="flex-1"
                  disabled={isPlaying}
                >
                  <Play className="w-4 h-4 mr-2" />
                  {isPlaying ? `Playing in ${delaySeconds}s...` : `Play with ${delaySeconds}s delay`}
                </Button>
                <Button
                  onClick={resetVideo}
                  variant="outline"
                  size="lg"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>

              {/* Delay Settings */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Delay (seconds)</label>
                  <span className="text-sm text-muted-foreground">{delaySeconds}s</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value))}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer slider"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};