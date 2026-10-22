// Music uses the media playback session, rather than iOS's ambient/ringer route.
// Safari 17+ supports this directly. Older iOS gets a tiny preloaded silent media
// bridge; the actual synth remains on the low-latency Web Audio output.
export class PlaybackSession {
  constructor() {this.element=null;this.onchange=null;}
  configure() {
    try {
      if (navigator.audioSession) {
        if (navigator.audioSession.type !== 'playback') navigator.audioSession.type='playback';
        return navigator.audioSession.type === 'playback';
      }
    } catch {}
    return false;
  }
  prepare() {
    if (this.configure() || this.element) return;
    const ios=/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
    if (!ios) return;
    const audio=document.createElement('audio');
    audio.preload='auto';audio.loop=true;audio.muted=false;audio.volume=1;
    audio.setAttribute('playsinline','');audio.setAttribute('aria-hidden','true');audio.hidden=true;
    audio.src='/xianji/audio/media-session.wav';
    for (const event of ['loadeddata','canplay','playing','pause','error']) audio.addEventListener(event,()=>this.onchange?.());
    document.body.append(audio);this.element=audio;audio.load();
  }
  get state() {
    if (!this.element) return 'ready';
    if (this.element.error) return 'waiting';
    if (this.element.readyState<2) return 'preparing';
    return this.element.paused ? 'waiting' : 'ready';
  }
  activate() {
    this.prepare();
    if (!this.element || this.state==='ready') return Promise.resolve();
    return this.element.play();
  }
  pause() {this.element?.pause();}
}
