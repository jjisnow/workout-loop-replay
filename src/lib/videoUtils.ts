export interface VideoSaveOptions {
  frames: string[];
  fps: number;
  filename: string;
}

export const saveFramesAsVideo = async (options: VideoSaveOptions): Promise<void> => {
  const { frames, fps, filename } = options;
  
  if (frames.length === 0) {
    throw new Error('No frames to save');
  }

  try {
    // Create a canvas to render frames
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Create a temporary video element to get frame dimensions
    const tempImg = new Image();
    tempImg.src = frames[0];
    
    await new Promise((resolve, reject) => {
      tempImg.onload = resolve;
      tempImg.onerror = reject;
    });

    canvas.width = tempImg.width;
    canvas.height = tempImg.height;

    // Create MediaRecorder with best available codec
    const stream = canvas.captureStream(fps);
    
    // Try to use the best available codec (browsers don't support HEVC encoding yet)
    // We'll use H.264 (MP4) as the best alternative
    const mimeTypes = [
      'video/mp4; codecs="avc1.42E01E"', // H.264 baseline
      'video/webm; codecs="vp9"',        // VP9
      'video/webm; codecs="vp8"',        // VP8
      'video/webm'                       // Fallback
    ];

    let selectedMimeType = '';
    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        selectedMimeType = mimeType;
        break;
      }
    }

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: selectedMimeType,
      videoBitsPerSecond: 5000000 // 5 Mbps for good quality
    });

    const chunks: BlobPart[] = [];
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: selectedMimeType });
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Clean up
      URL.revokeObjectURL(url);
    };

    mediaRecorder.start();

    // Render frames sequentially
    const frameInterval = 1000 / fps;
    for (let i = 0; i < frames.length; i++) {
      const img = new Image();
      img.src = frames[i];
      
      await new Promise((resolve, reject) => {
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          resolve(null);
        };
        img.onerror = reject;
      });

      // Wait for frame interval
      if (i < frames.length - 1) {
        await new Promise(resolve => setTimeout(resolve, frameInterval));
      }
    }

    // Stop recording
    mediaRecorder.stop();
    
    // Stop the stream
    stream.getTracks().forEach(track => track.stop());

  } catch (error) {
    console.error('Error saving video:', error);
    throw error;
  }
};

export const getVideoCodecInfo = (): string => {
  const mimeTypes = [
    { name: 'H.264 (MP4)', type: 'video/mp4; codecs="avc1.42E01E"' },
    { name: 'VP9 (WebM)', type: 'video/webm; codecs="vp9"' },
    { name: 'VP8 (WebM)', type: 'video/webm; codecs="vp8"' },
    { name: 'WebM', type: 'video/webm' }
  ];

  for (const codec of mimeTypes) {
    if (MediaRecorder.isTypeSupported(codec.type)) {
      return codec.name;
    }
  }

  return 'Unknown';
};