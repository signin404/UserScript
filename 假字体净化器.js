// ==UserScript==
// @name         假字体净化器
// @description  将Unicode假字体替换为标准ASCII字符
// @namespace    http://tampermonkey.net/
// @match        *://*/*
// @run-at       document-start
// @version      2.5
// @author       Gemini
// @license      GPLv3
// ==/UserScript==

(function() {
    'use strict';

    // 修复了 ℂ, ℍ, ℕ, ℙ, ℚ, ℝ, ℬ, ℯ, ℎ 等字符不被替换的问题
    // 这些字符位于 "Letterlike Symbols" (U+2100-U+214F) 区块 而非数学符号区块
    // 增加了安全检查 防止误伤同区块的 ℃ (摄氏度), ™ (商标), ℀ (a/c) 等符号

    // 正则表达式匹配两部分：
    // 1. \uD835[\uDC00-\uDFFF] : 标准的数学字母符号 (高位代理 D835)
    // 2. [\u2100-\u214F]       : 类字母符号区块 (包含 ℂ, ℍ, ℕ, ℎ, ℯ 等)
    const targetRegex = /\uD835[\uDC00-\uDFFF]|[\u2100-\u214F]/g;

    // 快速检查正则：用于在处理节点前快速判断是否包含目标字符 提升性能
    const fastCheckRegex = /[\uD835\u2100-\u214F]/;

    // 替换逻辑
    const replacer = (match) => {
        // 使用 NFKC 标准化
        const normalized = match.normalize('NFKC');

        // 安全检查：
        // 只有当标准化后的结果是 单个 ASCII 字母或数字 时才替换
        // 例子：
        // ℂ -> C (通过)
        // ℎ -> h (通过)
        // 𝟎 -> 0 (通过)
        // ℃ -> °C (拒绝 保持原样)
        // ™ -> TM (拒绝 保持原样)
        // ℀ -> a/c (拒绝 保持原样)
        if (/^[A-Za-z0-9]$/.test(normalized)) {
            return normalized;
        }
        return match;
    };

    const normalizeText = (text) => text.replace(targetRegex, replacer);

    // 核心处理函数
    const processNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.nodeValue;

            // 性能优化: 快速失败 (Fast Fail)
            // 如果文本中不包含 D835 (数学符号) 也不包含 21xx (类字母符号) 直接跳过
            if (!fastCheckRegex.test(text)) return;

            const newText = normalizeText(text);
            if (newText !== text) {
                node.nodeValue = newText;
            }
        }
        else if (node.nodeType === Node.ELEMENT_NODE) {
            // 忽略特定标签
            if (node.tagName === 'SCRIPT' ||
                node.tagName === 'STYLE' ||
                node.tagName === 'TEXTAREA' ||
                node.tagName === 'INPUT' ||
                node.tagName === 'CODE' ||
                node.tagName === 'PRE' ||
                node.isContentEditable) return;

            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            let currentNode;
            while (currentNode = walker.nextNode()) {
                processNode(currentNode);
            }
        }
    };

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    processNode(node);
                }
            }
            else if (mutation.type === 'characterData') {
                processNode(mutation.target);
            }
        }
    });

    window.requestAnimationFrame(() => {
        if (document.body) {
            processNode(document.body);
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
    });

})();