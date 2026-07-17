/* Berniátor – Android Media Session bridge
   Propojí Web Audio generátor se systémovým přehrávačem Androidu.
*/
(() => {
  'use strict';

  if (!('mediaSession' in navigator)) return;

  const playButton = document.getElementById('btnPlayStop');
  const frequencyEl = document.getElementById('knobHz');
  if (!playButton || !frequencyEl) return;

  let bridgeAudio = null;
  let bridgeUrl = null;
  let bridgeWanted = false;

  function currentFrequencyLabel(){
    const value = Math.round(Number(frequencyEl.textContent) || 440);
    return `${value} Hz`;
  }

  function isGeneratorPlaying(){
    return playButton.classList.contains('danger') || /stop/i.test(playButton.textContent || '');
  }

  function makeSilentWavUrl(seconds = 60, sampleRate = 8000){
    const samples = Math.max(1, Math.floor(seconds * sampleRate));
    const bytesPerSample = 2;
    const dataSize = samples * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    let offset = 0;

    const writeText = (text) => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset++, text.charCodeAt(i));
    };
    const write16 = (value) => { view.setUint16(offset, value, true); offset += 2; };
    const write32 = (value) => { view.setUint32(offset, value, true); offset += 4; };

    writeText('RIFF'); write32(36 + dataSize); writeText('WAVE');
    writeText('fmt '); write32(16); write16(1); write16(1);
    write32(sampleRate); write32(sampleRate * bytesPerSample);
    write16(bytesPerSample); write16(16);
    writeText('data'); write32(dataSize);

    // Prakticky neslyšitelný signál; čisté mute někdy nevytvoří Android media session.
    for (let i = 0; i < samples; i++) {
      const sample = (i % 4000 === 0) ? 1 : 0;
      view.setInt16(offset, sample, true);
      offset += 2;
    }

    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }

  function ensureBridge(){
    if (bridgeAudio) return bridgeAudio;
    bridgeUrl = makeSilentWavUrl();
    bridgeAudio = document.createElement('audio');
    bridgeAudio.src = bridgeUrl;
    bridgeAudio.loop = true;
    bridgeAudio.preload = 'auto';
    bridgeAudio.volume = 1;
    bridgeAudio.setAttribute('playsinline', '');
    bridgeAudio.style.display = 'none';
    document.body.appendChild(bridgeAudio);
    return bridgeAudio;
  }

  function updateMetadata(){
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentFrequencyLabel(),
        artist: 'Berniátor',
        album: 'Generátor frekvence',
        artwork: [
          { src: './assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      });
    } catch (_) {}
  }

  async function startBridge(){
    bridgeWanted = true;
    updateMetadata();
    const audio = ensureBridge();
    try {
      await audio.play();
      navigator.mediaSession.playbackState = 'playing';
    } catch (_) {
      // Android dovolí play až po uživatelském kliknutí; další synchronizace to zkusí znovu.
    }
  }

  function stopBridge(){
    bridgeWanted = false;
    if (bridgeAudio) {
      try { bridgeAudio.pause(); } catch (_) {}
      try { bridgeAudio.currentTime = 0; } catch (_) {}
    }
    try { navigator.mediaSession.playbackState = 'paused'; } catch (_) {}
  }

  async function requestPlay(){
    if (!isGeneratorPlaying()) playButton.click();
    // UI a AudioContext se mění asynchronně.
    setTimeout(() => { if (isGeneratorPlaying()) startBridge(); }, 80);
  }

  function requestPause(){
    if (isGeneratorPlaying()) playButton.click();
    stopBridge();
  }

  try { navigator.mediaSession.setActionHandler('play', requestPlay); } catch (_) {}
  try { navigator.mediaSession.setActionHandler('pause', requestPause); } catch (_) {}
  try { navigator.mediaSession.setActionHandler('stop', requestPause); } catch (_) {}

  function syncFromGenerator(){
    updateMetadata();
    if (isGeneratorPlaying()) {
      startBridge();
    } else {
      stopBridge();
    }
  }

  playButton.addEventListener('click', () => setTimeout(syncFromGenerator, 100));

  new MutationObserver(() => {
    updateMetadata();
  }).observe(frequencyEl, { childList: true, characterData: true, subtree: true });

  new MutationObserver(() => {
    const playing = isGeneratorPlaying();
    if (playing && !bridgeWanted) startBridge();
    if (!playing && bridgeWanted) stopBridge();
  }).observe(playButton, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  updateMetadata();
})();
