const TITLEBAR_HEIGHT = 32;
const CONTROL_BAR_WIDTH = 64;
const SCRATCH_WIDTH = 480;
const SCRATCH_HEIGHT = 360;

function applyWindowPolicy(source, mode) {
  const generatedControlsHeight = mode === "test" ? 48 : 0;
  const minimumWidth = SCRATCH_WIDTH + CONTROL_BAR_WIDTH;
  const minimumHeight = SCRATCH_HEIGHT + TITLEBAR_HEIGHT;
  const sizeMarker = "    minWidth: 50,\n    minHeight: 50,";
  const windowMarker = "  const window = createWindow(options);\n  if (windowMode === 'maximize') {";
  if (!source.includes(sizeMarker) || !source.includes(windowMarker)) {
    throw new Error("No se pudo aplicar la política de ventana al paquete generado.");
  }

  return source
    .replace(
      sizeMarker,
      `    minWidth: ${minimumWidth},\n    minHeight: ${minimumHeight},\n    resizable: true,\n    maximizable: false,`,
    )
    .replace(
      windowMarker,
      `  options.width += ${CONTROL_BAR_WIDTH};\n` +
        `  options.height += ${TITLEBAR_HEIGHT - generatedControlsHeight};\n` +
        `  const window = createWindow(options);\n` +
        `  const extraWidth = ${CONTROL_BAR_WIDTH};\n` +
        `  const extraHeight = ${TITLEBAR_HEIGHT};\n` +
        `  const aspectWidth = ${SCRATCH_WIDTH};\n` +
        `  const aspectHeight = ${SCRATCH_HEIGHT};\n` +
        `  window.scrappExtraWidth = extraWidth;\n` +
        `  window.scrappExtraHeight = extraHeight;\n` +
        `  const fitBounds = (requested, edge) => {\n` +
        `    const display = screen.getDisplayMatching(requested).workArea;\n` +
        `    const current = window.getBounds();\n` +
        `    const horizontal = edge === 'left' || edge === 'right';\n` +
        `    const vertical = edge === 'top' || edge === 'bottom';\n` +
        `    const widthDelta = Math.abs(requested.width - current.width) / Math.max(current.width, 1);\n` +
        `    const heightDelta = Math.abs(requested.height - current.height) / Math.max(current.height, 1);\n` +
        `    let displayWidth = vertical || (!horizontal && heightDelta > widthDelta)\n` +
        `      ? Math.round((requested.height - extraHeight) * aspectWidth / aspectHeight)\n` +
        `      : requested.width - extraWidth;\n` +
        `    const maxDisplayWidth = Math.max(aspectWidth, Math.min(display.width - extraWidth, Math.floor((display.height - extraHeight) * aspectWidth / aspectHeight)));\n` +
        `    displayWidth = Math.max(aspectWidth, Math.min(maxDisplayWidth, displayWidth));\n` +
        `    const next = { width: displayWidth + extraWidth, height: Math.round(displayWidth * aspectHeight / aspectWidth) + extraHeight };\n` +
        `    next.x = edge.includes('left') ? current.x + current.width - next.width : requested.x;\n` +
        `    next.y = edge.includes('top') ? current.y + current.height - next.height : requested.y;\n` +
        `    next.x = Math.max(display.x, Math.min(next.x, display.x + display.width - next.width));\n` +
        `    next.y = Math.max(display.y, Math.min(next.y, display.y + display.height - next.height));\n` +
        `    return next;\n` +
        `  };\n` +
        `  window.setMinimumSize(aspectWidth + extraWidth, aspectHeight + extraHeight);\n` +
        `  const initialBounds = window.getBounds();\n` +
        `  if (initialBounds.width < aspectWidth + extraWidth || initialBounds.height < aspectHeight + extraHeight) {\n` +
        `    window.setBounds(fitBounds({\n` +
        `      ...initialBounds,\n` +
        `      width: Math.max(initialBounds.width, aspectWidth + extraWidth),\n` +
        `      height: Math.max(initialBounds.height, aspectHeight + extraHeight),\n` +
        `    }, 'right'));\n` +
        `  }\n` +
        `  window.setMaximizable(false);\n` +
        `  window.on('will-resize', (event, requested, details) => {\n` +
        `    fittedWindows.delete(window);\n` +
        `    event.preventDefault();\n` +
        `    window.setBounds(fitBounds(requested, details.edge || 'right'));\n` +
        `  });\n` +
        `  if (windowMode === 'maximize') {`,
    )
    .replace(
      "const createProjectWindow = (url) => {",
      `const fittedWindows = new WeakMap();\n` +
        `ipcMain.on('ScrappWindow.minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());\n` +
        `ipcMain.on('ScrappWindow.close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());\n` +
        `ipcMain.handle('ScrappWindow.toggleFit', (event) => {\n` +
        `  const window = BrowserWindow.fromWebContents(event.sender);\n` +
        `  if (!window) return false;\n` +
        `  const fitted = fittedWindows.get(window);\n` +
        `  if (fitted) {\n` +
        `    window.setBounds(fitted.restoreBounds);\n` +
        `    fittedWindows.delete(window);\n` +
        `    return false;\n` +
        `  }\n` +
        `  const restoreBounds = window.getBounds();\n` +
        `  const workArea = screen.getDisplayMatching(restoreBounds).workArea;\n` +
        `  const extraWidth = window.scrappExtraWidth || ${CONTROL_BAR_WIDTH};\n` +
        `  const extraHeight = window.scrappExtraHeight || ${TITLEBAR_HEIGHT};\n` +
        `  const displayWidth = Math.min(workArea.width - extraWidth, Math.floor((workArea.height - extraHeight) * ${SCRATCH_WIDTH} / ${SCRATCH_HEIGHT}));\n` +
        `  const width = displayWidth + extraWidth;\n` +
        `  const height = Math.round(displayWidth * ${SCRATCH_HEIGHT} / ${SCRATCH_WIDTH}) + extraHeight;\n` +
        `  window.setBounds({\n` +
        `    x: workArea.x + Math.floor((workArea.width - width) / 2),\n` +
        `    y: workArea.y + Math.floor((workArea.height - height) / 2),\n` +
        `    width,\n` +
        `    height,\n` +
        `  });\n` +
        `  fittedWindows.set(window, { restoreBounds });\n` +
        `  return true;\n` +
        `});\n\n` +
        "const createProjectWindow = (url) => {",
    );
}

function applyPreloadPolicy(source) {
  if (!source.includes("contextBridge") || !source.includes("ipcRenderer")) {
    throw new Error("No se pudo configurar la barra de la ventana generada.");
  }
  return `${source.trimEnd()}\n\ncontextBridge.exposeInMainWorld('ScrappWindow', {\n` +
    `  minimize: () => ipcRenderer.send('ScrappWindow.minimize'),\n` +
    `  toggleFit: () => ipcRenderer.invoke('ScrappWindow.toggleFit'),\n` +
    `  close: () => ipcRenderer.send('ScrappWindow.close'),\n` +
    `});\n`;
}

const customWindowCss = `
html, body { background: #000 !important; }
#app, #loading, #error, #launch { top: ${TITLEBAR_HEIGHT}px !important; left: 0 !important; width: calc(100% - ${CONTROL_BAR_WIDTH}px) !important; height: calc(100% - ${TITLEBAR_HEIGHT}px) !important; }
#loading .loading-image { width: min(38%, 240px); max-height: 25%; margin: 0 0 16px; }
#loading .loading-image img { display: block; width: 100%; height: 100%; object-fit: contain; }
.sc-controls-bar { display: none !important; }
#scrapp-titlebar { position: fixed; inset: 0 0 auto 0; height: ${TITLEBAR_HEIGHT}px; z-index: 2147483647; display: flex; align-items: center; background: #202020; color: #f3f3f3; font: 12px "Segoe UI", sans-serif; -webkit-app-region: drag; }
#scrapp-title-icon { width: 18px; height: 18px; margin-left: 8px; object-fit: contain; }
#scrapp-title { flex: 1; min-width: 0; padding: 0 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scrapp-window-button { position: relative; width: 46px; height: ${TITLEBAR_HEIGHT}px; border: 0; border-radius: 0; padding: 0; background: transparent; color: #f3f3f3; font: 18px "Segoe UI", sans-serif; -webkit-app-region: no-drag; }
.scrapp-window-button:hover { background: #3a3a3a; }
#scrapp-close:hover { background: #c42b1c; }
.scrapp-maximize-icon::before { content: ""; position: absolute; width: 9px; height: 9px; border: 1px solid currentColor; left: 18px; top: 11px; }
.scrapp-window-button.restoring .scrapp-maximize-icon::before { left: 20px; top: 10px; box-shadow: -3px 3px 0 -1px #202020, -4px 4px 0 -1px currentColor; }
#scrapp-controlbar { position: fixed; top: ${TITLEBAR_HEIGHT}px; right: 0; bottom: 0; width: ${CONTROL_BAR_WIDTH}px; z-index: 2147483646; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 8px 8px; border-left: 1px solid #262626; background: #101010; box-sizing: border-box; }
.scrapp-control-slot { width: 40px; height: 32px; display: grid; place-items: center; flex: 0 0 32px; }
#scrapp-controlbar .control-button { width: 32px; height: 32px; margin: 0; padding: 6px; background: transparent; }
#scrapp-controlbar .control-button:hover { background: #292929; }
#scrapp-volume { min-height: 90px; flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; overflow: hidden; }
#scrapp-volume-label { color: #888; font: 700 8px "Segoe UI", sans-serif; }
#scrapp-volume-slider { position: relative; min-height: 32px; max-height: 105px; width: 30px; height: 60%; flex: 0 1 60%; cursor: pointer; touch-action: none; }
#scrapp-volume-slider::before { content: ""; position: absolute; top: 5px; bottom: 5px; left: 12px; width: 6px; border-radius: 3px; background: #343434; }
#scrapp-volume-thumb { position: absolute; left: 1px; width: 28px; height: 10px; border-radius: 1px; background: #843043; transform: translateY(-50%); }
#scrapp-volume-value { width: 38px; height: 38px; flex: 0 0 38px; display: grid; place-items: center; box-sizing: border-box; border: 1px solid #cf9cff; border-radius: 50%; padding: 0; background: #a556ff; color: #f5f5f5; font: 12px "Segoe UI", sans-serif; cursor: pointer; }
#scrapp-volume-value:hover { filter: brightness(1.12); }
#scrapp-volume-value.muted { border-color: #4c4c4c; background: #232323; }
#scrapp-turbo { width: 36px; height: 36px; flex: 0 0 36px; display: none; place-items: center; border: 1px solid #333; border-radius: 3px; padding: 7px; background: #181818; color: #8b8b8b; }
#scrapp-turbo:hover { background: #292929; }
#scrapp-turbo.active { border-color: #d0ab2d; color: #ffd84b; background: #292615; }
#scrapp-turbo svg { width: 100%; height: 100%; fill: currentColor; }
#scrapp-turbo-area { width: 48px; flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 8px; }
#scrapp-turbo-speeds { display: flex; flex-direction: column; align-items: center; gap: 7px; }
.scrapp-turbo-speed { width: 34px; height: 18px; border: 1px solid #333; border-radius: 2px; padding: 0; background: #181818; color: #999; font: 700 8px "Segoe UI", sans-serif; }
.scrapp-turbo-speed:hover { background: #292929; color: white; }
.scrapp-turbo-speed.selected { border-color: #d0ab2d; background: #292615; color: #ffd84b; }
@media (min-height: 560px) { #scrapp-turbo { display: grid; } }
`;

function createCustomWindowJs(mode) {
  const controlMode = mode === "test";
  return `
const setScrappVolume = (percent) => {
  const audioEngine = vm.runtime && vm.runtime.audioEngine;
  const gain = audioEngine && audioEngine.inputNode && audioEngine.inputNode.gain;
  if (!gain) return;
  const value = Number(percent) / 100;
  if (gain.setValueAtTime && audioEngine.audioContext) {
    gain.setValueAtTime(value, audioEngine.audioContext.currentTime);
  } else {
    gain.value = value;
  }
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
const setScrappAudioScale = (nextScale) => {
  scrappAudioScale = nextScale;
};
const scrappBufferSourcePrototype = globalThis.AudioBufferSourceNode && AudioBufferSourceNode.prototype;
const scrappBufferDescriptor = scrappBufferSourcePrototype &&
  Object.getOwnPropertyDescriptor(scrappBufferSourcePrototype, 'buffer');
if (scrappBufferDescriptor && scrappBufferDescriptor.get && scrappBufferDescriptor.set) {
  Object.defineProperty(scrappBufferSourcePrototype, 'buffer', {
    configurable: scrappBufferDescriptor.configurable,
    enumerable: scrappBufferDescriptor.enumerable,
    get: scrappBufferDescriptor.get,
    set(buffer) {
      const nextBuffer = buffer && scrappAudioScale > 1
        ? stretchScrappAudio(buffer, scrappAudioScale, this.context)
        : buffer;
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
  vm.runtime.currentMSecs = scrappClockVirtualBase +
    (scrappNativeNow() - scrappClockRealBase) * scrappClockScale;
};

const hookStopButton = (button) => {
  if (!button || button.dataset.scrappHooked) return;
  button.dataset.scrappHooked = 'true';
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
  if (!button || button.dataset.scrappHooked) return;
  button.dataset.scrappHooked = 'true';
  scaffolding.addEventListener('PROJECT_RUN_START', () => button.classList.add('active'));
  scaffolding.addEventListener('PROJECT_RUN_STOP', () => button.classList.remove('active'));
  button.addEventListener('click', (event) => {
    event.stopImmediatePropagation();
    const launchScreen = document.getElementById('launch');
    if (launchScreen && !launchScreen.hidden) {
      launchScreen.click();
    } else {
      scaffolding.greenFlag();
    }
  }, true);
};

document.addEventListener('DOMContentLoaded', () => {
  const bar = document.createElement('div');
  bar.id = 'scrapp-titlebar';
  const icon = document.createElement('img');
  icon.id = 'scrapp-title-icon';
  icon.src = './icon.png';
  const title = document.createElement('div');
  title.id = 'scrapp-title';
  title.textContent = document.title;
  const minimize = document.createElement('button');
  minimize.className = 'scrapp-window-button';
  minimize.title = 'Minimizar';
  minimize.setAttribute('aria-label', 'Minimizar');
  minimize.textContent = '-';
  minimize.addEventListener('click', () => window.ScrappWindow.minimize());
  const maximize = document.createElement('button');
  maximize.className = 'scrapp-window-button';
  maximize.title = 'Maximizar';
  maximize.setAttribute('aria-label', 'Maximizar');
  maximize.innerHTML = '<span class="scrapp-maximize-icon"></span>';
  maximize.addEventListener('click', async () => {
    const fitted = await window.ScrappWindow.toggleFit();
    maximize.classList.toggle('restoring', fitted);
    maximize.title = fitted ? 'Restaurar' : 'Maximizar';
  });
  const close = document.createElement('button');
  close.id = 'scrapp-close';
  close.className = 'scrapp-window-button';
  close.title = 'Cerrar';
  close.setAttribute('aria-label', 'Cerrar');
  close.textContent = 'x';
  close.addEventListener('click', () => window.ScrappWindow.close());
  bar.append(icon, title, minimize, maximize, close);

  const controls = document.createElement('div');
  controls.id = 'scrapp-controlbar';
  controls.className = ${JSON.stringify(controlMode ? "control-mode" : "final-mode")};

  ${controlMode ? `const selectors = ['.green-flag-button', '.pause-button', '.stop-all-button'];
  for (const selector of selectors) {
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
  volume.title = 'Volumen general';
  volume.innerHTML = '<span id="scrapp-volume-label">VOL</span><div id="scrapp-volume-slider" role="slider" tabindex="0" aria-label="Volumen general" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span id="scrapp-volume-thumb"></span></div><button type="button" tabindex="-1" id="scrapp-volume-value" aria-label="Silenciar audio" aria-pressed="false">100</button>';
  const slider = volume.querySelector('[role="slider"]');
  const thumb = volume.querySelector('#scrapp-volume-thumb');
  const volumeValue = volume.querySelector('#scrapp-volume-value');
  let volumePercent = 100;
  let volumeMuted = false;
  const renderVolume = () => {
    const travel = Math.max(0, slider.clientHeight - 10);
    thumb.style.top = (5 + (100 - volumePercent) * travel / 100) + 'px';
    volumeValue.textContent = String(volumePercent);
    volumeValue.classList.toggle('muted', volumeMuted);
    volumeValue.setAttribute('aria-pressed', String(volumeMuted));
    volumeValue.setAttribute('aria-label', volumeMuted ? 'Restaurar audio' : 'Silenciar audio');
    slider.setAttribute('aria-valuenow', String(volumePercent));
  };
  const applyVolume = (value) => {
    volumePercent = Math.max(0, Math.min(100, Math.round(value)));
    renderVolume();
    setScrappVolume(volumeMuted ? 0 : volumePercent);
  };
  const volumeFromPointer = (event) => {
    const rect = slider.getBoundingClientRect();
    const travel = Math.max(1, rect.height - 10);
    applyVolume(100 - (event.clientY - rect.top - 5) * 100 / travel);
  };
  slider.addEventListener('pointerdown', (event) => {
    slider.setPointerCapture(event.pointerId);
    volumeFromPointer(event);
  });
  slider.addEventListener('pointermove', (event) => {
    if (slider.hasPointerCapture(event.pointerId)) volumeFromPointer(event);
  });
  slider.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') applyVolume(volumePercent + 5);
    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') applyVolume(volumePercent - 5);
  });
  volumeValue.addEventListener('click', () => {
    volumeMuted = !volumeMuted;
    renderVolume();
    setScrappVolume(volumeMuted ? 0 : volumePercent);
  });
  volumeValue.addEventListener('mousedown', (event) => event.preventDefault());
  new ResizeObserver(renderVolume).observe(slider);
  requestAnimationFrame(renderVolume);
  controls.appendChild(volume);

  ${controlMode ? `let turboEnabled = false;
  let turboLevel = 3;
  const turboScales = { 2: 2, 3: 3, 4: 4 };
  const turboFramerates = { 2: 83, 3: 167, 4: 250 };
  const turboArea = document.createElement('div');
  turboArea.id = 'scrapp-turbo-area';
  const turbo = document.createElement('button');
  turbo.id = 'scrapp-turbo';
  turbo.title = 'Turbo';
  turbo.setAttribute('aria-label', 'Turbo');
  turbo.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2 5 13h6l-.8 9L19 10h-6l.2-8z"/></svg>';
  const turboSpeeds = document.createElement('div');
  turboSpeeds.id = 'scrapp-turbo-speeds';
  const renderTurbo = () => {
    const speed = turboScales[turboLevel];
    setScrappClockScale(turboEnabled ? speed : 1);
    setScrappAudioScale(turboEnabled ? speed : 1);
    if (typeof vm.setTurboMode === 'function') vm.setTurboMode(turboEnabled);
    if (typeof vm.setFramerate === 'function') vm.setFramerate(turboEnabled ? turboFramerates[turboLevel] : 30);
    if (vm.runtime) vm.runtime.turboMode = turboEnabled;
    turbo.classList.toggle('active', turboEnabled);
    turbo.setAttribute('aria-pressed', String(turboEnabled));
    turbo.title = turboEnabled ? 'Turbo activado (' + turboLevel + 'x)' : 'Turbo';
    for (const button of turboSpeeds.children) {
      button.classList.toggle('selected', turboEnabled && Number(button.dataset.level) === turboLevel);
    }
  };
  turbo.addEventListener('click', () => {
    turboEnabled = !turboEnabled;
    renderTurbo();
  });
  for (const level of [2, 3, 4]) {
    const speedButton = document.createElement('button');
    speedButton.type = 'button';
    speedButton.className = 'scrapp-turbo-speed';
    speedButton.textContent = level + 'x';
    speedButton.dataset.level = String(level);
    speedButton.addEventListener('click', () => {
      const wasSelected = turboEnabled && turboLevel === level;
      turboLevel = level;
      turboEnabled = !wasSelected;
      renderTurbo();
    });
    turboSpeeds.appendChild(speedButton);
  }
  turboArea.append(turbo, turboSpeeds);
  controls.appendChild(turboArea);` : ""}

  document.body.prepend(bar);
  document.body.appendChild(controls);
  scaffolding.relayout();
});
`;
}

module.exports = {
  applyPreloadPolicy,
  applyWindowPolicy,
  createCustomWindowJs,
  customWindowCss,
};
