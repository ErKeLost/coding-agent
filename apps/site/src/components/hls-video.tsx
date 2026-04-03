import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

type HlsVideoProps = {
  src: string;
  className?: string;
};

export function HlsVideo({ src, className = 'absolute inset-0 z-0 h-full w-full object-cover' }: HlsVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return undefined;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);

      return () => {
        hls.destroy();
      };
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    }

    return undefined;
  }, [src]);

  return <video ref={videoRef} className={className} autoPlay loop muted playsInline />;
}