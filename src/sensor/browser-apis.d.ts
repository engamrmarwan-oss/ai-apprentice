// Chromium capture APIs that TypeScript's DOM library does not describe yet.

interface MediaStreamTrackProcessorInit {
  track: MediaStreamTrack;
  maxBufferSize?: number;
}

/** Turns a video track into a stream of frames that a worker can read. */
declare class MediaStreamTrackProcessor {
  constructor(init: MediaStreamTrackProcessorInit);
  readonly readable: ReadableStream<VideoFrame>;
}

/** Document Picture-in-Picture: a small always-on-top window owned by the page. */
interface DocumentPictureInPicture extends EventTarget {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  readonly window: Window | null;
}

interface Window {
  documentPictureInPicture?: DocumentPictureInPicture;
}
