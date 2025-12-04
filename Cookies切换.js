// ==UserScript==
// @name         Cookies切换
// @description  掌控你的cookie吧~~
// @namespace    http://tampermonkey.net/
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @match        *://*/*
// @grant        GM_cookie
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @version      1.0
// @author       Cheney & Gemini
// @license      GPLv3
// @icon      data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAaCAYAAACpSkzOAAAAAXNSR0IArs4c6QAAArlJREFUSEullktoE0EYx//ftEKxD2uVFitW8AH25AssKIiCvVQQsaAeeiiKBzWZRMylXmwvnipkZ6OUoniwh6BexMdBPYiIggcVRS1YwQdUbKWRIhLbuJ+d3abNdjfJNlmYw+73+H0z859vllDgYSlbAMQAVJNSxwv5FrORnwNHo/VgvgDmkzn2PlKqt1jCfHYPiKPRLbCsAQBtniDL2kuJxONSYC4Qh0IHIcRVAA2+yZiryDT/lgXiUKgZQjwBsN43EdFLMoztpUB0zNyMWMpLAE5lE70Zz+Dy6z8YaK9zPjGPkGluLAvEUnYAuJebpFaN2a89bdU411btmIgOk2HcLAVmz4ilvALAJV/PjLLZS4QRR6OrYFnvAdQvotIkgM+kVE/QGGIpTwNIBA3I8RsmpVqDxmmQlvOxoAE5fmkIsY7i8e9BYokjkadg3hXE2ccncLfQoHEwrywRpMM8MI7FGqm/35Ht7OMBfZ38Z5ta6ipc7NHfFtpvpbC2tgL3Oz26+QTmb7NHYA+EOEPxeHwhyLV0+vy0NlTiRZe7C32YyGDH0IRdwLvuFcUWYBjMnWSaWs0OnyORa2Duzn7YnZxAzRLhVzVejWXQtFSguUYUA2l7Gun0Ghoc/OmApNSt/3yQyCA+qbSF5VWuQvocUCi0CUK8BVAZJFEhn0O3f+Hhlyl7aRfs8dlsC7oOoKtc0IkHk3g2Oo2hjmXY2jhX9w9MT7c6oHB4P4julgvKE99LSvXNXxORSBLMRwrBFikGneoOKXXA3qPcxCwl5wMtUt46zSgptXpO3i5QOLwZRI9mmqynU0xOMfbdSGFbU+X8ZZivKqLnZBg7XQfWz7csyRPFyDAuLszr+7uVI5CjAPQoJv0MAL3HSTJN103tu3S+s3POmYZtmB3Z/4aPM0dixB6WlaREYriQkP4DhYT2pc+2+CQAAAAASUVORK5CYII=
// ==/UserScript==

(function () {
  "use strict";
  const hostname = location.hostname;
  const domain = hostname;
  let cookiesConfig = GM_getValue("cookiesConfig", {});
  const mainClassName = `cookieSwitchWrapper_${randomStr()}`;

  const LIVE_COOKIES_OPTION_VALUE = "__LIVE_COOKIES__";
  const LIVE_COOKIES_OPTION_TEXT = "当前Cookie";

  function randomStr() {
    const letters = "abcdefghijklmnopqrstuvwxyz";
    let str = "";
    for (let i = 0; i < 6; i++) {
      str += letters[Math.floor(Math.random() * 26)];
    }
    return str;
  }

  function closePannel() {
    $(`.${mainClassName}`).css("transform", "translateX(110%)");
  }

  /**
   * Checks if the table width exceeds the panel width and applies word wrapping to the Name column if necessary.
   */
  function checkAndAdjustNameColumnWrap() {
    setTimeout(() => {
        const $mainDiv = $(`.${mainClassName}`);
        if (!$mainDiv.length) return;

        const $table = $mainDiv.find('.cookieTable');
        if (!$table.length || $table.find('tbody tr').length === 0) return;

        const $nameColumn = $table.find('th:first-child, td.cookie-name');

        // Temporarily remove the class to measure the table's natural width
        $nameColumn.removeClass('force-wrap-name');

        if ($table.outerWidth() > $mainDiv.width()) {
            $nameColumn.addClass('force-wrap-name');
        }
    }, 100); // Use a short delay to ensure DOM is updated before measuring
  }


  function createStyle() {
    const css = `
      .${mainClassName} {
        position: fixed; z-index: 999999; top: 0; right: 0;
        width: 1000px; height: 100%; padding: 10px;
        transition: transform 200ms; transform: translateX(110%);
        background-color: #fff !important; color: #000 !important;
        box-shadow: -10px 0 10px #ddd; overflow: auto;
      }
      .${mainClassName} .topWrapper {
        display: flex; justify-content: space-between; align-items: center; margin-bottom:10px;
      }
      .${mainClassName} .topWrapper span { color: #000 !important; }
      .${mainClassName} select, .${mainClassName} input, .${mainClassName} button {
        background-color: #fff !important;
        color: #000 !important;
        border: 1px solid #ccc !important;
        padding: 5px 8px !important;
        border-radius: 3px !important;
        margin-left: 5px !important;
      }
      .${mainClassName} select { min-width: 180px; }
      .${mainClassName} .titleInput { font-size: 14px; outline: none; flex-grow: 1; margin-left:10px !important; }
      .${mainClassName} .topWrapper button { margin-left: 10px !important; }
      .${mainClassName} .delete-setting-btn { background-color: #ffdddd !important; border-color: #ffaaaa !important;}

      .${mainClassName} .cookieTable { width: 100%; margin-top: 15px; border-collapse: collapse; }
      .${mainClassName} .cookieTable thead { background-color: #f0f0f0 !important; }
      .${mainClassName} .cookieTable th, .${mainClassName} .cookieTable td {
        font-size: 12px; padding: 6px; text-align: center;
        border: 1px solid #ddd !important;
        color: #000 !important;
      }
      .${mainClassName} .cookieTable th { font-size: 13px; white-space: nowrap; background-color: #e9e9e9 !important; }
      .${mainClassName} .cookieTable tbody tr:nth-child(odd) { background-color: #f9f9f9 !important; }
      .${mainClassName} .cookieTable tbody tr:hover { background-color: #f1f1f1 !important; }
      .${mainClassName} .cookieTable td.cookie-name { text-align: left; }
      .${mainClassName} .cookieTable td.cookie-value { text-align: left; word-break: break-all; }
      .${mainClassName} .cookieTable textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 2px !important;
        border: 1px solid #eee !important;
        outline: none;
		color: #000 !important;
        background-color: #FFFFFF !important;
        font-family: inherit;
        font-size: inherit;
        line-height: inherit;
        resize: none;
        overflow-y: hidden;
        vertical-align: top;
      }
      .${mainClassName} .cookieTable button {
        word-break: keep-all; padding: 3px 6px !important; font-size:11px !important;
      }
      .${mainClassName} .btnWrapper {
        display: flex; justify-content: center; margin-top: 20px;
      }
      .${mainClassName} .btnWrapper button {
        margin-left: 15px !important; padding: 8px 20px !important; cursor: pointer;
        border: 1px solid #ddd;border-radius: 4px;background-color: #fff;&:hover {background-color: #f1f1f1;
      }
      #cookieBtn {
        background-color: #FF6E6E !important;
      }
      /* Style to force word wrapping on the name column when needed */
      .${mainClassName} .force-wrap-name {
        white-space: normal !important;
        word-break: break-all !important;
      }
    `;
    return $("<style lang='scss'></style>").text(css);
  }

  function createCookieBtn() {
    const cookieBtn = $(
      `<div id="cookieBtn"><svg t="1715656222971" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1852" width="26" height="26"><path d="M1023.72271 650.495659a541.231658 541.231658 0 0 1-881.127308 230.481105 544.362949 544.362949 0 0 1 221.599077-880.946655A161.773348 161.773348 0 0 0 414.897311 63.37854c9.183114 12.133754 19.901765 23.002948 31.915085 32.366713-12.766034 33.26997-49.468381 147.381451 27.097713 191.791593 16.077976 28.84401 48.655449 49.980227 108.782264 51.184569 0.602171 41.579935 9.785285 109.264001 59.283775 139.222029 27.850427 44.620901 84.635191 71.206769 198.716563 22.611536A167.102565 167.102565 0 0 0 903.288429 609.186701a98.816327 98.816327 0 0 0 120.434281 41.308958z" fill="#FF6E6E" p-id="1853"></path><path d="M195.737029 542.104807a45.162855 45.162855 0 1 1 0 90.32571 45.162855 45.162855 0 0 1 0-90.32571z m270.977132 270.977132a45.162855 45.162855 0 1 1 0 90.32571 45.162855 45.162855 0 0 1 0-90.32571z m0-301.085703a45.162855 45.162855 0 1 1 0 90.325711 45.162855 45.162855 0 0 1 0-90.325711z m-180.651422-301.085702a45.162855 45.162855 0 1 1 0 90.325711 45.162855 45.162855 0 0 1 0-90.325711z m511.845694 451.628553a45.162855 45.162855 0 1 1 0 90.325711 45.162855 45.162855 0 0 1 0-90.325711z" fill="#0C0058" p-id="1854"></path></svg></div>`
    )
      .css({
        width: "26px", height: "26px", position: "fixed",
        right: "10px", bottom: "40px", "z-index": 99999,
        cursor: "pointer", "user-select": "none",
        "box-shadow": "-4px 4px 8px #ddd", "border-radius": "50%",
        opacity: "0.9",
      })
      .click(() => {
        $(`.${mainClassName}`).css("transform", "translateX(0)");
        checkAndAdjustNameColumnWrap();
      });
    return cookieBtn;
  }

  function updateDeleteButtonVisibility() {
    const selectedValue = $(`.${mainClassName} .title-select`).val();
    const deleteBtn = $(`.${mainClassName} .delete-setting-btn`);
    if (selectedValue && selectedValue !== LIVE_COOKIES_OPTION_VALUE && cookiesConfig[domain] && cookiesConfig[domain].some(s => s.title === selectedValue)) {
      deleteBtn.show();
    } else {
      deleteBtn.hide();
    }
  }

  function refreshSettingsUI(selectThisValue = null) {
    const titleSelect = $(`.${mainClassName} .title-select`);
    const titleInput = $(`.${mainClassName} .titleInput`);
    titleSelect.empty();

    // Always add Live Cookies option first
    titleSelect.append($("<option>").val(LIVE_COOKIES_OPTION_VALUE).text(LIVE_COOKIES_OPTION_TEXT));

    // Add saved configurations
    if (cookiesConfig[domain] && cookiesConfig[domain].length > 0) {
      cookiesConfig[domain].forEach((item) => {
        titleSelect.append($("<option>").val(item.title).text(item.title));
      });
    }

    let finalSelectedValue = selectThisValue || LIVE_COOKIES_OPTION_VALUE; // Default to live if nothing specific

    // Ensure the value to select is actually in the dropdown
    if (finalSelectedValue !== LIVE_COOKIES_OPTION_VALUE && (!cookiesConfig[domain] || !cookiesConfig[domain].some(s => s.title === finalSelectedValue))) {
        finalSelectedValue = LIVE_COOKIES_OPTION_VALUE; // Fallback to live if requested saved config not found
    }

    titleSelect.val(finalSelectedValue);

    if (finalSelectedValue === LIVE_COOKIES_OPTION_VALUE) {
      titleInput.val(""); // Clear input, ready for new name if user wants to save live state
      GM_cookie.list({}, function (cookies, error) {
        if (!error) {
          fillTable(cookies);
        } else {
          $(`.${mainClassName} tbody`).html("<tr><td colspan='10'>无法加载当前Cookie.</td></tr>");
        }
      });
    } else { // A saved configuration is selected
      titleInput.val(finalSelectedValue); // Set input to the name of the saved config
      const setting = cookiesConfig[domain].find(s => s.title === finalSelectedValue);
      fillTable(setting?.cookies);
    }
    updateDeleteButtonVisibility();
  }


  function handleDeleteCurrentSetting() {
    const titleToDelete = $(`.${mainClassName} .title-select`).val();
    if (!titleToDelete || titleToDelete === LIVE_COOKIES_OPTION_VALUE || !cookiesConfig[domain] || !cookiesConfig[domain].find(s => s.title === titleToDelete)) {
      alert("没有选中的有效已保存配置可删除");
      return;
    }

    //if (confirm(`确认删除配置 "${titleToDelete}" 吗？`))
    {
      cookiesConfig[domain] = cookiesConfig[domain].filter(item => item.title !== titleToDelete);
      if (cookiesConfig[domain].length === 0) {
        delete cookiesConfig[domain];
      }
      GM_setValue("cookiesConfig", cookiesConfig);
      //alert(`配置 "${titleToDelete}" 已删除`);
      refreshSettingsUI(LIVE_COOKIES_OPTION_VALUE); // Refresh and select live cookies
    }
  }

  function createMain() {
    const titleSelect = $("<select class='title-select'>");
    const titleInput = $("<input class='titleInput' placeholder='输入新配置名称或选择现有配置' />");
    const deleteSettingBtn = $("<button class='delete-setting-btn'>删除此配置</button>")
      .click(handleDeleteCurrentSetting)
      .hide();

    titleSelect.change((e) => {
      const selectedValue = $(e.target).val();
      refreshSettingsUI(selectedValue); // Let refreshSettingsUI handle loading and input field
    });

    titleInput.change((e) => {
        const currentTypedTitle = $(e.target).val().trim();
        const titleSelectElement = $(`.${mainClassName} .title-select`);

        if (currentTypedTitle === "") { // If input is cleared
            if (titleSelectElement.val() !== LIVE_COOKIES_OPTION_VALUE) {
                // If not already on live, switch to live view
                refreshSettingsUI(LIVE_COOKIES_OPTION_VALUE);
            }
        } else if (cookiesConfig[domain] && cookiesConfig[domain].some(item => item.title === currentTypedTitle)) {
            // If typed name matches an existing saved config, select it
            if (titleSelectElement.val() !== currentTypedTitle) {
                 refreshSettingsUI(currentTypedTitle);
            }
        }
    });


    const closeBtn = $("<button>关闭</button>").click(closePannel);
    const topDiv = $("<div class='topWrapper'>").append(
      `<span>当前域名: ${domain}</span>`,
      titleSelect,
      deleteSettingBtn,
      titleInput,
      closeBtn
    );

    const cookieTable = $("<table class='cookieTable'></table>")
      .append(
        `<thead><tr><th>Name</th><th>Value</th><th>Domain</th><th>Path</th><th>Expires/Max-Age</th><th>Size</th><th>HttpOnly</th><th>Secure</th><th>SameSite</th><th>操作</th></tr></thead>`,
        `<tbody></tbody>`
      )
      .on("click", ".editable:not(.editing)", function (event) {
        const td = $(this);
        td.addClass("editing");
        const originalText = td.text();
        const textarea = $("<textarea />").val(originalText);

        // Function to auto-resize textarea
        const autoResize = (el) => {
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
        };

        textarea.blur(() => {
          td.removeClass("editing");
          td.text(textarea.val());
          checkAndAdjustNameColumnWrap();
        }).on('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                $(this).blur();
            } else if (e.key === 'Escape') {
                td.removeClass("editing");
                td.text(originalText);
                $(this).remove();
            }
        }).on('input', function() {
            autoResize(this);
        });

        td.html(textarea);
        autoResize(textarea[0]); // Set initial size
        textarea.focus();
      });

    const addBtn = $("<button>新增</button>").click(() => {
      const deleteRowBtn = $("<button>删除</button>").click(function () {
        if (confirm(`确认删除此行吗？`)) {
            $(this).closest("tr").remove();
            checkAndAdjustNameColumnWrap();
        }
      });
      const deleteTd = $("<td>").append(deleteRowBtn);
      const tr = $("<tr class='cookie-row'>").append(
        `<td class="editable cookie-name"></td><td class="editable cookie-value"></td><td class="editable">${domain}</td><td class="editable">/</td><td class="editable"></td><td></td><td class="editable">false</td><td class="editable">false</td><td class="editable">Lax</td>`,
        deleteTd
      );
      $(`.${mainClassName} tbody`).append(tr);
      checkAndAdjustNameColumnWrap();
    });

    const saveBtn = $("<button>保存</button>").click(() => {
      const currentTitle = $(`.${mainClassName} .titleInput`).val().trim();
      const savedCookies = saveCookie(); // saveCookie now handles title validation
      if (savedCookies) {
        //alert(`配置 "${currentTitle}" 已保存!`);
        refreshSettingsUI(currentTitle); // Refresh and reselect the saved/updated title
      }
    });

    const applyBtn = $("<button>保存并导入</button>").click(() => {
      applyCookie();
    });

    // --- 新增按钮 ---
    const copyBtn = $("<button>复制</button>").click(() => {
        copyCookiesToClipboard();
    });

    // --- 修改按钮容器 ---
    const btnWrapper = $("<div class='btnWrapper'></div>").append(addBtn, saveBtn, applyBtn, copyBtn);
    return $(`<div class='${mainClassName}'></div>`).append(topDiv, cookieTable, btnWrapper);
  }

  function initPage() {
    cookiesConfig = GM_getValue("cookiesConfig", {});
    const main = createMain();
    const style = createStyle();
    const cookieBtn = createCookieBtn();
    $("body").append(style, cookieBtn, main);
    refreshSettingsUI(LIVE_COOKIES_OPTION_VALUE); // Default to live cookies on initial load
  }

  function saveCookie() {
    const title = $(`.${mainClassName} .titleInput`).val().trim();
    if (!title) {
      alert("请输入配置名称");
      return undefined;
    }
    if (title === LIVE_COOKIES_OPTION_TEXT) {
        alert(`配置名称不能是 "${LIVE_COOKIES_OPTION_TEXT}". 请输入一个不同的名称`);
        return undefined;
    }

    const cookies = [];
    $(`.${mainClassName} .cookieTable .cookie-row`).each(function () {
      const tds = $(this).children("td");
      const name = tds.eq(0).text().trim();
      if (!name) return;

      let expirationDate;
      const expDateStr = tds.eq(4).text().trim();
      if (expDateStr && expDateStr.toLowerCase() !== 'session') {
        const parsedDate = Date.parse(expDateStr);
        if (!isNaN(parsedDate)) expirationDate = parsedDate / 1000;
      }

      cookies.push({
        name: name, value: tds.eq(1).text(),
        domain: tds.eq(2).text().trim() || domain,
        path: tds.eq(3).text().trim() || "/",
        expirationDate: expirationDate,
        httpOnly: tds.eq(6).text().trim().toLowerCase() === 'true',
        secure: tds.eq(7).text().trim().toLowerCase() === 'true',
        sameSite: tds.eq(8).text().trim() || 'Lax',
      });
    });

    if (!cookiesConfig[domain]) cookiesConfig[domain] = [];
    const existingSettingIndex = cookiesConfig[domain].findIndex(item => item.title === title);
    if (existingSettingIndex > -1) {
      cookiesConfig[domain][existingSettingIndex].cookies = cookies;
    } else {
      cookiesConfig[domain].push({ title, cookies });
    }
    GM_setValue("cookiesConfig", cookiesConfig);
    return cookies;
  }

  function applyCookie() {
    const currentTitle = $(`.${mainClassName} .titleInput`).val().trim();
    const cookiesToApply = saveCookie(); // This also saves the configuration.
    if (!cookiesToApply) {
        // saveCookie already showed an alert if there was a problem (e.g., no title).
        return;
    }

    // 1. Get all existing cookies that the script can access.
    GM_cookie.list({}, function(existingCookies, error) {
        if (error) {
            alert('获取现有Cookie列表失败，操作已取消');
            console.error('Error listing cookies for deletion:', error);
            return;
        }

        let deletedCount = 0;
        const totalToDelete = existingCookies.length;

        // This function will be called after all existing cookies are deleted.
        const setNewCookies = () => {
            let successCount = 0;
            let errorCount = 0;
            const totalToSet = cookiesToApply.length;

            if (totalToSet === 0) {
                alert("所有现有Cookie已被清除页面即将刷新");
                closePannel();
                location.reload();
                return;
            }

            cookiesToApply.forEach((cookie) => {
                const cookieDetails = { ...cookie };
                // Prepare cookie details for setting
                if (cookieDetails.expirationDate === undefined || isNaN(cookieDetails.expirationDate)) {
                    delete cookieDetails.expirationDate; // For session cookies
                }
                if (!cookieDetails.domain) cookieDetails.domain = domain;
                if (!cookieDetails.path) cookieDetails.path = "/";

                GM_cookie.set(cookieDetails, function (setError) {
                    if (setError) {
                        console.error("设置Cookie失败:", setError, cookieDetails);
                        errorCount++;
                    } else {
                        successCount++;
                    }
                    // Check if all new cookies have been processed
                    if (successCount + errorCount === totalToSet) {
                        //alert(`配置: ${currentTitle}\n导入完成\n\n清除现有☢: ${totalToDelete}\n导入成功✔: ${successCount}\n导入失败❌: ${errorCount}\n\n页面即将刷新`);
                        closePannel();
                        location.reload();
                    }
                });
            });
        };

        // 2. If there are no existing cookies, go straight to setting new ones.
        if (totalToDelete === 0) {
            console.log("没有需要删除的现有Cookie");
            setNewCookies();
            return;
        }

        // 3. Delete each existing cookie.
        console.log(`准备删除 ${totalToDelete} 个现有Cookie...`);
        existingCookies.forEach(cookie => {
            // Use the specific details from the listed cookie to ensure correct deletion.
            GM_cookie.delete({ name: cookie.name, domain: cookie.domain, path: cookie.path }, function(deleteError) {
                if (deleteError) {
                    console.error('删除Cookie失败:', deleteError, cookie);
                }
                deletedCount++;
                // 4. After all deletions are attempted, proceed to set the new cookies.
                if (deletedCount === totalToDelete) {
                    console.log("所有现有Cookie已处理完毕");
                    setNewCookies();
                }
            });
        });
    });
  }

  // --- 新增函数 ---
  /**
   * Copies the current set of cookies (Name and Value) to the clipboard.
   * Format: Name1=Value1;Name2=Value2;Name3=Value3;
   */
  function copyCookiesToClipboard() {
    const cookiePairs = [];
    $(`.${mainClassName} .cookieTable tbody .cookie-row`).each(function () {
        const tds = $(this).children("td");
        const name = tds.eq(0).text().trim();
        const value = tds.eq(1).text().trim();
        if (name) { // Only include if name is not empty
            cookiePairs.push(`${name}=${value}`);
        }
    });

    if (cookiePairs.length === 0) {
        alert("没有可复制的Cookie");
        return;
    }

    // Join with a semicolon and add a trailing semicolon for the correct format
    const cookieString = cookiePairs.join('; ');

    // Use the modern Clipboard API. GM_setClipboard is also an option.
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(cookieString).then(() => {
        }).catch(err => {
            // Fallback for older browsers or non-secure contexts if needed
            GM_setClipboard(cookieString, "text");
        });
    } else {
        // Fallback for older browsers or non-secure contexts
        GM_setClipboard(cookieString, "text");
    }
  }


  function fillTable(cookiesArray) {
    const tbody = $(`.${mainClassName} tbody`);
    tbody.html("");
    if (!cookiesArray || cookiesArray.length === 0) {
      tbody.html("<tr><td colspan='10'>没有Cookies数据显示</td></tr>");
      checkAndAdjustNameColumnWrap();
      return;
    }
    cookiesArray.forEach((cookie) => {
      const deleteRowBtn = $("<button>删除</button>").click(function () {
        {
            $(this).closest("tr").remove();
            checkAndAdjustNameColumnWrap();
        }
      });
      const deleteTd = $("<td>").append(deleteRowBtn);
      const expirationDateString = cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toLocaleString() : "Session";
      const tr = $("<tr class='cookie-row'>").append(
        `<td class="editable cookie-name">${cookie.name || ""}</td>
         <td class="editable cookie-value">${cookie.value || ""}</td>
         <td class="editable">${cookie.domain || ""}</td>
         <td class="editable">${cookie.path || ""}</td>
         <td class="editable">${expirationDateString}</td>
         <td>${String(cookie.value || "").length}</td>
         <td class="editable">${typeof cookie.httpOnly === 'boolean' ? cookie.httpOnly : false}</td>
         <td class="editable">${typeof cookie.secure === 'boolean' ? cookie.secure : false}</td>
         <td class="editable">${cookie.sameSite || "Lax"}</td>`,
        deleteTd
      );
      tbody.append(tr);
    });
    checkAndAdjustNameColumnWrap();
  }

  initPage();
})();