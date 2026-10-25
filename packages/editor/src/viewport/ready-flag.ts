type ReadyWindow = {
  __vibe3dReady?: boolean;
};

// 同步置位：首帧/定时器都可能被重场景卡住数秒，而 capture 自己会 gl.render，不必等首帧
export function scheduleReadyFlag(win: ReadyWindow): () => void {
  win.__vibe3dReady = true;
  return () => {
    win.__vibe3dReady = undefined;
  };
}
