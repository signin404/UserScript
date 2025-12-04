// ==UserScript==
// @name         本地屏幕录制
// @description  调用Screen Capture API进行录制
// @namespace    http://tampermonkey.net/
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @version      1.0
// @author       Gemini
// @license      GPLv3
// ==/UserScript==

(function() {
    'use strict';

    // --- 全局状态变量 ---
    let mediaRecorder;
    let recordedChunks = [];
    let mediaStream;

    /**
     * 将录制的视频块合成为Blob并触发下载
     */
    function downloadVideo() {
        if (recordedChunks.length === 0) {
            console.log('没有录制到数据 已取消下载');
            return;
        }
        const blob = new Blob(recordedChunks, {
            type: 'video/webm'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        // 文件名格式化 例如：screen-recording-2025-07-28_14-30-00.webm
        a.download = `screen-recording-${new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();

        console.log('视频下载已触发');

        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);
    }

    /**
     * 停止屏幕录制的核心逻辑
     * 这个函数由浏览器的 onended 事件调用 而不是由用户菜单调用
     */
    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop(); // 这会触发 onstop 事件
            mediaStream.getTracks().forEach(track => track.stop());
            console.log('录制已停止');
        }
    }

    /**
     * 异步函数：开始屏幕录制
     */
    async function startRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            console.warn('已经有一个录制任务在进行中');
            alert('已经有一个录制任务在进行中'); // 使用alert作为强提醒
            return;
        }

        // 重置状态以防万一
        recordedChunks = [];
        mediaRecorder = null;
        mediaStream = null;

        try {
            // 1. 请求用户授权屏幕共享
            mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: "always" },
                audio: { echoCancellation: true, noiseSuppression: true }
            });

            // 2. 当用户通过浏览器UI停止共享时 自动触发停止逻辑
            mediaStream.getVideoTracks()[0].onended = () => {
                stopRecording();
            };

            // 3. 创建MediaRecorder实例
            const options = { mimeType: 'video/webm; codecs=vp9' };
            mediaRecorder = new MediaRecorder(mediaStream, options);

            // 4. 定义数据可用时的处理
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };

            // 5. 定义停止时的处理 (最终下载的地方)
            mediaRecorder.onstop = () => {
                console.log('MediaRecorder已停止 准备下载...');
                downloadVideo();
            };

            // 6. 开始录制
            mediaRecorder.start();

        } catch (err) {
            if (err.name === 'NotAllowedError') {
            } else {
                console.error("录制错误:", err);
            }
        }
    }

    // --- 注册Tampermonkey菜单命令 ---
    // 只注册“开始录制”这一个命令
    GM_registerMenuCommand('开始录制', startRecording);

})();