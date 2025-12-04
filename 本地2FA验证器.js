// ==UserScript==
// @name         本地2FA验证器
// @description  一个纯本地、离线的2FA(TOTP)验证码生成器
// @namespace    http://tampermonkey.net/
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @run-at       document-idle
// @version      12.1
// @author       Gemini
// @license      GPLv3
// ==/UserScript==

(function() {
    'use strict';

    /*
     * =================================================================================
     * INLINED LIBRARY: otpauth (Clean, unminified, correct source code)
     * =================================================================================
     */
    const otpauth = (() => {
        class OTPAuthError extends Error { constructor(message) { super(message); this.name = this.constructor.name; } }
        class Secret {
            constructor({ buffer } = {}) {
                if (!(buffer instanceof ArrayBuffer)) throw new OTPAuthError("Buffer must be an instance of 'ArrayBuffer'");
                this._buffer = buffer;
            }
            get buffer() { return this._buffer; }
            static fromBase32(base32) {
                const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
                const clean_base32 = base32.toUpperCase().replace(/=+$/, '');
                const bitsPerChar = 5;
                const bytes = new Uint8Array(Math.floor(clean_base32.length * bitsPerChar / 8));
                let bits = 0;
                let value = 0;
                let index = 0;
                for (let i = 0; i < clean_base32.length; i++) {
                    const charIndex = alphabet.indexOf(clean_base32[i]);
                    if (charIndex === -1) throw new OTPAuthError("Invalid Base32 character");
                    value = (value << bitsPerChar) | charIndex;
                    bits += bitsPerChar;
                    if (bits >= 8) {
                        bytes[index++] = (value >>> (bits - 8)) & 255;
                        bits -= 8;
                    }
                }
                return new Secret({ buffer: bytes.buffer });
            }
        }

        class TOTP {
            constructor({ secret, algorithm = 'SHA1', digits = 6, period = 30 } = {}) {
                if (!(secret instanceof Secret)) throw new OTPAuthError("Secret must be an instance of 'Secret'");
                this.secret = secret;
                this.algorithm = algorithm;
                this.digits = digits;
                this.period = period;
            }
            async generate({ timestamp = Date.now() } = {}) {
                const counter = Math.floor(timestamp / 1000 / this.period);
                const counterBuffer = new ArrayBuffer(8);
                const counterView = new DataView(counterBuffer);
                counterView.setUint32(0, Math.floor(counter / 4294967296));
                counterView.setUint32(4, counter & 0xFFFFFFFF);
                const cryptoAlgo = { name: 'HMAC', hash: `SHA-${this.algorithm.slice(3)}` };
                const key = await crypto.subtle.importKey('raw', this.secret.buffer, cryptoAlgo, false, ['sign']);
                const signature = await crypto.subtle.sign('HMAC', key, counterBuffer);
                const signatureView = new DataView(signature);
                const offset = signatureView.getUint8(signatureView.byteLength - 1) & 0x0f;
                let value = signatureView.getUint32(offset);
                value &= 0x7fffffff;
                value %= Math.pow(10, this.digits);
                return value.toString().padStart(this.digits, '0');
            }
        }
        return { Secret, TOTP };
    })();

    /* =================================================================================
     * STYLING (CENTERED & SHARP EDGES)
     * ================================================================================= */
    GM_addStyle(`
        #totp-container { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 320px; background-color: #f9f9f9; border: 1px solid #ccc; border-radius: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #333; }
        #totp-header { padding: 5px 15px; cursor: move; background-color: #efefef; border-bottom: 1px solid #ccc; display: flex; justify-content: space-between; align-items: center; }
        #totp-header h3 { margin: 0; font-size: 14px; font-weight: 600; color: #333333; }
        #totp-close-btn { cursor: pointer; font-size: 20px; font-weight: bold; color: #888; border: none; background: none; }
        #totp-search-container { padding: 1px; border-bottom: 1px solid #ccc; }
        #totp-search-box { width: 100%; box-sizing: border-box; padding: 4px; border: 1px solid #ccc; border-radius: 0; font-size: 4px; background-color: #F9F9F9; color: #333333; height: 26px; }
        #totp-list { list-style: none; padding: 10px; margin: 0; max-height: 400px; overflow-y: auto; transition: height 0.2s; scrollbar-color: #8B8B8B #F9F9F9; }
        .totp-item { display: flex; flex-direction: column; padding: 12px; border-bottom: 1px solid #CCCCCC; }
        .totp-item:last-child { border-bottom: none; }
        .totp-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .totp-name { font-size: 14px; font-weight: 500; color: #333333; }
        .totp-delete-btn { cursor: pointer; color: #f44336; font-size: 12px; border: 1px solid #f44336; border-radius: 0; padding: 2px 6px; background-color: white; }
        .totp-delete-btn:hover { background-color: #f44336; color: white; }
        .totp-code { font-size: 20px; font-weight: bold; letter-spacing: 2px; color: #007bff; cursor: pointer; text-align: center; min-height: 20px; display: flex; align-items: center; justify-content: center; }
        .totp-progress-bar { width: 100%; height: 4px; background-color: #e9ecef; border-radius: 0; margin-top: 8px; overflow: hidden; }
        .totp-progress { height: 100%; background-color: #007bff; transition: width 1s linear; }
        #totp-add-btn-container { padding: 10px; border-top: 1px solid #ccc; text-align: center; }
        #totp-add-btn { width: 100%; padding: 8px; font-size: 14px; cursor: pointer; background-color: #28a745; color: white; border: none; border-radius: 0; }
    `);

    /* =================================================================================
     * UI & CORE LOGIC
     * ================================================================================= */
    const container = document.createElement('div');
    container.id = 'totp-container';
    container.innerHTML = `
        <div id="totp-header"><h3>本地2FA验证器</h3><button id="totp-close-btn">&times;</button></div>
        <div id="totp-search-container"><input type="text" id="totp-search-box" placeholder="搜索..."></div>
        <div id="totp-list"></div>
        <div id="totp-add-btn-container"><button id="totp-add-btn">添加新密钥</button></div>
    `;
    document.body.appendChild(container);
    container.style.display = 'none';

    const totpList = document.getElementById('totp-list');
    const closeBtn = document.getElementById('totp-close-btn');
    const addBtn = document.getElementById('totp-add-btn');
    const header = document.getElementById('totp-header');
    const searchBox = document.getElementById('totp-search-box');

    let updateInterval = null;
    let secretsMap = new Map();

    async function generateTOTP(secret) {
        try {
            let totp = new otpauth.TOTP({
                secret: otpauth.Secret.fromBase32(secret.replace(/\s/g, ''))
            });
            return await totp.generate();
        } catch (e) {
            console.error(`Failed to generate token for secret "${secret}":`, e);
            return "错误";
        }
    }

    function updateCodeElement(codeElement, code) {
        if (code !== "错误") {
            codeElement.textContent = `${code.substring(0, 3)} ${code.substring(3, 6)}`;
            codeElement.style.color = '#007bff';
        } else {
            codeElement.textContent = "生成失败";
            codeElement.style.color = "#dc3545";
        }
    }

    async function buildAndPopulateUI() {
        const keys = await GM_listValues();
        secretsMap.clear();
        for (const key of keys) {
            if (key.startsWith('totp_')) {
                const name = key.substring(5);
                secretsMap.set(name, await GM_getValue(key));
            }
        }

        totpList.innerHTML = '';

        if (secretsMap.size === 0) {
            totpList.innerHTML = '<p style="text-align:center; color:#888; padding: 20px 0;">暂无密钥 请点击下方按钮添加</p>';
            return;
        }

        const sortedSecrets = new Map([...secretsMap.entries()].sort());

        for (const [name, secret] of sortedSecrets.entries()) {
            const item = document.createElement('div');
            item.className = 'totp-item';
            item.setAttribute('data-name', name);
            item.innerHTML = `
                <div class="totp-item-header">
                    <span class="totp-name">${name}</span>
                    <button class="totp-delete-btn">删除</button>
                </div>
                <div class="totp-code" title="点击复制">... ...</div>
                <div class="totp-progress-bar"><div class="totp-progress"></div></div>
            `;
            totpList.appendChild(item);

            const codeElement = item.querySelector('.totp-code');
            const initialCode = await generateTOTP(secret);
            updateCodeElement(codeElement, initialCode);

            item.querySelector('.totp-delete-btn').addEventListener('click', async () => {
                if (confirm(`确定要删除密钥 "${name}" 吗？此操作不可撤销！`)) {
                    await GM_deleteValue(`totp_${name}`);
                    hideContainer();
                    showContainer();
                }
            });

            codeElement.addEventListener('click', () => {
                const currentCode = codeElement.textContent.replace(/\s/g, '');
                if (currentCode && currentCode.length === 6 && !isNaN(currentCode)) {
                    GM_setClipboard(currentCode);
                    const originalText = codeElement.textContent;
                    codeElement.textContent = '已复制!';
                    setTimeout(() => { if (codeElement) codeElement.textContent = originalText; }, 1000);
                }
            });
        }
    }

    async function updateUI() {
        const remainingTime = 30 - (Math.floor(Date.now() / 1000) % 30);
        const isNewCycle = remainingTime === 30;

        for (const [name, secret] of secretsMap.entries()) {
            const item = totpList.querySelector(`.totp-item[data-name="${CSS.escape(name)}"]`);
            if (item) {
                const progressElement = item.querySelector('.totp-progress');
                progressElement.style.width = `${(remainingTime / 30) * 100}%`;

                if (isNewCycle) {
                    const codeElement = item.querySelector('.totp-code');
                    const newCode = await generateTOTP(secret);
                    updateCodeElement(codeElement, newCode);
                }
            }
        }
    }

    function filterEntries() {
        const searchTerm = searchBox.value.toLowerCase();
        const items = totpList.querySelectorAll('.totp-item');
        items.forEach(item => {
            const name = item.getAttribute('data-name').toLowerCase();
            if (name.includes(searchTerm)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    async function addNewSecret() {
        const name = prompt("请输入此密钥的名称:");
        if (!name) return;
        const secret = prompt("请输入服务提供商的2FA密钥:");
        if (!secret) return;
        if (!/^[A-Z2-7=]+$/i.test(secret.replace(/\s/g, ''))) {
            alert("密钥格式无效它应该只包含字母A-Z和数字2-7");
            return;
        }
        await GM_setValue(`totp_${name}`, secret);
        alert(`密钥 "${name}" 已成功添加！`);
        hideContainer();
        showContainer();
    }

    async function showContainer() {
        container.style.top = '50%';
        container.style.left = '50%';
        container.style.transform = 'translate(-50%, -50%)';
        searchBox.value = '';
        container.style.display = 'block';

        await buildAndPopulateUI();

        // --- KEY FIX: Lock the list height after it's populated ---
        const listHeight = totpList.offsetHeight;
        totpList.style.height = `${listHeight}px`;

        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(updateUI, 1000);
    }

    function hideContainer() {
        container.style.display = 'none';
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
        // --- KEY FIX: Unlock the list height when hidden ---
        totpList.style.height = 'auto';
    }

    function toggleContainer() {
        if (container.style.display === 'none') showContainer();
        else hideContainer();
    }

    GM_registerMenuCommand("显示验证器", toggleContainer);
    //GM_registerMenuCommand("添加新密钥", addNewSecret);
    closeBtn.addEventListener('click', hideContainer);
    addBtn.addEventListener('click', addNewSecret);
    searchBox.addEventListener('input', filterEntries);

    let isDragging = false, offsetX, offsetY;
    header.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = container.getBoundingClientRect();
        container.style.transform = 'none';
        container.style.left = `${rect.left}px`;
        container.style.top = `${rect.top}px`;
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        header.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            container.style.left = `${e.clientX - offsetX}px`;
            container.style.top = `${e.clientY - offsetY}px`;
        }
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
        header.style.cursor = 'move';
    });

})();