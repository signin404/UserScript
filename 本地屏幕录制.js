// ==UserScript==
// @name         本地屏幕录制
// @description  调用Screen Capture API进行录制
// @namespace    http://tampermonkey.net/
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @version      1.1
// @author       Gemini
// @license      GPLv3
// @icon      data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PGNpcmNsZSBjeD0iMTgiIGN5PSIxOCIgcj0iMTgiIGZpbGw9IiNERDJFNDQiLz48L3N2Zz4=
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

        // --- 1. 触发下载 ---
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        // 文件名格式化 例如：screen-recording-2025-07-28_14-30-00.webm
        a.download = `screen-recording-${new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();
        console.log('视频下载已触发');

        // --- 2. 打开新标签页播放 ---
        // 注意：浏览器可能会拦截非用户直接点击触发的弹窗 请留意地址栏拦截提示
        try {
            window.open(url, '_blank');
        } catch (e) {
        }

        // --- 3. 清理工作 ---
        setTimeout(() => {
            document.body.removeChild(a);
            // 注意：这里注释掉了 revokeObjectURL
            // 因为如果立即释放 URL 新打开的标签页可能还没加载完视频数据就失效了
            // 让浏览器在页面关闭时自动回收 或者设置一个很长的超时时间（例如 1 分钟）
            // window.URL.revokeObjectURL(url);
        }, 100);

        // 可选：设置一个较长的超时来释放内存（例如60秒后）
        // setTimeout(() => {
             // window.URL.revokeObjectURL(url);
        // }, 60000);
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
            console.warn('已经有录制任务在进行中');
            alert('已经有录制任务在进行中'); // 使用alert作为强提醒
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
                // 用户取消了选择
            } else {
                console.error("录制错误:", err);
            }
        }
    }

    // --- 注册Tampermonkey菜单命令 ---
    GM_registerMenuCommand('开始录制', startRecording);

})();