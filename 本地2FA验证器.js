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
// @version      12.2
// @author       Gemini
// @license      GPLv3
// ==/UserScript==

(function() {
    'use strict';

    /*
     * =================================================================================
     * INLINED LIBRARY: otpauth
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
     * STYLING (Dark Mode & Sharp Edges)
     * ================================================================================= */
    GM_addStyle(`
        #totp-container { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 340px; background-color: rgb(44, 44, 44); border: 1px solid #555; border-radius: 0; box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 999999; color: #eee; display: flex; flex-direction: column; }
        #totp-header { padding: 10px 15px; cursor: move; background-color: #333; border-bottom: 1px solid #555; display: flex; justify-content: space-between; align-items: center; border-radius: 0; }
        #totp-header h3 { margin: 0; font-size: 15px; font-weight: 600; color: #fff; }
        #totp-close-btn { cursor: pointer; font-size: 20px; line-height: 1; color: #aaa; border: none; background: none; padding: 0; }
        #totp-close-btn:hover { color: #fff; }
        #totp-search-container { padding: 2px; border-bottom: 1px solid #555; background: rgb(44, 44, 44); }
        #totp-search-box { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #666; border-radius: 0; font-size: 12px; outline: none; background-color: #222; color: #fff; }
        #totp-search-box:focus { border-color: #007bff; }
        #totp-list { list-style: none; padding: 0; margin: 0; max-height: 400px; overflow-y: auto; background: rgb(44, 44, 44); scrollbar-width: thin; scrollbar-color: #666 #333; }
        #totp-list::-webkit-scrollbar { width: 8px; }
        #totp-list::-webkit-scrollbar-track { background: #333; }
        #totp-list::-webkit-scrollbar-thumb { background-color: #666; border-radius: 0; }
        .totp-item { padding: 12px 15px; border-bottom: 1px solid #555; position: relative; }
        .totp-item:last-child { border-bottom: none; }
        .totp-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .totp-name { font-size: 14px; font-weight: 600; color: #ddd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; }
        .totp-actions { display: flex; gap: 5px; }
        .totp-btn-sm { cursor: pointer; font-size: 11px; border: 1px solid #666; border-radius: 0; padding: 2px 6px; background-color: #333; color: #ccc; transition: all 0.2s; }
        .totp-btn-sm:hover { background-color: #555; color: #fff; }
        .totp-delete-btn { color: #ff6b6b; border-color: #a33; }
        .totp-delete-btn:hover { background-color: #a33; color: white; }
        .totp-edit-btn { color: #4dabf7; border-color: #0056b3; }
        .totp-edit-btn:hover { background-color: #0056b3; color: white; }
        .totp-code { font-size: 20px; font-weight: bold; letter-spacing: 3px; color: #4dabf7; cursor: pointer; text-align: center; margin: 5px 0; user-select: none; text-shadow: 0 0 2px rgba(0,0,0,0.5); }
        .totp-code:active { transform: scale(0.98); }
        .totp-progress-bar { width: 100%; height: 4px; background-color: rgb(68, 68, 68); border-radius: 0; overflow: hidden; margin-top: 5px; }
        .totp-progress { height: 100%; background-color: #28a745; transition: width 1s linear; }
        #totp-add-btn-container { padding: 10px; border-top: 1px solid #555; background: rgb(44, 44, 44); border-radius: 0; }
        #totp-add-btn { width: 100%; padding: 8px; font-size: 14px; cursor: pointer; background-color: #28a745; color: white; border: none; border-radius: 0; font-weight: 500; }
        #totp-add-btn:hover { background-color: #218838; }

        /* Modal Styles */
        #totp-modal-overlay { display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000000; border-radius: 0; align-items: center; justify-content: center; }
        #totp-modal { background: rgb(44, 44, 44); padding: 20px; border: 1px solid #666; border-radius: 0; box-shadow: 0 4px 15px rgba(0,0,0,0.5); width: 85%; box-sizing: border-box; color: #eee; }
        #totp-modal h4 { margin: 0 0 15px 0; font-size: 16px; color: #fff; text-align: center; }
        .totp-form-group { margin-bottom: 12px; }
        .totp-form-group label { display: block; font-size: 12px; color: #aaa; margin-bottom: 4px; }
        .totp-form-group input { width: 100%; padding: 6px; box-sizing: border-box; border: 1px solid #666; border-radius: 0; font-size: 13px; background-color: #222; color: #fff; }
        .totp-form-group input:focus { border-color: #4dabf7; outline: none; }
        .totp-modal-btns { display: flex; justify-content: space-between; margin-top: 15px; gap: 10px; }
        .totp-modal-btn { flex: 1; padding: 8px; border: none; border-radius: 0; cursor: pointer; font-size: 13px; color: #fff; }
        #totp-modal-save { background-color: #007bff; }
        #totp-modal-save:hover { background-color: #0056b3; }
        #totp-modal-cancel { background-color: #555; }
        #totp-modal-cancel:hover { background-color: #444; }
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
        <div id="totp-add-btn-container"><button id="totp-add-btn">添加密钥</button></div>

        <!-- Custom Modal -->
        <div id="totp-modal-overlay">
            <div id="totp-modal">
                <h4 id="totp-modal-title">添加密钥</h4>
                <div class="totp-form-group">
                    <label>名称</label>
                    <input type="text" id="totp-input-name" placeholder="例如: Google">
                </div>
                <div class="totp-form-group">
                    <label>密钥 (Base32)</label>
                    <input type="text" id="totp-input-secret" placeholder="A-Z, 2-7">
                </div>
                <div class="totp-form-group">
                    <label>更新周期 (秒)</label>
                    <input type="number" id="totp-input-period" value="60" min="1">
                </div>
                <div class="totp-modal-btns">
                    <button id="totp-modal-cancel" class="totp-modal-btn">取消</button>
                    <button id="totp-modal-save" class="totp-modal-btn">保存</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(container);
    container.style.display = 'none';

    // Elements
    const totpList = document.getElementById('totp-list');
    const closeBtn = document.getElementById('totp-close-btn');
    const addBtn = document.getElementById('totp-add-btn');
    const header = document.getElementById('totp-header');
    const searchBox = document.getElementById('totp-search-box');

    // Modal Elements
    const modalOverlay = document.getElementById('totp-modal-overlay');
    const modalTitle = document.getElementById('totp-modal-title');
    const inputName = document.getElementById('totp-input-name');
    const inputSecret = document.getElementById('totp-input-secret');
    const inputPeriod = document.getElementById('totp-input-period');
    const btnSave = document.getElementById('totp-modal-save');
    const btnCancel = document.getElementById('totp-modal-cancel');

    let updateInterval = null;
    let secretsMap = new Map(); // Stores { secret: string, period: number }
    let editingKey = null; // Tracks original name if we are editing

    // --- Helper: Get Data safely ---
    async function getStoredData(key) {
        const raw = await GM_getValue(key);
        if (!raw) return null;
        try {
            const data = JSON.parse(raw);
            if (data && typeof data === 'object' && data.secret) {
                return { secret: data.secret, period: parseInt(data.period) || 30 };
            }
        } catch (e) {
            // Not JSON, assume legacy string format
        }
        return { secret: raw, period: 30 };
    }

    async function generateTOTP(secretData) {
        try {
            let totp = new otpauth.TOTP({
                secret: otpauth.Secret.fromBase32(secretData.secret.replace(/\s/g, '')),
                period: secretData.period
            });
            return await totp.generate();
        } catch (e) {
            console.error(`Failed to generate token`, e);
            return "错误";
        }
    }

    function updateCodeElement(codeElement, code) {
        if (code !== "错误") {
            codeElement.textContent = `${code.substring(0, 3)} ${code.substring(3, 6)}`;
            codeElement.style.color = '#4dabf7';
        } else {
            codeElement.textContent = "生成失败";
            codeElement.style.color = "#ff6b6b";
        }
    }

    async function buildAndPopulateUI() {
        const keys = await GM_listValues();
        secretsMap.clear();
        for (const key of keys) {
            if (key.startsWith('totp_')) {
                const name = key.substring(5);
                const data = await getStoredData(key);
                secretsMap.set(name, data);
            }
        }

        totpList.innerHTML = '';

        if (secretsMap.size === 0) {
            totpList.innerHTML = '<p style="text-align:center; color:#888; padding: 20px 0; font-size:13px;">无密钥</p>';
            return;
        }

        const sortedSecrets = new Map([...secretsMap.entries()].sort());

        for (const [name, data] of sortedSecrets.entries()) {
            const item = document.createElement('div');
            item.className = 'totp-item';
            item.setAttribute('data-name', name);
            item.innerHTML = `
                <div class="totp-item-header">
                    <span class="totp-name" title="${name}">${name}</span>
                    <div class="totp-actions">
                        <button class="totp-btn-sm totp-edit-btn">编辑</button>
                        <button class="totp-btn-sm totp-delete-btn">删除</button>
                    </div>
                </div>
                <div class="totp-code" title="点击复制">... ...</div>
                <div class="totp-progress-bar"><div class="totp-progress"></div></div>
            `;
            totpList.appendChild(item);

            const codeElement = item.querySelector('.totp-code');
            const initialCode = await generateTOTP(data);
            updateCodeElement(codeElement, initialCode);

            // Delete Action
            item.querySelector('.totp-delete-btn').addEventListener('click', async () => {
                if (confirm(`确定要删除密钥 "${name}" 吗?`)) {
                    await GM_deleteValue(`totp_${name}`);
                    buildAndPopulateUI();
                }
            });

            // Edit Action
            item.querySelector('.totp-edit-btn').addEventListener('click', () => {
                openModal(name, data.secret, data.period);
            });

            // Copy Action
            codeElement.addEventListener('click', () => {
                const currentCode = codeElement.textContent.replace(/\s/g, '');
                if (currentCode && currentCode.length === 6 && !isNaN(currentCode)) {
                    GM_setClipboard(currentCode);
                    const originalText = codeElement.textContent;
                    codeElement.textContent = '已复制';
                    setTimeout(() => {
                        if (codeElement) {
                            codeElement.textContent = originalText;
                        }
                    }, 800);
                }
            });
        }
    }

    async function updateUI() {
        const now = Date.now() / 1000;

        for (const [name, data] of secretsMap.entries()) {
            const item = totpList.querySelector(`.totp-item[data-name="${CSS.escape(name)}"]`);
            if (item) {
                const period = data.period || 30;
                const remainingTime = period - (Math.floor(now) % period);

                // Update Progress Bar
                const progressElement = item.querySelector('.totp-progress');
                const percentage = (remainingTime / period) * 100;
                progressElement.style.width = `${percentage}%`;

                // Color indication for last 5 seconds
                if (remainingTime <= 5) {
                    progressElement.style.backgroundColor = '#ff6b6b'; // Red
                } else {
                    progressElement.style.backgroundColor = '#28a745'; // Green
                }

                // Update Code if new cycle
                if (Math.floor(remainingTime) === period || Math.floor(remainingTime) === 0 || item.querySelector('.totp-code').textContent.includes('.')) {
                     const codeElement = item.querySelector('.totp-code');
                     const newCode = await generateTOTP(data);
                     const currentDisplay = codeElement.textContent.replace(/\s/g, '');
                     if (currentDisplay !== newCode && currentDisplay !== '已复制') {
                         updateCodeElement(codeElement, newCode);
                     }
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
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // --- Modal Logic ---

    function openModal(name = '', secret = '', period = 60) {
        editingKey = name || null; // Store original name if editing

        modalTitle.textContent = editingKey ? '编辑密钥' : '添加新密钥';
        inputName.value = name;
        // inputName.disabled = !!editingKey; // REMOVED: Now we allow editing name
        inputSecret.value = secret;
        inputPeriod.value = period;

        modalOverlay.style.display = 'flex';
        if (!editingKey) inputName.focus();
        else inputSecret.focus();
    }

    function closeModal() {
        modalOverlay.style.display = 'none';
        inputName.value = '';
        inputSecret.value = '';
        inputPeriod.value = 60;
        editingKey = null;
    }

    async function saveFromModal() {
        const newName = inputName.value.trim();
        const secret = inputSecret.value.trim().replace(/\s/g, '');
        const period = parseInt(inputPeriod.value) || 60;

        if (!newName) { alert("请输入名称"); return; }
        if (!secret) { alert("请输入密钥"); return; }
        if (!/^[A-Z2-7=]+$/i.test(secret)) {
            alert("密钥格式无效");
            return;
        }

        const data = { secret: secret, period: period };

        // Rename Logic
        if (editingKey && editingKey !== newName) {
            // Check if new name already exists
            const existing = await GM_getValue(`totp_${newName}`);
            if (existing) {
                if (!confirm(`名称 "${newName}" 已存在 是否覆盖?`)) {
                    return;
                }
            }
            // Delete old key
            await GM_deleteValue(`totp_${editingKey}`);
        } else if (!editingKey) {
            // New entry check
            const existing = await GM_getValue(`totp_${newName}`);
            if (existing) {
                if (!confirm(`名称 "${newName}" 已存在 是否覆盖?`)) {
                    return;
                }
            }
        }

        await GM_setValue(`totp_${newName}`, JSON.stringify(data));

        closeModal();
        buildAndPopulateUI();
    }

    // --- Main Container Logic ---

    async function showContainer() {
        container.style.display = 'flex';
        searchBox.value = '';
        filterEntries();
        await buildAndPopulateUI();

        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(updateUI, 1000);
        updateUI();
    }

    function hideContainer() {
        container.style.display = 'none';
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
    }

    function toggleContainer() {
        if (container.style.display === 'none') showContainer();
        else hideContainer();
    }

    // --- Event Listeners ---

    GM_registerMenuCommand("显示验证器", toggleContainer);

    closeBtn.addEventListener('click', hideContainer);
    addBtn.addEventListener('click', () => openModal());
    searchBox.addEventListener('input', filterEntries);

    // Modal Events
    btnCancel.addEventListener('click', closeModal);
    btnSave.addEventListener('click', saveFromModal);

    // Dragging Logic
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
            e.preventDefault();
            container.style.left = `${e.clientX - offsetX}px`;
            container.style.top = `${e.clientY - offsetY}px`;
        }
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
        header.style.cursor = 'move';
    });

})();