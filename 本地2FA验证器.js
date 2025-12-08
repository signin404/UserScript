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
// @grant        GM_notification
// @run-at       document-idle
// @version      12.6
// @author       Gemini
// @license      GPLv3
// @icon      data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0MxNjk0RiIgZD0iTTMyLjYxNCAzLjQxNEMyOC4zMS0uODkgMjEuMzMyLS44OSAxNy4wMjcgMy40MTRjLTMuMzkxIDMuMzkyLTQuMDk4IDguNDM5LTIuMTQ0IDEyLjUzNWwtMy45MTYgMy45MTVhMi40NCAyLjQ0IDAgMCAwLS42MjUgMi4zNTlsLTEuOTczIDEuOTcyYTEuMjIgMS4yMiAwIDAgMC0xLjczMSAwbC0xLjczMSAxLjczMmExLjIyMyAxLjIyMyAwIDAgMCAwIDEuNzMybC0uODY3Ljg2NGExLjIyNCAxLjIyNCAwIDAgMC0xLjczMSAwbC0uODY2Ljg2N2ExLjIyMyAxLjIyMyAwIDAgMCAwIDEuNzMyYy4wMTUuMDE2LjAzNi4wMi4wNTEuMDMzYTMuMDYyIDMuMDYyIDAgMCAwIDQuNzExIDMuODYzTDIwLjA4IDIxLjE0NGM0LjA5NyAxLjk1NSA5LjE0NCAxLjI0NyAxMi41MzUtMi4xNDYgNC4zMDItNC4zMDIgNC4zMDItMTEuMjgtLjAwMS0xNS41ODRtLTEuNzMxIDUuMTk1YTIuNDUgMi40NSAwIDAgMS0zLjQ2NC0zLjQ2NCAyLjQ1IDIuNDUgMCAwIDEgMy40NjQgMy40NjQiLz48L3N2Zz4=
// ==/UserScript==

(function() {
    'use strict';

    /*
     * =================================================================================
     * LIBRARY: otpauth (Inlined)
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

    /*
     * =================================================================================
     * HELPER FUNCTIONS
     * =================================================================================
     */

    function getXPath(element) {
        const doc = element.ownerDocument;
        if (element.id !== '') {
            if (doc.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1) {
                return `//*[@id="${element.id}"]`;
            }
        }
        if (element === doc.body) return '/html/body';
        let ix = 1;
        let sibling = element.previousElementSibling;
        while (sibling) {
            if (sibling.tagName === element.tagName) ix++;
            sibling = sibling.previousElementSibling;
        }
        return getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + ix + ']';
    }

    function generateSelectorForElement(el) {
        const doc = el.ownerDocument;
        if (el.id) {
            const selector = `#${CSS.escape(el.id)}`;
            if (doc.querySelectorAll(selector).length === 1) {
                return { type: 'css', selector: selector };
            }
        }
        if (el.classList.length > 0) {
            const classSelector = '.' + Array.from(el.classList).map(c => CSS.escape(c)).join('.');
            const selector = el.tagName.toLowerCase() + classSelector;
            if (doc.querySelectorAll(selector).length === 1) {
                return { type: 'css', selector: selector };
            }
        }
        return { type: 'xpath', selector: getXPath(el) };
    }

    function findOptimalClickTarget(element) {
        let currentEl = element;
        const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'DETAILS'];
        const goodClassKeywords = ['btn', 'button', 'link', 'icon', 'item', 'action', 'nav', 'j-', 'js-', 'wrapper', 'container', 'submit', 'login', 'next'];

        while (currentEl && currentEl.tagName !== 'BODY') {
            if (currentEl.id && currentEl.ownerDocument.querySelectorAll('#' + CSS.escape(currentEl.id)).length === 1) return currentEl;
            if (interactiveTags.includes(currentEl.tagName)) return currentEl;
            const role = currentEl.getAttribute('role');
            if (role && ['button', 'link', 'menuitem', 'checkbox', 'switch'].includes(role)) return currentEl;
            const classList = Array.from(currentEl.classList);
            if (classList.some(c => goodClassKeywords.some(k => c.toLowerCase().includes(k)))) return currentEl;
            currentEl = currentEl.parentElement;
        }
        return element;
    }

    function getElementBySelector(type, selector) {
        if (!selector) return null;
        try {
            if (type === 'xpath') {
                const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                return result.singleNodeValue;
            } else {
                return document.querySelector(selector);
            }
        } catch (e) {
            return null;
        }
    }

    function triggerInputEvent(element, value) {
        if (!element) return;

        element.focus();

        // --- 核心修复开始 ---
        // 1. 获取浏览器原生的 value 设置器 (绕过 React/框架 的劫持)
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

        // 2. 使用原生设置器赋值
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(element, value);
        } else {
            element.value = value;
        }

        // 3. 派发 input 事件 (模拟真实输入)
        // bubbles: true 是必须的 composed: true 用于穿透 Shadow DOM
        const inputEvent = new Event('input', { bubbles: true, composed: true });
        element.dispatchEvent(inputEvent);

        // 4. 派发 change 事件 (兼容旧版框架)
        const changeEvent = new Event('change', { bubbles: true });
        element.dispatchEvent(changeEvent);

        // 5. 派发 blur 事件 (某些网站在失焦时校验)
        const blurEvent = new Event('blur', { bubbles: true });
        element.dispatchEvent(blurEvent);
        // --- 核心修复结束 ---
    }

    /* =================================================================================
     * STYLING
     * ================================================================================= */
    GM_addStyle(`
        /* Main Container */
        #totp-container { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 340px; background-color: rgb(44, 44, 44); border: 1px solid #555; box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 999999; color: #eee; display: flex; flex-direction: column; font-family: sans-serif; border-radius: 0; }

        /* Header Fixed Height */
        #totp-header {
            height: 40px; min-height: 40px; max-height: 40px;
            padding: 0 15px; cursor: move; background-color: #333; border-bottom: 1px solid #555;
            display: flex; justify-content: space-between; align-items: center; box-sizing: border-box;
        }
        #totp-header h3 { margin: 0; font-size: 15px; font-weight: 600; color: #fff; line-height: 1; }
        #totp-close-btn { cursor: pointer; font-size: 20px; line-height: 1; color: #aaa; border: none; background: none; padding: 0; }
        #totp-close-btn:hover { color: #fff; }

        /* --- 搜索框容器 --- */
        #totp-search-container {
            padding: 2px;
            border-bottom: 1px solid #555;
            background: rgb(44, 44, 44);
            height: 34px !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
        }
        /* --- 搜索输入框 --- */
        #totp-search-box {
            width: 100%;
            height: 30px !important;
            min-height: 30px !important;
            max-height: 30px !important;
            padding: 0 8px !important;
            border: 1px solid #666;
            background-color: #222;
            color: #fff;
            box-sizing: border-box !important;
            outline: none;
            border-radius: 0 !important;
            font-size: 13px !important;
            margin: 0 !important;
            vertical-align: top !important;
            line-height: 28px !important;
            display: block !important;
        }

        /* --- 列表容器 --- */
        #totp-list {
            list-style: none;
            padding: 0 !important;
            margin: 0 !important;
            max-height: 400px;
            overflow-y: auto;
            background: rgb(44, 44, 44);
        }

        /* --- 列表单项 --- */
        .totp-item {
            padding: 12px 15px !important;
            border-bottom: 1px solid #555;
            position: relative;
            margin: 0 !important;
            box-sizing: border-box !important;
            line-height: normal !important;
            width: 100% !important;
        }
        .totp-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }

        /* Name */
        .totp-name { font-size: 14px !important; font-weight: 600; color: #ddd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; }
        .totp-actions { display: flex; gap: 5px; }

        /* Edit/Delete Buttons */
        .totp-btn-sm {
            cursor: pointer;
            font-size: 12px !important;
            border: 1px solid #666;
            background-color: #333;
            color: #ccc;
            transition: all 0.2s;
            border-radius: 0 !important;
            width: 40px !important;
            height: 24px !important;
            padding: 0 !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            line-height: 1 !important;
            margin: 0 !important;
            box-sizing: border-box !important;
        }
        .totp-btn-sm:hover { background-color: #555; color: #fff; }
        .totp-delete-btn { color: #ff6b6b; border-color: #a33; }
        .totp-delete-btn:hover { background-color: #a33; color: white; }
        .totp-edit-btn { color: #4dabf7; border-color: #0056b3; }
        .totp-edit-btn:hover { background-color: #0056b3; color: white; }

        .totp-code { font-size: 20px; font-weight: bold; letter-spacing: 3px; color: #4dabf7; cursor: pointer; text-align: center; margin: 5px 0; user-select: none; text-shadow: 0 0 2px rgba(0,0,0,0.5); }
        .totp-code:active { transform: scale(0.98); }
        .totp-progress-bar { width: 100%; height: 4px; background-color: rgb(68, 68, 68); overflow: hidden; margin-top: 5px; }
        .totp-progress { height: 100%; background-color: #28a745; transition: width 1s linear; }

        /* Add Button */
        #totp-add-btn-container { padding: 10px; border-top: 1px solid #555; background: rgb(44, 44, 44); }
        #totp-add-btn {
            width: 100%; padding: 8px; font-size: 14px; cursor: pointer; background-color: #28a745; color: white;
            border: none; font-weight: 500; border-radius: 0 !important;
            display: flex !important; justify-content: center !important; align-items: center !important;
            line-height: normal !important; margin: 0 !important;
        }
        #totp-add-btn:hover { background-color: #218838; }

        /* Modal Overlay */
        #totp-modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: transparent; z-index: 1000000; align-items: center; justify-content: center; pointer-events: none; }

        /* Modal Box */
        #totp-modal { background: rgb(44, 44, 44); padding: 15px; border: 1px solid #666; box-shadow: 0 4px 25px rgba(0,0,0,0.7); width: 580px; max-height: 95vh; overflow-y: auto; box-sizing: border-box; color: #eee; display: flex; flex-direction: column; border-radius: 0 !important; pointer-events: auto; }

        /* --- FIXED SIZES FOR MODAL INPUTS --- */
        .totp-form-group input[type="text"],
        .totp-form-group input[type="password"],
        .totp-form-group input[type="number"],
        .totp-form-group select {
            width: 100%;
            height: 28px !important;
            line-height: 26px !important;
            padding: 0 6px !important;
            box-sizing: border-box !important;
            border: 1px solid #666;
            background-color: #222;
            color: #fff;
            outline: none;
            border-radius: 0 !important;
            text-align: center;
            font-size: 12px !important;
            vertical-align: middle !important;
            margin: 0 !important;
        }

        /* Hide Spinners */
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }

        .totp-form-group select { text-align: left !important; padding-top: 0 !important; padding-bottom: 0 !important; }
        .totp-form-group input:focus { border-color: #4dabf7; }

        /* Layout Classes */
        .totp-row {
            display: flex;
            gap: 8px;
            margin-bottom: 8px;
            align-items: center;
            height: 28px;
        }
        .totp-col-left { flex: 0 0 30%; min-width: 0; height: 28px; display: flex; align-items: center; }
        .totp-col-right { flex: 1; min-width: 0; height: 28px; display: flex; align-items: center; }

        .totp-input-group { display: flex; gap: 4px; width: 100%; height: 100%; align-items: center; }

        /* Pick Button */
        .totp-pick-btn {
            cursor: pointer; background: #555; color: white; border: 1px solid #777; padding: 0 8px;
            font-size: 11px !important; white-space: nowrap; border-radius: 0 !important;
            display: flex !important; justify-content: center !important; align-items: center !important;
            line-height: normal !important; margin: 0 !important;
            height: 28px !important;
            width: 42px !important;
            box-sizing: border-box !important;
        }
        .totp-pick-btn:hover { background: #666; }

        /* Modal Buttons */
        .totp-modal-btns { display: flex; justify-content: space-between; margin-top: 5px; gap: 10px; }
        .totp-modal-btn {
            flex: 1; padding: 0; border: none; cursor: pointer; font-size: 13px; color: #fff; border-radius: 0 !important;
            display: flex !important; justify-content: center !important; align-items: center !important;
            line-height: normal !important; margin: 0 !important;
            height: 30px !important;
        }
        #totp-modal-save { background-color: #007bff; }
        #totp-modal-save:hover { background-color: #0056b3; }
        #totp-modal-cancel { background-color: #555; }
        #totp-modal-cancel:hover { background-color: #444; }

        /* Section Title */
        .totp-section-title {
            font-size: 12px; font-weight: bold; color: #4dabf7; margin: 0 0 6px 0;
            border-bottom: 1px solid #555; padding-bottom: 2px;
            display: flex; align-items: center; justify-content: center;
        }

        .totp-subsection { border: 1px solid #444; padding: 8px; margin-bottom: 6px; background: #2a2a2a; }

        /* Placeholder styling */
        #totp-search-box::placeholder,
        #totp-modal input::placeholder { color: #888 !important; opacity: 1 !important; font-size: 12px !important; }
    `);

    /* =================================================================================
     * UI & CORE LOGIC
     * ================================================================================= */

    // 1. Main Widget Container
    const container = document.createElement('div');
    container.id = 'totp-container';
    container.innerHTML = `
        <div id="totp-header"><h3>本地2FA验证器</h3><button id="totp-close-btn">&times;</button></div>
        <div id="totp-search-container"><input type="text" id="totp-search-box" placeholder="搜索..."></div>
        <div id="totp-list"></div>
        <div id="totp-add-btn-container"><button id="totp-add-btn">添加配置</button></div>
    `;
    document.body.appendChild(container);
    container.style.display = 'none';

    // 2. Modal Overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'totp-modal-overlay';
    modalOverlay.innerHTML = `
        <div id="totp-modal">

            <!-- Top Row: Name & URL -->
            <div class="totp-row totp-form-group">
                <div style="flex: 0 0 40%;">
                    <input type="text" id="totp-input-name" placeholder="配置名称">
                </div>
                <div style="flex: 1;">
                    <input type="text" id="totp-input-url" placeholder="网址正则">
                </div>
            </div>

            <!-- Account Section -->
            <div class="totp-subsection">
                <!-- Row 1: Username -->
                <div class="totp-row totp-form-group">
                    <div class="totp-col-left">
                        <input type="text" id="totp-input-username" placeholder="账号">
                    </div>
                    <div class="totp-col-right">
                        <div class="totp-input-group">
                            <select id="totp-user-sel-type" style="width: 60px;"><option value="css">CSS</option><option value="xpath">XPath</option></select>
                            <input type="text" id="totp-user-selector" placeholder="账号输入框">
                            <button class="totp-pick-btn" id="totp-pick-user-sel">选择</button>
                        </div>
                    </div>
                </div>

                <!-- Row 2: Password -->
                <div class="totp-row totp-form-group">
                    <div class="totp-col-left">
                        <input type="password" id="totp-input-password" placeholder="密码">
                    </div>
                    <div class="totp-col-right">
                        <div class="totp-input-group">
                            <select id="totp-pass-sel-type" style="width: 60px;"><option value="css">CSS</option><option value="xpath">XPath</option></select>
                            <input type="text" id="totp-pass-selector" placeholder="密码输入框">
                            <button class="totp-pick-btn" id="totp-pick-pass-sel">选择</button>
                        </div>
                    </div>
                </div>

                <!-- Row 3: Login Button & Auto-fill Checkbox -->
                <div class="totp-row totp-form-group">
                    <div class="totp-col-left" style="display:flex; align-items:center; justify-content:center;">
                        <input type="checkbox" id="totp-input-autofill" style="width:auto !important; height:auto !important; margin-right:5px; cursor:pointer;">
                        <label for="totp-input-autofill" style="margin:0; cursor:pointer; color:#4dabf7; font-weight:bold; font-size:12px;">启用自动填写</label>
                    </div>
                    <div class="totp-col-right">
                        <div class="totp-input-group">
                            <select id="totp-next-btn-sel-type" style="width: 60px;"><option value="css">CSS</option><option value="xpath">XPath</option></select>
                            <input type="text" id="totp-next-btn-selector" placeholder="下一步按钮 (分步登录用)">
                            <button class="totp-pick-btn" id="totp-pick-next-btn">选择</button>
                        </div>
                    </div>
                </div>

                <!-- Row 4: Empty & Login Button -->
                <div class="totp-row totp-form-group">
                    <div class="totp-col-left" style="display:flex; align-items:center; justify-content:center; color:#666; font-size:11px;">
                    </div>
                    <div class="totp-col-right">
                        <div class="totp-input-group">
                            <select id="totp-login-btn-sel-type" style="width: 60px;"><option value="css">CSS</option><option value="xpath">XPath</option></select>
                            <input type="text" id="totp-login-btn-selector" placeholder="登录按钮">
                            <button class="totp-pick-btn" id="totp-pick-login-btn">选择</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 2FA Section -->
            <div class="totp-subsection">
                <!-- Row 1: Secret & Input -->
                <div class="totp-row totp-form-group">
                    <div class="totp-col-left">
                        <input type="text" id="totp-input-secret" placeholder="密钥">
                    </div>
                    <div class="totp-col-right">
                        <div class="totp-input-group">
                            <select id="totp-input-sel-type" style="width: 60px;"><option value="css">CSS</option><option value="xpath">XPath</option></select>
                            <input type="text" id="totp-input-selector" placeholder="验证码输入框">
                            <button class="totp-pick-btn" id="totp-pick-input">选择</button>
                        </div>
                    </div>
                </div>

                <!-- Row 2: Period & Button -->
                <div class="totp-row totp-form-group">
                    <div class="totp-col-left">
                        <input type="number" id="totp-input-period" value="30" min="1" placeholder="更新周期 (秒)">
                    </div>
                    <div class="totp-col-right">
                        <div class="totp-input-group">
                            <select id="totp-btn-sel-type" style="width: 60px;"><option value="css">CSS</option><option value="xpath">XPath</option></select>
                            <input type="text" id="totp-btn-selector" placeholder="确定按钮">
                            <button class="totp-pick-btn" id="totp-pick-btn">选择</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="totp-modal-btns">
                <button id="totp-modal-cancel" class="totp-modal-btn">取消</button>
                <button id="totp-modal-save" class="totp-modal-btn">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(modalOverlay);

    // Elements
    const totpList = document.getElementById('totp-list');
    const closeBtn = document.getElementById('totp-close-btn');
    const addBtn = document.getElementById('totp-add-btn');
    const header = document.getElementById('totp-header');
    const searchBox = document.getElementById('totp-search-box');

    // Modal Elements
    const inputName = document.getElementById('totp-input-name');
    const inputAutoFill = document.getElementById('totp-input-autofill');
    const inputUrl = document.getElementById('totp-input-url');

    // Account Inputs
    const inputUsername = document.getElementById('totp-input-username');
    const inputPassword = document.getElementById('totp-input-password');
    const userSelector = document.getElementById('totp-user-selector');
    const userSelType = document.getElementById('totp-user-sel-type');
    const passSelector = document.getElementById('totp-pass-selector');
    const passSelType = document.getElementById('totp-pass-sel-type');
    const nextBtnSelector = document.getElementById('totp-next-btn-selector');
    const nextBtnSelType = document.getElementById('totp-next-btn-sel-type');
    const loginBtnSelector = document.getElementById('totp-login-btn-selector');
    const loginBtnSelType = document.getElementById('totp-login-btn-sel-type');

    // 2FA Inputs
    const inputSecret = document.getElementById('totp-input-secret');
    const inputPeriod = document.getElementById('totp-input-period');
    const inputSelType = document.getElementById('totp-input-sel-type');
    const inputSelector = document.getElementById('totp-input-selector');
    const btnSelType = document.getElementById('totp-btn-sel-type');
    const btnSelector = document.getElementById('totp-btn-selector');

    // Pick Buttons
    const btnPickUser = document.getElementById('totp-pick-user-sel');
    const btnPickPass = document.getElementById('totp-pick-pass-sel');
    const btnPickNextBtn = document.getElementById('totp-pick-next-btn');
    const btnPickLoginBtn = document.getElementById('totp-pick-login-btn');
    const btnPickInput = document.getElementById('totp-pick-input');
    const btnPickBtn = document.getElementById('totp-pick-btn');

    const btnSave = document.getElementById('totp-modal-save');
    const btnCancel = document.getElementById('totp-modal-cancel');

    let updateInterval = null;
    let secretsMap = new Map();
    let editingKey = null;

    // --- Helper: Get Data safely ---
    async function getStoredData(key) {
        const raw = await GM_getValue(key);
        if (!raw) return null;
        try {
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                return {
                    secret: data.secret || '',
                    period: parseInt(data.period) || 30,
                    autoFill: data.autoFill || false,
                    urlPattern: data.urlPattern || '',

                    // Account Info
                    username: data.username || '',
                    password: data.password || '',
                    userSelector: data.userSelector || '',
                    userSelectorType: data.userSelectorType || 'css',
                    passSelector: data.passSelector || '',
                    passSelectorType: data.passSelectorType || 'css',
                    nextBtnSelector: data.nextBtnSelector || '',
                    nextBtnSelectorType: data.nextBtnSelectorType || 'css',
                    loginBtnSelector: data.loginBtnSelector || '',
                    loginBtnSelectorType: data.loginBtnSelectorType || 'css',

                    // 2FA Info
                    inputSelector: data.inputSelector || '',
                    inputSelectorType: data.inputSelectorType || 'css',
                    btnSelector: data.btnSelector || '',
                    btnSelectorType: data.btnSelectorType || 'css'
                };
            }
        } catch (e) { }
        // Legacy support
        return { secret: raw, period: 30, autoFill: false };
    }

    async function generateTOTP(secretData) {
        if (!secretData.secret) return "无密钥";
        try {
            let totp = new otpauth.TOTP({
                secret: otpauth.Secret.fromBase32(secretData.secret.replace(/\s/g, '')),
                period: secretData.period
            });
            return await totp.generate();
        } catch (e) {
            return "错误";
        }
    }

    function updateCodeElement(codeElement, code) {
        if (code === "无密钥") {
            codeElement.textContent = "无密钥";
            codeElement.style.color = "#888";
            codeElement.style.fontSize = "12px";
            codeElement.style.letterSpacing = "0";
        } else if (code !== "错误") {
            codeElement.textContent = `${code.substring(0, 3)} ${code.substring(3, 6)}`;
            codeElement.style.color = '#4dabf7';
            codeElement.style.fontSize = "20px";
            codeElement.style.letterSpacing = "3px";
        } else {
            codeElement.textContent = "生成失败";
            codeElement.style.color = "#ff6b6b";
            codeElement.style.fontSize = "14px";
            codeElement.style.letterSpacing = "0";
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
            totpList.innerHTML = '<p style="text-align:center; color:#888; padding: 40px 0; font-size:14px;">无配置</p>';
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
                if (confirm(`确定要删除配置 "${name}" 吗?`)) {
                    await GM_deleteValue(`totp_${name}`);
                    buildAndPopulateUI();
                }
            });

            // Edit Action
            item.querySelector('.totp-edit-btn').addEventListener('click', () => {
                openModal(name, data);
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
            if (item && data.secret) {
                const period = data.period || 30;
                const remainingTime = period - (Math.floor(now) % period);

                const progressElement = item.querySelector('.totp-progress');
                const percentage = (remainingTime / period) * 100;
                progressElement.style.width = `${percentage}%`;

                if (remainingTime <= 5) {
                    progressElement.style.backgroundColor = '#ff6b6b';
                } else {
                    progressElement.style.backgroundColor = '#28a745';
                }

                if (Math.floor(remainingTime) === period || Math.floor(remainingTime) === 0 || item.querySelector('.totp-code').textContent.includes('.')) {
                     const codeElement = item.querySelector('.totp-code');
                     const newCode = await generateTOTP(data);
                     const currentDisplay = codeElement.textContent.replace(/\s/g, '');
                     if (currentDisplay !== newCode && currentDisplay !== '已复制') {
                         updateCodeElement(codeElement, newCode);
                     }
                }
            } else if (item && !data.secret) {
                item.querySelector('.totp-progress').style.width = '0%';
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

    // --- Selection Mode Logic ---
    function startSelectionMode(targetInputId, targetSelectId) {
        // 隐藏界面
        modalOverlay.style.display = 'none';
        container.style.display = 'none';

        const originalCursor = document.body.style.cursor;
        document.body.style.cursor = 'crosshair';

        const notif = document.createElement('div');
        notif.textContent = "选择元素";
        notif.style.cssText = "position:fixed; top:10px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.5); color:white; padding:10px 20px; z-index:1000001; pointer-events:none; border-radius:0; font-size:12px;";
        document.body.appendChild(notif);

        const cleanup = () => {
            document.body.style.cursor = originalCursor;
            // 移除所有类型的监听
            ['mousedown', 'mouseup', 'click', 'contextmenu'].forEach(evt => {
                document.removeEventListener(evt, handler, true);
            });
            document.removeEventListener('keydown', escHandler, true);

            if (notif.parentNode) notif.parentNode.removeChild(notif);

            // 恢复界面显示
            modalOverlay.style.display = 'flex';
            container.style.display = 'flex';
        };

        const handler = (e) => {
            // 核心：在捕获阶段(capture)就阻止事件 防止网页接收到
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            // 只有在鼠标松开(click)时才执行选择逻辑 避免 mousedown 误触
            if (e.type === 'click') {
                const optimalTarget = findOptimalClickTarget(e.target);
                const { type, selector } = generateSelectorForElement(optimalTarget);

                document.getElementById(targetInputId).value = selector;
                document.getElementById(targetSelectId).value = type;

                cleanup();
            } else if (e.type === 'contextmenu') {
                // 右键取消
                cleanup();
            }
        };

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cleanup();
            }
        };

        // 监听所有相关事件 使用 capture=true 确保最先捕获
        ['mousedown', 'mouseup', 'click', 'contextmenu'].forEach(evt => {
            document.addEventListener(evt, handler, true);
        });
        document.addEventListener('keydown', escHandler, true);
    }

    // --- Modal Logic ---

    function openModal(name = '', data = null) {
        editingKey = name || null;

        inputName.value = name;

        // Auto-fill fields
        inputAutoFill.checked = data ? data.autoFill : false;
        inputUrl.value = data ? data.urlPattern : window.location.hostname.replace(/^www\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Account
        inputUsername.value = data ? data.username : '';
        inputPassword.value = data ? data.password : '';
        userSelector.value = data ? data.userSelector : '';
        userSelType.value = data ? data.userSelectorType : 'css';
        passSelector.value = data ? data.passSelector : '';
        passSelType.value = data ? data.passSelectorType : 'css';
        nextBtnSelector.value = data ? data.nextBtnSelector : '';
        nextBtnSelType.value = data ? data.nextBtnSelectorType : 'css';
        loginBtnSelector.value = data ? data.loginBtnSelector : '';
        loginBtnSelType.value = data ? data.loginBtnSelectorType : 'css';

        // 2FA
        inputSecret.value = data ? data.secret : '';
        inputPeriod.value = data ? data.period : 30;
        inputSelector.value = data ? data.inputSelector : '';
        inputSelType.value = data ? data.inputSelectorType : 'css';
        btnSelector.value = data ? data.btnSelector : '';
        btnSelType.value = data ? data.btnSelectorType : 'css';

        modalOverlay.style.display = 'flex';
        if (!editingKey) inputName.focus();
    }

    function closeModal() {
        modalOverlay.style.display = 'none';
        editingKey = null;
    }

    async function saveFromModal() {
        const newName = inputName.value.trim();
        const secret = inputSecret.value.trim().replace(/\s/g, '');
        const period = parseInt(inputPeriod.value) || 30;

        if (!newName) { alert("请输入配置名称"); return; }

        // Validation: Must have either secret OR username/password
        if (!secret && !inputUsername.value && !inputPassword.value) {
            alert("请至少输入 密钥 或 账号/密码");
            return;
        }

        if (secret && !/^[A-Z2-7=]+$/i.test(secret)) { alert("密钥格式无效 (Base32)"); return; }

        const data = {
            secret: secret,
            period: period,
            autoFill: inputAutoFill.checked,
            urlPattern: inputUrl.value.trim(),

            username: inputUsername.value.trim(),
            password: inputPassword.value,
            userSelector: userSelector.value.trim(),
            userSelectorType: userSelType.value,
            passSelector: passSelector.value.trim(),
            passSelectorType: passSelType.value,
            nextBtnSelector: nextBtnSelector.value.trim(),
            nextBtnSelectorType: nextBtnSelType.value,
            loginBtnSelector: loginBtnSelector.value.trim(),
            loginBtnSelectorType: loginBtnSelType.value,

            inputSelector: inputSelector.value.trim(),
            inputSelectorType: inputSelType.value,
            btnSelector: btnSelector.value.trim(),
            btnSelectorType: btnSelType.value
        };

        if (editingKey && editingKey !== newName) {
            const existing = await GM_getValue(`totp_${newName}`);
            if (existing && !confirm(`名称 "${newName}" 已存在 是否覆盖?`)) return;
            await GM_deleteValue(`totp_${editingKey}`);
        } else if (!editingKey) {
            const existing = await GM_getValue(`totp_${newName}`);
            if (existing && !confirm(`名称 "${newName}" 已存在 是否覆盖?`)) return;
        }

        await GM_setValue(`totp_${newName}`, JSON.stringify(data));
        closeModal();
        buildAndPopulateUI();
    }

    // --- Auto Fill Logic (Core) ---

    // 轮询 2FA 输入框
    function start2FAPolling(data) {
        if (!data.secret || !data.inputSelector) return;
        let attempts = 0;
        const maxAttempts = 180; // 轮询超时 (秒)

        const pollInterval = setInterval(async () => {
            attempts++;
            if (attempts > maxAttempts) { clearInterval(pollInterval); return; }

            const inputEl = getElementBySelector(data.inputSelectorType, data.inputSelector);
            if (inputEl && inputEl.offsetParent !== null) {
                if (inputEl.value && inputEl.value.length === 6) {
                    clearInterval(pollInterval);
                    if (data.btnSelector) {
                        const btnEl = getElementBySelector(data.btnSelectorType, data.btnSelector);
                        if (btnEl) setTimeout(() => btnEl.click(), 300);
                    }
                    return;
                }
                const code = await generateTOTP(data);
                if (code !== "错误" && code !== "无密钥" && inputEl.value !== code) {
                    triggerInputEvent(inputEl, code);
                }
            }
        }, 1000);
    }

    // 2. 合并后的登录轮询器 (同时处理 账号、密码、下一步、登录)
    function pollForLogin(data) {
        // 如果连账号或密码选择器都没配 就没必要轮询登录逻辑了
        if (!data.userSelector && !data.passSelector) return;

        let attempts = 0;
        const maxAttempts = 180; // 轮询超时 (秒)

        const loginInterval = setInterval(() => {
            attempts++;
            if (attempts > maxAttempts) { clearInterval(loginInterval); return; }

            // 尝试获取元素
            const userEl = data.userSelector ? getElementBySelector(data.userSelectorType, data.userSelector) : null;
            const passEl = data.passSelector ? getElementBySelector(data.passSelectorType, data.passSelector) : null;

            // 判断可见性 (offsetParent !== null 代表元素在页面上可见)
            const isUserVisible = userEl && userEl.offsetParent !== null;
            const isPassVisible = passEl && passEl.offsetParent !== null;

            // --- 自动填写逻辑 (只要看见了就填) ---
            if (isUserVisible && userEl.value !== data.username) {
                triggerInputEvent(userEl, data.username);
            }
            if (isPassVisible && passEl.value !== data.password) {
                triggerInputEvent(passEl, data.password);
            }

            // --- 行为判断逻辑 ---

            // 场景 A: 账号和密码框同时存在 (单步登录)
            if (isUserVisible && isPassVisible) {
                // 确保两个都填好了
                if (userEl.value === data.username && passEl.value === data.password) {
                    if (data.loginBtnSelector) {
                        const loginBtn = getElementBySelector(data.loginBtnSelectorType, data.loginBtnSelector);
                        if (loginBtn) {
                            clearInterval(loginInterval); // 任务完成
                            setTimeout(() => loginBtn.click(), 500);
                        }
                    }
                }
            }
            // 场景 B: 仅账号框存在 (分步登录 - 第一步)
            else if (isUserVisible && !isPassVisible) {
                // 必须配置了“下一步按钮”才执行点击 否则可能是单步登录但密码框还没加载出来 需要等待
                if (data.nextBtnSelector && userEl.value === data.username) {
                    const nextBtn = getElementBySelector(data.nextBtnSelectorType, data.nextBtnSelector);
                    if (nextBtn) {
                        clearInterval(loginInterval); // 点击下一步后 页面通常会变 停止当前轮询
                        setTimeout(() => nextBtn.click(), 500);
                        // 注意：点击后页面可能刷新 脚本会重新加载并重新启动 checkAndRunAutoFill
                        // 如果页面不刷新(AJAX) 建议此处不清除 interval 或者依靠 checkAndRunAutoFill 的再次调用
                    }
                }
            }
            // 场景 C: 仅密码框存在 (分步登录 - 第二步)
            else if (!isUserVisible && isPassVisible) {
                if (passEl.value === data.password) {
                    if (data.loginBtnSelector) {
                        const loginBtn = getElementBySelector(data.loginBtnSelectorType, data.loginBtnSelector);
                        if (loginBtn) {
                            clearInterval(loginInterval); // 任务完成
                            setTimeout(() => loginBtn.click(), 500);
                        }
                    }
                }
            }

        }, 1000);
    }

    // 3. 主逻辑
    async function checkAndRunAutoFill() {
        const keys = await GM_listValues();
        const currentUrl = window.location.href;
        const currentHostname = window.location.hostname;

        for (const key of keys) {
            if (!key.startsWith('totp_')) continue;

            const data = await getStoredData(key);
            if (!data || !data.autoFill || !data.urlPattern) continue;

            const regex = new RegExp(data.urlPattern);
            if (regex.test(currentUrl) || regex.test(currentHostname)) {

                // 1. 启动统一的登录轮询器 (处理账号、密码、下一步、登录)
                pollForLogin(data);

                // 2. 始终启动 2FA 轮询 (独立运行)
                start2FAPolling(data);

                return; // 找到匹配配置后停止
            }
        }
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

    // [新增] 阻止脚本界面的事件冒泡到网页 (防止点击脚本导致网页菜单关闭)
    function stopPropagation(e) {
        e.stopPropagation();
    }
    // 对主容器和模态框应用隔离
    [container, modalOverlay].forEach(el => {
        ['click', 'mousedown', 'keydown', 'keyup', 'contextmenu'].forEach(evtName => {
            el.addEventListener(evtName, stopPropagation, false);
        });
    });

    GM_registerMenuCommand("显示验证器", toggleContainer);

    // 密码框聚焦时显示明文 失焦时隐藏
    inputPassword.addEventListener('focus', () => { inputPassword.type = 'text'; });
    inputPassword.addEventListener('blur', () => { inputPassword.type = 'password'; });

    closeBtn.addEventListener('click', hideContainer);
    addBtn.addEventListener('click', () => openModal());
    searchBox.addEventListener('input', filterEntries);

    btnCancel.addEventListener('click', closeModal);
    btnSave.addEventListener('click', saveFromModal);

    // Pick Buttons - Account
    btnPickUser.addEventListener('click', () => startSelectionMode('totp-user-selector', 'totp-user-sel-type'));
    btnPickPass.addEventListener('click', () => startSelectionMode('totp-pass-selector', 'totp-pass-sel-type'));
    btnPickNextBtn.addEventListener('click', () => startSelectionMode('totp-next-btn-selector', 'totp-next-btn-sel-type'));
    btnPickLoginBtn.addEventListener('click', () => startSelectionMode('totp-login-btn-selector', 'totp-login-btn-sel-type'));

    // Pick Buttons - 2FA
    btnPickInput.addEventListener('click', () => startSelectionMode('totp-input-selector', 'totp-input-sel-type'));
    btnPickBtn.addEventListener('click', () => startSelectionMode('totp-btn-selector', 'totp-btn-sel-type'));

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

    // Run Auto-fill check on load
    setTimeout(checkAndRunAutoFill, 1000);
    // Check again for dynamic loading
    setTimeout(checkAndRunAutoFill, 3000);

})();