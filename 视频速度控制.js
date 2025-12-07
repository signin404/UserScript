// ==UserScript==
// @name         视频速度控制
// @description  +加速|-减速|/重置|*自定义
// @namespace    http://tampermonkey.net/
// @match        *://*/*
// @grant        GM_addStyle
// @version      1.6
// @author       Gemini
// @license      GPLv3
// @icon      data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iIzI5MkYzMyIgZD0iTTE2IDVoNHYzaC00eiIvPjxwYXRoIGZpbGw9IiM4ODk5QTYiIGQ9Ik0yMiAxaC04Yy0xLjEgMC0yIC45LTIgMnMuOSAyIDIgMmg4YzEuMSAwIDItLjkgMi0ycy0uOS0yLTItMm02LjE4NCAxMC41MDctMS41MDQtMS4zMThhMi4wMDYgMi4wMDYgMCAwIDEtLjE4Ni0yLjgyMiAyLjAwNiAyLjAwNiAwIDAgMSAyLjgyMi0uMTg2bDEuNTA0IDEuMzE4Yy44MjcuNzI1LjkxMSAxLjk5NS4xODYgMi44MjJhMi4wMDYgMi4wMDYgMCAwIDEtMi44MjIuMTg2Ii8+PGNpcmNsZSBjeD0iMTgiIGN5PSIyMSIgcj0iMTEiIGZpbGw9IiNGNUY4RkEiLz48cGF0aCBmaWxsPSIjNjY3NTdGIiBkPSJNMTggN0MxMC4yNjggNyA0IDEzLjI2OCA0IDIxczYuMjY4IDE0IDE0IDE0IDE0LTYuMjY4IDE0LTE0UzI1LjczMiA3IDE4IDdtMCAyNWMtNi4wNjUgMC0xMS00LjkzNS0xMS0xMXM0LjkzNS0xMSAxMS0xMSAxMSA0LjkzNSAxMSAxMS00LjkzNSAxMS0xMSAxMSIvPjxwYXRoIGZpbGw9IiMyOTJGMzMiIGQ9Ik0yNyAyMkgxN2ExIDEgMCAxIDEgMC0yaDEwYTEgMSAwIDEgMSAwIDIiLz48Y2lyY2xlIGN4PSIxOCIgY3k9IjEyIiByPSIxIiBmaWxsPSIjMjkyRjMzIi8+PGNpcmNsZSBjeD0iMTgiIGN5PSIzMCIgcj0iMSIgZmlsbD0iIzI5MkYzMyIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTUiIHI9IjEiIGZpbGw9IiMyOTJGMzMiLz48Y2lyY2xlIGN4PSIyNCIgY3k9IjI3IiByPSIxIiBmaWxsPSIjMjkyRjMzIi8+PGNpcmNsZSBjeD0iOSIgY3k9IjIxIiByPSIxIiBmaWxsPSIjMjkyRjMzIi8+PGNpcmNsZSBjeD0iMjQiIGN5PSIxNSIgcj0iMSIgZmlsbD0iIzI5MkYzMyIvPjxwYXRoIGZpbGw9IiNERDJFNDQiIGQ9Ik0xMiAyOGEuOTk5Ljk5OSAwIDAgMS0uNzA3LTEuNzA3bDctN2EuOTk5Ljk5OSAwIDEgMSAxLjQxNCAxLjQxNGwtNyA3QTEgMSAwIDAgMSAxMiAyOCIvPjwvc3ZnPg==
// ==/UserScript==

(function() {
    'use strict';

    const PRESET_SPEEDS = [1.0, 1.2, 1.5, 1.7, 2.0];
    const SPEED_DISPLAY_DURATION = 2000; // ms

    let speedDisplayElement = null;
    let speedDisplayTimeout = null;
    let customSpeedInputContainer = null;

    // --- Styling ---
    GM_addStyle(`
        .userscript-speed-indicator {
            position: absolute;
            top: 10px;
            right: 10px;
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 8px 15px;
            font-size: 16px;
            z-index: 2147483647;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
        }
        .userscript-speed-indicator.visible {
            opacity: 1;
        }
        .userscript-custom-speed-input-container {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(30, 30, 30, 0.95);
            padding: 15px;
            box-shadow: 0 0 15px rgba(0,0,0,0.5);
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .userscript-custom-speed-input-container label {
            color: white;
            font-size: 16px;
            margin-bottom: 10px;
        }
        .userscript-custom-speed-input-container input[type="number"] {
            padding: 6px;
            font-size: 16px;
            width: 70px;
            text-align: center;
            border: 1px solid #555;
            background-color: #323232;
            color: white;
        }
        .userscript-custom-speed-input-container input[type=number]::-webkit-inner-spin-button,
        .userscript-custom-speed-input-container input[type=number]::-webkit-outer-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
        .userscript-custom-speed-input-container input[type=number] {
            -moz-appearance: textfield;
        }
    `);

    /**
     * Finds the most relevant video/media element on the page.
     */
    function getTargetVideoElement() {
        const activeElement = document.activeElement;
        const videoSelectors = [
            'video',
            'div[data-video]',
            'div[data-src*="video"]',
            'div[class*="video"]',
            'div[id*="video"]',
            'object[type*="video"]',
            'embed[src*="video"]'
        ];
        const fullSelector = videoSelectors.join(', ');

        if (activeElement) {
            if (typeof activeElement.playbackRate === 'number' && activeElement.matches(fullSelector)) {
                return activeElement;
            }
            const containingElement = activeElement.closest(fullSelector);
            if (containingElement) {
                const video = containingElement.querySelector('video');
                if (video) return video;
                if (typeof containingElement.playbackRate === 'number') return containingElement;
            }
        }

        let videos = [];
        const potentialElements = document.querySelectorAll(fullSelector);
        potentialElements.forEach(el => {
            if (el.tagName === 'VIDEO') {
                if (!videos.includes(el)) videos.push(el);
            } else if (['EMBED', 'OBJECT'].includes(el.tagName)) {
                if (typeof el.playbackRate === 'number' && !videos.includes(el)) videos.push(el);
            } else {
                const videoInside = el.querySelector('video');
                if (videoInside && !videos.includes(videoInside)) videos.push(videoInside);
            }
        });

        if (activeElement) {
            for (const video of videos) {
                if (video.contains(activeElement)) return video;
                const playerWrapper = video.closest('.html5-video-player, .player, .video-player, [role="application"]');
                if (playerWrapper && playerWrapper.contains(activeElement) && playerWrapper.contains(video)) {
                    return video;
                }
            }
        }

        const visibleVideos = videos.filter(v =>
            v.offsetWidth > 0 &&
            v.offsetHeight > 0 &&
            (v.duration > 0 || !['VIDEO'].includes(v.tagName))
        );

        if (visibleVideos.length === 0) return null;
        if (visibleVideos.length === 1) return visibleVideos[0];

        let largestVideo = null;
        let maxArea = 0;
        for (const video of visibleVideos) {
            const area = video.offsetWidth * video.offsetHeight;
            if (area > maxArea) {
                maxArea = area;
                largestVideo = video;
            }
        }
        return largestVideo;
    }


    function showSpeed(videoElement, speed) {
        if (!videoElement) return;
        const videoRect = videoElement.getBoundingClientRect();
        const parent = videoElement.parentNode || document.body;

        if (!speedDisplayElement || !speedDisplayElement.parentNode) {
            speedDisplayElement = document.createElement('div');
            speedDisplayElement.className = 'userscript-speed-indicator';
            parent.appendChild(speedDisplayElement);
        }

        if (parent !== document.body) {
            speedDisplayElement.style.position = 'absolute';
            const parentRect = parent.getBoundingClientRect();
            speedDisplayElement.style.top = (videoRect.top - parentRect.top + 10) + 'px';
            speedDisplayElement.style.right = (parentRect.right - videoRect.right + 10) + 'px';
        } else {
            speedDisplayElement.style.position = 'fixed';
            speedDisplayElement.style.top = '10px';
            speedDisplayElement.style.right = '10px';
        }

        speedDisplayElement.textContent = `速度: ${speed.toFixed(1)}x`;
        speedDisplayElement.classList.add('visible');

        if (speedDisplayTimeout) clearTimeout(speedDisplayTimeout);
        speedDisplayTimeout = setTimeout(() => {
            if (speedDisplayElement) speedDisplayElement.classList.remove('visible');
        }, SPEED_DISPLAY_DURATION);
    }

    function removeCustomInput(videoElementToFocus) {
        if (customSpeedInputContainer) {
            customSpeedInputContainer.remove();
            customSpeedInputContainer = null;
            if (videoElementToFocus) videoElementToFocus.focus();
        }
    }

    function showCustomSpeedInput(videoElement) {
        if (!videoElement) return;
        removeCustomInput();

        customSpeedInputContainer = document.createElement('div');
        customSpeedInputContainer.className = 'userscript-custom-speed-input-container';

        const label = document.createElement('label');
        label.textContent = '速度';
        customSpeedInputContainer.appendChild(label);

        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.1';
        input.min = '0.1';
        input.max = '16';
        input.value = videoElement.playbackRate.toFixed(1);
        customSpeedInputContainer.appendChild(input);

        const videoContainer = videoElement.parentNode || document.body;
        videoContainer.appendChild(customSpeedInputContainer);
        input.focus();
        input.select();

        input.addEventListener('blur', () => {
             removeCustomInput(videoElement);
        });

        input.addEventListener('wheel', (e) => {
            if (document.activeElement === input) {
                e.preventDefault();
                 const currentValue = parseFloat(input.value);
                 if (!isNaN(currentValue)) {
                     const step = parseFloat(input.step) || 0.1;
                     if (e.deltaY < 0) {
                         input.value = (currentValue + step).toFixed(1);
                     } else {
                         input.value = (currentValue - step).toFixed(1);
                     }
                 }
            }
        }, { passive: false });
    }


    function handleKeydown(event) {
        const isCustomInputFocused = customSpeedInputContainer && customSpeedInputContainer.contains(event.target);
        const isAnyOtherInputFocused = !isCustomInputFocused && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName));

        if (isAnyOtherInputFocused) {
            return;
        }

        if (isCustomInputFocused) {
            event.stopPropagation();
            const video = getTargetVideoElement();

            if (event.code === 'Enter' || event.code === 'NumpadEnter') {
                event.preventDefault();
                const input = customSpeedInputContainer.querySelector('input');
                const newSpeed = parseFloat(input.value);
                if (video && !isNaN(newSpeed) && newSpeed >= 0.1 && newSpeed <= 16) {
                    video.playbackRate = newSpeed;
                    showSpeed(video, newSpeed);
                }
                removeCustomInput(video);
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                removeCustomInput(video);
                return;
            }

            const isSpeedControlKey = ['+', '=', '-', '_', '/', '*'].includes(event.key) ||
                                      ['NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide'].includes(event.code);

            if (!isSpeedControlKey) {
                return;
            }
        }

        if (!isCustomInputFocused) {
            const usedNumpadCodes = ['NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide'];
            if (event.code.startsWith('Numpad') && !usedNumpadCodes.includes(event.code)) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
        }

        const video = getTargetVideoElement();

        if (!video && event.key !== '*') {
            return;
        }

        let currentSpeed = video ? video.playbackRate : 1.0;
        let newSpeed = currentSpeed;
        let speedChanged = false;

        switch (event.key) {
            case '+':
            case '=':
                if (!video) return;
                let currentIndexPlus = -1;
                for(let i=0; i < PRESET_SPEEDS.length; i++) {
                    if (Math.abs(currentSpeed - PRESET_SPEEDS[i]) < 0.01) {
                        currentIndexPlus = i;
                        break;
                    }
                }
                if (currentIndexPlus === -1) {
                    for(let i = PRESET_SPEEDS.length - 1; i >= 0; i--) {
                        if (currentSpeed > PRESET_SPEEDS[i]) {
                            currentIndexPlus = i;
                            break;
                        }
                    }
                     if (currentIndexPlus === -1 && currentSpeed < PRESET_SPEEDS[0]) {
                        newSpeed = PRESET_SPEEDS[0];
                        speedChanged = true;
                        break;
                    }
                }

                if (currentIndexPlus < PRESET_SPEEDS.length - 1) {
                    newSpeed = PRESET_SPEEDS[currentIndexPlus + 1];
                } else {
                    newSpeed = PRESET_SPEEDS[0];
                }
                speedChanged = true;
                break;

            case '-':
            case '_':
                if (!video) return;
                let currentIndexMinus = -1;
                for(let i=0; i < PRESET_SPEEDS.length; i++) {
                     if (Math.abs(currentSpeed - PRESET_SPEEDS[i]) < 0.01) {
                        currentIndexMinus = i;
                        break;
                    }
                }
                if (currentIndexMinus === -1) {
                     for(let i = 0; i < PRESET_SPEEDS.length; i++) {
                        if (currentSpeed < PRESET_SPEEDS[i]) {
                            currentIndexMinus = i;
                            break;
                        }
                    }
                     if (currentIndexMinus === -1 && currentSpeed > PRESET_SPEEDS[PRESET_SPEEDS.length-1]) {
                        newSpeed = PRESET_SPEEDS[PRESET_SPEEDS.length-1];
                        speedChanged = true;
                        break;
                    } else if (currentIndexMinus === -1) {
                        newSpeed = PRESET_SPEEDS[PRESET_SPEEDS.length-1];
                        speedChanged = true;
                        break;
                    }
                }

                if (currentIndexMinus > 0) {
                    newSpeed = PRESET_SPEEDS[currentIndexMinus - 1];
                } else {
                    newSpeed = PRESET_SPEEDS[PRESET_SPEEDS.length - 1];
                }
                speedChanged = true;
                break;

            case '/':
                if (!video) return;
                newSpeed = 1.0;
                speedChanged = true;
                break;

            case '*':
                event.preventDefault();
                if (customSpeedInputContainer) {
                    removeCustomInput(video);
                } else {
                    if (video) {
                        showCustomSpeedInput(video);
                    }
                }
                return;
        }

        if (speedChanged && video) {
            event.preventDefault();
            newSpeed = Math.max(0.07, Math.min(16, newSpeed));
            video.playbackRate = newSpeed;
            showSpeed(video, newSpeed);

            // --- 新增：同步更新输入框的值 ---
            if (customSpeedInputContainer) {
                const input = customSpeedInputContainer.querySelector('input');
                if (input) {
                    input.value = newSpeed.toFixed(1);
                }
            }
        }
    }

    window.addEventListener('keydown', handleKeydown, true);

    window.addEventListener('unload', () => {
        if (speedDisplayElement) speedDisplayElement.remove();
        if (customSpeedInputContainer) customSpeedInputContainer.remove();
        if (speedDisplayTimeout) clearTimeout(speedDisplayTimeout);
        window.removeEventListener('keydown', handleKeydown, true);
    });

})();