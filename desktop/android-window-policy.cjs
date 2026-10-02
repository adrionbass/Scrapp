const CONTROL_BAR_WIDTH = 64;

const androidWindowCss = `
html, body { background: #000 !important; margin: 0; overflow: hidden; }
#app, #loading, #error, #launch { top: 0 !important; left: 0 !important; width: calc(100% - ${CONTROL_BAR_WIDTH}px) !important; height: 100% !important; }
#loading .loading-image { width: min(38%, 240px); max-height: 25%; margin: 0 0 16px; }
#loading .loading-image img { display: block; width: 100%; height: 100%; object-fit: contain; }
.sc-controls-bar { display: none !important; }
#scrapp-controlbar { position: fixed; top: 0; right: 0; bottom: 0; width: ${CONTROL_BAR_WIDTH}px; z-index: 2147483646; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 8px; border-left: 1px solid #262626; background: #101010; box-sizing: border-box; }
.scrapp-control-slot { width: 40px; height: 32px; display: grid; place-items: center; flex: 0 0 32px; }
#scrapp-controlbar .control-button { width: 32px; height: 32px; margin: 0; padding: 6px; background: transparent; }
#scrapp-controlbar .control-button:active { background: #292929; }
#scrapp-volume { min-height: 90px; flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; overflow: hidden; }
#scrapp-volume-label { color: #888; font: 700 8px sans-serif; }
#scrapp-volume-slider { position: relative; min-height: 32px; max-height: 105px; width: 30px; height: 60%; flex: 0 1 60%; touch-action: none; }
#scrapp-volume-slider::before { content: ""; position: absolute; top: 5px; bottom: 5px; left: 12px; width: 6px; border-radius: 3px; background: #343434; }
#scrapp-volume-thumb { position: absolute; left: 1px; width: 28px; height: 10px; border-radius: 1px; background: #843043; transform: translateY(-50%); }
#scrapp-volume-value { width: 38px; height: 38px; flex: 0 0 38px; display: grid; place-items: center; box-sizing: border-box; border: 1px solid #cf9cff; border-radius: 50%; padding: 0; background: #a556ff; color: #f5f5f5; font: 12px sans-serif; touch-action: manipulation; }
#scrapp-volume-value:active { filter: brightness(1.12); }
#scrapp-volume-value.muted { border-color: #4c4c4c; background: #232323; }
#scrapp-turbo-area { width: 48px; flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 8px; }
#scrapp-turbo { width: 36px; height: 36px; flex: 0 0 36px; display: none; place-items: center; border: 1px solid #333; border-radius: 3px; padding: 7px; background: #181818; color: #8b8b8b; }
#scrapp-turbo.active { border-color: #d4af37; color: #ffd84b; background: #292615; }
#scrapp-turbo svg { width: 100%; height: 100%; fill: currentColor; }
#scrapp-turbo-speeds { display: flex; flex-direction: column; align-items: center; gap: 7px; }
.scrapp-turbo-speed { width: 34px; height: 18px; border: 1px solid #333; border-radius: 2px; padding: 0; background: #181818; color: #999; font: 700 8px sans-serif; }
.scrapp-turbo-speed.selected { border-color: #d4af37; background: #292615; color: #ffd84b; }
@media (min-height: 560px) { #scrapp-turbo { display: grid; } }
`;

function createAndroidControlsJs(mode) {
  const controlMode = mode === "test";
  return `
const setScrappVolume = (percent) => {
  const audioEngine = vm.runtime && vm.runtime.audioEngine;
  const gain = audioEngine && audioEngine.inputNode && audioEngine.inputNode.gain;
  if (!gain) return;
  const value = Number(percent) / 100;
  if (gain.setValueAtTime && audioEngine.audioContext) gain.setValueAtTime(value, audioEngine.audioContext.currentTime);
  else gain.value = value;
};

let scrappAudioScale = 1;
const scrappStretchedAudio = new WeakMap();
const stretchScrappAudio = (buffer, scale, context) => {
  if (!buffer || scale <= 1) return buffer;
  let variants = scrappStretchedAudio.get(buffer);
  if (!variants) {
    variants = new Map();
    scrappStretchedAudio.set(buffer, variants);
  }
  if (variants.has(scale)) return variants.get(scale);
  const frameSize = 2048;
  const synthesisHop = frameSize / 2;
  const outputLength = Math.max(1, Math.ceil(buffer.length / scale));
  const stretched = context.createBuffer(buffer.numberOfChannels, outputLength, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const input = buffer.getChannelData(channel);
    const output = stretched.getChannelData(channel);
    const weights = new Float32Array(outputLength);
    for (let outputOffset = 0; outputOffset < outputLength; outputOffset += synthesisHop) {
      const inputOffset = Math.floor(outputOffset * scale);
      for (let index = 0; index < frameSize; index++) {
        const sourceIndex = inputOffset + index;
        const destinationIndex = outputOffset + index;
        if (sourceIndex >= input.length || destinationIndex >= outputLength) break;
        const windowValue = 0.5 - 0.5 * Math.cos(2 * Math.PI * index / (frameSize - 1));
        output[destinationIndex] += input[sourceIndex] * windowValue;
        weights[destinationIndex] += windowValue;
      }
    }
    for (let index = 0; index < outputLength; index++) {
      if (weights[index] > 0.0001) output[index] /= weights[index];
    }
  }
  variants.set(scale, stretched);
  return stretched;
};
const scrappBufferSourcePrototype = globalThis.AudioBufferSourceNode && AudioBufferSourceNode.prototype;
const scrappBufferDescriptor = scrappBufferSourcePrototype && Object.getOwnPropertyDescriptor(scrappBufferSourcePrototype, 'buffer');
if (scrappBufferDescriptor && scrappBufferDescriptor.get && scrappBufferDescriptor.set) {
  Object.defineProperty(scrappBufferSourcePrototype, 'buffer', {
    configurable: scrappBufferDescriptor.configurable,
    enumerable: scrappBufferDescriptor.enumerable,
    get: scrappBufferDescriptor.get,
    set(buffer) {
      const nextBuffer = buffer && scrappAudioScale > 1 ? stretchScrappAudio(buffer, scrappAudioScale, this.context) : buffer;
      scrappBufferDescriptor.set.call(this, nextBuffer);
    },
  });
}

const scrappNativeNow = Date.now.bind(Date);
let scrappClockScale = 1;
let scrappClockRealBase = scrappNativeNow();
let scrappClockVirtualBase = vm.runtime.currentMSecs || scrappClockRealBase;
const setScrappClockScale = (nextScale) => {
  const realNow = scrappNativeNow();
  scrappClockVirtualBase += (realNow - scrappClockRealBase) * scrappClockScale;
  scrappClockRealBase = realNow;
  scrappClockScale = nextScale;
};
vm.runtime.updateCurrentMSecs = () => {
  vm.runtime.currentMSecs = scrappClockVirtualBase + (scrappNativeNow() - scrappClockRealBase) * scrappClockScale;
};

const hookStopButton = (button) => {
  if (!button) return;
  let stopped = false;
  scaffolding.addEventListener('PROJECT_RUN_START', () => { stopped = false; });
  scaffolding.addEventListener('PROJECT_RUN_STOP', () => { stopped = true; });
  button.addEventListener('click', (event) => {
    event.stopImmediatePropagation();
    if (stopped) {
      stopped = false;
      scaffolding.greenFlag();
    } else {
      stopped = true;
      scaffolding.stopAll();
    }
  }, true);
};

const hookGreenFlagButton = (button) => {
  if (!button) return;
  scaffolding.addEventListener('PROJECT_RUN_START', () => button.classList.add('active'));
  scaffolding.addEventListener('PROJECT_RUN_STOP', () => button.classList.remove('active'));
  button.addEventListener('click', (event) => {
    event.stopImmediatePropagation();
    const launchScreen = document.getElementById('launch');
    if (launchScreen && !launchScreen.hidden) launchScreen.click();
    else scaffolding.greenFlag();
  }, true);
};

document.addEventListener('DOMContentLoaded', () => {
  const controls = document.createElement('div');
  controls.id = 'scrapp-controlbar';
  controls.className = ${JSON.stringify(controlMode ? "control-mode" : "final-mode")};

  ${controlMode ? `for (const selector of ['.green-flag-button', '.pause-button', '.stop-all-button']) {
    const slot = document.createElement('div');
    slot.className = 'scrapp-control-slot';
    let button = document.querySelector(selector);
    if (button && selector !== '.pause-button') {
      const replacement = button.cloneNode(true);
      button.replaceWith(replacement);
      button = replacement;
    }
    if (button) slot.appendChild(button);
    controls.appendChild(slot);
  }
  hookGreenFlagButton(controls.querySelector('.green-flag-button'));
  hookStopButton(controls.querySelector('.stop-all-button'));` : ""}

  const volume = document.createElement('div');
  volume.id = 'scrapp-volume';
  volume.innerHTML = '<span id="scrapp-volume-label">VOL</span><div id="scrapp-volume-slider" role="slider" aria-label="Volumen general" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span id="scrapp-volume-thumb"></span></div><button type="button" tabindex="-1" id="scrapp-volume-value" aria-label="Silenciar audio" aria-pressed="false">100</button>';
  const slider = volume.querySelector('[role="slider"]');
  const thumb = volume.querySelector('#scrapp-volume-thumb');
  const volumeValue = volume.querySelector('#scrapp-volume-value');
  let volumePercent = 100;
  let volumeMuted = false;
  const applyVolume = (value) => {
    volumePercent = Math.max(0, Math.min(100, Math.round(value)));
    const travel = Math.max(0, slider.clientHeight - 10);
    thumb.style.top = (5 + (100 - volumePercent) * travel / 100) + 'px';
    volumeValue.textContent = String(volumePercent);
    volumeValue.classList.toggle('muted', volumeMuted);
    volumeValue.setAttribute('aria-pressed', String(volumeMuted));
    volumeValue.setAttribute('aria-label', volumeMuted ? 'Restaurar audio' : 'Silenciar audio');
    slider.setAttribute('aria-valuenow', String(volumePercent));
    setScrappVolume(volumeMuted ? 0 : volumePercent);
  };
  const volumeFromPointer = (event) => {
    const rect = slider.getBoundingClientRect();
    applyVolume(100 - (event.clientY - rect.top - 5) * 100 / Math.max(1, rect.height - 10));
  };
  slider.addEventListener('pointerdown', (event) => {
    slider.setPointerCapture(event.pointerId);
    volumeFromPointer(event);
  });
  slider.addEventListener('pointermove', (event) => {
    if (slider.hasPointerCapture(event.pointerId)) volumeFromPointer(event);
  });
  volumeValue.addEventListener('click', () => {
    volumeMuted = !volumeMuted;
    applyVolume(volumePercent);
  });
  volumeValue.addEventListener('mousedown', (event) => event.preventDefault());
  new ResizeObserver(() => applyVolume(volumePercent)).observe(slider);
  controls.appendChild(volume);

  ${controlMode ? `let turboEnabled = false;
  let turboLevel = 3;
  const turboScales = { 2: 2, 3: 3, 4: 4 };
  const turboFramerates = { 2: 83, 3: 167, 4: 250 };
  const turboArea = document.createElement('div');
  turboArea.id = 'scrapp-turbo-area';
  const turbo = document.createElement('button');
  turbo.id = 'scrapp-turbo';
  turbo.setAttribute('aria-label', 'Turbo');
  turbo.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2 5 13h6l-.8 9L19 10h-6l.2-8z"/></svg>';
  const speeds = document.createElement('div');
  speeds.id = 'scrapp-turbo-speeds';
  const renderTurbo = () => {
    const speed = turboScales[turboLevel];
    setScrappClockScale(turboEnabled ? speed : 1);
    scrappAudioScale = turboEnabled ? speed : 1;
    if (typeof vm.setTurboMode === 'function') vm.setTurboMode(turboEnabled);
    if (typeof vm.setFramerate === 'function') vm.setFramerate(turboEnabled ? turboFramerates[turboLevel] : 30);
    if (vm.runtime) vm.runtime.turboMode = turboEnabled;
    turbo.classList.toggle('active', turboEnabled);
    for (const button of speeds.children) button.classList.toggle('selected', turboEnabled && Number(button.dataset.level) === turboLevel);
  };
  turbo.addEventListener('click', () => {
    turboEnabled = !turboEnabled;
    renderTurbo();
  });
  for (const level of [2, 3, 4]) {
    const button = document.createElement('button');
    button.className = 'scrapp-turbo-speed';
    button.textContent = level + 'x';
    button.dataset.level = String(level);
    button.addEventListener('click', () => {
      const wasSelected = turboEnabled && turboLevel === level;
      turboLevel = level;
      turboEnabled = !wasSelected;
      renderTurbo();
    });
    speeds.appendChild(button);
  }
  turboArea.append(turbo, speeds);
  controls.appendChild(turboArea);` : ""}

  document.body.appendChild(controls);
  scaffolding.relayout();
});
`;
}

module.exports = { androidWindowCss, createAndroidControlsJs };
