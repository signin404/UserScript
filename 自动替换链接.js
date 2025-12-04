// ==UserScript==
// @name         自动替换链接
// @description  鼠标悬停时自动替换链接
// @namespace    http://tampermonkey.net/
// @icon      https://i.imgur.com/cfmXJHv.png
// @resource      icon https://i.imgur.com/cfmXJHv.png
// @match        *://*/*
// @grant        GM_getResourceURL
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-start
// @version      1.3
// @author       wOxxOm & Gemini
// @license      GPLv3
// ==/UserScript==

'use strict';

const POPUP = document.createElement('a');
POPUP.id = GM_info.script.name;
POPUP.title = '原始链接';
let isPopupStyled;
let lastLink;
let hoverTimer;
let hoverStopTimer;

// --- Custom Rules Logic Start ---

// 初始化时加载规则
let cachedRules = [];
const urlCache = new Map();

loadRules();

// 注册菜单
GM_registerMenuCommand("设置面板", openSettings);

function getRules() {
    return GM_getValue('custom_rules', []);
}

// 加载并预编译规则 (优化性能的关键)
function loadRules() {
    const rawRules = getRules();
    cachedRules = rawRules.map(rule => {
        // 确保 enabled 默认为 true
        if (rule.enabled === undefined) rule.enabled = true;

        // 预编译匹配正则
        let matchRegex = null;
        if (rule.useRegexMatch && rule.match) {
            try { matchRegex = new RegExp(rule.match); } catch(e) {}
        }

        // 预编译查找正则
        let findRegex = null;
        if (rule.find) {
            try {
                if (rule.useRegexFind) {
                    findRegex = new RegExp(rule.find, 'g');
                } else {
                    const escapedFind = rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    findRegex = new RegExp(escapedFind, 'g');
                }
            } catch(e) {}
        }
        return { ...rule, _matchRegex: matchRegex, _findRegex: findRegex };
    });
}

function saveRules(rules) {
    GM_setValue('custom_rules', rules);
    loadRules();
    urlCache.clear();
}

// 应用自定义规则 (使用缓存 速度极快)
function applyCustomRules(a) {
    const href = a.href;

    // 1. 查缓存：如果这个 URL 之前计算过 直接用结果
    if (urlCache.has(href)) {
        const cachedResult = urlCache.get(href);
        // 如果缓存结果是 null 说明之前算过但不匹配任何规则 直接返回 false
        if (cachedResult === null) return false;

        // 命中缓存且有替换结果 直接应用
        a.hrefUndecloaked = href;
        a.href = cachedResult;
        a.rel = 'external noreferrer nofollow noopener';
        return true;
    }

    const hostname = a.hostname;

    // 2. 没缓存 开始遍历规则
    for (const rule of cachedRules) {
        if (rule.enabled === false) continue;

        try {
            let isMatch = false;
            if (rule.useRegexMatch) {
                if (rule._matchRegex) isMatch = rule._matchRegex.test(href);
            } else {
                if (rule.match && hostname.includes(rule.match)) isMatch = true;
            }

            if (isMatch) {
                let newUrl = href;
                if (rule._findRegex) {
                     let replaceText = rule.replace || "";
                     if (!rule.useRegexReplace) replaceText = replaceText.replace(/\$/g, '$$$$');
                     newUrl = newUrl.replace(rule._findRegex, replaceText);
                }

                try { newUrl = decodeURIComponent(newUrl); } catch (e) {}

                if (newUrl !== href) {
                    // 3. 找到匹配：写入缓存 (原始URL -> 新URL)
                    urlCache.set(href, newUrl);

                    a.hrefUndecloaked = href;
                    a.href = newUrl;
                    a.rel = 'external noreferrer nofollow noopener';
                    return true;
                }
            }
        } catch (e) {
        }
    }

    // 4. 遍历完所有规则都没匹配：写入缓存 (原始URL -> null)
    // 防止下次遇到同样的 URL 又跑一遍循环
    urlCache.set(href, null);

    return false;
}

// 设置界面 UI
function openSettings() {
    const existing = document.getElementById('decloak-settings-modal');
    if (existing) return;

    // 样式调整：所有属性强制 !important 以防止网页样式干扰
    GM_addStyle(`
        #decloak-settings-modal {
            all: initial !important; /* 重置所有继承属性 */
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: transparent !important;
            z-index: 2147483647 !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            font-family: sans-serif !important;
            font-size: 13px !important;
            color: #eee !important;
            pointer-events: none !important;
            line-height: normal !important;
            text-align: left !important;
        }
        #decloak-settings-modal * {
            box-sizing: border-box !important;
        }
        #decloak-settings-modal * { box-sizing: border-box !important; }
        #decloak-settings-content {
            background: rgb(44, 44, 44) !important;
            padding: 15px !important;
            border: 1px solid rgb(80, 80, 80) !important;
            width: 850px !important;
            max-width: 95% !important;
            max-height: 90% !important;
            display: flex !important;
            flex-direction: column !important;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;
            pointer-events: auto !important;
            border-radius: 0 !important;
        }

        /* 头部布局：Flex 模拟表格列 + 绝对定位标题 */
        .decloak-header {
            display: flex !important;
            gap: 5px !important;
            align-items: center !important;
            position: relative !important;
            margin-bottom: 10px !important;
            height: 30px !important;
            padding: 0 6px !important; /* 修改：添加 5px 左右内边距 与下方规则行对齐 */
        }

        /* 标题绝对居中 */
        .decloak-header-title {
            position: absolute !important;
            left: 0 !important;
            width: 100% !important;
            text-align: center !important;
            font-size: 16px !important;
            font-weight: bold !important;
            color: #fff !important;
            pointer-events: none !important; /* 防止遮挡点击 */
            z-index: 0 !important;
        }

        /* 关闭按钮绝对定位在右侧 */
        #decloak-close {
            position: absolute !important;
            right: 0 !important;
            z-index: 10 !important;
            border: none !important;
            background: none !important;
            cursor: pointer !important;
            font-size: 20px !important;
            line-height: 1 !important;
            color: #ccc !important;
            padding: 0 !important;
        }

        /* 搜索框样式 */
        #decloak-search-input {
            background: #222 !important;
            border: 1px solid #555 !important;
            color: #eee !important;
            padding: 2px 5px !important;
            font-size: 13px !important;
            border-radius: 0 !important;
            margin: 0 !important;
            flex: 1 !important; /* 填满分配的空间 */
            height: 26px !important;
            z-index: 5 !important; /* 确保在标题之上可点击 */
        }
        #decloak-search-input:focus {
            border-color: #888 !important;
            outline: none !important;
            background: #111 !important;
        }

        .decloak-table-header {
            display: flex !important; gap: 5px !important; padding: 0 5px 5px 5px !important;
            font-weight: bold !important; font-size: 12px !important; color: #ccc !important;
            border-bottom: 1px solid #555 !important; margin-bottom: 0 !important;
        }
        .decloak-rules-container {
            flex: 1 !important;
            overflow-y: auto !important;
            margin-bottom: 10px !important;
            border: 1px solid #555 !important;
            border-top: none !important;
            background: #2a2a2a !important;
        }

        /* 紧凑行样式 - 深色版 */
        .decloak-rule-row {
            display: flex !important;
            gap: 5px !important;
            align-items: center !important;
            background: #333 !important;
            padding: 4px 5px !important;
            border-bottom: 1px solid #444 !important;
            border-radius: 0 !important;
            margin: 0 !important;
        }
        .decloak-rule-row:nth-child(even) { background: #2e2e2e !important; }
        .decloak-rule-row:hover { background: #3a3a3a !important; }
        .decloak-rule-row.disabled { opacity: 0.5 !important; }
        .decloak-rule-row.disabled input { color: #999 !important; }

        .decloak-input-group {
            display: flex !important;
            flex-direction: column !important;
            flex: 1 !important;
            margin: 0 !important;
            padding: 0 !important;
        }

        .decloak-input-wrapper {
            display: flex !important;
            height: 26px !important;
            width: 100% !important;
        }

        .decloak-input {
            padding: 2px 5px !important;
            border: 1px solid #555 !important;
            background: #222 !important;
            flex: 1 !important;
            border-radius: 0 !important;
            height: 100% !important;
            width: 100% !important;
            font-size: 13px !important;
            font-family: sans-serif !important;
            margin: 0 !important;
            box-shadow: none !important;
        }
        .decloak-input:focus {
            border-color: #888 !important;
            outline: none !important;
            background: #111 !important;
        }

        /* 特定输入框颜色 */
        .rule-match { color: rgb(77, 171, 247) !important; }
        .rule-find { color: rgb(246, 182, 78) !important; }
        .rule-replace { color: rgb(178, 139, 247) !important; }

        /* 按钮通用样式 - 深色版 */
        .decloak-btn {
            padding: 0 !important;
            cursor: pointer !important;
            border: 1px solid #555 !important;
            background: #444 !important;
            color: #ccc !important;
            border-radius: 0 !important;
            height: 26px !important;
            min-width: 26px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 11px !important;
            margin: 0 !important;
            line-height: 1 !important;
        }
        .decloak-btn:hover { background: #555 !important; color: #fff !important; }

        /* 正则按钮激活颜色 RGB 118,202,83 */
        .decloak-btn.active {
            background: rgb(118, 202, 83) !important;
            color: white !important;
            border-color: rgb(118, 202, 83) !important;
        }
        .decloak-btn-toggle { margin-right: 0 !important; font-weight: bold !important; }
        /* 删除按钮 - 深色版 */
        .decloak-btn-danger {
            background: #333 !important;
            color: #ff6b6b !important;
            border: 1px solid #555 !important;
            width: 26px !important;
        }
        .decloak-btn-danger:hover {
            background: #d32f2f !important;
            color: white !important;
            border-color: #d32f2f !important;
        }

        /* 主要按钮 */
        .decloak-btn-primary {
            background: #1976D2 !important;
            color: white !important;
            border: none !important;
            padding: 0 15px !important;
            width: auto !important;
            height: 30px !important;
        }
        .decloak-btn-primary:hover { background: #1565C0 !important; }

        /* 添加按钮 - 实线边框 */
        #decloak-add-rule {
            background: #333 !important;
            color: #ccc !important;
            border: 1px solid #555 !important; /* 改为实线 */
        }
        #decloak-add-rule:hover {
            background: #3a3a3a !important;
            color: #fff !important;
            border-color: #777 !important;
        }

        .decloak-footer {
            display: flex !important;
            justify-content: flex-end !important;
            gap: 10px !important;
        }

        /* 输入框组合样式 */
        .decloak-input-wrapper .decloak-input { border-right: none !important; }
        .decloak-input-wrapper .decloak-btn { border-left: 1px solid #555 !important; }

        /* 滚动条样式 */
        .decloak-rules-container::-webkit-scrollbar { width: 8px !important; }
        .decloak-rules-container::-webkit-scrollbar-track { background: #222 !important; }
        .decloak-rules-container::-webkit-scrollbar-thumb { background: #555 !important; }
        .decloak-rules-container::-webkit-scrollbar-thumb:hover { background: #777 !important; }
    `);

    const modal = document.createElement('div');
    modal.id = 'decloak-settings-modal';
    modal.innerHTML = `
        <div id="decloak-settings-content">
            <div class="decloak-header">
                <!-- 标题层：绝对居中 -->
                <div class="decloak-header-title">链接替换规则</div>

                <!-- 布局层：模拟下方表格的列宽 实现对齐 -->
                <!-- 1. 占位：对应 Toggle 按钮 -->
                <div style="width: 26px !important;"></div>

                <!-- 2. 容器：对应 Match 列 (flex: 1.2) -->
                <div style="flex: 1.2 !important; display: flex !important; gap: 0 !important;">
                    <!-- 搜索框：对应 Input (flex: 1) -->
                    <input type="text" id="decloak-search-input" placeholder="搜索..." title="输入关键词">
                    <!-- 占位：对应 Regex 按钮 (27px) -->
                    <div style="width: 27px !important;"></div>
                </div>

                <!-- 3. 占位：对应 Find + Replace 列 (flex: 2) -->
                <div style="flex: 2 !important;"></div>

                <!-- 4. 占位：对应 Delete 按钮 -->
                <div style="width: 26px !important;"></div>

                <!-- 关闭按钮：绝对定位右侧 -->
                <button id="decloak-close">&times;</button>
            </div>

            <!-- 表头 -->
            <div class="decloak-table-header">
                <div style="width: 26px !important;"></div>
                <div style="flex: 1.2 !important;">链接匹配</div>
                <div style="flex: 1 !important;">查找</div>
                <div style="flex: 1 !important;">替换</div>
                <div style="width: 26px !important;"></div>
            </div>

            <div class="decloak-rules-container" id="decloak-rules-list">
                <!-- Rules will be injected here -->
            </div>
            <button id="decloak-add-rule" class="decloak-btn" style="width: 100% !important; margin-bottom: 10px !important; height: 30px !important;">+ 添加规则</button>
            <div class="decloak-footer">
                <button id="decloak-save" class="decloak-btn decloak-btn-primary">保存并关闭</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const rulesList = modal.querySelector('#decloak-rules-list');
    const searchInput = modal.querySelector('#decloak-search-input');
    let currentRules = getRules();

    function renderRules() {
        rulesList.innerHTML = '';
        const filterText = searchInput.value.toLowerCase().trim();

        if (currentRules.length === 0) {
            rulesList.innerHTML = '<div style="text-align:center !important;color:#777 !important;padding:20px !important;">无规则</div>';
            return;
        }

        currentRules.forEach((rule, index) => {
            if (filterText && !rule.match.toLowerCase().includes(filterText)) {
                return;
            }

            const row = document.createElement('div');
            // 新增：根据启用状态添加 class
            row.className = `decloak-rule-row ${rule.enabled === false ? 'disabled' : ''}`;

            if (rule.useRegexMatch === undefined) rule.useRegexMatch = false;
            // 新增：初始化 enabled 属性
            if (rule.enabled === undefined) rule.enabled = true;

            // 修改：在最左侧添加 toggle 按钮
            row.innerHTML = `
                <button class="decloak-btn decloak-btn-toggle ${rule.enabled ? 'active' : ''}" title="启用/禁用规则">✔</button>

                <div class="decloak-input-group" style="flex: 1.2 !important;">
                    <div class="decloak-input-wrapper">
                        <input type="text" class="decloak-input rule-match" value="${escapeHtml(rule.match)}" title="${escapeHtml(rule.match)}">
                        <button class="decloak-btn rule-regex-match ${rule.useRegexMatch ? 'active' : ''}" title="正则匹配">.*</button>
                    </div>
                </div>
                <div class="decloak-input-group">
                    <div class="decloak-input-wrapper">
                        <input type="text" class="decloak-input rule-find" value="${escapeHtml(rule.find)}" title="${escapeHtml(rule.find)}">
                        <button class="decloak-btn rule-regex-find ${rule.useRegexFind ? 'active' : ''}" title="正则查找">.*</button>
                    </div>
                </div>
                <div class="decloak-input-group">
                    <div class="decloak-input-wrapper">
                        <input type="text" class="decloak-input rule-replace" value="${escapeHtml(rule.replace)}" title="${escapeHtml(rule.replace)}">
                        <button class="decloak-btn rule-regex-replace ${rule.useRegexReplace ? 'active' : ''}" title="正则替换">.*</button>
                    </div>
                </div>
                <button class="decloak-btn decloak-btn-danger rule-delete" title="删除规则">X</button>
            `;

            // Bind events
            // 更新值的同时更新 title
            row.querySelector('.rule-match').oninput = (e) => {
                currentRules[index].match = e.target.value;
                e.target.title = e.target.value;
            };
            row.querySelector('.rule-find').oninput = (e) => {
                currentRules[index].find = e.target.value;
                e.target.title = e.target.value;
            };
            row.querySelector('.rule-replace').oninput = (e) => {
                currentRules[index].replace = e.target.value;
                e.target.title = e.target.value;
            };

            // 新增：Toggle 按钮点击事件
            const btnToggle = row.querySelector('.decloak-btn-toggle');
            btnToggle.onclick = () => {
                currentRules[index].enabled = !currentRules[index].enabled;
                renderRules(); // 重新渲染以更新样式
            };

            const btnMatchRegex = row.querySelector('.rule-regex-match');
            btnMatchRegex.onclick = () => {
                currentRules[index].useRegexMatch = !currentRules[index].useRegexMatch;
                renderRules();
            };

            const btnFindRegex = row.querySelector('.rule-regex-find');
            btnFindRegex.onclick = () => {
                currentRules[index].useRegexFind = !currentRules[index].useRegexFind;
                renderRules();
            };

            const btnReplaceRegex = row.querySelector('.rule-regex-replace');
            btnReplaceRegex.onclick = () => {
                currentRules[index].useRegexReplace = !currentRules[index].useRegexReplace;
                renderRules();
            };

            row.querySelector('.rule-delete').onclick = () => {
                currentRules.splice(index, 1);
                renderRules();
            };

            rulesList.appendChild(row);
        });
    }

    searchInput.oninput = () => {
        renderRules();
    };

    renderRules();

    document.getElementById('decloak-add-rule').onclick = () => {
        searchInput.value = '';
        currentRules.push({ match: '', find: '', replace: '', useRegexMatch: false, useRegexFind: false, useRegexReplace: false, enabled: true });
        renderRules();
        setTimeout(() => rulesList.scrollTop = rulesList.scrollHeight, 0);
    };

    document.getElementById('decloak-save').onclick = () => {
        const validRules = currentRules.filter(r => r.match.trim() !== '');
        saveRules(validRules);
        modal.remove();
    };

    document.getElementById('decloak-close').onclick = () => modal.remove();
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// --- Custom Rules Logic End ---

addEventListener('keypress', e => e.which === 13 && decloakLink(e), true);
addEventListener('mousedown', decloakLink, true);
addEventListener('mouseover', onHover, true);

function onHover(event) {
  const a = decloakLink(event);
  if (!a) return;
  if (lastLink)
    lastLink.removeEventListener('mouseout', cancelHover);
  lastLink = a;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(showPopup, 0, a);
  a.addEventListener('mouseout', cancelHover);
}

function cancelHover(e) {
  this.removeEventListener('mouseout', cancelHover);
  clearTimeout(hoverStopTimer);
  hoverStopTimer = setTimeout(hidePopup, 0, this);
}

function showPopup(a) {
  if (!a.matches(':hover'))
    return;
  if (!isPopupStyled) {
    isPopupStyled = true;
    POPUP.style.cssText = //'all: unset;' +
      'width: 18px;' +
      'height: 18px;' +
      'background: url("' + GM_getResourceURL('icon', false) + '") center no-repeat, white;' +
      'background-size: 16px;' +
      'border: 1px solid #888;' +
      'border-radius: 11px;' +
      'z-index: 2147483647;' +
      'margin-left: 0;' +
      'cursor: pointer;' +
      'position: absolute;'
        .replace(/;/g, '!important;');
  }
  const linkStyle = getComputedStyle(a);
  POPUP.href = a.hrefUndecloaked;
  POPUP.style.marginLeft = -(
    (parseFloat(linkStyle.paddingRight) || 0) +
    (parseFloat(linkStyle.marginRight) || 0) +
    (parseFloat(linkStyle.borderRightWidth) || 0) +
    Math.max(0, a.getBoundingClientRect().right + 32 - innerWidth)
  ) + 'px';
  a.parentElement.insertBefore(POPUP, a.nextSibling);
  POPUP.addEventListener('click', openOriginal);
}

function hidePopup(a) {
  if (POPUP.matches(':hover') || lastLink && lastLink.matches(':hover')) {
    cancelHover.call(a);
  } else {
    lastLink = null;
    POPUP.remove();
  }
}

function openOriginal(e) {
  this.href = '';
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  setTimeout(() => {
    lastLink.href = lastLink.hrefUndecloaked;
    lastLink.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  });
}

function decloakLink(event) {
  const a = getClosestLink(event);
  if (!a || a === POPUP || !/^https?:$/.test(a.protocol))
    return;
  if (a.hrefUndecloaked)
    return a;

  // --- Modified: Check Custom Rules First ---
  if (applyCustomRules(a)) {
      return a;
  }
  // ----------------------------------------

  if (/\bthis\.href\s*=[^=]/.test(a.getAttribute('onmousedown')))
    a.onmousedown = null;
  if (/\bthis\.href\s*=[^=]/.test(a.getAttribute('onclick')))
    a.onclick = null;

  const href = a.href.baseVal || a.href;
  const m = href.match(/([?&][-\w]*referrer[-\w]*(?==))?[=?/]((ftps?|https?)((:|%3[Aa])\/\/[^+&]+|%3[Aa]%2[Ff]%2[Ff][^+&/]+))/);
  if (!m ||
      m[1] ||
      a.hostname === 'disqus.com' && a.pathname.startsWith('/embed/comments/')) {
    return;
  }

  let realUrl = decodeURIComponent(m[2]);
  if (a.hostname === 'disq.us' &&
      realUrl.lastIndexOf(':') !== realUrl.indexOf(':')) {
    realUrl = realUrl.substr(0, realUrl.lastIndexOf(':'));
  }

  if (new URL(realUrl).hostname === a.hostname ||
      href.match(/[?&=/]\w*([Ss]ign|[Ll]og)[io]n/)) {
    return;
  }

  a.hrefUndecloaked = href;
  a.setAttribute('href', realUrl);
  a.rel = 'external noreferrer nofollow noopener';
  return a;
}

function getClosestLink(event) {
  return event.composedPath
    ? event.composedPath().find(el => el.tagName === 'A')
    : event.target.closest('a');
}