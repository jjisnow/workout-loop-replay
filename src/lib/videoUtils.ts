export interface VideoSaveOptions {
  frames: string[];
  fps: number;
  filename: string;
  codec?: 'av1' | 'hevc' | 'h264' | 'vp9';
  container?: 'mp4' | 'mkv' | 'webm';
}

export const saveFramesAsVideo = async (options: VideoSaveOptions): Promise<void> => {
  const { frames, fps, filename, codec = 'av1', container = 'mp4' } = options;
  
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

    // Create MediaRecorder with selected codec and container
    const stream = canvas.captureStream(fps);
    
    // Map codec and container preferences to MIME types
    const codecMap = {
      av1: ['video/webm; codecs="av01.0.05M.08"', 'video/mp4; codecs="av01.0.05M.08"'],
      hevc: ['video/mp4; codecs="hev1.1.6.L93.B0"', 'video/mp4; codecs="hvc1.1.6.L93.B0"'],
      h264: ['video/mp4; codecs="avc1.42E01E"', 'video/webm; codecs="h264"'],
      vp9: ['video/webm; codecs="vp9"', 'video/mp4; codecs="vp09.00.10.08"']
    };

    const containerMap = {
      mp4: 'video/mp4',
      mkv: 'video/x-matroska',
      webm: 'video/webm'
    };

    // Get preferred MIME types for selected codec
    const codecMimeTypes = codecMap[codec] || codecMap.av1;
    
    // Try to find a supported MIME type that matches both codec and container preferences
    let selectedMimeType = '';
    
    // First, try codec-specific MIME types that match the container
    for (const mimeType of codecMimeTypes) {
      if (container === 'mp4' && mimeType.startsWith('video/mp4') && MediaRecorder.isTypeSupported(mimeType)) {
        selectedMimeType = mimeType;
        break;
      } else if (container === 'webm' && mimeType.startsWith('video/webm') && MediaRecorder.isTypeSupported(mimeType)) {
        selectedMimeType = mimeType;
        break;
      } else if (container === 'mkv' && MediaRecorder.isTypeSupported(mimeType)) {
        // For MKV, we'll use the codec but may need to adjust the container later
        selectedMimeType = mimeType;
        break;
      }
    }
    
    // Fallback to any supported codec MIME type
    if (!selectedMimeType) {
      for (const mimeType of codecMimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }
    }
    
    // Final fallback to any supported format
    if (!selectedMimeType) {
      const fallbackTypes = [
        'video/webm; codecs="vp9"',
        'video/webm; codecs="vp8"',
        'video/mp4; codecs="avc1.42E01E"',
        'video/webm'
      ];
      
      for (const mimeType of fallbackTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
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
      
      // Determine the correct file extension based on the selected container
      let actualExtension = container;
      if (container === 'mp4' && selectedMimeType.includes('webm')) {
        actualExtension = 'webm';
      } else if (container === 'webm' && selectedMimeType.includes('mp4')) {
        actualExtension = 'mp4';
      }
      
      // Update filename with correct extension
      const baseFilename = filename.replace(/\.[^/.]+$/, '');
      const finalFilename = `${baseFilename}.${actualExtension}`;
      
      // Create download link
      const a = document.createElement('a');
      a.href = url;
      a.download = finalFilename;
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

export const getVideoCodecInfo = (codec: string = 'auto', container: string = 'auto'): string => {
  const codecMap = {
    av1: [
      { name: 'AV1 (WebM)', type: 'video/webm; codecs="av01.0.05M.08"' },
      { name: 'AV1 (MP4)', type: 'video/mp4; codecs="av01.0.05M.08"' }
    ],
    hevc: [
      { name: 'HEVC (MP4)', type: 'video/mp4; codecs="hev1.1.6.L93.B0"' },
      { name: 'HEVC (MP4)', type: 'video/mp4; codecs="hvc1.1.6.L93.B0"' }
    ],
    h264: [
      { name: 'H.264 (MP4)', type: 'video/mp4; codecs="avc1.42E01E"' },
      { name: 'H.264 (WebM)', type: 'video/webm; codecs="h264"' }
    ],
    vp9: [
      { name: 'VP9 (WebM)', type: 'video/webm; codecs="vp9"' },
      { name: 'VP9 (MP4)', type: 'video/mp4; codecs="vp09.00.10.08"' }
    ]
  };

  // If specific codec requested, check its support
  if (codec !== 'auto' && codecMap[codec as keyof typeof codecMap]) {
    const codecs = codecMap[codec as keyof typeof codecMap];
    for (const codecInfo of codecs) {
      if (MediaRecorder.isTypeSupported(codecInfo.type)) {
        return codecInfo.name;
      }
    }
  }

  // Auto-detect best available codec
  const allCodecs = [
    ...codecMap.av1,
    ...codecMap.hevc,
    ...codecMap.h264,
    ...codecMap.vp9,
    { name: 'WebM', type: 'video/webm' }
  ];

  for (const codecInfo of allCodecs) {
    if (MediaRecorder.isTypeSupported(codecInfo.type)) {
      return codecInfo.name;
    }
  }

  return 'Unknown';
};

export const getSupportedCodecs = (): Array<{value: string, label: string, supported: boolean}> => {
  // Test a wider range of AV1 codec variations for better support detection
  const av1Supported = [
    'video/webm; codecs="av01.0.05M.08"',
    'video/mp4; codecs="av01.0.05M.08"',
    'video/webm; codecs="av01.0.08M.08"',
    'video/mp4; codecs="av01.0.08M.08"',
    'video/webm; codecs="av01"',
    'video/mp4; codecs="av01"'
  ].some(type => MediaRecorder.isTypeSupported(type));

  return [
    {
      value: 'av1',
      label: 'AV1',
      supported: av1Supported
    },
    {
      value: 'hevc',
      label: 'HEVC/H.265',
      supported: MediaRecorder.isTypeSupported('video/mp4; codecs="hev1.1.6.L93.B0"') ||
                 MediaRecorder.isTypeSupported('video/mp4; codecs="hvc1.1.6.L93.B0"')
    },
    {
      value: 'h264',
      label: 'H.264',
      supported: MediaRecorder.isTypeSupported('video/mp4; codecs="avc1.42E01E"') ||
                 MediaRecorder.isTypeSupported('video/webm; codecs="h264"')
    },
    {
      value: 'vp9',
      label: 'VP9',
      supported: MediaRecorder.isTypeSupported('video/webm; codecs="vp9"') ||
                 MediaRecorder.isTypeSupported('video/mp4; codecs="vp09.00.10.08"')
    }
  ];
};