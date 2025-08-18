export interface VideoSaveOptions {
  frames: string[];
  fps: number;
  filename: string;
  codec?: 'av1' | 'hevc' | 'h264' | 'vp9';
  container?: 'mp4' | 'mkv' | 'webm';
}

export const saveFramesAsVideo = async (options: VideoSaveOptions): Promise<void> => {
  const { frames, fps, filename, codec = 'auto', container = 'auto' } = options;
  
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
    
    // Define codec priority order: AV1 > HEVC > H.264 > VP9
    const codecPriority = ['av1', 'hevc', 'h264', 'vp9'];
    
    // Define container priority order: MKV > MP4 > WebM
    const containerPriority = ['mkv', 'mp4', 'webm'];
    
    // Map codecs to their MIME type variants with container preferences
    const codecMap = {
      av1: [
        { type: 'video/x-matroska; codecs="av01.0.05M.08"', container: 'mkv' },
        { type: 'video/mp4; codecs="av01.0.05M.08"', container: 'mp4' },
        { type: 'video/webm; codecs="av01.0.05M.08"', container: 'webm' },
        { type: 'video/webm; codecs="av01.0.08M.08"', container: 'webm' },
        { type: 'video/webm; codecs="av01"', container: 'webm' },
        { type: 'video/mp4; codecs="av01"', container: 'mp4' }
      ],
      hevc: [
        { type: 'video/x-matroska; codecs="hev1.1.6.L93.B0"', container: 'mkv' },
        { type: 'video/mp4; codecs="hev1.1.6.L93.B0"', container: 'mp4' },
        { type: 'video/mp4; codecs="hvc1.1.6.L93.B0"', container: 'mp4' }
      ],
      h264: [
        { type: 'video/x-matroska; codecs="avc1.42E01E"', container: 'mkv' },
        { type: 'video/mp4; codecs="avc1.42E01E"', container: 'mp4' },
        { type: 'video/webm; codecs="h264"', container: 'webm' }
      ],
      vp9: [
        { type: 'video/x-matroska; codecs="vp9"', container: 'mkv' },
        { type: 'video/mp4; codecs="vp09.00.10.08"', container: 'mp4' },
        { type: 'video/webm; codecs="vp9"', container: 'webm' }
      ]
    };

    let selectedMimeType = '';
    let selectedContainer = container;
    
    // Auto-select best codec and container if not specified
    if (codec === 'auto' || container === 'auto') {
      // Try each codec in priority order
      for (const codecName of codecPriority) {
        const codecVariants = codecMap[codecName as keyof typeof codecMap];
        
        // Try each container in priority order for this codec
        for (const containerName of containerPriority) {
          const variant = codecVariants.find(v => v.container === containerName);
          if (variant && MediaRecorder.isTypeSupported(variant.type)) {
            selectedMimeType = variant.type;
            selectedContainer = containerName;
            break;
          }
        }
        
        if (selectedMimeType) break;
        
        // If no container priority match, try any supported variant for this codec
        for (const variant of codecVariants) {
          if (MediaRecorder.isTypeSupported(variant.type)) {
            selectedMimeType = variant.type;
            selectedContainer = variant.container;
            break;
          }
        }
        
        if (selectedMimeType) break;
      }
    } else {
      // Use specific codec and container combination
      const codecVariants = codecMap[codec as keyof typeof codecMap];
      if (codecVariants) {
        // Try to find exact match first
        const exactMatch = codecVariants.find(v => v.container === container);
        if (exactMatch && MediaRecorder.isTypeSupported(exactMatch.type)) {
          selectedMimeType = exactMatch.type;
        } else {
          // Fallback to any supported variant of this codec
          for (const variant of codecVariants) {
            if (MediaRecorder.isTypeSupported(variant.type)) {
              selectedMimeType = variant.type;
              selectedContainer = variant.container;
              break;
            }
          }
        }
      }
    }
    
    // Final fallback to basic formats
    if (!selectedMimeType) {
      const fallbackTypes = [
        { type: 'video/webm; codecs="vp9"', container: 'webm' },
        { type: 'video/webm; codecs="vp8"', container: 'webm' },
        { type: 'video/mp4; codecs="avc1.42E01E"', container: 'mp4' },
        { type: 'video/webm', container: 'webm' }
      ];
      
      for (const fallback of fallbackTypes) {
        if (MediaRecorder.isTypeSupported(fallback.type)) {
          selectedMimeType = fallback.type;
          selectedContainer = fallback.container;
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
      
      // Use the selected container for the file extension
      const baseFilename = filename.replace(/\.[^/.]+$/, '');
      const finalFilename = `${baseFilename}.${selectedContainer}`;
      
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

  // Auto-detect best available codec in priority order: AV1 > HEVC > H.264 > VP9
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