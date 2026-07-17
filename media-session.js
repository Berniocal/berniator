/* Media Session API – systémové ovládání Berniátoru v Androidu / PWA.
   Stejný princip jako ve funkční aplikaci Šumy: při přehrávání Web Audio
   udržujeme aktivní také téměř neslyšitelný HTMLAudioElement delší než 5 s. */
(() => {
  'use strict';

  if (!('mediaSession' in navigator) || !('MediaMetadata' in window)) return;

  const toggleBtn = document.getElementById('btnPlayStop');
  const frequencyEl = document.getElementById('knobHz');
  if (!toggleBtn || !frequencyEl) return;

  const icon = new URL('./assets/icons/icon-512.png', document.baseURI).href;

  function createQuietWavUrl(){
    const sampleRate = 8000;
    const seconds = 60;
    const samples = sampleRate * seconds;
    const bytesPerSample = 2;
    const dataSize = samples * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeText = (offset, text) => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };

    writeText(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeText(8, 'WAVE');
    writeText(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeText(36, 'data');
    view.setUint32(40, dataSize, true);

    // Prakticky neslyšitelný 35Hz signál. Není muted ani digitálně nulový,
    // protože takové médium může Android ignorovat.
    for (let i = 0; i < samples; i++) {
      const value = Math.round(Math.sin(2 * Math.PI * 35 * i / sampleRate) * 2);
      view.setInt16(44 + i * 2, value, true);
    }

    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }

  const mediaBridge = document.createElement('audio');
  mediaBridge.id = 'androidMediaBridge';
  mediaBridge.src = createQuietWavUrl();
  mediaBridge.loop = true;
  mediaBridge.preload = 'auto';
  mediaBridge.volume = 1;
  mediaBridge.setAttribute('playsinline', '');
  mediaBridge.style.position = 'fixed';
  mediaBridge.style.width = '1px';
  mediaBridge.style.height = '1px';
  mediaBridge.style.opacity = '0.001';
  mediaBridge.style.pointerEvents = 'none';
  mediaBridge.style.left = '-10px';
  document.body.appendChild(mediaBridge);

  function appIsPlaying(){
    return toggleBtn.textContent.includes('Stop');
  }

  function currentFrequency(){
    const frequency = Math.round(Number(frequencyEl.textContent) || 440);
    return `${frequency} Hz`;
  }

  function updateMetadata(){
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentFrequency(),
      artist: 'Berniátor',
      album: 'Generátor frekvence',
      artwork: [{ src: icon, sizes: '512x512', type: 'image/png' }]
    });
  }

  function setPlaybackState(state){
    try { navigator.mediaSession.playbackState = state; } catch (_) {}
  }

  async function startBridge(){
    updateMetadata();
    try {
      await mediaBridge.play();
      setPlaybackState('playing');
    } catch (error) {
      console.warn('Systémové mediální ovládání se nepodařilo aktivovat:', error);
    }
  }

  function stopBridge(){
    try { mediaBridge.pause(); } catch (_) {}
    try { mediaBridge.currentTime = 0; } catch (_) {}
    setPlaybackState('paused');
  }

  async function requestPlay(){
    // Nejprve aktivujeme HTML audio a potom případně hlavní generátor.
    await startBridge();
    if (!appIsPlaying()) toggleBtn.click();
  }

  function requestPause(){
    stopBridge();
    if (appIsPlaying()) toggleBtn.click();
  }

  // Capture fáze je zásadní: audio.play() proběhne přímo v původním
  // uživatelském kliknutí ještě před asynchronním spuštěním AudioContextu.
  toggleBtn.addEventListener('click', () => {
    if (!appIsPlaying()) startBridge();
    else stopBridge();
  }, true);

  try { navigator.mediaSession.setActionHandler('play', requestPlay); } catch (_) {}
  try { navigator.mediaSession.setActionHandler('pause', requestPause); } catch (_) {}
  try { navigator.mediaSession.setActionHandler('stop', requestPause); } catch (_) {}
  try { navigator.mediaSession.setActionHandler('seekbackward', null); } catch (_) {}
  try { navigator.mediaSession.setActionHandler('seekforward', null); } catch (_) {}
  try { navigator.mediaSession.setActionHandler('previoustrack', null); } catch (_) {}
  try { navigator.mediaSession.setActionHandler('nexttrack', null); } catch (_) {}

  const buttonObserver = new MutationObserver(() => {
    updateMetadata();
    if (appIsPlaying()) {
      if (mediaBridge.paused) startBridge();
      else setPlaybackState('playing');
    } else {
      stopBridge();
    }
  });
  buttonObserver.observe(toggleBtn, { childList: true, subtree: true, characterData: true });

  const frequencyObserver = new MutationObserver(updateMetadata);
  frequencyObserver.observe(frequencyEl, { childList: true, subtree: true, characterData: true });

  mediaBridge.addEventListener('play', () => setPlaybackState('playing'));
  mediaBridge.addEventListener('pause', () => {
    if (!appIsPlaying()) setPlaybackState('paused');
  });

  updateMetadata();
  setPlaybackState('none');
})();