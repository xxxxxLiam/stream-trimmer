/*
 * Stand-in for the YouTube IFrame API, for parity runs. YouTube is unreachable from here, so the
 * player would always read as blocked and the transport row would never show. This keeps the same
 * contract the app uses (Player, events, seekTo, playVideo, getCurrentTime ...) with no picture.
 * window.__fakeYT = { start, ended } is read when a player is built.
 */
(() => {
  const cfg = () => window.__fakeYT || {};
  class Player {
    constructor(host, opts) {
      this.t = Number(cfg().start || 0);
      this.state = cfg().ended ? 0 : 2;
      this.rate = 1;
      queueMicrotask(() => {
        setTimeout(() => {
          opts.events?.onReady?.({});
          if (this.state === 0) opts.events?.onStateChange?.({ data: 0 });
        }, 30);
      });
      this.opts = opts;
      window.__fakeYTPlayer = this;
    }
    destroy() {}
    seekTo(s) { this.t = s; }
    playVideo() { this.state = 1; this.opts.events?.onStateChange?.({ data: 1 }); }
    pauseVideo() { this.state = 2; this.opts.events?.onStateChange?.({ data: 2 }); }
    getCurrentTime() { return this.t; }
    getPlayerState() { return this.state; }
    setPlaybackRate(r) { this.rate = r; }
    mute() {}
    unMute() {}
  }
  window.YT = { Player };
})();
