// Background music through YouTube's own embedded player (the song isn't
// ours to copy, so it's streamed, not downloaded). YouTube requires the
// player to stay visible, so it sits small in a corner.

const VOLUME = 12; // 0..100, quiet under everything else
let player = null;
let ready = false;
let wantPlay = false;
let muted = false;
let ducked = false;
let card = null;

function loadApi() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => resolve(); // offline or blocked: just no music
    document.head.append(s);
  });
}

function apply() {
  if (!ready) return;
  if (muted) player.mute();
  else player.unMute();
  player.setVolume(ducked ? Math.round(VOLUME / 3) : VOLUME);
}

/** Builds the player once. Call early; nothing plays until startMusic(). */
export async function setupMusic({ videoId, title }) {
  if (card || !videoId) return;
  card = document.createElement('aside');
  card.className = 'music';
  card.innerHTML = `
    <div class="music__frame"><div id="music-player"></div></div>
    <div class="music__meta"><span>Now playing</span><b></b></div>
    <button class="music__stop" type="button" aria-label="Stop the music">Stop</button>`;
  card.querySelector('b').textContent = title;
  card.hidden = true;
  document.body.append(card);
  card.querySelector('.music__stop').addEventListener('click', () => {
    wantPlay = false;
    if (ready) player.stopVideo();
    card.hidden = true;
    document.body.classList.remove('has-music');
  });

  await loadApi();
  if (!window.YT || !window.YT.Player) return;
  if (location.hostname === 'localhost') window.__music = () => player && player.getPlayerState && player.getPlayerState();
  player = new window.YT.Player('music-player', {
    width: 200,
    height: 113,
    videoId,
    playerVars: { autoplay: 0, controls: 1, loop: 1, playlist: videoId, modestbranding: 1, playsinline: 1, rel: 0 },
    events: {
      onReady: () => {
        ready = true;
        apply();
        if (wantPlay) player.playVideo();
      },
      onError: (e) => {
        console.warn("music unavailable, YouTube error", e.data);
        // removed or not embeddable: carry on without music
        card.hidden = true;
        document.body.classList.remove('has-music');
      },
    },
  });
}

/** Call from a click so the browser allows sound. */
export function startMusic() {
  if (!card) return;
  wantPlay = true;
  card.hidden = false;
  document.body.classList.add('has-music');
  if (ready) {
    apply();
    player.playVideo();
  }
}

export function muteMusic(m) {
  muted = m;
  apply();
}

/** Quieter while a video with its own sound is playing. */
export function duckMusic(on) {
  ducked = on;
  apply();
}
