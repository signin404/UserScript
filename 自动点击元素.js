// ==UserScript==
// @name         自动点击元素
// @description  在符合正则表达式的网址上自动点击指定的元素
// @namespace    http://tampermonkey.net/
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_info
// @grant        GM_addValueChangeListener
// @version      2.1
// @author       Max & Gemini
// @license      MPL2.0
// @icon      data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iIzk5QUFCNSIgZD0iTTIwIDIuMDQ3VjJhMiAyIDAgMCAwLTQgMHYuMDQ3QzcuNzM3IDIuNDIyIDYgNS4xMjcgNiA3djE3YzAgNi42MjcgNS4zNzMgMTIgMTIgMTJzMTItNS4zNzMgMTItMTJWN2MwLTEuODczLTEuNzM3LTQuNTc4LTEwLTQuOTUzIi8+PHBhdGggZmlsbD0iIzI5MkYzMyIgZD0iTTIyIDkuMTk5di03YTM2IDM2IDAgMCAwLTItLjE1MVY5YTIgMiAwIDAgMS00IDBWMi4wNDhxLTEuMDY3LjA1MS0yIC4xNTF2N0M3LjQ1OSA5Ljg5IDYgMTIuMjkgNiAxNHYyYzAtMS43MjUgMS40ODItNC4xNTMgOC4xNjktNC44MTlDMTQuNjQ2IDEyLjIyOCAxNi4xNzEgMTMgMTggMTNzMy4zNTUtLjc3MiAzLjgzMS0xLjgxOUMyOC41MTggMTEuODQ3IDMwIDE0LjI3NSAzMCAxNnYtMmMwLTEuNzEtMS40NTktNC4xMS04LTQuODAxIi8+PC9zdmc+
// ==/UserScript==

// --- 新增的独立辅助函数 ---

/**
 * 核心修复：寻找最优点击目标
 * 从被点击的元素开始向上遍历DOM树 寻找一个更稳定、更具代表性的父元素作为规则的目标
 * @param {HTMLElement} element 实际被点击的元素
 * @returns {HTMLElement} 最优的点击目标元素
 */
function findOptimalClickTarget(element) {
    let currentEl = element;
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'DETAILS'];
    const goodClassKeywords = ['btn', 'button', 'link', 'icon', 'item', 'action', 'nav', 'j-', 'js-', 'wrapper', 'container'];

    while (currentEl && currentEl.tagName !== 'BODY') {
        // 优先级1: 元素有唯一的 ID
        if (currentEl.id && currentEl.ownerDocument.querySelectorAll('#' + CSS.escape(currentEl.id)).length === 1) {
            return currentEl;
        }
        // 优先级2: 元素是标准的可交互标签
        if (interactiveTags.includes(currentEl.tagName)) {
            return currentEl;
        }
        // 优先级3: 元素有明确的交互性 role 属性
        const role = currentEl.getAttribute('role');
        if (role && ['button', 'link', 'menuitem', 'checkbox', 'switch'].includes(role)) {
            return currentEl;
        }
        // 优先级4: 元素的 class 包含高价值关键词
        const classList = Array.from(currentEl.classList);
        if (classList.some(c => goodClassKeywords.some(k => c.includes(k)))) {
            return currentEl;
        }
        // 如果当前元素不满足条件 则向上移动一级
        currentEl = currentEl.parentElement;
    }
    // 如果遍历到顶都没找到更好的 就返回原始点击的元素
    return element;
}

// --- 从 WebElementHandler 中移出的辅助函数 ---
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
        if (sibling.tagName === element.tagName) {
            ix++;
        }
        sibling = sibling.previousElementSibling;
    }

    return getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + ix + ']';
}


class RuleManager {
    clickRules;

    constructor() {
        this.clickRules = GM_getValue('clickRules', { rules: [] });
    }

    addRule(newRule) {
        this.clickRules.rules.push(newRule);
        this.updateRules();
    }

    updateRule(index, updatedRule) {
        this.clickRules.rules[index] = updatedRule;
        this.updateRules();
    }

    deleteRule(index) {
        this.clickRules.rules.splice(index, 1);
        this.updateRules();
    }

    updateRules() {
        GM_setValue('clickRules', this.clickRules);
    }
}

class WebElementHandler {
    ruleManager;
    clickTaskManager;
    i18n = {
        'zh-CN': {
            title: '设置面板',
            matchingRules: '当前域名规则',
            noMatchingRules: '当前域名下无任何规则',
            addRuleSection: '',
            ruleName: '名称',
            urlPattern: '网址',
            selectorType: '选择器类型',
            selector: '选择器',
            selectValue: '选择框文本',
            selectValuePlaceholder: '填写显示的文本',
            nthElement: '第几个元素 (从 1 开始)',
            clickDelay: '点击延迟 (毫秒)',
            clickMethod: '点击方法',
            methodNative: 'Native',
            methodPointer: 'PointerEvent',
            simulateHover: '模拟悬停',
            keepClicking: '持续点击',
            ifLinkOpen: '打开链接',
            addRule: '新增规则',
            save: '保存',
            delete: '删除',
            ruleNamePlaceholder: '规则名称',
            urlPatternPlaceholder: '网址正则表达式',
            selectorPlaceholder: 'button.submit"]',
            invalidRegex: '无效的正则表达式',
            invalidSelector: '无效的选择器',
            createRuleByClick: '选择元素',
            selectionMessage: '选择元素',
            autoRuleNamePrefix: '自动创建'
        }
    };

    constructor(ruleManager, clickTaskManager) {
        this.ruleManager = ruleManager;
        this.clickTaskManager = clickTaskManager;
        this.setupUrlChangeListener();
    }

    // 获取菜单标题 (用于 registerMenu)
    getMenuTitle() {
        return this.i18n[this.getLanguage()].title;
    }

    // 获取当前语言
    getLanguage() {
        return 'zh-CN';
    }

    // 验证规则输入
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    validateRule(rule) {
        const i18n = this.i18n[this.getLanguage()];
        try {
            new RegExp(rule.urlPattern);
        } catch (e) {
            alert(`${i18n.invalidRegex}: ${rule.urlPattern}`);
            return false;
        }
        if (!rule.selector || !['css', 'xpath'].includes(rule.selectorType)) {
            alert(`${i18n.invalidSelector}: ${rule.selector}`);
            return false;
        }
        return true;
    }

    // 创建规则元素 以提供规则RUD
    createRuleElement(rule, ruleIndex) {
        const i18n = this.i18n[this.getLanguage()];
        const ruleDiv = document.createElement('div');

        // 关键修复: 转义HTML属性中的双引号 防止显示中断
        const escapeHTML = (str) => (str || '').replace(/"/g, '&quot;');
        const safeRuleName = escapeHTML(rule.ruleName);
        const safeUrlPattern = escapeHTML(rule.urlPattern);
        const safeSelector = escapeHTML(rule.selector);
        const safeSelectValue = escapeHTML(rule.selectValue);

        // 默认值处理
        const clickMethod = rule.clickMethod || 'native';

        ruleDiv.innerHTML = `
                <div class="ruleHeader" id="ruleHeader${ruleIndex}">
                    <strong>${rule.ruleName || `规则 ${ruleIndex + 1}`}</strong>
                </div>
                <div class="readRule" id="readRule${ruleIndex}" style="display: none;">
                    <label>${i18n.ruleName}</label>
                    <input type="text" id="updateRuleName${ruleIndex}" value="${safeRuleName}">
                    <label>${i18n.urlPattern}</label>
                    <input type="text" id="updateUrlPattern${ruleIndex}" value="${safeUrlPattern}">
                    <label>${i18n.selectorType}</label>
                    <select id="updateSelectorType${ruleIndex}">
                        <option value="css" ${rule.selectorType === 'css' ? 'selected' : ''}>CSS</option>
                        <option value="xpath" ${rule.selectorType === 'xpath' ? 'selected' : ''}>XPath</option>
                    </select>
                    <label>${i18n.selector}</label>
                    <input type="text" id="updateSelector${ruleIndex}" value="${safeSelector}">
                    <label>${i18n.selectValue}</label>
                    <input type="text" id="updateSelectValue${ruleIndex}" value="${safeSelectValue}" placeholder="${i18n.selectValuePlaceholder}">
                    <label>${i18n.nthElement}</label>
                    <input type="number" id="updateNthElement${ruleIndex}" min="1" value="${rule.nthElement}">

                    <!-- 1. 点击延迟 -->
                    <label>${i18n.clickDelay}</label>
                    <input type="number" id="updateClickDelay${ruleIndex}" min="100" value="${rule.clickDelay || 1000}">

                    <!-- 2. 点击方法 -->
                    <label>${i18n.clickMethod}</label>
                    <select id="updateClickMethod${ruleIndex}">
                        <option value="native" ${clickMethod === 'native' ? 'selected' : ''}>${i18n.methodNative}</option>
                        <option value="pointer" ${clickMethod === 'pointer' ? 'selected' : ''}>${i18n.methodPointer}</option>
                    </select>

                <div class="checkbox-row">
                    <div class="checkbox-container">
                        <label>${i18n.keepClicking}</label>
                        <input type="checkbox" id="updateKeepSearching${ruleIndex}" ${rule.keepClicking ? 'checked' : ''}>
                    </div>

                    <!-- 3. 模拟悬停 -->
                    <div class="checkbox-container">
                        <label>${i18n.simulateHover}</label>
                        <input type="checkbox" id="updateSimulateHover${ruleIndex}" ${rule.simulateHover ? 'checked' : ''}>
                    </div>

                    <div class="checkbox-container">
                        <label>${i18n.ifLinkOpen}</label>
                        <input type="checkbox" id="updateIfLink${ruleIndex}" ${rule.ifLinkOpen ? 'checked' : ''}>
                    </div>
                </div>

                    <button id="updateRule${ruleIndex}">${i18n.save}</button>
                    <button id="deleteRule${ruleIndex}">${i18n.delete}</button>
                </div>
            `;
        return ruleDiv;
    }

    // 建立设置菜单
    createMenuElement() {
        const i18n = this.i18n[this.getLanguage()];
        const menu = document.createElement('div');
        menu.id = 'autoClickMenuContainer';

        // 【修改】获取转义后的默认域名
        const defaultEscapedUrl = this.escapeRegex(window.location.hostname);

        menu.style.position = 'fixed';
        menu.style.top = '10px';
        menu.style.right = '10px';
        menu.style.background = 'rgb(36, 36, 36)';
        menu.style.color = 'rgb(204, 204, 204)';
        menu.style.border = '1px solid rgb(80, 80, 80)';
        menu.style.padding = '10px';
        menu.style.zIndex = '2147483647';
        menu.style.width = '265px';
        menu.style.boxSizing = 'border-box';
        menu.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
        menu.innerHTML = `
            <style>
                #autoClickMenu {
                    overflow-y: auto;
                    max-height: 80vh;
                    font-size: 9px;
                    scrollbar-gutter: stable;
                    padding-right: 8px;
                }
                /* 【新增】滚动条样式 */
                #autoClickMenu::-webkit-scrollbar {
                    width: 8px;
                }
                #autoClickMenu::-webkit-scrollbar-track {
                    background: rgb(44, 44, 44);
                }
                #autoClickMenu::-webkit-scrollbar-thumb {
                    background-color: rgb(159, 159, 159);
                    border-radius: 0px;
                }
                #autoClickMenu input:not([type="checkbox"]), #autoClickMenu select, #autoClickMenu button {
                    background: rgb(50, 50, 50);
                    color: rgb(204, 204, 204);
                    border: 1px solid rgb(80, 80, 80);
                    margin: 5px 0;
                    padding: 5px;
                    width: 100% !important;
                    min-width: 100% !important;
                    max-width: 100% !important;
                    box-sizing: border-box !important;
                    height: 29px;
                    font-size: 9px;
                    text-align: center !important;
                    border-radius: 0 !important;
                }

                #autoClickMenu button {
                    text-align: center !important;

                    /* 使用 Flexbox 强制垂直居中 */
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;

                    /* 重置 padding 防止 padding 导致的不对称 */
                    padding: 0 !important;
                }

                #autoClickMenu h3, #autoClickMenu h4, #autoClickMenu p, #autoClickMenu label {
                    font-size: 9px;
                    display: block;
                    color: rgb(204, 204, 204);
                    text-align: center;
                }
                #autoClickMenu input[type="checkbox"] {
                    background: rgb(50, 50, 50);
                    color: rgb(204, 204, 204);
                    border: 1px solid rgb(80, 80, 80);
                    margin: 0 5px 0 0;
                    padding: 5px;
                    width: auto;
                    vertical-align: middle;
                }
                #autoClickMenu button {
                    cursor: pointer;
                }
                #autoClickMenu button:hover {
                    background: rgb(70, 70, 70);
                }
                #autoClickMenu .checkbox-container {
                    display: flex;
                    align-items: center;
                    margin-top: 5px;
                    margin-right: 3px; /* 增加右侧间距 */
                }

                /* 新增样式：横向排列容器 */
                #autoClickMenu .checkbox-row {
                    display: flex;
                    flex-direction: row;
                    flex-wrap: wrap; /* 宽度不足时自动换行 */
                    align-items: center;
                    justify-content: center;
                }
                #autoClickMenu .ruleHeader {
                    cursor: pointer;
                    background: rgb(50, 50, 50);
                    padding: 5px;
                    margin: 5px 0;
                    border-radius: 0px;
                    border: 1px solid rgb(80, 80, 80);
                    text-align: center;
                }
                #autoClickMenu .readRule {
                    padding: 5px;
                    border: 1px solid rgb(80, 80, 80);
                    border-radius: 0px;
                    margin-bottom: 5px;
                }
                #autoClickMenu .headerContainer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                }
                #autoClickMenu .closeButton {
                    width: auto !important;
                    min-width: auto !important;
                    padding: 5px 10px;
                    margin: 0;
                    border: none !important;
                    background: transparent;
                }
                #autoClickMenu button[id^="updateRule"],
                #autoClickMenu button[id^="deleteRule"] {
                    border-radius: 0;
                }
                /* 分割线样式 */
                #autoClickMenu .separator {
                    width: 100%;
                    height: 1px;
                    background-color: rgb(204, 204, 204);
                    margin: 10px 0;
                }
            </style>
                <div id="autoClickMenu">
                    <div class="headerContainer">
                        <h3>${i18n.title}</h3>
                        <button id="closeMenu" class="closeButton">✕</button>
                    </div>
                    <div id="rulesList"></div>
                    <div class="separator"></div>
                    <h4>${i18n.addRuleSection}</h4>
                    <label>${i18n.ruleName}</label>
                    <input type="text" id="ruleName" placeholder="${i18n.ruleNamePlaceholder}">
                    <label>${i18n.urlPattern}</label>
                    <input type="text" id="urlPattern" value="${defaultEscapedUrl}" placeholder="${i18n.urlPatternPlaceholder}">
                    <label>${i18n.selectorType}</label>
                    <select id="selectorType">
                        <option value="css">CSS</option>
                        <option value="xpath">XPath</option>
                    </select>
                    <label>${i18n.selector}</label>
                    <input type="text" id="selector" placeholder="${i18n.selectorPlaceholder}">
                    <label>${i18n.selectValue}</label>
                    <input type="text" id="selectValue" placeholder="${i18n.selectValuePlaceholder}">
                    <label>${i18n.nthElement}</label>
                    <input type="number" id="nthElement" min="1" value="1">

                    <!-- 1. 点击延迟 -->
                    <label>${i18n.clickDelay}</label>
                    <input type="number" id="clickDelay" min="50" value="1000">

                    <!-- 2. 点击方法 -->
                    <label>${i18n.clickMethod}</label>
                    <select id="clickMethod">
                        <option value="native">${i18n.methodNative}</option>
                        <option value="pointer">${i18n.methodPointer}</option>
                    </select>

                <div class="checkbox-row">
                    <div class="checkbox-container">
                        <label>${i18n.keepClicking}</label>
                        <input type="checkbox" id="keepClicking">
                    </div>

                    <!-- 3. 模拟悬停 -->
                    <div class="checkbox-container">
                        <label>${i18n.simulateHover}</label>
                        <input type="checkbox" id="simulateHover">
                    </div>

                    <div class="checkbox-container">
                        <label>${i18n.ifLinkOpen}</label>
                        <input type="checkbox" id="ifLinkOpen">
                    </div>
                </div>

                    <button id="addRule" style="margin-top: 10px;">${i18n.addRule}</button>
                    <button id="createRuleByClick" style="margin-top: 5px;">${i18n.createRuleByClick}</button>
                </div>
            `;
        document.body.appendChild(menu);

        // --- 修改：添加事件隔离 ---
        // 阻止菜单上的事件冒泡到页面 防止触发网页快捷键或滚动
        const stopPropagation = (e) => {
            e.stopPropagation();
        };
        const eventTypes = ['click', 'mousedown', 'keydown', 'keyup', 'contextmenu', 'focus', 'focusin', 'wheel'];
        eventTypes.forEach(evt => menu.addEventListener(evt, stopPropagation, false));
        // --- 修改结束 ---

        menu.addEventListener('mousedown', (event) => {
            const interactiveTags = ['INPUT', 'SELECT', 'OPTION', 'BUTTON'];
            if (!interactiveTags.includes(event.target.tagName.toUpperCase())) {
                event.preventDefault();
            }
            event.stopPropagation();
        });
        menu.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        this.updateRulesElement();

        document.getElementById('addRule').addEventListener('click', () => {
            const newRule = {
                ruleName: document.getElementById('ruleName').value || `规则 ${this.ruleManager.clickRules.rules.length + 1}`,
                urlPattern: document.getElementById('urlPattern').value,
                selectorType: document.getElementById('selectorType').value,
                selector: document.getElementById('selector').value,
                selectValue: document.getElementById('selectValue').value || '',
                nthElement: parseInt(document.getElementById('nthElement').value) || 1,
                clickDelay: parseInt(document.getElementById('clickDelay').value) || 1000,
                clickMethod: document.getElementById('clickMethod').value,
                simulateHover: document.getElementById('simulateHover').checked || false,

                keepClicking: document.getElementById('keepClicking').checked || false,
                ifLinkOpen: document.getElementById('ifLinkOpen').checked || false
            };
            if (!this.validateRule(newRule)) return;
            this.ruleManager.addRule(newRule);

            // 重置表单
            document.getElementById('ruleName').value = '';
            document.getElementById('selector').value = '';
            document.getElementById('selectValue').value = '';
            document.getElementById('nthElement').value = '1';
            document.getElementById('clickDelay').value = '1000';
            document.getElementById('clickMethod').value = 'native';
            document.getElementById('simulateHover').checked = false;
            document.getElementById('keepClicking').checked = false;
            document.getElementById('ifLinkOpen').checked = false;
        });

        document.getElementById('createRuleByClick').addEventListener('click', () => this.startElementSelection());

        document.getElementById('closeMenu').addEventListener('click', () => {
            menu.remove();
        });
    }

    // 更新规则列表 (仅显示当前网址符合的规则)
    updateRulesElement() {
        const rulesList = document.getElementById('rulesList');
        const i18n = this.i18n[this.getLanguage()];
        rulesList.innerHTML = ''; // 清空现有列表

        // 【最终修正】
        const currentHostname = window.location.hostname;
        // 准备一个用于比较的基础域名 移除 'www.' 前缀
        const baseHostname = currentHostname.replace(/^www\./, '');

        const matchingRules = this.ruleManager.clickRules.rules.filter(rule => {
            try {
                // 核心逻辑: 创建一个"非转义"版本的规则URL模式 仅用于域名匹配
                // 比如 将 "greasyfork\.org" 变成 "greasyfork.org" 这样就可以和主机名进行可靠的字符串比较
                const normalizedPattern = rule.urlPattern.replace(/\\/g, '');

                // 检查这个非转义的模式字符串是否包含当前页面的基础域名
                // 这个方法可以正确处理 "www.example.com" 和 "example.com" 都匹配 "example\.com" 的情况
                return normalizedPattern.includes(baseHostname);
            } catch (e) {
                // 如果规则有问题 则忽略它
                return false;
            }
        });

        if (matchingRules.length === 0) {
            // 【修改】当无规则时 只显示提示文本 不显示"匹配的规则"标题
            rulesList.innerHTML = `<p>${i18n.noMatchingRules}</p>`;
            return;
        }

        // 【修改】当有规则时 才添加"匹配的规则"标题
        const titleHeader = document.createElement('h4');
        titleHeader.textContent = i18n.matchingRules;
        rulesList.appendChild(titleHeader);

        matchingRules.forEach((rule) => {
            const ruleIndex = this.ruleManager.clickRules.rules.indexOf(rule);
            const ruleDiv = this.createRuleElement(rule, ruleIndex);
            rulesList.appendChild(ruleDiv);

            document.getElementById(`ruleHeader${ruleIndex}`).addEventListener('click', () => {
                const details = document.getElementById(`readRule${ruleIndex}`);
                details.style.display = details.style.display === 'none' ? 'block' : 'none';
            });

            document.getElementById(`updateRule${ruleIndex}`).addEventListener('click', () => {
                const updatedRule = {
                    ruleName: document.getElementById(`updateRuleName${ruleIndex}`).value || `规则 ${ruleIndex + 1}`,
                    urlPattern: document.getElementById(`updateUrlPattern${ruleIndex}`).value,
                    selectorType: document.getElementById(`updateSelectorType${ruleIndex}`).value,
                    selector: document.getElementById(`updateSelector${ruleIndex}`).value,
                    selectValue: document.getElementById(`updateSelectValue${ruleIndex}`).value || '',
                    nthElement: parseInt(document.getElementById(`updateNthElement${ruleIndex}`).value) || 1,
                    clickDelay: parseInt(document.getElementById(`updateClickDelay${ruleIndex}`).value) || 1000,
                    clickMethod: document.getElementById(`updateClickMethod${ruleIndex}`).value,
                    simulateHover: document.getElementById(`updateSimulateHover${ruleIndex}`).checked || false,

                    keepClicking: document.getElementById(`updateKeepSearching${ruleIndex}`).checked || false,
                    ifLinkOpen: document.getElementById(`updateIfLink${ruleIndex}`).checked || false
                };
                if (!this.validateRule(updatedRule)) return;
                this.ruleManager.updateRule(ruleIndex, updatedRule);
            });

            document.getElementById(`deleteRule${ruleIndex}`).addEventListener('click', () => {
                this.ruleManager.deleteRule(ruleIndex);
            });
        });
    }

    // --- 元素选择功能 ---
    startElementSelection() {
        const i18n = this.i18n[this.getLanguage()];
        const menu = document.querySelector('#autoClickMenuContainer');
        if (!menu) return;

        const originalCursor = document.body.style.cursor;
        document.body.style.cursor = 'crosshair';

        const message = document.createElement('div');
        message.textContent = i18n.selectionMessage;
        message.style.position = 'fixed';
        message.style.top = '10px';
        message.style.left = '50%';
        message.style.transform = 'translateX(-50%)';
        message.style.padding = '10px 20px';
        message.style.background = 'rgba(0, 0, 0, 0.5)';
        message.style.color = 'white';
        message.style.zIndex = '2147483647';
        message.style.pointerEvents = 'none';
        document.body.appendChild(message);

        const broadcastMessage = (msg) => {
            window.postMessage(msg, '*');
            Array.from(document.querySelectorAll('iframe, frame')).forEach(f => f.contentWindow?.postMessage(msg, '*'));
        };

        // 修改 1: 定义右键退出处理函数
        const rightClickHandler = (event) => {
            event.preventDefault(); // 阻止默认的右键菜单弹出
            event.stopPropagation();
            cleanup();
        };

        const cleanup = () => {
            broadcastMessage({ type: 'AUTO_CLICK_STOP_SELECTION_MODE' });
            window.removeEventListener('message', messageHandler);

            // 修改 2: 移除右键监听
            document.removeEventListener('contextmenu', rightClickHandler, true);

            if (document.body.contains(message)) document.body.removeChild(message);
            document.body.style.cursor = originalCursor;
            menu.style.display = 'block';
        };

        const messageHandler = (event) => {
            if (event.data?.type === 'AUTO_CLICK_ELEMENT_SELECTED') {
                const { selectorType, selector, ruleName } = event.data.payload;
                const preciseUrlPattern = this.escapeRegex(window.location.hostname);

                document.getElementById('selectorType').value = selectorType;
                document.getElementById('selector').value = selector;
                document.getElementById('urlPattern').value = preciseUrlPattern;
                document.getElementById('ruleName').value = `${i18n.autoRuleNamePrefix}: ${ruleName}`;

                cleanup();
            }
        };

        menu.style.display = 'none';
        window.addEventListener('message', messageHandler);

        // 修改 3: 添加右键监听 (使用捕获模式 true 确保优先拦截)
        document.addEventListener('contextmenu', rightClickHandler, true);

        broadcastMessage({ type: 'AUTO_CLICK_START_SELECTION_MODE' });
    }


    // 设置 URL 变更监听器
    setupUrlChangeListener() {
        const oldPushState = history.pushState;
        history.pushState = function pushState() {
            const result = oldPushState.apply(this, arguments);
            window.dispatchEvent(new Event('pushstate'));
            window.dispatchEvent(new Event('locationchange'));
            return result;
        };

        const oldReplaceState = history.replaceState;
        history.replaceState = function replaceState() {
            const result = oldReplaceState.apply(this, arguments);
            window.dispatchEvent(new Event('replacestate'));
            window.dispatchEvent(new Event('locationchange'));
            return result;
        };

        window.addEventListener('popstate', () => {
            window.dispatchEvent(new Event('locationchange'));
        });

        window.addEventListener('locationchange', () => {
            this.clickTaskManager.clearAutoClicks();
            this.clickTaskManager.runAutoClicks();
        });
    }
}

class ClickTaskManager {
    ruleManager;
    intervalIds = {};

    constructor(ruleManager) {
        this.ruleManager = ruleManager;
        this.runAutoClicks();
        // 【新增】监听规则变化 实现实时同步
        GM_addValueChangeListener('clickRules', this.handleRulesChange.bind(this));
    }

    // 【新增】处理规则变化的函数
    handleRulesChange(name, oldValue, newValue, remote) {
        this.ruleManager.clickRules = newValue || { rules: [] };
        this.clearAutoClicks();
        this.runAutoClicks();
    }


    // 清除所有自动点击任务
    clearAutoClicks() {
        Object.keys(this.intervalIds).forEach(index => {
            clearInterval(this.intervalIds[index]);
            delete this.intervalIds[index];
        });
    }

    // 执行所有符合规则的自动点击
    runAutoClicks() {
        this.ruleManager.clickRules.rules.forEach((rule, index) => {
            if (rule.urlPattern && rule.selector && !this.intervalIds[index]) {
                const intervalId = setInterval(() => {
                    const clicked = this.autoClick(rule, index);
                    if (clicked && !rule.keepClicking) {
                        clearInterval(this.intervalIds[index]);
                        delete this.intervalIds[index];
                    }
                }, rule.clickDelay || 1000);
                this.intervalIds[index] = intervalId;
            } else if (!rule.urlPattern || !rule.selector) {
                console.warn(`${GM_info.script.name}: 规则 "${rule.ruleName}" 无效 (索引 ${index}): 缺少 urlPattern 或 selector`);
            }
        });
    }

    // --- 修复：模拟 PointerEvent 的辅助函数 ---
    triggerPointerEvent(element, eventType) {
        if (!element) return;

        const realWindow = element.ownerDocument.defaultView || window;

        // 【核心修复】计算元素中心点坐标
        const rect = element.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;

        const event = new PointerEvent(eventType, {
            bubbles: true,
            cancelable: true,
            view: realWindow,
            pointerId: 1,
            width: 1,
            height: 1,
            isPrimary: true,
            pointerType: 'mouse',
            // 添加坐标信息
            clientX: clientX,
            clientY: clientY,
            screenX: clientX,
            screenY: clientY,
            buttons: 1,
            pressure: 0.5
        });
        element.dispatchEvent(event);

        // 某些老式监听器可能还需要 MouseEvent
        if (eventType.startsWith('pointer')) {
             const mouseEventType = eventType.replace('pointer', 'mouse');
             const mouseEvent = new MouseEvent(mouseEventType, {
                bubbles: true,
                cancelable: true,
                view: realWindow,
                clientX: clientX,
                clientY: clientY,
                buttons: 1
             });
             element.dispatchEvent(mouseEvent);
        }
    }

    // --- 新增：执行点击动作的辅助函数 ---
    performClick(targetElement, method, ifLinkOpen) {
        if (targetElement.tagName === 'SELECT') {
             return;
        }

        if (method === 'pointer') {
            this.triggerPointerEvent(targetElement, 'pointerdown');
            this.triggerPointerEvent(targetElement, 'mousedown');
            this.triggerPointerEvent(targetElement, 'pointerup');
            this.triggerPointerEvent(targetElement, 'mouseup');
            targetElement.click();
        } else {
            if (ifLinkOpen && targetElement.tagName === "A" && targetElement.href) {
                window.location.href = targetElement.href;
            } else {
                targetElement.click();
            }
        }
    }

    autoClick(rule, ruleIndex) {
        try {
            const urlRegex = new RegExp(rule.urlPattern);
            if (!urlRegex.test(window.location.href)) {
                return false;
            }

            const elements = this.getElements(rule.selectorType, rule.selector);
            if (elements.length === 0) {
                // console.warn(`${GM_info.script.name}: 规则 "${rule.ruleName}" 未找到符合元素: `, rule.selector);
                return false;
            }

            if (rule.nthElement < 1 || rule.nthElement > elements.length) {
                console.warn(`${GM_info.script.name}: 规则 "${rule.ruleName}" 的 nthElement 无效: ${rule.nthElement} 找到 ${elements.length} 个元素`);
                return false;
            }

            const targetElement = elements[rule.nthElement - 1];
            if (targetElement) {
                // --- 【核心修改】 ---
                if (targetElement.tagName === 'SELECT' && rule.selectValue) {
                    const targetText = rule.selectValue.trim();
                    let foundOption = false;

                    for (const option of targetElement.options) {
                        if (option.textContent.trim() === targetText) {
                            const optionValue = option.value;
                            if (targetElement.value !== optionValue) {
                                console.log(`${GM_info.script.name}: 规则 "${rule.ruleName}" 设置 Select 值为 "${optionValue}"`);
                                targetElement.value = optionValue;
                                targetElement.dispatchEvent(new Event('change', { bubbles: true }));
                                targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                            foundOption = true;
                            break;
                        }
                    }
                    if (!foundOption) console.warn(`${GM_info.script.name}: 未找到 Select 选项 "${targetText}"`);
                    return true;
                }

                if (rule.simulateHover) {
                    // 【逻辑分离】仅执行悬停 不点击
                    this.triggerPointerEvent(targetElement, 'pointerover');
                    this.triggerPointerEvent(targetElement, 'pointerenter');
                    this.triggerPointerEvent(targetElement, 'pointermove');
                } else {
                    // 仅执行点击
                    this.performClick(targetElement, rule.clickMethod, rule.ifLinkOpen);
                }

                return true;
            } else {
                return false;
            }
        } catch (e) {
            console.warn(`${GM_info.script.name}: 规则 "${rule.ruleName}" 执行失败: `, e);
            return false;
        }
    }

    // --- 新增：递归穿透 Shadow DOM 的辅助方法 ---
    diveIntoShadow(element) {
        let current = element;
        let depth = 0;
        const maxDepth = 20; // 防止死循环的安全限制

        // 只要当前元素有 Shadow Root 就尝试向内查找
        while (current && current.shadowRoot && depth < maxDepth) {
            // 在 Shadow DOM 中寻找高优先级的交互元素
            // 这里增加了 [role="button"] 和 tabindex 支持 以覆盖更多自定义组件
            const internal = current.shadowRoot.querySelector('input, textarea, button, a, select, [role="button"], [tabindex]:not([tabindex="-1"])');

            if (internal) {
                current = internal; // 深入一层 将当前焦点移交给内部元素
                depth++;
            } else {
                // 如果 Shadow DOM 里没有明显的交互元素 就停留在宿主本身
                break;
            }
        }
        return current;
    }

    // --- 核心更新: 【修改】不再递归搜索 只在当前文档中查找 ---
    getElements(selectorType, selector) {
        try {
            let elements = [];
            if (selectorType === 'xpath') {
                const nodes = document.evaluate(selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                for (let i = 0; i < nodes.snapshotLength; i++) {
                    elements.push(nodes.snapshotItem(i));
                }
            } else if (selectorType === 'css') {
                elements = Array.from(document.querySelectorAll(selector));
            }

            // 对找到的每个元素执行递归穿透
            return elements.map(el => this.diveIntoShadow(el));

        } catch (e) {
            console.warn(`${GM_info.script.name}: 选择器 "${selector}" 无效:`, e);
            return [];
        }
    }
}

// --- 新增：在所有框架中初始化选择器监听器 ---
// 【核心修改】本函数已重构 以提供更强大的事件拦截
function initializeFrameSelectionListener() {
    let isSelectionModeActive = false;

    // 创建一个统一的、强大的事件拦截处理器
    const masterInterceptionHandler = (event) => {
        // 检查事件是否由真实用户触发 忽略脚本触发的点击
        if (!event.isTrusted) return;

        // 立即、完全地停止事件的默认行为和传播
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        // 只有当事件类型是 'click' 时 才执行选择逻辑
        if (event.type === 'click') {
            const optimalTarget = findOptimalClickTarget(event.target);
            const { type, selector } = generateSelectorForElement(optimalTarget);
            const ruleNameText = optimalTarget.textContent.trim().substring(0, 20) || optimalTarget.name || optimalTarget.id || 'Element';
            window.top.postMessage({ type: 'AUTO_CLICK_ELEMENT_SELECTED', payload: { selectorType: type, selector, ruleName: ruleNameText } }, '*');
            stopListening(); // 完成选择后 停止监听
        }
    };

    const startListening = () => {
        if (isSelectionModeActive) return;
        isSelectionModeActive = true;
        document.body.style.cursor = 'crosshair';
        // 在捕获阶段为整个点击周期（mousedown, mouseup, click）添加拦截器
        document.addEventListener('mousedown', masterInterceptionHandler, true);
        document.addEventListener('mouseup', masterInterceptionHandler, true);
        document.addEventListener('click', masterInterceptionHandler, true);
    };

    const stopListening = () => {
        if (!isSelectionModeActive) return;
        isSelectionModeActive = false;
        document.body.style.cursor = 'default';
        document.removeEventListener('mousedown', masterInterceptionHandler, true);
        document.removeEventListener('mouseup', masterInterceptionHandler, true);
        document.removeEventListener('click', masterInterceptionHandler, true);
    };

    window.addEventListener('message', (event) => {
        if (window.self !== window.top && event.source !== window.top) return;
        if (event.data?.type === 'AUTO_CLICK_START_SELECTION_MODE') startListening();
        else if (event.data?.type === 'AUTO_CLICK_STOP_SELECTION_MODE') stopListening();
    });
}


// --- 修改后的脚本执行入口 ---

// 1. 在所有框架中运行监听器
initializeFrameSelectionListener();

// 2. 在所有框架中都运行一个ClickTaskManager实例
const localRuleManager = new RuleManager();
const localClickTaskManager = new ClickTaskManager(localRuleManager);

// 3. 仅在顶层窗口创建UI和主逻辑
if (window.self === window.top) {
    const uiRuleManager = new RuleManager();
    const Mika = new WebElementHandler(uiRuleManager, localClickTaskManager);

    // 新增：为UI面板也添加监听器 以便在规则变化时刷新UI
    GM_addValueChangeListener('clickRules', (name, oldValue, newValue, remote) => {
        Mika.ruleManager.clickRules = newValue || { rules: [] };
        if (document.getElementById('autoClickMenuContainer')) {
            Mika.updateRulesElement();
        }
    });

    GM_registerMenuCommand(Mika.getMenuTitle(), () => {
        if (!document.getElementById('autoClickMenuContainer')) {
            Mika.createMenuElement();
        }
    });
}