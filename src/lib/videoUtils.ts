export interface VideoSaveOptions {
  frames: string[];
  fps: number;
  filename: string;
  codec?: 'av1' | 'hevc' | 'h264' | 'vp9' | 'auto';
  container?: 'mp4' | 'mkv' | 'webm' | 'auto';
}

export interface VideoSaveResult {
  codec: string;
  container: string;
  filename: string;
}

export const saveFramesAsVideo = async (options: VideoSaveOptions): Promise<VideoSaveResult> => {
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
    let selectedContainer: string = container;
    let selectedCodecName: string = codec;
    
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
             selectedContainer = containerName as string;
             selectedCodecName = codecName as string;
            break;
          }
        }
        
        if (selectedMimeType) break;
        
        // If no container priority match, try any supported variant for this codec
        for (const variant of codecVariants) {
          if (MediaRecorder.isTypeSupported(variant.type)) {
            selectedMimeType = variant.type;
           selectedContainer = variant.container as string;
           selectedCodecName = codecName as string;
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
          // If exact codec/container combo not supported, try other codecs with same container first
          if (options.container && options.container !== 'auto') {
            // Try all codecs with the requested container in priority order
            for (const codecName of codecPriority) {
              if (codecName === codec) continue; // Skip the requested codec (already tried)
              const otherCodecVariants = codecMap[codecName as keyof typeof codecMap];
              const containerMatch = otherCodecVariants?.find(v => v.container === container);
              if (containerMatch && MediaRecorder.isTypeSupported(containerMatch.type)) {
                selectedMimeType = containerMatch.type;
                selectedContainer = container;
                selectedCodecName = codecName as string;
                break;
              }
            }
          }
          
          // If still no match, fallback to any supported variant of the requested codec
          if (!selectedMimeType) {
            for (const variant of codecVariants) {
              if (MediaRecorder.isTypeSupported(variant.type)) {
                selectedMimeType = variant.type;
               selectedContainer = variant.container as string;
                // selectedCodecName already set to the requested codec
                break;
              }
            }
          }
        }
      }
    }
    
    // Final fallback to basic formats following priority order
    if (!selectedMimeType) {
      const fallbackTypes = [
        // HEVC fallbacks
        { type: 'video/x-matroska; codecs="hev1.1.6.L93.B0"', container: 'mkv', codec: 'hevc' },
        { type: 'video/mp4; codecs="hev1.1.6.L93.B0"', container: 'mp4', codec: 'hevc' },
        { type: 'video/mp4; codecs="hvc1.1.6.L93.B0"', container: 'mp4', codec: 'hevc' },
        // H.264 fallbacks  
        { type: 'video/x-matroska; codecs="avc1.42E01E"', container: 'mkv', codec: 'h264' },
        { type: 'video/mp4; codecs="avc1.42E01E"', container: 'mp4', codec: 'h264' },
        { type: 'video/webm; codecs="h264"', container: 'webm', codec: 'h264' },
        // VP9 fallbacks
        { type: 'video/x-matroska; codecs="vp9"', container: 'mkv', codec: 'vp9' },
        { type: 'video/mp4; codecs="vp09.00.10.08"', container: 'mp4', codec: 'vp9' },
        { type: 'video/webm; codecs="vp9"', container: 'webm', codec: 'vp9' },
        // Basic fallbacks
        { type: 'video/webm; codecs="vp8"', container: 'webm', codec: 'vp8' },
        { type: 'video/webm', container: 'webm', codec: 'unknown' }
      ];
      
      for (const fallback of fallbackTypes) {
        if (MediaRecorder.isTypeSupported(fallback.type)) {
          selectedMimeType = fallback.type;
         selectedContainer = fallback.container as string;
         selectedCodecName = fallback.codec as string;
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

    let resolvePromise: (result: VideoSaveResult) => void;
    const savePromise = new Promise<VideoSaveResult>((resolve) => {
      resolvePromise = resolve;
    });

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
      
      // Resolve with the actual format used
      resolvePromise({
        codec: selectedCodecName,
        container: selectedContainer,
        filename: finalFilename
      });
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

    return await savePromise;

  } catch (error) {
    console.error('Error saving video:', error);
    throw error;
  }
};

export const getResolvedFormat = (codec: string = 'auto', container: string = 'auto'): { codec: string; container: string; displayName: string } => {
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

  let selectedCodec: string = codec;
  let selectedContainer: string = container;
  
  // Auto-select best codec and container if not specified
  if (codec === 'auto' || container === 'auto') {
    // Try each codec in priority order
    for (const codecName of codecPriority) {
      const codecVariants = codecMap[codecName as keyof typeof codecMap];
      
      // Try each container in priority order for this codec
      for (const containerName of containerPriority) {
        const variant = codecVariants.find(v => v.container === containerName);
        if (variant && MediaRecorder.isTypeSupported(variant.type)) {
         selectedCodec = codecName as string;
         selectedContainer = containerName as string;
          break;
        }
      }
      
      if (selectedCodec !== 'auto') break;
      
      // If no container priority match, try any supported variant for this codec
      for (const variant of codecVariants) {
        if (MediaRecorder.isTypeSupported(variant.type)) {
         selectedCodec = codecName as string;
         selectedContainer = variant.container as string;
          break;
        }
      }
      
      if (selectedCodec !== 'auto') break;
    }
  } else {
    // Use specific codec and container combination
    const codecVariants = codecMap[codec as keyof typeof codecMap];
    if (codecVariants) {
      // Try to find exact match first
      const exactMatch = codecVariants.find(v => v.container === container);
      if (exactMatch && MediaRecorder.isTypeSupported(exactMatch.type)) {
        // Keep selected values as-is
      } else {
        // If exact codec/container combo not supported, try other codecs with same container first
        if ((container as string) !== 'auto') {
          // Try all codecs with the requested container in priority order
          for (const codecName of codecPriority) {
            if (codecName === codec) continue; // Skip the requested codec (already tried)
            const otherCodecVariants = codecMap[codecName as keyof typeof codecMap];
            const containerMatch = otherCodecVariants?.find(v => v.container === container);
            if (containerMatch && MediaRecorder.isTypeSupported(containerMatch.type)) {
             selectedCodec = codecName as string;
             selectedContainer = container as string;
              break;
            }
          }
        }
        
        // If still no match, fallback to any supported variant of the requested codec
        if (selectedCodec === codec && selectedContainer === container) {
          for (const variant of codecVariants) {
            if (MediaRecorder.isTypeSupported(variant.type)) {
              selectedContainer = variant.container as string;
              break;
            }
          }
        }
      }
    }
  }
  
  // Final fallback to basic formats following priority order
  if (selectedCodec === 'auto') {
    const fallbackTypes = [
      // HEVC fallbacks
      { type: 'video/x-matroska; codecs="hev1.1.6.L93.B0"', codec: 'hevc', container: 'mkv' },
      { type: 'video/mp4; codecs="hev1.1.6.L93.B0"', codec: 'hevc', container: 'mp4' },
      { type: 'video/mp4; codecs="hvc1.1.6.L93.B0"', codec: 'hevc', container: 'mp4' },
      // H.264 fallbacks  
      { type: 'video/x-matroska; codecs="avc1.42E01E"', codec: 'h264', container: 'mkv' },
      { type: 'video/mp4; codecs="avc1.42E01E"', codec: 'h264', container: 'mp4' },
      { type: 'video/webm; codecs="h264"', codec: 'h264', container: 'webm' },
      // VP9 fallbacks
      { type: 'video/x-matroska; codecs="vp9"', codec: 'vp9', container: 'mkv' },
      { type: 'video/mp4; codecs="vp09.00.10.08"', codec: 'vp9', container: 'mp4' },
      { type: 'video/webm; codecs="vp9"', codec: 'vp9', container: 'webm' },
      // Basic fallbacks
      { type: 'video/webm; codecs="vp8"', codec: 'vp8', container: 'webm' },
      { type: 'video/webm', codec: 'unknown', container: 'webm' }
    ];
    
    for (const fallback of fallbackTypes) {
      if (MediaRecorder.isTypeSupported(fallback.type)) {
       selectedCodec = fallback.codec as string;
       selectedContainer = fallback.container as string;
        break;
      }
    }
  }

  // Create display name
  const codecDisplayName = selectedCodec === 'av1' ? 'AV1' :
                          selectedCodec === 'hevc' ? 'HEVC' :
                          selectedCodec === 'h264' ? 'H.264' :
                          selectedCodec === 'vp9' ? 'VP9' :
                          selectedCodec === 'vp8' ? 'VP8' :
                          selectedCodec.toUpperCase();
  
  const displayName = `${codecDisplayName} (${selectedContainer.toUpperCase()})`;

  return {
    codec: selectedCodec,
    container: selectedContainer,
    displayName
  };
};

export const getVideoCodecInfo = (codec: string = 'auto', container: string = 'auto'): string => {
  return getResolvedFormat(codec, container).displayName;
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