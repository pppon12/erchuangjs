    // ==UserScript==
    // @name         二创便捷工具（榕江）
    // @namespace    http://tampermonkey.net/
    // @version      1.1
    // @description  打包上传+图片剪辑+格式化信息 多合一 | 支持在线升级
    // @author       卫炜
    // @match        https://www.kdocs.cn/*
    // @match        https://easylink.cc/*
    // @grant        GM_download
    // @grant        GM_setClipboard
    // @grant        GM_xmlhttpRequest
    // @grant        GM_setValue
    // @grant        GM_getValue
    // @grant        GM_registerMenuCommand
    // @grant        unsafeWindow
    // @connect      service.easylink.cc
    // @connect      cdn3.easylink.cc
    // @connect      raw.githubusercontent.com
    // @connect      gitee.com
    // @connect      *
    // @run-at       document-start
    // @updateURL    https://raw.githubusercontent.com/pppon12/erchuangjs/main/ecbjgj.js
    // @downloadURL  https://github.com/pppon12/erchuangjs/raw/main/ecbjgj.js
    // @homepageURL  https://github.com/pppon12/erchuangjs
    // ==/UserScript==

    (function() {
        'use strict';

        const S = { title: 'el_t', url: 'el_u', pos: 'el_pos', img: 'el_img', imgType: 'el_img_type', imgName: 'el_img_name', desc: 'el_desc', originalUrl: 'el_original_url', ratio: 'el_ratio' };

        function notify(msg, type = 'info') {
            const c = { success: '#4caf50', error: '#f44336', info: '#2196f3', warn: '#ff9800' };
            const el = document.createElement('div');
            el.textContent = msg;
            Object.assign(el.style, {
                position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
                zIndex: '999999', padding: '10px 24px', background: c[type] || c.info,
                color: 'white', borderRadius: '20px', fontSize: '13px',
                fontFamily: '-apple-system, sans-serif', boxShadow: '0 2px 12px rgba(0,0,0,0.25)'
            });
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 3000);
        }

        function fetchVideoUrl(code) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('请求超时，请稍后重试'));
                }, 15000);

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://service.easylink.cc/easyfiles?url=${code}`,
                    timeout: 15000,
                    onload: (resp) => {
                        clearTimeout(timeout);
                        try {
                            const arr = JSON.parse(resp.responseText);
                            const file = Array.isArray(arr) ? arr[0] : (arr.data || arr);
                            const key = file.transcoded_kodo_key || file.kodo_key || file.object_key || file.key;
                            if (!key) { reject('未找到视频'); return; }

                            const innerTimeout = setTimeout(() => {
                                reject(new Error('获取下载地址超时'));
                            }, 10000);

                            GM_xmlhttpRequest({
                                method: 'GET',
                                url: `https://service.easylink.cc/kodo/object/${encodeURIComponent(key)}`,
                                timeout: 10000,
                                onload: (r) => {
                                    clearTimeout(innerTimeout);
                                    try {
                                        const d = JSON.parse(r.responseText);
                                        const url = d.download_url || d.data?.url || d.url;
                                        if (url) resolve(url);
                                        else reject('未获取到下载地址');
                                    } catch (e) { reject('解析失败'); }
                                },
                                onerror: () => { clearTimeout(innerTimeout); reject('获取下载地址失败'); }
                            });
                        } catch (e) { reject('解析失败'); }
                    },
                    onerror: () => { clearTimeout(timeout); reject('获取文件信息失败'); }
                });
            });
        }

        // 从blob URL获取base64
        function blobUrlToBase64(blobUrl) {
            return new Promise((resolve, reject) => {
                fetch(blobUrl)
                    .then(r => r.blob())
                    .then(blob => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    })
                    .catch(reject);
            });
        }

        // 从当前页面获取图片base64
        function getSelectedImageBase64() {
            return new Promise((resolve, reject) => {
                const imgs = document.querySelectorAll('img');
                if (imgs.length === 0) { reject('页面上没有图片'); return; }

                let maxImg = null, maxArea = 0;
                imgs.forEach(img => {
                    const area = (img.naturalWidth || img.width) * (img.naturalHeight || img.height);
                    if (area > maxArea) { maxArea = area; maxImg = img; }
                });

                if (maxImg) {
                    if (maxImg.src.startsWith('blob:')) {
                        blobUrlToBase64(maxImg.src).then(resolve).catch(reject);
                    } else {
                        try {
                            const canvas = document.createElement('canvas');
                            canvas.width = maxImg.naturalWidth || maxImg.width;
                            canvas.height = maxImg.naturalHeight || maxImg.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(maxImg, 0, 0);
                            resolve(canvas.toDataURL('image/png'));
                        } catch (e) { reject('无法获取图片: ' + e.message); }
                    }
                } else {
                    reject('未找到图片');
                }
            });
        }

        function createPanel() {
            if (document.getElementById('el-panel')) return;

            const savedImg = GM_getValue(S.img, '');
            const savedImgType = GM_getValue(S.imgType, 'url');
            const savedImgName = GM_getValue(S.imgName, '');

            const panel = document.createElement('div');
            panel.id = 'el-panel';
            panel.innerHTML = `
                <style>
                    #el-panel {
                        position: fixed; z-index: 99998; background: #fff;
                        border-radius: 14px; box-shadow: 0 8px 40px rgba(0,0,0,0.22);
                        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                        width: 360px;
                        height: 500px;
                        color: #333;
                        resize: both;
                        overflow: hidden;
                        min-width: 320px;
                        min-height: 100px;
                        max-width: 600px;
                        max-height: 800px;
                        display: flex;
                        flex-direction: column;
                    }
                    #el-body {
                        flex: 1;
                        overflow-y: auto;
                        padding: 12px;
                    }
                    #el-resize-handle {
                        position: absolute;
                        right: 0;
                        bottom: 0;
                        width: 16px;
                        height: 16px;
                        background: linear-gradient(135deg, #667eea, #764ba2);
                        cursor: se-resize;
                        border-radius: 0 0 14px 0;
                    }
                    #el-head {
                        background: linear-gradient(135deg, #667eea, #764ba2);
                        color: #fff; padding: 12px 16px; cursor: move;
                        display: flex; justify-content: space-between; align-items: center;
                        font-size: 14px; font-weight: 600; border-radius: 14px 14px 0 0;
                    }
                    #el-head button {
                        background: rgba(255,255,255,0.2); border: none; color: #fff;
                        width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
                        font-size: 16px;
                    }
                    #el-tabs {
                        display: flex;
                        border-bottom: 1px solid #e0e0e0;
                    }
                    .el-tab {
                        flex: 1;
                        padding: 10px 12px;
                        text-align: center;
                        font-size: 13px;
                        cursor: pointer;
                        background: #fafafa;
                        color: #666;
                        transition: all 0.2s;
                    }
                    .el-tab.active {
                        background: #fff;
                        color: #667eea;
                        font-weight: 600;
                        border-bottom: 2px solid #667eea;
                    }
                    .el-tab:hover {
                        background: #f0f0f0;
                    }

                    .el-row { margin-bottom: 12px; }
                    .el-row label {
                        display: block; font-size: 11px; color: #888; margin-bottom: 4px;
                    }
                    .el-row input {
                        width: 100%; padding: 10px 12px; border: 1.5px solid #e0e0e0;
                        border-radius: 8px; font-size: 13px; box-sizing: border-box;
                        background: #fafafa; color: #333 !important;
                    }
                    .el-row input:focus {
                        outline: none; border-color: #667eea; background: #fff;
                    }
                    .el-img-row {
                        display: flex; gap: 8px; align-items: flex-start;
                    }
                    .el-img-row input { flex: 1; }
                    .el-img-row .el-clear {
                        padding: 10px 12px; background: #ffebee; color: #f44336;
                        border: none; border-radius: 8px; cursor: pointer;
                        font-size: 12px; white-space: nowrap;
                    }
                    .el-img-row .el-clear:hover { background: #ffcdd2; }
                    .el-paste-row {
                        display: flex; gap: 8px; margin-top: 8px;
                    }
                    .el-paste-btn {
                        flex: 1; padding: 8px; border: 1.5px dashed #bbb;
                        border-radius: 8px; background: #fafafa; color: #666;
                        font-size: 11px; cursor: pointer; text-align: center;
                        transition: all 0.2s;
                    }
                    .el-paste-btn:hover { border-color: #667eea; color: #667eea; background: #f0f0ff; }
                    .el-img-container {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        margin-top: 8px;
                    }
                    .el-img-preview {
                        max-width: 100px; max-height: 80px;
                        border-radius: 6px; border: 1px solid #e0e0e0;
                        object-fit: contain;
                    }
                    .el-img-preview.show { display: block; }
                    .el-img-preview.hide { display: none; }
                    .el-img-info {
                        flex: 1;
                        padding: 8px;
                        background: #f8f9fa;
                        border-radius: 6px;
                        font-size: 11px;
                        display: none;
                    }
                    .el-img-info.show { display: block; }
                    .el-img-info.hide { display: none; }
                    .el-info-row {
                        margin: 2px 0;
                        white-space: nowrap;
                    }
                    .el-hint { font-size: 10px; color: #aaa; margin-top: 4px; }
                    .el-btns { display: flex; gap: 8px; margin-top: 12px; }
                    .el-btn {
                        flex: 1; padding: 12px; border: none; border-radius: 8px;
                        font-size: 13px; font-weight: bold; cursor: pointer;
                        transition: all 0.2s;
                    }
                    .el-btn:active { transform: scale(0.98); }
                    .el-btn-p { background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; }
                    .el-btn-p:hover { box-shadow: 0 4px 15px rgba(102,126,234,0.4); }
                    .el-btn-s { background: #4caf50; color: #fff; }
                    .el-btn-s:hover { background: #43a047; }
                    .el-status {
                        margin-top: 12px; padding: 12px; border-radius: 8px;
                        font-size: 12px; display: none; word-break: break-all;
                        max-height: 200px; overflow-y: auto;
                    }
                    .el-status.show { display: block; }
                    .el-status.ok { background: #e8f5e9; color: #2e7d32; }
                    .el-status.err { background: #ffebee; color: #c62828; }
                    .el-status.loading { background: #e3f2fd; color: #1565c0; }
                    .el-status code {
                        display: block; margin-top: 8px; padding: 10px;
                        background: rgba(0,0,0,0.06); border-radius: 6px;
                        font-size: 11px; white-space: pre-wrap;
                        font-family: 'Consolas', monospace;
                    }
                    .el-progress-bar {
                        width: 100%; height: 6px; background: #e0e0e0; border-radius: 3px; margin-top: 8px; overflow: hidden;
                    }
                    .el-progress-fill {
                        height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); border-radius: 3px;
                        transition: width 0.1s ease;
                    }
                </style>

                <div id="el-head">
                    <span>📥 下载工具</span>
                    <div style="display: flex; gap: 8px;">
                        <button id="el-check-update" style="background: rgba(255,255,255,0.2); border: none; color: #fff; width: 24px; height: 24px; border-radius: 50%; cursor: pointer; font-size: 14px;" title="检查更新">🔄</button>
                        <button id="el-settings" style="background: rgba(255,255,255,0.2); border: none; color: #fff; width: 24px; height: 24px; border-radius: 50%; cursor: pointer; font-size: 14px;">⚙️</button>
                        <button id="el-min">−</button>
                    </div>
                </div>

                <div id="el-config" style="display: none; padding: 16px; background: #f5f5f5; border-bottom: 1px solid #e0e0e0;">
                    <div class="el-row">
                        <label>登录管理</label>
                        <div class="el-btns" style="margin-top: 8px;">
                            <button class="el-btn el-btn-s" id="el-save-token" style="flex: 1;">🔑 保存登录</button>
                            <button class="el-btn el-btn-s" id="el-clear-token" style="flex: 1; background: #f44336;">🗑️ 清除登录</button>
                        </div>
                    </div>
                </div>

                <div id="el-tabs">
                    <div class="el-tab active" id="el-tab-upload">📦 打包上传</div>
                    <div class="el-tab" id="el-tab-title">✨ 生成标题简介</div>
                    <div class="el-tab" id="el-tab-format">📝 格式整理</div>
                    <div class="el-tab" id="el-tab-image">🖼️ 图片裁剪</div>
                    <div class="el-tab" id="el-tab-video">📥 下载视频</div>
                </div>

                <div id="el-body"></div>
                <div id="el-resize-handle"></div>
            `;

            document.body.appendChild(panel);

            const uploadContent = document.createElement('div');
            uploadContent.id = 'el-content-upload';
            uploadContent.innerHTML = `
                    <div class="el-row">
                        <label>标题</label>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="el-title" placeholder="粘贴标题" value="${GM_getValue(S.title, '')}" style="flex: 1;">
                            <button id="el-paste-table" class="el-btn el-btn-xs" style="padding: 8px 12px; background: #e3f2fd; color: #1565c0; border: none; border-radius: 8px; font-size: 12px; cursor: pointer; white-space: nowrap;">📋 粘贴表格</button>
                        </div>
                    </div>

                    <div class="el-row">
                        <label>简介</label>
                        <input type="text" id="el-desc" placeholder="粘贴简介" value="${GM_getValue(S.desc, '')}">
                    </div>

                    <div class="el-row">
                        <label>参考链接</label>
                        <input type="text" id="el-original-url" placeholder="粘贴参考链接" value="${GM_getValue(S.originalUrl, '')}">
                    </div>

                    <div class="el-row">
                        <label>短连接</label>
                        <input type="text" id="el-url" placeholder="粘贴 easylink 短连接" value="${GM_getValue(S.url, '')}">
                    </div>

                    <div class="el-row">
                        <label>上传文件到短链接</label>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="el-upload-filename" placeholder="点击选择文件、拖拽文件或粘贴文件" readonly style="flex: 1;">
                            <button class="el-clear" id="el-clear-files" style="padding: 6px 12px;">清除</button>
                        </div>
                        <input type="file" id="el-upload-file" multiple accept=".mp4,.mkv,.mov,.avi,.flv,.webm,.png,.jpg,.jpeg,.gif,.webp" style="display:none;">
                    </div>
                    <div id="el-file-drop-zone" style="border: 2px dashed #ccc; border-radius: 8px; padding: 20px; text-align: center; margin-top: 8px; transition: all 0.3s;">
                        <div style="font-size: 24px; margin-bottom: 8px;">📁</div>
                        <div style="font-size: 14px; color: #666;">拖拽文件到这里，或按 Ctrl+V 粘贴</div>
                    </div>
                    <div id="el-file-list" style="max-height: 150px; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 8px; display: none;"></div>
                    <div class="el-btns" style="margin-top: 8px;">
                        <button class="el-btn el-btn-s" id="el-select-files">📁 选择文件</button>
                        <button class="el-btn el-btn-p" id="el-upload">⬆️ 上传到easylink</button>
                    </div>

                    <div class="el-row">
                        <label>图片（三选一）</label>
                        <div class="el-img-row">
                            <input type="text" id="el-img" placeholder="粘贴图片URL（支持http/https）" value="${savedImgType === 'url' ? savedImg : ''}">
                            <button class="el-clear" id="el-clear-img">清除</button>
                        </div>
                        <div class="el-paste-row">
                        <button class="el-paste-btn" id="el-grab-largest">📷 抓取当前图片</button>
                        <label class="el-paste-btn" style="background: #2196f3; cursor: pointer;">📂 选择本地图片
                            <input type="file" accept="image/*" id="el-local-file" style="display: none;">
                        </label>
                    </div>
                        <div class="el-img-container">
                            <img class="el-img-preview ${savedImg ? 'show' : 'hide'}" id="el-img-preview" src="${savedImgType === 'url' ? savedImg : (savedImgType === 'base64' ? savedImg : '')}">
                            <div class="el-img-info ${savedImg ? 'show' : 'hide'}" id="el-img-info">
                                <div class="el-info-row">📏 <span id="el-img-size">尺寸: -- × --</span></div>
                                <div class="el-info-row">📐 <span id="el-img-ratio">比例: --:--</span></div>
                                <div class="el-info-row">✅ <span id="el-img-check">校验: --</span></div>
                            </div>
                        </div>
                        <div class="el-hint">粘贴URL后自动下载图片 | 点击抓取当前显示的图片</div>
                    </div>

                    <div class="el-btns">
                        <button class="el-btn el-btn-s" id="el-copy-text">📝 复制简介</button>
                        <button class="el-btn el-btn-s" id="el-copy-png-links">🖼️ 提取图片链接</button>
                        <button class="el-btn el-btn-p" id="el-curl">⬇️ 直接下载</button>
                        <button class="el-btn el-btn-s" id="el-clear-all">🗑️ 清空数据</button>
                    </div>
                    <div class="el-status" id="el-status"></div>
            `;

            const titleContent = document.createElement('div');
            titleContent.id = 'el-content-title';
            titleContent.style.display = 'none';
            titleContent.innerHTML = `
                    <div class="el-row">
                        <label>封面比例</label>
                        <div style="display: flex; gap: 8px;">
                            <button class="el-btn el-btn-xs el-ratio-btn" id="el-ratio-3-2" style="flex: 1; padding: 8px 12px; background: #e3f2fd; color: #1565c0; border: none; border-radius: 8px; font-size: 12px; cursor: pointer;">3:2（横封面）</button>
                            <button class="el-btn el-btn-xs el-ratio-btn" id="el-ratio-7-10" style="flex: 1; padding: 8px 12px; background: #f5f5f5; color: #666; border: none; border-radius: 8px; font-size: 12px; cursor: pointer;">7:10（竖封面）</button>
                        </div>
                    </div>
                    <div class="el-row" style="margin-top: 12px;">
                        <label>✨ 标题简介生成</label>
                        <textarea id="el-gen-description" placeholder="输入要找的视频描述，我来帮你生成标题和简介！&#10;&#10;例如：我想找一个关于猫咪的治愈视频，猫咪很可爱很搞笑" style="width: 100%; padding: 8px; border: 1.5px solid #e0e0e0; border-radius: 8px; font-size: 13px; box-sizing: border-box; color: #333 !important; margin-top: 8px; resize: vertical; min-height: 120px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;"></textarea>
                        <div class="el-btns" style="margin-top: 8px;">
                            <button class="el-btn el-btn-p" id="el-gen-title-desc" style="background: linear-gradient(135deg, #667eea, #764ba2);">✨ 生成标题和简介</button>
                        </div>
                        <div class="el-hint" style="margin-top: 4px;">输入描述后点击生成按钮，会复制内容到剪贴板，然后可以粘贴给AI来生成</div>
                    </div>
                    <div class="el-status" id="el-status-title"></div>
            `;

            // 创建格式整理标签页内容
            const formatContent = document.createElement('div');
            formatContent.id = 'el-content-format';
            formatContent.style.display = 'none';
            formatContent.innerHTML = `
                    <div class="el-row">
                        <label>📝 文本格式化</label>
                        <textarea id="el-format-input" placeholder="请粘贴需要格式化的文本..." style="width: 100%; padding: 10px; border: 1.5px solid #e0e0e0; border-radius: 8px; font-size: 13px; box-sizing: border-box; color: #333 !important; margin-top: 8px; resize: vertical; min-height: 150px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;"></textarea>
                    </div>
                    <div class="el-btns" style="margin-top: 8px;">
                        <button class="el-btn el-btn-s" id="el-format-paste-btn" style="background: #4CAF50;">� 粘贴</button>
                        <button class="el-btn el-btn-p" id="el-format-btn" style="background: linear-gradient(135deg, #667eea, #764ba2);">� 格式化</button>
                    </div>
                    <div class="el-status" id="el-status-format" style="margin-top: 8px;"></div>
                    <div class="el-row" style="margin-top: 12px;">
                        <label>格式化结果</label>
                        <div id="el-format-result" style="width: 100%; padding: 12px; border: 1.5px solid #e0e0e0; border-radius: 8px; font-size: 13px; box-sizing: border-box; color: #000 !important; margin-top: 8px; max-height: 200px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; background: #fff;"></div>
                    </div>
                    <div class="el-btns" style="margin-top: 8px;">
                        <button class="el-btn el-btn-s" id="el-format-copy-btn" style="flex: 1; background: #f5f5f5; color: #333;">📋 复制结果</button>
                    </div>
            `;

            // 创建图片裁剪标签页内容
            const imageContent = document.createElement('div');
            imageContent.id = 'el-content-image';
            imageContent.style.display = 'none';
            imageContent.innerHTML = `
                    <style>
                        .irc-img-preview {
                            max-width: 100%; max-height: 150px;
                            border-radius: 8px; border: 1px solid #e0e0e0;
                            object-fit: contain; margin-top: 12px; display: none;
                        }
                        .irc-img-preview.show { display: block; }
                        .irc-info {
                            margin-top: 12px; padding: 12px;
                            background: #f8f9fa; border-radius: 8px; display: none;
                        }
                        .irc-info.show { display: block; }
                        .irc-info-row {
                            font-size: 13px; margin: 4px 0;
                            display: flex; align-items: center; gap: 8px;
                        }
                        .irc-info-row span:first-child { color: #666; }
                        .irc-crop-container {
                            position: relative; max-width: 100%;
                            height: 250px; border: 2px dashed #ccc;
                            border-radius: 8px; overflow: hidden;
                            display: none; margin-top: 12px;
                            background: #f5f5f5;
                        }
                        .irc-crop-container.show { display: block; }
                        #irc-crop-canvas {
                            position: absolute; cursor: grab;
                            transform-origin: 0 0; z-index: 1;
                        }
                        #irc-crop-canvas.grabbing { cursor: grabbing; }
                        .irc-crop-guide {
                            position: absolute;
                            border: 2px dashed #4CAF50;
                            background: rgba(76, 175, 80, 0.3);
                            z-index: 3; cursor: move;
                        }
                        .irc-crop-handle {
                            position: absolute; width: 14px; height: 14px;
                            background: #4CAF50; border: 2px solid #fff;
                            border-radius: 50%; z-index: 4;
                        }
                        .irc-crop-handle.nw { cursor: nwse-resize; }
                        .irc-crop-handle.ne { cursor: nesw-resize; }
                        .irc-crop-handle.sw { cursor: nesw-resize; }
                        .irc-crop-handle.se { cursor: nwse-resize; }
                        .irc-ratio-selector {
                            display: flex; gap: 8px; margin-top: 8px;
                        }
                        .irc-ratio-btn {
                            padding: 6px 12px; border: 1.5px solid #e0e0e0;
                            border-radius: 6px; font-size: 12px;
                            cursor: pointer; background: #fafafa; color: #666;
                        }
                        .irc-ratio-btn.active {
                            background: #667eea; color: #fff; border-color: #667eea;
                        }
                        .irc-edit-section { display: none; margin-top: 16px; padding-top: 16px; border-top: 1px solid #eee; }
                    </style>
                    <div class="el-row">
                        <label>图片链接</label>
                        <input type="text" id="irc-url" placeholder="粘贴图片URL（http/https/blob）" style="width: 100%; padding: 10px 12px; border: 1.5px solid #e0e0e0; border-radius: 8px; font-size: 13px; box-sizing: border-box; background: #fafafa; color: #333;">
                    </div>
                    <div class="el-row">
                        <label>标题（保存时使用）</label>
                        <input type="text" id="irc-title" placeholder="输入图片标题" style="width: 100%; padding: 10px 12px; border: 1.5px solid #e0e0e0; border-radius: 8px; font-size: 13px; box-sizing: border-box; background: #fafafa; color: #333;">
                    </div>
                    <div class="el-btns" style="margin-top: 8px;">
                        <button class="el-btn el-btn-p" id="irc-check-url" style="background: linear-gradient(135deg, #667eea, #764ba2);">🔗 解析链接</button>
                        <button class="el-btn el-btn-s" id="irc-grab-blob">📷 抓取blob图片</button>
                    </div>
                    <img class="irc-img-preview" id="irc-preview">
                    <div class="irc-info" id="irc-info">
                        <div class="irc-info-row"><span>📏 尺寸:</span><span id="irc-size" style="font-weight: 600;">-- × -- px</span></div>
                        <div class="irc-info-row"><span>📐 比例:</span><span id="irc-ratio" style="font-weight: 600;">--:--</span></div>
                        <div class="irc-info-row"><span>✅ 校验:</span><span id="irc-check" style="font-weight: 600;">--</span></div>
                        <div class="irc-info-row"><span>📊 类型:</span><span id="irc-type" style="font-weight: 600;">--</span></div>
                    </div>
                    <div class="el-hint" style="margin-top: 8px; font-size: 11px; color: #aaa;">💡 支持：粘贴图片URL / 粘贴本地图片 / 抓取页面blob图片</div>
                    <div class="el-status" id="irc-status"></div>
                    <div class="irc-edit-section" id="irc-edit-section">
                        <div class="el-row">
                            <label>裁剪比例</label>
                            <div class="irc-ratio-selector">
                                <button class="irc-ratio-btn active" data-ratio="3:2">横图 3:2</button>
                                <button class="irc-ratio-btn" data-ratio="7:10">竖图 7:10</button>
                            </div>
                        </div>
                        <div class="irc-crop-container" id="irc-crop-container">
                            <canvas id="irc-crop-canvas"></canvas>
                            <div class="irc-crop-guide" id="irc-crop-guide"></div>
                            <div class="irc-crop-handle nw" id="irc-crop-handle-nw"></div>
                            <div class="irc-crop-handle ne" id="irc-crop-handle-ne"></div>
                            <div class="irc-crop-handle sw" id="irc-crop-handle-sw"></div>
                            <div class="irc-crop-handle se" id="irc-crop-handle-se"></div>
                        </div>
                        <div class="el-btns" style="margin-top: 12px;">
                            <button class="el-btn el-btn-w" id="irc-crop-btn" style="background: #ff9800; color: #fff;">✂️ 裁剪图片</button>
                            <button class="el-btn el-btn-s" id="irc-save-btn" style="background: #4caf50;">💾 保存图片</button>
                        </div>
                    </div>
            `;

            document.getElementById('el-body').appendChild(uploadContent);
            document.getElementById('el-body').appendChild(titleContent);
            document.getElementById('el-body').appendChild(formatContent);
            document.getElementById('el-body').appendChild(imageContent);

            // 创建下载视频标签页内容
            const videoContent = document.createElement('div');
            videoContent.id = 'el-content-video';
            videoContent.style.display = 'none';
            videoContent.innerHTML = `
                    <div class="el-row">
                        <label>📥 短视频下载</label>
                        <div class="el-img-row">
                            <input type="text" id="video-url-input" placeholder="粘贴短视频分享链接（抖音、快手、B站等）">
                            <button class="el-clear" id="video-clear-btn">清除</button>
                        </div>
                        <div class="el-btns" style="margin-top: 8px;">
                            <button class="el-btn el-btn-p" id="video-parse-btn" style="background: linear-gradient(135deg, #667eea, #764ba2);">🔗 解析链接</button>
                            <button class="el-btn el-btn-s" id="video-download-btn" style="background: #4caf50; display: none;">💾 下载视频</button>
                        </div>
                        <div class="el-status" id="video-status"></div>
                        <div class="video-info" id="video-info" style="margin-top: 12px; display: none;">
                            <div style="margin-bottom: 8px;">
                                <img id="video-thumbnail" style="max-width: 100%; max-height: 150px; border-radius: 8px;" />
                            </div>
                            <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;" id="video-title"></div>
                            <div style="font-size: 12px; color: #666; margin-bottom: 2px;" id="video-duration"></div>
                            <div style="font-size: 12px; color: #666; margin-bottom: 2px;" id="video-size"></div>
                            <div style="font-size: 12px; color: #666;" id="video-platform"></div>
                        </div>
                        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px dashed #ddd;">
                            <label style="font-size: 13px; margin-bottom: 6px; display: block;">🔗 手动输入视频URL</label>
                            <input type="text" id="video-direct-url" placeholder="直接输入视频下载链接（.mp4格式）" style="margin-bottom: 8px;">
                            <div class="el-hint" style="font-size: 11px; color: #ff6b6b; margin-bottom: 8px;">💡 如果自动解析失败，可以手动获取视频URL粘贴到这里</div>
                            <button class="el-btn el-btn-p" id="video-direct-download" style="background: #ff9800; width: 100%;">🚀 直接下载</button>
                        </div>
                        <div class="el-hint" style="margin-top: 8px; font-size: 11px; color: #aaa;">💡 支持：抖音、快手、B站、小红书、微博、视频号等平台</div>
                    </div>
            `;
            document.getElementById('el-body').appendChild(videoContent);

            const pos = GM_getValue(S.pos, { x: 20, y: 80 });
            panel.style.left = pos.x + 'px';
            panel.style.top = pos.y + 'px';

            // 元素必须在添加到DOM之后才能获取
            const $ = id => document.getElementById(id);
            const titleEl = $('el-title'), urlEl = $('el-url');
            const originalUrlEl = $('el-original-url'), descEl = $('el-desc');
            const imgEl = $('el-img'), imgPreview = $('el-img-preview'), clearImgBtn = $('el-clear-img');
            const copyTextBtn = $('el-copy-text'), curlBtn = $('el-curl');
            const statusEl = $('el-status'), minBtn = $('el-min');
            const settingsBtn = $('el-settings');
            const checkUpdateBtn = $('el-check-update');
            const clearAllBtn = $('el-clear-all');
            const configPanel = $('el-config');
            const ratioBtn32 = $('el-ratio-3-2'), ratioBtn710 = $('el-ratio-7-10');
            let currentRatio = GM_getValue(S.ratio, '3:2');

            // 标签页切换功能
            const tabUpload = $('el-tab-upload');
            const tabTitle = $('el-tab-title');
            const tabFormat = $('el-tab-format');
            const tabImage = $('el-tab-image');
            const tabVideo = $('el-tab-video');
            const contentUpload = $('el-content-upload');
            const contentTitle = $('el-content-title');
            const contentFormat = $('el-content-format');
            const contentImage = $('el-content-image');
            const contentVideo = $('el-content-video');

            function switchTab(tabName) {
                tabUpload.classList.remove('active');
                tabTitle.classList.remove('active');
                tabFormat.classList.remove('active');
                tabImage.classList.remove('active');
                tabVideo.classList.remove('active');
                contentUpload.style.display = 'none';
                contentTitle.style.display = 'none';
                contentFormat.style.display = 'none';
                contentImage.style.display = 'none';
                contentVideo.style.display = 'none';

                if (tabName === 'upload') {
                    tabUpload.classList.add('active');
                    contentUpload.style.display = 'block';
                } else if (tabName === 'title') {
                    tabTitle.classList.add('active');
                    contentTitle.style.display = 'block';
                } else if (tabName === 'format') {
                    tabFormat.classList.add('active');
                    contentFormat.style.display = 'block';
                } else if (tabName === 'image') {
                    tabImage.classList.add('active');
                    contentImage.style.display = 'block';
                } else if (tabName === 'video') {
                    tabVideo.classList.add('active');
                    contentVideo.style.display = 'block';
                }
            }

            tabUpload.onclick = () => switchTab('upload');
            tabTitle.onclick = () => switchTab('title');
            tabFormat.onclick = () => switchTab('format');
            tabImage.onclick = () => switchTab('image');
            tabVideo.onclick = () => switchTab('video');

            // 视频下载相关功能
            const videoUrlInput = $('video-url-input');
            const videoParseBtn = $('video-parse-btn');
            const videoDownloadBtn = $('video-download-btn');
            const videoStatus = $('video-status');
            const videoInfo = $('video-info');
            const videoThumbnail = $('video-thumbnail');
            const videoTitle = $('video-title');
            const videoDuration = $('video-duration');
            const videoSize = $('video-size');
            const videoPlatform = $('video-platform');
            const videoClearBtn = $('video-clear-btn');

            let currentVideoUrl = '';

            videoClearBtn.onclick = () => {
                videoUrlInput.value = '';
                videoInfo.style.display = 'none';
                videoDownloadBtn.style.display = 'none';
                videoStatus.textContent = '';
                videoStatus.className = 'el-status';
                currentVideoUrl = '';
            };

            videoParseBtn.onclick = async () => {
                const url = videoUrlInput.value.trim();
                if (!url) {
                    setVideoStatus('请输入视频链接', 'error');
                    return;
                }

                videoParseBtn.disabled = true;
                videoParseBtn.textContent = '⏳ 解析中...';
                setVideoStatus('正在解析视频链接...', 'ok');

                try {
                    // 添加重试机制，最多重试2次
                    let result = null;
                    let retryCount = 0;
                    const maxRetries = 2;
                    
                    while (retryCount <= maxRetries) {
                        result = await parseVideoUrl(url);
                        if (result.success && result.videoUrl && result.videoUrl !== url) {
                            break;
                        }
                        retryCount++;
                        if (retryCount <= maxRetries) {
                            setVideoStatus(`重试中 (${retryCount}/${maxRetries})...`, 'ok');
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }

                    if (result && result.success) {
                        currentVideoUrl = result.videoUrl;
                        videoThumbnail.src = result.thumbnail;
                        videoTitle.textContent = result.title || '未获取到标题';
                        videoDuration.textContent = '时长: ' + (result.duration || '未知');
                        videoSize.textContent = '大小: ' + (result.size || '未知');
                        videoPlatform.textContent = '来源: ' + result.platform;
                        videoInfo.style.display = 'block';
                        videoDownloadBtn.style.display = 'inline-block';
                        
                        // 如果解析到真实视频地址，显示成功
                        if (result.videoUrl && result.videoUrl !== url) {
                            setVideoStatus('✅ 解析成功', 'ok');
                            notify('✅ 视频解析成功', 'success');
                        } else {
                            // 如果没有解析到真实地址，显示提示
                            setVideoStatus('⚠️ 已识别平台，但需要手动下载', 'warn');
                            notify('⚠️ 已识别平台，但需要手动下载', 'warn');
                        }
                    } else {
                        setVideoStatus('❌ ' + (result?.error || '解析失败'), 'error');
                        notify('❌ ' + (result?.error || '解析失败'), 'error');
                    }
                } catch (err) {
                    setVideoStatus('❌ 解析失败: ' + err.message, 'error');
                    notify('❌ 解析失败: ' + err.message, 'error');
                } finally {
                    videoParseBtn.disabled = false;
                    videoParseBtn.textContent = '🔗 解析链接';
                }
            };

            // 直接下载按钮点击事件
            const videoDirectUrl = $('video-direct-url');
            const videoDirectDownload = $('video-direct-download');
            videoDirectDownload.onclick = async () => {
                const url = videoDirectUrl.value.trim();
                if (!url) {
                    notify('请输入视频URL', 'error');
                    return;
                }
                
                if (!url.includes('.mp4') && !url.includes('.webm') && !url.includes('.flv')) {
                    notify('请输入有效的视频链接（.mp4, .webm, .flv）', 'error');
                    return;
                }
                
                videoDirectDownload.disabled = true;
                videoDirectDownload.textContent = '⏳ 下载中...';
                
                try {
                    await downloadVideo(url, 'video.mp4');
                    setVideoStatus('✅ 下载成功', 'ok');
                    notify('✅ 视频下载成功', 'success');
                } catch (err) {
                    setVideoStatus('❌ 下载失败: ' + err.message, 'error');
                    notify('❌ 下载失败: ' + err.message, 'error');
                } finally {
                    videoDirectDownload.disabled = false;
                    videoDirectDownload.textContent = '🚀 直接下载';
                }
            };

            videoDownloadBtn.onclick = async () => {
                if (!currentVideoUrl) {
                    notify('请先解析视频链接', 'error');
                    return;
                }

                videoDownloadBtn.disabled = true;
                videoDownloadBtn.textContent = '⏳ 下载中...';

                try {
                    const filename = videoTitle.textContent.replace(/[\\/:*?"<>|]/g, '_') || 'video';
                    await downloadFile(currentVideoUrl, filename + '.mp4');
                    notify('✅ 视频下载成功', 'success');
                } catch (err) {
                    notify('❌ 下载失败: ' + err.message, 'error');
                } finally {
                    videoDownloadBtn.disabled = false;
                    videoDownloadBtn.textContent = '💾 下载视频';
                }
            };

            function setVideoStatus(msg, type) {
                videoStatus.textContent = msg;
                videoStatus.className = 'el-status show ' + type;
            }

            async function parseVideoUrl(url) {
                // 识别平台
                let platform = '未知';
                let apiUrl = '';
                
                if (url.includes('douyin') || url.includes('v.douyin.com')) {
                    platform = '抖音';
                    // 构建抖音API请求
                    const shortCode = url.match(/v\.douyin\.com\/([^\/\?]+)/);
                    if (shortCode) {
                        apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${shortCode[1]}`;
                    }
                } else if (url.includes('kuaishou') || url.includes('v.kuaishou.com')) {
                    platform = '快手';
                    const shortCode = url.match(/v\.kuaishou\.com\/([^\/\?]+)/);
                    if (shortCode) {
                        apiUrl = `https://www.kuaishou.com/graphql`;
                    }
                } else if (url.includes('bilibili') || url.includes('b23.tv')) {
                    platform = 'B站';
                    const bvid = url.match(/bilibili\.com\/video\/([^\/\?]+)/) || url.match(/b23\.tv\/([^\/\?]+)/);
                    if (bvid) {
                        apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid[1]}`;
                    }
                } else if (url.includes('xiaohongshu')) {
                    platform = '小红书';
                } else if (url.includes('weibo') && url.includes('status')) {
                    platform = '微博';
                    const statusId = url.match(/status\/([^\/\?]+)/);
                    if (statusId) {
                        apiUrl = `https://m.weibo.cn/detail/${statusId[1]}`;
                    }
                } else if (url.includes('tiktok')) {
                    platform = 'TikTok';
                }

                // 尝试直接解析页面获取视频信息
                try {
                    if (platform === '抖音') {
                        const result = await parseDouyinVideo(url);
                        if (result.success && result.videoUrl && result.videoUrl !== url) {
                            return result;
                        }
                    } else if (platform === 'B站') {
                        const result = await parseBilibiliVideo(url);
                        if (result.success && result.videoUrl && result.videoUrl !== url) {
                            return result;
                        }
                    } else if (platform === '快手') {
                        const result = await parseKuaishouVideo(url);
                        if (result.success && result.videoUrl && result.videoUrl !== url) {
                            return result;
                        }
                    } else if (platform === '微博') {
                        const result = await parseWeiboVideo(url);
                        if (result.success && result.videoUrl && result.videoUrl !== url) {
                            return result;
                        }
                    }
                } catch (err) {
                    console.log(`解析${platform}视频失败:`, err.message);
                }

                // 如果专用解析失败，尝试通用解析
                const genericResult = await parseGenericVideo(url);
                if (genericResult.success && genericResult.videoUrl && genericResult.videoUrl !== url) {
                    return genericResult;
                }

                // 如果都失败，返回错误信息
                return {
                    success: false,
                    error: `无法从 ${platform} 链接中提取视频，请尝试其他方式下载`,
                    videoUrl: url,
                    thumbnail: `https://picsum.photos/seed/${url.length}/320/180`,
                    title: `来自${platform}的视频`,
                    duration: '未知',
                    size: '未知',
                    platform: platform
                };
            }

            // 通用视频解析函数
            async function parseGenericVideo(url) {
                return new Promise((resolve) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Referer': url
                        },
                        onload: function(response) {
                            try {
                                const html = response.responseText;
                                
                                // 尝试多种通用模式提取视频地址
                                let videoUrl = '';
                                let coverUrl = '';
                                let title = '';
                                
                                // 模式1: 直接匹配视频URL
                                const videoMatch1 = html.match(/https?:\/\/[^\s'"<>]+\.(mp4|flv|webm|mov|avi)/gi);
                                if (videoMatch1) {
                                    // 找到第一个看起来像视频的URL
                                    for (const match of videoMatch1) {
                                        if (match.includes('video') || match.includes('play') || 
                                            match.includes('download') || match.includes('stream')) {
                                            videoUrl = match.split('"')[0].split("'")[0].split('<')[0];
                                            break;
                                        }
                                    }
                                    if (!videoUrl && videoMatch1[0]) {
                                        videoUrl = videoMatch1[0].split('"')[0].split("'")[0].split('<')[0];
                                    }
                                }
                                
                                // 模式2: 从JSON数据中提取
                                const jsonMatch = html.match(/{"[\s\S]*?"url":\s*"([^"]+)"/);
                                if (!videoUrl && jsonMatch) {
                                    videoUrl = decodeURIComponent(jsonMatch[1]);
                                }
                                
                                // 模式3: 从embed标签提取
                                const embedMatch = html.match(/<embed[^>]+src=["']([^"']+)["']/i);
                                if (!videoUrl && embedMatch) {
                                    videoUrl = embedMatch[1];
                                }
                                
                                // 模式4: 从video标签提取
                                const videoTagMatch = html.match(/<video[^>]+src=["']([^"']+)["']/i);
                                if (!videoUrl && videoTagMatch) {
                                    videoUrl = videoTagMatch[1];
                                }
                                
                                // 模式5: 提取封面
                                const coverMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
                                if (coverMatch) {
                                    coverUrl = coverMatch[1];
                                }
                                
                                // 模式6: 提取标题
                                const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
                                if (titleMatch) {
                                    title = decodeURIComponent(titleMatch[1]);
                                }
                                
                                if (!title) {
                                    const titleTagMatch = html.match(/<title>([^<]+)<\/title>/);
                                    if (titleTagMatch) {
                                        title = titleTagMatch[1];
                                    }
                                }
                                
                                if (videoUrl && videoUrl.startsWith('http')) {
                                    resolve({
                                        success: true,
                                        videoUrl: videoUrl,
                                        thumbnail: coverUrl && coverUrl.startsWith('http') ? coverUrl : 'https://picsum.photos/320/180',
                                        title: title || '视频',
                                        duration: '未知',
                                        size: '未知',
                                        platform: '通用'
                                    });
                                    return;
                                }
                            } catch (err) {
                                console.log('通用解析失败:', err.message);
                            }
                            
                            resolve({
                                success: false,
                                videoUrl: '',
                                thumbnail: '',
                                title: '',
                                duration: '未知',
                                size: '未知',
                                platform: '通用'
                            });
                        },
                        onerror: function(err) {
                            console.log('通用解析请求失败:', err);
                            resolve({
                                success: false,
                                videoUrl: '',
                                thumbnail: '',
                                title: '',
                                duration: '未知',
                                size: '未知',
                                platform: '通用'
                            });
                        }
                    });
                });
            }

            // 解析抖音视频
            async function parseDouyinVideo(url) {
                return new Promise((resolve) => {
                    // 首先获取短链接重定向后的真实URL
                    resolveShortUrl(url, (realUrl) => {
                        if (realUrl) {
                            console.log('重定向后的真实URL:', realUrl);
                            // 从真实URL提取视频ID
                            const videoIdMatch = realUrl.match(/douyin\.com\/video\/([^\/\?]+)/);
                            if (videoIdMatch) {
                                const videoId = videoIdMatch[1];
                                console.log('提取到视频ID:', videoId);
                                // 使用正确的视频ID调用API
                                fetchDouyinVideoById(videoId, resolve);
                                return;
                            }
                        }
                        
                        // 如果无法获取真实URL，尝试直接解析页面
                        parseDouyinPage(url, resolve);
                    });
                });
            }

            // 获取短链接重定向后的真实URL
            function resolveShortUrl(url, callback) {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.douyin.com/'
                    },
                    onload: function(response) {
                        // 尝试从响应头获取重定向URL
                        const redirectUrl = response.finalUrl || response.responseURL;
                        if (redirectUrl && redirectUrl.includes('/video/')) {
                            callback(redirectUrl);
                            return;
                        }
                        
                        // 如果没有重定向，尝试从页面内容提取
                        const html = response.responseText;
                        const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
                        if (canonicalMatch) {
                            callback(canonicalMatch[1]);
                            return;
                        }
                        
                        callback(null);
                    },
                    onerror: function(err) {
                        console.log('解析短链接失败:', err);
                        callback(null);
                    }
                });
            }

            // 根据视频ID获取抖音视频
            function fetchDouyinVideoById(videoId, resolve) {
                // 尝试多个API端点
                const apiEndpoints = [
                    `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}&aid=1128&version_name=18.5.0&device_platform=webapp&channel=doubao`,
                    `https://api.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}&aid=1128`,
                    `https://www.douyin.com/aweme/v1/aweme/detail/?aweme_id=${videoId}&aid=1128`,
                    `https://api.amemv.com/aweme/v1/aweme/detail/?aweme_id=${videoId}&aid=1128`,
                    `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}&aid=6383&version_name=18.5.0`,
                    `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}&aid=6383`,
                    `https://www.iesdouyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}&aid=1128`,
                    // 新增端点
                    `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}&aid=3233&version_name=18.5.0`,
                    `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}&aid=3233`,
                    `https://api-toutiao.bytedance.net/aweme/v1/web/aweme/detail/?aweme_id=${videoId}&aid=1128`
                ];
                
                let currentIndex = 0;
                
                function tryNextEndpoint() {
                    if (currentIndex >= apiEndpoints.length) {
                        // 所有API都失败了，尝试使用代理API
                        console.log('所有API端点都失败了，尝试使用代理API');
                        tryProxyApi(videoId, resolve);
                        return;
                    }
                    
                    const apiUrl = apiEndpoints[currentIndex];
                    currentIndex++;
                    
                    // 生成随机设备信息
                    const deviceId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                    const installId = Math.random().toString(36).substring(2, 15);
                    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                        return v.toString(16);
                    });
                    
                    // 轮流使用不同的用户代理和Cookie
                    const userAgents = [
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                        'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
                    ];
                    
                    const cookies = [
                        `tt_webid=${deviceId}; __ac_nonce=0; __ac_signature=0; install_id=${installId}; uuid=${uuid}`,
                        `tt_webid=${deviceId}; __ac_nonce=0; __ac_signature=0`,
                        `tt_webid=${deviceId}`,
                        `tt_webid=7271394255654786054; __ac_nonce=0; __ac_signature=0`
                    ];
                    
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: apiUrl,
                        headers: {
                            'User-Agent': userAgents[currentIndex % userAgents.length],
                            'Referer': 'https://www.douyin.com/',
                            'Accept': 'application/json, text/plain, */*',
                            'Cookie': cookies[currentIndex % cookies.length],
                            'X-Requested-With': 'XMLHttpRequest',
                            'Origin': 'https://www.douyin.com',
                            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                            'Sec-Ch-Ua-Mobile': '?0',
                            'Sec-Ch-Ua-Platform': '"Windows"',
                            'Sec-Fetch-Dest': 'empty',
                            'Sec-Fetch-Mode': 'cors',
                            'Sec-Fetch-Site': 'same-origin',
                            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'Connection': 'keep-alive',
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache'
                        },
                        timeout: 15000,
                        responseType: 'blob',
                        onload: function(response) {
                            console.log('API响应状态:', response.status, '-', apiUrl);
                            
                            // 尝试解析响应
                            let responseText = '';
                            if (response.responseText) {
                                responseText = response.responseText;
                            } else if (response.response) {
                                // 如果是blob类型，尝试转换
                                const reader = new FileReader();
                                reader.onload = function(e) {
                                    responseText = e.target.result;
                                    processResponse(responseText);
                                };
                                reader.onerror = function() {
                                    console.log('无法读取blob响应');
                                    tryNextEndpoint();
                                };
                                reader.readAsText(response.response);
                                return;
                            } else {
                                console.log('API响应为空，尝试下一个端点');
                                tryNextEndpoint();
                                return;
                            }
                            
                            processResponse(responseText);
                        },
                        onerror: function(err) {
                            console.log('抖音API请求失败:', err);
                            tryNextEndpoint();
                        },
                        ontimeout: function() {
                            console.log('API请求超时');
                            tryNextEndpoint();
                        }
                    });
                    
                    function processResponse(responseText) {
                        if (!responseText || responseText.trim() === '') {
                            console.log('API响应为空，尝试下一个端点');
                            tryNextEndpoint();
                            return;
                        }
                        
                        try {
                            const data = JSON.parse(responseText);
                            console.log('API响应解析成功');
                            
                            if (data.aweme_detail) {
                                const video = data.aweme_detail;
                                let videoUrl = '';
                                let coverUrl = '';
                                let foundValidUrl = false;
                                
                                if (video.video) {
                                    // 方法1: play_addr - 播放地址
                                    if (video.video.play_addr && video.video.play_addr.url_list && video.video.play_addr.url_list.length > 0) {
                                        const candidateUrl = video.video.play_addr.url_list[0];
                                        if (isValidVideoUrl(candidateUrl)) {
                                            videoUrl = candidateUrl;
                                            foundValidUrl = true;
                                        }
                                    }
                                    
                                    // 方法2: download_addr - 下载地址
                                    if (!foundValidUrl && video.video.download_addr && video.video.download_addr.url_list && video.video.download_addr.url_list.length > 0) {
                                        const candidateUrl = video.video.download_addr.url_list[0];
                                        if (isValidVideoUrl(candidateUrl)) {
                                            videoUrl = candidateUrl;
                                            foundValidUrl = true;
                                        }
                                    }
                                    
                                    // 方法3: bit_rate - 不同码率的视频
                                    if (!foundValidUrl && video.video.bit_rate && video.video.bit_rate.length > 0) {
                                        for (const bitrate of video.video.bit_rate) {
                                            if (bitrate.play_addr && bitrate.play_addr.url_list && bitrate.play_addr.url_list.length > 0) {
                                                const candidateUrl = bitrate.play_addr.url_list[0];
                                                if (isValidVideoUrl(candidateUrl)) {
                                                    videoUrl = candidateUrl;
                                                    foundValidUrl = true;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                    
                                    // 方法4: 尝试其他字段
                                    if (!foundValidUrl && video.video.origin_video && video.video.origin_video.url_list) {
                                        const candidateUrl = video.video.origin_video.url_list[0];
                                        if (isValidVideoUrl(candidateUrl)) {
                                            videoUrl = candidateUrl;
                                            foundValidUrl = true;
                                        }
                                    }
                                    
                                    // 获取封面
                                    if (video.video.cover && video.video.cover.url_list && video.video.cover.url_list.length > 0) {
                                        coverUrl = video.video.cover.url_list[0];
                                    }
                                    if (!coverUrl && video.video.origin_cover && video.video.origin_cover.url_list && video.video.origin_cover.url_list.length > 0) {
                                        coverUrl = video.video.origin_cover.url_list[0];
                                    }
                                }
                                
                                if (videoUrl && isValidVideoUrl(videoUrl)) {
                                    console.log('成功获取视频URL:', videoUrl);
                                    resolve({
                                        success: true,
                                        videoUrl: videoUrl,
                                        thumbnail: coverUrl && coverUrl.startsWith('http') ? coverUrl : 'https://picsum.photos/320/180',
                                        title: video.desc || video.text || video.title || '抖音视频',
                                        duration: formatDuration(video.duration || video.video.duration || 0),
                                        size: '未知',
                                        platform: '抖音'
                                    });
                                    return;
                                }
                            } else {
                                console.log('API响应中没有aweme_detail字段');
                            }
                        } catch (err) {
                            console.log('解析抖音API失败:', err.message);
                        }
                        
                        // 尝试下一个端点
                        tryNextEndpoint();
                    }
                }
                
                tryNextEndpoint();
            }

            // 尝试使用代理API
            function tryProxyApi(videoId, resolve) {
                const proxyApis = [
                    // 新增代理服务
                    `https://www.xiaohongshuzy.com/api/douyin?url=https://v.douyin.com/${videoId}/`,
                    `https://www.douyin888.net/api/video?url=https://v.douyin.com/${videoId}/`,
                    `https://www.kuaishouzy.com/api/douyin?url=https://v.douyin.com/${videoId}/`,
                    `https://api.douyinzy.org/api/parse?url=https://v.douyin.com/${videoId}/`,
                    // 原有的代理服务
                    `https://api.douyin.wtf/api?url=https://v.douyin.com/${videoId}/`,
                    `https://www.douyinzy.com/api/video?url=https://v.douyin.com/${videoId}/`,
                    `https://douyin.zzzmh.cn/api/search?keyword=${videoId}`,
                    `https://dy.kukutool.com/api/video?url=https://v.douyin.com/${videoId}/`,
                    // 使用视频ID直接调用
                    `https://www.xiaohongshuzy.com/api/douyin/video/${videoId}`,
                    `https://api.douyinzy.org/api/video/${videoId}`
                ];
                
                let currentIndex = 0;
                
                function tryNextProxy() {
                    if (currentIndex >= proxyApis.length) {
                        // 所有代理都失败了，尝试解析页面
                        console.log('所有代理API都失败了，尝试解析页面');
                        parseDouyinPage(`https://www.douyin.com/video/${videoId}`, resolve);
                        return;
                    }
                    
                    const apiUrl = proxyApis[currentIndex];
                    currentIndex++;
                    
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: apiUrl,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Referer': 'https://dy.kukutool.com/',
                            'Accept': 'application/json, text/plain, */*',
                            'Origin': 'https://dy.kukutool.com',
                            'X-Requested-With': 'XMLHttpRequest'
                        },
                        timeout: 15000,
                        onload: function(response) {
                            console.log('代理API响应状态:', response.status, '-', apiUrl);
                            
                            if (!response.responseText || response.responseText.trim() === '') {
                                console.log('代理API响应为空，尝试下一个');
                                tryNextProxy();
                                return;
                            }
                            
                            try {
                                const data = JSON.parse(response.responseText);
                                
                                // 尝试多种代理API返回格式
                                let videoUrl = '';
                                let coverUrl = '';
                                let title = '';
                                
                                // 格式1: data.data.video_url
                                if (data.data && data.data.video_url) {
                                    videoUrl = data.data.video_url;
                                    coverUrl = data.data.cover_url || data.data.cover;
                                    title = data.data.title || data.data.desc;
                                }
                                
                                // 格式2: data.videoUrl
                                if (!videoUrl && data.videoUrl) {
                                    videoUrl = data.videoUrl;
                                    coverUrl = data.cover || data.thumbnail;
                                    title = data.title;
                                }
                                
                                // 格式3: data.url
                                if (!videoUrl && data.url) {
                                    videoUrl = data.url;
                                }
                                
                                // 格式4: data.playUrl
                                if (!videoUrl && data.playUrl) {
                                    videoUrl = data.playUrl;
                                }
                                
                                // 格式5: data.play_addr.url_list
                                if (!videoUrl && data.play_addr && data.play_addr.url_list) {
                                    videoUrl = data.play_addr.url_list[0];
                                }
                                
                                // 格式6: data.result.video_url
                                if (!videoUrl && data.result && data.result.video_url) {
                                    videoUrl = data.result.video_url;
                                    coverUrl = data.result.cover_url;
                                    title = data.result.title;
                                }
                                
                                // 格式7: data.video_info.url
                                if (!videoUrl && data.video_info && data.video_info.url) {
                                    videoUrl = data.video_info.url;
                                }
                                
                                // 格式8: data.data.url
                                if (!videoUrl && data.data && data.data.url) {
                                    videoUrl = data.data.url;
                                }
                                
                                // 格式9: data.data.play_url
                                if (!videoUrl && data.data && data.data.play_url) {
                                    videoUrl = data.data.play_url;
                                }
                                
                                if (videoUrl && isValidVideoUrl(videoUrl)) {
                                    console.log('通过代理API成功获取视频:', videoUrl);
                                    resolve({
                                        success: true,
                                        videoUrl: videoUrl,
                                        thumbnail: coverUrl && coverUrl.startsWith('http') ? coverUrl : 'https://picsum.photos/320/180',
                                        title: title || '抖音视频',
                                        duration: '未知',
                                        size: '未知',
                                        platform: '抖音'
                                    });
                                    return;
                                }
                            } catch (err) {
                                console.log('解析代理API响应失败:', err.message);
                            }
                            
                            tryNextProxy();
                        },
                        onerror: function(err) {
                            console.log('代理API请求失败:', err);
                            tryNextProxy();
                        },
                        ontimeout: function() {
                            console.log('代理API请求超时');
                            tryNextProxy();
                        }
                    });
                }
                
                tryNextProxy();
            }

            // 验证视频URL是否有效
            function isValidVideoUrl(url) {
                if (!url || typeof url !== 'string') return false;
                if (!url.startsWith('http')) return false;
                // 排除封面图片（通常包含cover或有特定特征）
                if (url.includes('cover') || url.includes('thumbnail') || url.includes('poster')) return false;
                // 检查是否是视频文件
                if (url.includes('.mp4') || url.includes('.webm') || url.includes('.flv') || url.includes('/video/')) return true;
                // 检查是否是抖音视频CDN地址
                if (url.includes('douyin') || url.includes('amemv') || url.includes('bytedance') || url.includes('musical')) return true;
                return false;
            }

            // 解析抖音页面
            function parseDouyinPage(url, resolve) {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.douyin.com/',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                    },
                    onload: function(response) {
                        try {
                            const html = response.responseText;
                            console.log('开始解析抖音页面...');
                            
                            // 模式1: 从__NEXT_DATA__提取（新版页面）
                            const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
                            if (nextDataMatch) {
                                try {
                                    const data = JSON.parse(nextDataMatch[1]);
                                    if (data.props && data.props.pageProps && data.props.pageProps.videoData) {
                                        const video = data.props.pageProps.videoData;
                                        if (video.playUrl || video.videoUrl) {
                                            const videoUrl = video.playUrl || video.videoUrl;
                                            if (isValidVideoUrl(videoUrl)) {
                                                resolve({
                                                    success: true,
                                                    videoUrl: videoUrl,
                                                    thumbnail: video.cover || video.coverUrl || 'https://picsum.photos/320/180',
                                                    title: video.title || video.desc || '抖音视频',
                                                    duration: formatDuration(video.duration || 0),
                                                    size: '未知',
                                                    platform: '抖音'
                                                });
                                                return;
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.log('解析__NEXT_DATA__失败:', e.message);
                                }
                            }
                            
                            // 模式2: 从window.__INITIAL_STATE__提取
                            const initialStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
                            if (initialStateMatch) {
                                try {
                                    const state = JSON.parse(initialStateMatch[1]);
                                    if (state.awemeDetail) {
                                        const video = state.awemeDetail;
                                        if (video.video && video.video.play_addr && video.video.play_addr.url_list) {
                                            const videoUrl = video.video.play_addr.url_list[0];
                                            if (isValidVideoUrl(videoUrl)) {
                                                const coverUrl = video.video.cover && video.video.cover.url_list ? video.video.cover.url_list[0] : '';
                                                resolve({
                                                    success: true,
                                                    videoUrl: videoUrl,
                                                    thumbnail: coverUrl && coverUrl.startsWith('http') ? coverUrl : 'https://picsum.photos/320/180',
                                                    title: video.desc || '抖音视频',
                                                    duration: formatDuration(video.duration || 0),
                                                    size: '未知',
                                                    platform: '抖音'
                                                });
                                                return;
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.log('解析__INITIAL_STATE__失败:', e.message);
                                }
                            }
                            
                            // 模式3: 从window.__playinfo__提取
                            const playinfoMatch = html.match(/window\.__playinfo__\s*=\s*({[\s\S]*?});/);
                            if (playinfoMatch) {
                                try {
                                    const playinfo = JSON.parse(playinfoMatch[1]);
                                    if (playinfo.data && playinfo.data.aweme_list && playinfo.data.aweme_list[0]) {
                                        const aweme = playinfo.data.aweme_list[0];
                                        if (aweme.video && aweme.video.play_addr && aweme.video.play_addr.url_list) {
                                            const videoUrl = aweme.video.play_addr.url_list[0];
                                            if (isValidVideoUrl(videoUrl)) {
                                                resolve({
                                                    success: true,
                                                    videoUrl: videoUrl,
                                                    thumbnail: aweme.video.cover && aweme.video.cover.url_list ? aweme.video.cover.url_list[0] : 'https://picsum.photos/320/180',
                                                    title: aweme.desc || '抖音视频',
                                                    duration: formatDuration(aweme.duration || 0),
                                                    size: '未知',
                                                    platform: '抖音'
                                                });
                                                return;
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.log('解析__playinfo__失败:', e.message);
                                }
                            }
                            
                            // 模式4: 从页面中的JSON数据提取
                            const jsonMatch = html.match(/({"aweme_detail":[\s\S]*?})\s*<\/script>/);
                            if (jsonMatch) {
                                try {
                                    const data = JSON.parse(jsonMatch[1]);
                                    if (data.aweme_detail && data.aweme_detail.video) {
                                        const video = data.aweme_detail;
                                        if (video.video.play_addr && video.video.play_addr.url_list) {
                                            const videoUrl = video.video.play_addr.url_list[0];
                                            if (isValidVideoUrl(videoUrl)) {
                                                resolve({
                                                    success: true,
                                                    videoUrl: videoUrl,
                                                    thumbnail: video.video.cover && video.video.cover.url_list ? video.video.cover.url_list[0] : 'https://picsum.photos/320/180',
                                                    title: video.desc || '抖音视频',
                                                    duration: formatDuration(video.duration || 0),
                                                    size: '未知',
                                                    platform: '抖音'
                                                });
                                                return;
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.log('解析页面JSON失败:', e.message);
                                }
                            }
                            
                            // 模式5: 从embed配置提取
                            const embedMatch = html.match(/embedConfig\s*=\s*({[\s\S]*?});/);
                            if (embedMatch) {
                                try {
                                    const config = JSON.parse(embedMatch[1]);
                                    if (config.video && config.video.playUrl) {
                                        const videoUrl = config.video.playUrl;
                                        if (isValidVideoUrl(videoUrl)) {
                                            resolve({
                                                success: true,
                                                videoUrl: videoUrl,
                                                thumbnail: config.video.coverUrl || 'https://picsum.photos/320/180',
                                                title: config.video.title || '抖音视频',
                                                duration: formatDuration(config.video.duration || 0),
                                                size: '未知',
                                                platform: '抖音'
                                            });
                                            return;
                                        }
                                    }
                                } catch (e) {
                                    console.log('解析embedConfig失败:', e.message);
                                }
                            }
                            
                            // 模式6: 通用正则匹配 - playAddr
                            let videoUrl = '';
                            const playAddrMatch = html.match(/"playAddr":"([^"]+)"/);
                            if (playAddrMatch) {
                                videoUrl = decodeURIComponent(playAddrMatch[1].replace(/\\u002F/g, '/'));
                            }
                            
                            // 模式7: srcNoMark
                            if (!videoUrl) {
                                const srcNoMarkMatch = html.match(/"srcNoMark":"([^"]+)"/);
                                if (srcNoMarkMatch) {
                                    videoUrl = decodeURIComponent(srcNoMarkMatch[1].replace(/\\u002F/g, '/'));
                                }
                            }
                            
                            // 模式8: 从video标签提取
                            if (!videoUrl) {
                                const videoTagMatch = html.match(/<video[^>]+src=["']([^"']+)["']/);
                                if (videoTagMatch) {
                                    videoUrl = videoTagMatch[1];
                                }
                            }
                            
                            // 模式9: 从source标签提取
                            if (!videoUrl) {
                                const sourceMatch = html.match(/<source[^>]+src=["']([^"']+)["']/);
                                if (sourceMatch) {
                                    videoUrl = sourceMatch[1];
                                }
                            }
                            
                            if (videoUrl && isValidVideoUrl(videoUrl)) {
                                console.log('通过正则匹配找到视频:', videoUrl);
                                // 尝试提取封面和标题
                                const coverMatch = html.match(/"cover":"([^"]+)"/);
                                const titleMatch = html.match(/"desc":"([^"]+)"/);
                                const titleMatch2 = html.match(/<title>([^<]+)<\/title>/);
                                resolve({
                                    success: true,
                                    videoUrl: videoUrl,
                                    thumbnail: coverMatch ? decodeURIComponent(coverMatch[1]) : 'https://picsum.photos/320/180',
                                    title: titleMatch ? decodeURIComponent(titleMatch[1]) : (titleMatch2 ? titleMatch2[1].replace(' - 抖音', '') : '抖音视频'),
                                    duration: '未知',
                                    size: '未知',
                                    platform: '抖音'
                                });
                                return;
                            }
                            
                            console.log('所有解析模式都失败了');
                        } catch (err) {
                            console.log('解析抖音页面失败:', err.message);
                        }
                        
                        // 所有方法都失败
                        resolve({
                            success: false,
                            error: '无法从抖音链接中提取视频，可能是平台限制或链接格式不支持',
                            videoUrl: url,
                            thumbnail: 'https://picsum.photos/320/180',
                            title: '抖音视频',
                            duration: '未知',
                            size: '未知',
                            platform: '抖音'
                        });
                    },
                    onerror: function(err) {
                        console.log('获取抖音页面失败:', err);
                        resolve({
                            success: false,
                            error: '无法访问抖音页面',
                            videoUrl: url,
                            thumbnail: 'https://picsum.photos/320/180',
                            title: '抖音视频',
                            duration: '未知',
                            size: '未知',
                            platform: '抖音'
                        });
                    }
                });
            }

            // 解析B站视频
            async function parseBilibiliVideo(url) {
                return new Promise((resolve) => {
                    const bvid = url.match(/bilibili\.com\/video\/([^\/\?]+)/) || url.match(/b23\.tv\/([^\/\?]+)/);
                    if (bvid) {
                        const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid[1]}`;
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: apiUrl,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Referer': 'https://www.bilibili.com/'
                            },
                            onload: function(response) {
                                try {
                                    const data = JSON.parse(response.responseText);
                                    if (data.data) {
                                        resolve({
                                            success: true,
                                            videoUrl: `https://api.bilibili.com/x/player/playurl?bvid=${bvid[1]}&cid=${data.data.cid}&qn=120`,
                                            thumbnail: data.data.pic,
                                            title: data.data.title,
                                            duration: formatDuration(data.data.duration),
                                            size: '未知',
                                            platform: 'B站'
                                        });
                                        return;
                                    }
                                } catch (err) {
                                    console.log('解析B站视频失败:', err.message);
                                }
                                resolve({
                                    success: true,
                                    videoUrl: url,
                                    thumbnail: 'https://picsum.photos/320/180',
                                    title: 'B站视频',
                                    duration: '未知',
                                    size: '未知',
                                    platform: 'B站'
                                });
                            },
                            onerror: function(err) {
                                console.log('获取B站数据失败:', err);
                                resolve({
                                    success: true,
                                    videoUrl: url,
                                    thumbnail: 'https://picsum.photos/320/180',
                                    title: 'B站视频',
                                    duration: '未知',
                                    size: '未知',
                                    platform: 'B站'
                                });
                            }
                        });
                    } else {
                        resolve({
                            success: true,
                            videoUrl: url,
                            thumbnail: 'https://picsum.photos/320/180',
                            title: 'B站视频',
                            duration: '未知',
                            size: '未知',
                            platform: 'B站'
                        });
                    }
                });
            }

            // 解析快手视频
            async function parseKuaishouVideo(url) {
                return new Promise((resolve) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': 'https://www.kuaishou.com/'
                        },
                        onload: function(response) {
                            try {
                                const html = response.responseText;
                                const videoMatch = html.match(/"playUrl":"([^"]+)"/);
                                const coverMatch = html.match(/"coverUrl":"([^"]+)"/);
                                const titleMatch = html.match(/"caption":"([^"]+)"/);
                                
                                if (videoMatch && videoMatch[1]) {
                                    resolve({
                                        success: true,
                                        videoUrl: decodeURIComponent(videoMatch[1]),
                                        thumbnail: coverMatch ? decodeURIComponent(coverMatch[1]) : 'https://picsum.photos/320/180',
                                        title: titleMatch ? decodeURIComponent(titleMatch[1]) : '快手视频',
                                        duration: '未知',
                                        size: '未知',
                                        platform: '快手'
                                    });
                                    return;
                                }
                            } catch (err) {
                                console.log('解析快手视频失败:', err.message);
                            }
                            resolve({
                                success: true,
                                videoUrl: url,
                                thumbnail: 'https://picsum.photos/320/180',
                                title: '快手视频',
                                duration: '未知',
                                size: '未知',
                                platform: '快手'
                            });
                        },
                        onerror: function(err) {
                            console.log('获取快手页面失败:', err);
                            resolve({
                                success: true,
                                videoUrl: url,
                                thumbnail: 'https://picsum.photos/320/180',
                                title: '快手视频',
                                duration: '未知',
                                size: '未知',
                                platform: '快手'
                            });
                        }
                    });
                });
            }

            // 解析微博视频
            async function parseWeiboVideo(url) {
                return new Promise((resolve) => {
                    const statusId = url.match(/status\/([^\/\?]+)/);
                    if (statusId) {
                        const apiUrl = `https://m.weibo.cn/detail/${statusId[1]}`;
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: apiUrl,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Referer': 'https://m.weibo.cn/'
                            },
                            onload: function(response) {
                                try {
                                    const html = response.responseText;
                                    const videoMatch = html.match(/"stream_url":"([^"]+)"/);
                                    const coverMatch = html.match(/"page_pic":"([^"]+)"/);
                                    
                                    if (videoMatch && videoMatch[1]) {
                                        resolve({
                                            success: true,
                                            videoUrl: decodeURIComponent(videoMatch[1]),
                                            thumbnail: coverMatch ? decodeURIComponent(coverMatch[1]) : 'https://picsum.photos/320/180',
                                            title: '微博视频',
                                            duration: '未知',
                                            size: '未知',
                                            platform: '微博'
                                        });
                                        return;
                                    }
                                } catch (err) {
                                    console.log('解析微博视频失败:', err.message);
                                }
                                resolve({
                                    success: true,
                                    videoUrl: url,
                                    thumbnail: 'https://picsum.photos/320/180',
                                    title: '微博视频',
                                    duration: '未知',
                                    size: '未知',
                                    platform: '微博'
                                });
                            },
                            onerror: function(err) {
                                console.log('获取微博页面失败:', err);
                                resolve({
                                    success: true,
                                    videoUrl: url,
                                    thumbnail: 'https://picsum.photos/320/180',
                                    title: '微博视频',
                                    duration: '未知',
                                    size: '未知',
                                    platform: '微博'
                                });
                            }
                        });
                    } else {
                        resolve({
                            success: true,
                            videoUrl: url,
                            thumbnail: 'https://picsum.photos/320/180',
                            title: '微博视频',
                            duration: '未知',
                            size: '未知',
                            platform: '微博'
                        });
                    }
                });
            }

            // 格式化时长
            function formatDuration(seconds) {
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                return `${mins}:${secs.toString().padStart(2, '0')}`;
            }

            // 上传相关元素
            const uploadFileEl = $('el-upload-file');
            const uploadFilenameEl = $('el-upload-filename');
            const fileListEl = $('el-file-list');
            const selectFilesBtn = $('el-select-files');
            const uploadBtn = $('el-upload');
            const clearFilesBtn = $('el-clear-files');
            const saveTokenBtn = $('el-save-token');
            const clearTokenBtn = $('el-clear-token');
            const pasteTableBtn = $('el-paste-table');
            const copyPngLinksBtn = $('el-copy-png-links');

            // 标题简介生成元素
            const genDescEl = $('el-gen-description');
            const genTitleDescBtn = $('el-gen-title-desc');

            // 从文本中提取纯链接
            function extractCleanLink(text) {
                // 匹配各种链接
                const urlPattern = /(https?:\/\/[^\s<>"`]+)/g;
                const matches = text.match(urlPattern);

                if (matches && matches.length > 0) {
                    // 只返回第一个链接
                    return matches[0].replace(/[.,;:!?"'`]+$/, '');
                }
                return null;
            }

            // 粘贴表格按钮功能
            pasteTableBtn.onclick = async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    if (!text) {
                        notify('剪贴板为空', 'warn');
                        return;
                    }

                    const cells = text.split('\t').map(cell => cell.trim()).filter(cell => cell.length > 0);

                    if (cells.length >= 1) {
                        let title = '', desc = '', originalUrl = '', shortUrl = '';

                        for (const cell of cells) {
                            const trimmed = cell.trim();
                            if (!trimmed) continue;

                            // 尝试从单元格中提取纯链接
                            const cleanLink = extractCleanLink(trimmed);

                            if (cleanLink) {
                                if (cleanLink.startsWith('https://easylink.cc/')) {
                                    shortUrl = cleanLink;
                                } else if (cleanLink.startsWith('https://v.douyin.com/') ||
                                           cleanLink.startsWith('https://www.douyin.com/') ||
                                           cleanLink.startsWith('https://www.bilibili.com/') ||
                                           cleanLink.startsWith('https://b23.tv/') ||
                                           cleanLink.startsWith('http://')) {
                                    originalUrl = cleanLink;
                                }
                            } else if (trimmed.match(/^\d{4}[\.\-/]\d{1,2}[\.\-/]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/) ||
                                       trimmed.match(/^\d{4}年\d{1,2}月\d{1,2}日?$/) ||
                                       trimmed.match(/^\d{8}$/)) {
                                continue;
                            } else if (!title) {
                                title = trimmed;
                            } else if (!desc) {
                                desc = trimmed;
                            }
                        }

                        if (title) titleEl.value = title;
                        if (desc) descEl.value = desc;
                        if (originalUrl) originalUrlEl.value = originalUrl;
                        if (shortUrl) urlEl.value = shortUrl;

                        notify('已自动识别表格数据', 'success');
                    } else {
                        notify('未识别到有效数据', 'warn');
                    }
                } catch (e) {
                    notify('粘贴失败: ' + e.message, 'error');
                }
            };

            // 配置面板显示/隐藏
            settingsBtn.onclick = () => {
                const isHidden = configPanel.style.display === 'none';
                configPanel.style.display = isHidden ? 'block' : 'none';
            };

            // 检查更新按钮
            checkUpdateBtn.onclick = () => {
                checkForUpdates();
            };

            // 检查更新函数
            function checkForUpdates() {
                const currentVersion = '6.6.7';
                const rawUrl = 'https://raw.githubusercontent.com/pppon12/erchuangjs/main/ecbjgj.js';
                const downloadUrl = 'https://github.com/pppon12/erchuangjs/raw/main/ecbjgj.js';
                
                checkUpdateBtn.innerHTML = '⏳';
                checkUpdateBtn.disabled = true;
                
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: rawUrl,
                    timeout: 10000,
                    headers: {
                        'Accept': 'text/plain'
                    },
                    onload: function(response) {
                        checkUpdateBtn.innerHTML = '🔄';
                        checkUpdateBtn.disabled = false;
                        
                        if (response.status === 200) {
                            const match = response.responseText.match(/@version\s+(\d+\.\d+\.\d+)/);
                            if (match) {
                                const latestVersion = match[1];
                                if (compareVersions(latestVersion, currentVersion) > 0) {
                                    if (confirm(`发现新版本 v${latestVersion}！\n\n当前版本: v${currentVersion}\n最新版本: v${latestVersion}\n\n是否立即更新？`)) {
                                        window.open(downloadUrl);
                                    }
                                } else {
                                    notify('✅ 当前已是最新版本', 'success');
                                }
                            } else {
                                notify('❌ 无法获取版本信息', 'error');
                            }
                        } else {
                            notify('❌ 检查更新失败，状态码: ' + response.status, 'error');
                        }
                    },
                    onerror: function(error) {
                        checkUpdateBtn.innerHTML = '🔄';
                        checkUpdateBtn.disabled = false;
                        notify('❌ 网络连接失败: ' + (error?.message || '未知错误'), 'error');
                    },
                    ontimeout: function() {
                        checkUpdateBtn.innerHTML = '🔄';
                        checkUpdateBtn.disabled = false;
                        notify('❌ 请求超时', 'error');
                    }
                });
            }

            // 版本比较函数
            function compareVersions(v1, v2) {
                const parts1 = v1.split('.').map(Number);
                const parts2 = v2.split('.').map(Number);
                const length = Math.max(parts1.length, parts2.length);
                
                for (let i = 0; i < length; i++) {
                    const p1 = parts1[i] || 0;
                    const p2 = parts2[i] || 0;
                    if (p1 > p2) return 1;
                    if (p1 < p2) return -1;
                }
                return 0;
            }

            // 页面加载时自动检查更新（每天检查一次）
            const lastCheckDate = GM_getValue('el_last_update_check', '');
            const today = new Date().toDateString();
            if (lastCheckDate !== today) {
                GM_setValue('el_last_update_check', today);
                setTimeout(checkForUpdates, 5000); // 页面加载5秒后自动检查
            }

            // 配置路径保存

            // 初始化比例按钮状态
            function updateRatioButtons() {
                if (currentRatio === '3:2') {
                    ratioBtn32.style.background = '#e3f2fd';
                    ratioBtn32.style.color = '#1565c0';
                    ratioBtn710.style.background = '#f5f5f5';
                    ratioBtn710.style.color = '#666';
                } else {
                    ratioBtn32.style.background = '#f5f5f5';
                    ratioBtn32.style.color = '#666';
                    ratioBtn710.style.background = '#e3f2fd';
                    ratioBtn710.style.color = '#1565c0';
                }
            }
            updateRatioButtons();

            ratioBtn32.onclick = () => {
                currentRatio = '3:2';
                GM_setValue(S.ratio, currentRatio);
                updateRatioButtons();
                notify('已选择 3:2（横封面）');
            };
            ratioBtn710.onclick = () => {
                currentRatio = '7:10';
                GM_setValue(S.ratio, currentRatio);
                updateRatioButtons();
                notify('已选择 7:10（竖封面）');
            };

            // 已选择的文件列表
            let selectedFiles = [];

            // 上传的文件信息列表（用于复制简介）
            let uploadedFilesInfo = [];

            // 计算比例（竖图: 宽固定700，横图: 宽固定3000）
            function simplifyRatio(width, height) {
                if (width === 0 || height === 0) return '0:0';

                // 判断是横图还是竖图
                const isLandscape = width >= height;

                if (isLandscape) {
                    // 横图：宽固定3000，计算高度
                    const fixedWidth = 3000;
                    const calculatedHeight = (height * fixedWidth / width).toFixed(2);
                    return `${fixedWidth}:${calculatedHeight}`;
                } else {
                    // 竖图：宽固定700，计算高度
                    const fixedWidth = 700;
                    const calculatedHeight = (height * fixedWidth / width).toFixed(2);
                    return `${fixedWidth}:${calculatedHeight}`;
                }
            }

            // 获取图片尺寸信息
            async function getImageInfo(url) {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        const width = img.width;
                        const height = img.height;
                        const ratio = simplifyRatio(width, height);
                        const isLandscape = width > height;
                        resolve({ width, height, ratio, isLandscape, url });
                    };
                    img.onerror = () => {
                        resolve({ width: 0, height: 0, ratio: '未知', isLandscape: true, url });
                    };
                    img.src = url;
                });
            }

            // 提取图片链接按钮功能
            copyPngLinksBtn.onclick = async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    if (!text) {
                        notify('剪贴板为空', 'warn');
                        return;
                    }

                    const pngLinks = [];
                    const pattern = /文件名[：:]\s*([^\n\r]+?\.(?:png|jpg|jpeg|jfif|gif|webp|bmp|svg))[\s\S]*?云链接[：:]\s*[`'"]?(https?:\/\/easylink\.cc\/[^`'"\s]+)/gi;
                    let match;

                    while ((match = pattern.exec(text)) !== null) {
                        const filename = match[1].trim();
                        const cloudLink = match[2].trim();
                        pngLinks.push({ filename, url: cloudLink });
                    }

                    if (pngLinks.length > 0) {
                        // 获取所有图片的尺寸信息
                        notify(`⏳ 正在获取 ${pngLinks.length} 张图片尺寸...`, 'loading');

                        const imageInfos = await Promise.all(
                            pngLinks.map(item => getImageInfo(item.url))
                        );

                        // 生成显示用的文本（带完整信息）
                        let displayText = '';
                        // 生成剪贴板文本（只包含链接）
                        let clipboardText = '';
                        let statsText = '';

                        imageInfos.forEach((info, index) => {
                            const item = pngLinks[index];
                            // 使用高度/宽度的比值来校验，精确到0.01
                            const actualRatio = (info.height / info.width).toFixed(2);
                            const requiredRatioValue = info.isLandscape ? (2/3).toFixed(2) : (10/7).toFixed(2);
                            const requiredRatioText = info.isLandscape ? '3:2' : '7:10';
                            const ratioOk = actualRatio === requiredRatioValue;

                            displayText += `${item.filename}\n`;
                            displayText += `📏 ${info.width} × ${info.height}px (${info.ratio})${ratioOk ? ' ✅' : ' ❌(需' + requiredRatioText + ')'}\n`;
                            displayText += `🔗 ${info.url}\n\n`;

                            // 剪贴板只放纯链接
                            clipboardText += `${info.url}\n`;
                        });

                        // 统计信息
                        const total = imageInfos.length;
                        const landscape = imageInfos.filter(i => i.isLandscape).length;
                        const portrait = imageInfos.filter(i => !i.isLandscape).length;
                        const okRatio = imageInfos.filter(i => {
                            const required = i.isLandscape ? '3:2' : '7:10';
                            return i.ratio === required;
                        }).length;

                        statsText = `📊 共${total}张图 | 横图${landscape}张 | 竖图${portrait}张 | 比例正确${okRatio}张`;

                        // 复制到剪贴板的只有纯链接
                        GM_setClipboard(clipboardText.trim());
                        notify(`✅ 已复制 ${pngLinks.length} 个图片链接`, 'success');
                        setStatus(`${statsText}\n\n${displayText}`, 'ok', displayText);
                    } else {
                        notify('未找到图片文件（.png）的云链接', 'warn');
                    }
                } catch (e) {
                    notify('提取失败: ' + e.message, 'error');
                }
            };

            let currentImgData = savedImg;
            let currentImgType = savedImgType;
            let currentImgName = savedImgName;

            // 拖动
            let drag = false, ox = 0, oy = 0;
            const elHead = $('el-head');
            if (elHead) {
                elHead.onmousedown = function(e) {
                    if (e.target.tagName === 'BUTTON') return;
                    drag = true;
                    const r = panel.getBoundingClientRect();
                    ox = e.clientX - r.left;
                    oy = e.clientY - r.top;
                };
            }

            document.addEventListener('mousemove', function(e) {
                if (!drag) return;
                panel.style.left = Math.max(0, e.clientX - ox) + 'px';
                panel.style.top = Math.max(0, e.clientY - oy) + 'px';
            });

            document.addEventListener('mouseup', function() {
                if (drag) {
                    drag = false;
                    GM_setValue(S.pos, { x: parseInt(panel.style.left), y: parseInt(panel.style.top) });
                }
            });

            // 最小化
            let minimized = false;
            let originalHeight = '500px';
            if (minBtn) {
                minBtn.onclick = function() {
                    minimized = !minimized;
                    const elBody = $('el-body');
                    const elTabs = $('el-tabs');
                    const elConfig = $('el-config');

                    if (minimized) {
                        originalHeight = panel.style.height || '500px';
                        panel.style.height = '48px';
                    } else {
                        panel.style.height = originalHeight;
                    }

                    if (elBody) {
                        elBody.style.display = minimized ? 'none' : 'block';
                    }
                    if (elTabs) {
                        elTabs.style.display = minimized ? 'none' : 'flex';
                    }
                    if (elConfig && elConfig.style.display === 'block') {
                        elConfig.style.display = minimized ? 'none' : 'block';
                    }
                    minBtn.textContent = minimized ? '+' : '−';
                };
            }

            // 清空所有数据按钮
            clearAllBtn.onclick = () => {
                // 清空输入框
                titleEl.value = '';
                descEl.value = '';
                originalUrlEl.value = '';
                urlEl.value = '';
                imgEl.value = '';
                genDescEl.value = '';

                // 清空上传记录
                selectedFiles = [];
                uploadedFilesInfo = [];
                updateFileList();
                uploadFilenameEl.value = '';

                // 清空图片预览
                imgPreview.src = '';
                imgPreview.classList.remove('show');
                imgPreview.classList.add('hide');
                currentImgData = '';
                currentImgType = '';
                currentImgName = '';

                // 清空状态
                setStatus('', 'ok');

                // 保存空值到存储
                GM_setValue(S.title, '');
                GM_setValue(S.desc, '');
                GM_setValue(S.originalUrl, '');
                GM_setValue(S.url, '');

                notify('已清空所有数据', 'success');
            };

            // 图片URL：粘贴后自动通过浏览器下载到本地
            let urlPreviewTimer = null;
            function updateImgUrlPreview() {
                const url = imgEl.value.trim();
                if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                    // 显示预览
                    imgPreview.src = url;
                    imgPreview.classList.remove('hide');
                    imgPreview.classList.add('show');

                    // 不自动下载，只记录URL，在复制命令时下载
                    currentImgData = url;
                    currentImgType = 'url';
                    currentImgName = '';
                    GM_setValue(S.img, url);
                    GM_setValue(S.imgType, 'url');
                    GM_setValue(S.imgName, '');

                    // 加载图片获取尺寸信息
                    const img = new Image();
                    img.onload = () => {
                        const width = img.width;
                        const height = img.height;
                        const ratio = simplifyRatio(width, height);
                        const isLandscape = width > height;
                        // 使用高度/宽度的比值来校验，精确到0.01
                        const actualRatio = (height / width).toFixed(2);
                        const requiredRatioValue = isLandscape ? (2/3).toFixed(2) : (10/7).toFixed(2);
                        const requiredRatioText = isLandscape ? '3:2' : '7:10';
                        const ratioOk = actualRatio === requiredRatioValue;
                        const checkText = ratioOk ? '比例正确' : `需${requiredRatioText}`;
                        const checkColor = ratioOk ? '#22c55e' : '#ef4444';

                        document.getElementById('el-img-info').classList.remove('hide');
                        document.getElementById('el-img-info').classList.add('show');
                        document.getElementById('el-img-size').textContent = `尺寸: ${width} × ${height}px`;
                        document.getElementById('el-img-ratio').textContent = `比例: ${ratio}`;
                        document.getElementById('el-img-check').textContent = `校验: ${checkText}`;
                        document.getElementById('el-img-check').style.color = checkColor;
                    };
                    img.onerror = () => {
                        // 加载失败时隐藏信息
                        document.getElementById('el-img-info').classList.remove('show');
                        document.getElementById('el-img-info').classList.add('hide');
                    };
                    img.src = url;

                    notify('✅ 图片URL已记录，将在复制命令时下载', 'success');
                } else if (url && url.startsWith('blob:')) {
                    notify('blob地址无法直接使用，请点击"抓取blob图片"', 'warn');
                } else {
                    if (currentImgType !== 'base64') {
                        imgPreview.src = '';
                        imgPreview.classList.remove('show');
                        imgPreview.classList.add('hide');
                        currentImgData = '';
                        currentImgType = '';
                        currentImgName = '';
                        GM_setValue(S.img, '');
                        GM_setValue(S.imgType, '');
                        GM_setValue(S.imgName, '');
                        // 隐藏尺寸信息
                        document.getElementById('el-img-info').classList.remove('show');
                        document.getElementById('el-img-info').classList.add('hide');
                    }
                }
            }

            imgEl.addEventListener('input', updateImgUrlPreview);
            imgEl.addEventListener('change', updateImgUrlPreview);

            // 图片输入框粘贴事件（支持粘贴本地图片文件）
            imgEl.addEventListener('paste', (e) => {
                const items = e.clipboardData?.items;
                if (!items) return;

                let foundImage = false;
                for (const item of items) {
                    if (item.type.startsWith('image/')) {
                        foundImage = true;
                        e.preventDefault();
                        const file = item.getAsFile();
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                                const base64Data = event.target?.result;
                                if (base64Data) {
                                    const img = new Image();
                                    img.onload = () => {
                                        const width = img.width;
                                        const height = img.height;
                                        const ratio = simplifyRatio(width, height);
                                        const isLandscape = width > height;
                                        const actualRatio = (height / width).toFixed(2);
                                        const requiredRatioValue = isLandscape ? (2/3).toFixed(2) : (10/7).toFixed(2);
                                        const ratioOk = actualRatio === requiredRatioValue;
                                        const checkText = ratioOk ? '符合' + (isLandscape ? '3:2' : '7:10') : '需' + (isLandscape ? '3:2' : '7:10');
                                        const checkColor = ratioOk ? '#22c55e' : '#ef4444';

                                        currentImgData = base64Data;
                                        currentImgType = 'base64';
                                        currentImgName = file.name.replace(/\.[^.]+$/, '');
                                        imgPreview.src = base64Data;
                                        imgPreview.classList.remove('hide');
                                        imgPreview.classList.add('show');
                                        imgEl.value = '[已粘贴本地图片]';
                                        GM_setValue(S.img, '[本地]');
                                        GM_setValue(S.imgType, 'base64');
                                        GM_setValue(S.imgName, currentImgName);

                                        document.getElementById('el-img-info').classList.remove('hide');
                                        document.getElementById('el-img-info').classList.add('show');
                                        document.getElementById('el-img-size').textContent = `尺寸: ${width} × ${height}px`;
                                        document.getElementById('el-img-ratio').textContent = `比例: ${ratio}`;
                                        document.getElementById('el-img-check').textContent = `校验: ${checkText}`;
                                        document.getElementById('el-img-check').style.color = checkColor;

                                        notify('✅ 已粘贴本地图片', 'success');
                                    };
                                    img.onerror = () => {
                                        notify('❌ 无法加载图片', 'error');
                                    };
                                    img.src = base64Data;
                                }
                            };
                            reader.readAsDataURL(file);
                        }
                        break;
                    }
                }
                
                // 如果没有找到图片，允许默认粘贴行为（粘贴URL）
                if (!foundImage) {
                    // 延迟执行，让默认粘贴完成后再处理URL预览
                    setTimeout(() => {
                        updateImgUrlPreview();
                    }, 100);
                }
            });

            // 文件选择按钮
            selectFilesBtn.onclick = () => {
                // 清空之前的选择和上传记录
                selectedFiles = [];
                uploadedFilesInfo = [];
                updateFileList();
                uploadFileEl.click();
            };

            // 清除文件按钮
            clearFilesBtn.onclick = () => {
                selectedFiles = [];
                uploadedFilesInfo = [];
                updateFileList();
            };

            // 选择本地图片文件（用于图片输入）
            const localFileInput = document.getElementById('el-local-file');
            if (localFileInput) {
                localFileInput.addEventListener('change', (e) => {
                    const file = e.target?.files?.[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const base64Data = event.target?.result;
                        if (base64Data) {
                            const img = new Image();
                            img.onload = () => {
                                const width = img.width;
                                const height = img.height;
                                const ratio = simplifyRatio(width, height);
                                const isLandscape = width > height;
                                const actualRatio = (height / width).toFixed(2);
                                const requiredRatioValue = isLandscape ? (2/3).toFixed(2) : (10/7).toFixed(2);
                                const ratioOk = actualRatio === requiredRatioValue;
                                const checkText = ratioOk ? '符合' + (isLandscape ? '3:2' : '7:10') : '需' + (isLandscape ? '3:2' : '7:10');
                                const checkColor = ratioOk ? '#22c55e' : '#ef4444';

                                currentImgData = base64Data;
                                currentImgType = 'base64';
                                currentImgName = file.name.replace(/\.[^.]+$/, '');
                                imgPreview.src = base64Data;
                                imgPreview.classList.remove('hide');
                                imgPreview.classList.add('show');
                                imgEl.value = '[已选择本地图片]';
                                GM_setValue(S.img, '[本地]');
                                GM_setValue(S.imgType, 'base64');
                                GM_setValue(S.imgName, currentImgName);

                                document.getElementById('el-img-info').classList.remove('hide');
                                document.getElementById('el-img-info').classList.add('show');
                                document.getElementById('el-img-size').textContent = `尺寸: ${width} × ${height}px`;
                                document.getElementById('el-img-ratio').textContent = `比例: ${ratio}`;
                                document.getElementById('el-img-check').textContent = `校验: ${checkText}`;
                                document.getElementById('el-img-check').style.color = checkColor;

                                notify('✅ 已加载本地图片', 'success');
                            };
                            img.onerror = () => {
                                notify('❌ 无法加载图片', 'error');
                            };
                            img.src = base64Data;
                        }
                    };
                    reader.readAsDataURL(file);
                });
            }

            // 保存登录信息按钮
            saveTokenBtn.onclick = () => {
                saveAuthToken();
            };

            // 清除登录信息按钮
            clearTokenBtn.onclick = () => {
                clearAuthToken();
            };

            // 文件选择变化
            uploadFileEl.onchange = (e) => {
                const files = Array.from(e.target.files);
                if (files.length > 0) {
                    selectedFiles = files;
                    updateFileList();
                }
            };

            // 拖拽上传支持
            const dropZone = document.getElementById('el-file-drop-zone');
            if (dropZone) {
                dropZone.addEventListener('dragenter', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropZone.style.borderColor = '#2196f3';
                    dropZone.style.backgroundColor = '#e3f2fd';
                });

                dropZone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });

                dropZone.addEventListener('dragleave', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropZone.style.borderColor = '#ccc';
                    dropZone.style.backgroundColor = '';
                });

                dropZone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropZone.style.borderColor = '#ccc';
                    dropZone.style.backgroundColor = '';
                    
                    const files = Array.from(e.dataTransfer?.files || []);
                    if (files.length > 0) {
                        selectedFiles = files;
                        updateFileList();
                    }
                });
            }

            // 粘贴上传支持
            document.addEventListener('paste', (e) => {
                const files = Array.from(e.clipboardData?.files || []);
                if (files.length > 0) {
                    const activeEl = document.activeElement;
                    const isInPanel = activeEl?.closest('#el-panel');
                    if (isInPanel) {
                        selectedFiles = files;
                        updateFileList();
                    }
                }
            });

            // 更新文件列表显示
            function updateFileList() {
                if (selectedFiles.length === 0) {
                    fileListEl.style.display = 'none';
                    uploadFilenameEl.value = '';
                    return;
                }

                uploadFilenameEl.value = `已选择 ${selectedFiles.length} 个文件`;
                fileListEl.style.display = 'block';

                let html = '';
                selectedFiles.forEach((file, index) => {
                    const size = formatFileSize(file.size);
                    html += `
                        <div style="display: flex; align-items: center; padding: 4px; border-bottom: 1px solid #f0f0f0;">
                            <input type="checkbox" id="el-file-${index}" checked style="margin-right: 8px;">
                            <label for="el-file-${index}" style="flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                ${file.name}
                            </label>
                            <span style="font-size: 10px; color: #888; margin-left: 8px;">${size}</span>
                        </div>
                    `;
                });
                fileListEl.innerHTML = html;
            }

            // 格式化文件大小
            function formatFileSize(bytes) {
                if (bytes < 1024) return bytes + ' B';
                if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
                return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
            }

            // 获取勾选的文件
            function getCheckedFiles() {
                const checked = [];
                selectedFiles.forEach((file, index) => {
                    const checkbox = document.getElementById(`el-file-${index}`);
                    if (checkbox && checkbox.checked) {
                        checked.push(file);
                    }
                });
                return checked;
            }

            // 上传到easylink
            uploadBtn.onclick = async () => {
                const files = getCheckedFiles();
                if (files.length === 0) {
                    notify('请先选择要上传的文件', 'warn');
                    return;
                }

                // 获取标题，用于命名文件
                const title = titleEl.value.trim();

                uploadBtn.textContent = '⏳ 上传中...';
                uploadBtn.disabled = true;

                try {
                    let allLinks = [];
                    let failedCount = 0;
                    const totalFiles = files.length;

                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        try {
                            // 显示当前正在上传的文件和进度
                            const startPercent = ((i) / totalFiles * 100).toFixed(1);
                            setStatus(`(${i + 1}/${totalFiles}) 正在上传...${startPercent}%`, 'loading');
                            // 传入标题用于命名文件
                            const link = await uploadToEasylink(file, i + 1, totalFiles, title);
                            if (link) {
                                allLinks.push(link);
                            }
                        } catch (err) {
                            failedCount++;
                            console.log(`文件 ${file.name} 上传失败:`, err);
                            setStatus(`❌ 文件 ${file.name} 上传失败`, 'err');
                        }
                    }

                    if (allLinks.length > 0) {
                        // 把第一个链接填入视频链接输入框
                        urlEl.value = allLinks[0];
                        GM_setValue(S.url, allLinks[0]);

                        // 复制所有链接到剪贴板
                        const linksText = allLinks.join('\n');
                        GM_setClipboard(linksText);

                        if (failedCount > 0) {
                            // 有失败时显示错误提示
                            showUploadCompleteModal(allLinks.length, failedCount, allLinks);
                        } else {
                            showUploadCompleteModal(allLinks.length, 0, allLinks);
                        }
                    } else {
                        throw new Error('所有文件上传都失败了，请打开浏览器控制台查看详细错误信息');
                    }
                } catch (err) {
                    const errorMsg = String(err);
                    notify('❌ 上传失败: ' + errorMsg, 'error');
                    setStatus('❌ 上传失败: ' + errorMsg + '\n\n请打开浏览器控制台(F12)查看详细调试信息', 'err');
                    console.error('上传错误详情:', err);
                } finally {
                    uploadBtn.textContent = '⬆️ 上传到easylink';
                    uploadBtn.disabled = false;
                }
            };

            // 显示上传完成弹窗
            function showUploadCompleteModal(successCount, failedCount, links) {
                const modal = document.createElement('div');
                modal.id = 'el-upload-modal';
                modal.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 999999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;

                const isError = failedCount > 0;
                const bgColor = isError ? '#ffebee' : '#e8f5e9';
                const borderColor = isError ? '#f44336' : '#4caf50';
                const title = isError ? '⚠️ 部分上传完成' : '✅ 上传完成';

                modal.innerHTML = `
                    <div style="
                        background: white;
                        border-radius: 12px;
                        padding: 24px;
                        max-width: 400px;
                        width: 90%;
                        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                    ">
                        <div style="
                            text-align: center;
                            font-size: 24px;
                            font-weight: bold;
                            margin-bottom: 16px;
                            color: ${borderColor};
                        ">${title}</div>

                        <div style="
                            background: ${bgColor};
                            border: 2px solid ${borderColor};
                            border-radius: 8px;
                            padding: 12px;
                            margin-bottom: 16px;
                            text-align: center;
                        ">
                            <div style="font-size: 14px; color: #333;">
                                ${isError ? `成功: ${successCount} 个，失败: ${failedCount} 个` : `成功上传 ${successCount} 个文件`}
                            </div>
                        </div>

                        <div style="margin-bottom: 16px;">
                            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">链接:</div>
                            <div style="
                                background: #f5f5f5;
                                border-radius: 6px;
                                padding: 8px;
                                font-size: 12px;
                                max-height: 100px;
                                overflow-y: auto;
                                word-break: break-all;
                            ">${links.join('<br>')}</div>
                        </div>

                        <div style="display: flex; gap: 8px;">
                            <button id="el-modal-copy-desc" style="
                                flex: 1;
                                padding: 12px;
                                background: linear-gradient(135deg, #667eea, #764ba2);
                                color: white;
                                border: none;
                                border-radius: 8px;
                                font-size: 14px;
                                font-weight: bold;
                                cursor: pointer;
                            ">📝 复制简介</button>
                            <button id="el-modal-close" style="
                                flex: 1;
                                padding: 12px;
                                background: #e0e0e0;
                                color: #333;
                                border: none;
                                border-radius: 8px;
                                font-size: 14px;
                                cursor: pointer;
                            ">关闭</button>
                        </div>
                    </div>
                `;

                document.body.appendChild(modal);

                // 复制简介按钮
                document.getElementById('el-modal-copy-desc').onclick = () => {
                    copyTextBtn.click();
                    notify('简介已复制', 'success');
                };

                // 关闭按钮
                document.getElementById('el-modal-close').onclick = () => {
                    modal.remove();
                };

                // 点击背景关闭
                modal.onclick = (e) => {
                    if (e.target === modal) {
                        modal.remove();
                    }
                };
            }

            // 上传到 easylink.cc（使用七牛云）
            async function uploadToEasylink(file, currentIndex = 1, totalFiles = 1, title = '') {
                return new Promise((resolve, reject) => {
                    const token = getAuthToken();
                    if (!token) {
                        reject(new Error('未找到认证token，请确保已登录easylink.cc'));
                        return;
                    }

                    // 获取上传token
                    setStatus(`⏳ 获取上传权限 (${currentIndex}/${totalFiles})...`, 'loading');

                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: 'https://service.easylink.cc/kodo/upload_token',
                        headers: {
                            'Accept': 'application/json',
                            'Authorization': 'Bearer ' + token,
                            'Origin': 'https://easylink.cc',
                            'Referer': 'https://easylink.cc/'
                        },
                        onload: (tokenResponse) => {
                            console.log('获取token状态:', tokenResponse.status);

                            if (tokenResponse.status !== 200) {
                                reject(new Error('获取上传token失败，请确保已登录easylink.cc'));
                                return;
                            }

                            try {
                                const tokenData = JSON.parse(tokenResponse.responseText);
                                console.log('获取到的token数据:', tokenData);
                                console.log('token数据完整内容:', JSON.stringify(tokenData, null, 2));

                                // 尝试多种可能的token字段名
                                const uploadToken = tokenData.upload_token || tokenData.token || tokenData.uploadToken || tokenData.access_token || tokenData.data?.token;

                                if (!uploadToken) {
                                    console.log('可用的token字段:', Object.keys(tokenData));
                                    reject(new Error('未获取到上传token，可能需要登录easylink.cc'));
                                    return;
                                }

                                // 上传到七牛云
                                setStatus(`⏳ 上传中 ${currentIndex}/${totalFiles}: ${file.name}`, 'loading');

                                // 使用标题命名文件（保留原扩展名）
                                const ext = file.name.split('.').pop();
                                const uploadFileName = title ? title + '.' + ext : file.name;

                                const formData = new FormData();
                                formData.append('file', file);
                                formData.append('token', uploadToken);
                                formData.append('key', uploadFileName);

                                const xhr = new XMLHttpRequest();
                                xhr.open('POST', 'https://upload-z1.qiniup.com/');
                                xhr.upload.onprogress = (progress) => {
                                    console.log('上传进度:', progress);
                                    if (progress.lengthComputable && progress.total > 0) {
                                        const percent = Math.round((progress.loaded / progress.total) * 100);
                                        const displayPercent = ((currentIndex - 1) / totalFiles * 100 + percent / totalFiles).toFixed(1);
                                        setStatus(`(${currentIndex}/${totalFiles}) 正在上传...${displayPercent}%`, 'loading', '', percent);
                                    } else if (progress.loaded > 0) {
                                        const displayPercent = ((currentIndex - 1) / totalFiles * 100).toFixed(1);
                                        setStatus(`(${currentIndex}/${totalFiles}) 正在上传...${displayPercent}%+`, 'loading');
                                    }
                                };
                                xhr.onload = () => {
                                    console.log('七牛云上传状态:', xhr.status);
                                    console.log('七牛云响应:', xhr.responseText);

                                    if (xhr.status !== 200) {
                                        const responseText = xhr.responseText;
                                        if (responseText.includes('file exists')) {
                                            reject(new Error('文件已存在，请先删除云空间中的同名文件'));
                                        } else {
                                            reject(new Error('上传到七牛云失败: ' + xhr.status));
                                        }
                                        return;
                                    }

                                    try {
                                        const uploadData = JSON.parse(xhr.responseText);
                                        console.log('解析后的上传数据:', uploadData);

                                        if (uploadData.key) {
                                            const fileUrl = 'https://easylink.bfpi.club/' + uploadData.key;
                                            console.log('文件URL:', fileUrl);

                                            // 第三步：注册文件到 easylink.cc 账号
                                            setStatus(`⏳ 注册 ${currentIndex}/${totalFiles}: ${file.name}`, 'loading');

                                            console.log('开始注册文件到easylink.cc...');
                                            registerFileToEasylink(file.name, fileUrl, file.size).then(shortUrl => {
                                                console.log('文件注册成功，返回URL:', shortUrl);

                                                // 保存上传的文件信息（添加到列表）
                                                uploadedFilesInfo.push({
                                                    name: file.name,
                                                    url: shortUrl || fileUrl
                                                });

                                                setStatus('✅ 上传并注册成功！\n文件: ' + file.name + '\n链接: ' + (shortUrl || fileUrl), 'ok');
                                                resolve(shortUrl || fileUrl);
                                            }).catch(err => {
                                                console.log('注册文件失败，使用原始URL:', err);

                                                // 即使注册失败，也保存文件信息
                                                uploadedFilesInfo.push({
                                                    name: file.name,
                                                    url: fileUrl
                                                });

                                                resolve(fileUrl);
                                            });
                                        } else {
                                            reject(new Error('上传成功但未返回文件路径'));
                                        }
                                    } catch (e) {
                                        reject(new Error('解析上传响应失败'));
                                    }
                                };
                                xhr.onerror = () => {
                                    console.log('上传请求失败详情:', xhr.status);
                                    reject(new Error('上传请求失败'));
                                };
                                xhr.send(formData);
                            } catch (e) {
                                reject(new Error('解析token响应失败'));
                            }
                        },
                        onerror: () => {
                            reject(new Error('获取token请求失败，请确保已登录easylink.cc'));
                        }
                    });
                });
            }

            // 注册文件到 easylink.cc 账号
            function registerFileToEasylink(filename, fileUrl, fileSize) {
                return new Promise((resolve, reject) => {
                    const token = getAuthToken();
                    if (!token) {
                        reject(new Error('未找到认证token'));
                        return;
                    }

                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: 'https://service.easylink.cc/easyfiles',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'Authorization': 'Bearer ' + token,
                            'Origin': 'https://easylink.cc',
                            'Referer': 'https://easylink.cc/'
                        },
                        data: JSON.stringify({
                            name: filename,
                            kodo_key: fileUrl.replace('https://easylink.bfpi.club/', ''),
                            size: fileSize,
                            content_type: getMimeType(filename),
                            is_temporary: 0
                        }),
                        onload: (response) => {
                            console.log('=== 注册文件完整响应 ===');
                            console.log('状态码:', response.status);
                            console.log('响应内容:', response.responseText);

                            if (response.status === 200 || response.status === 201) {
                                try {
                                    const data = JSON.parse(response.responseText);
                                    console.log('=== 解析后的完整数据 ===');
                                    console.log(JSON.stringify(data, null, 2));

                                    // 优先检查 url 字段（可能是短链接slug）
                                    let shortUrl = null;

                                    // 1. 优先检查 url 字段
                                    if (data.url) {
                                        const urlValue = data.url;
                                        if (urlValue.includes('easylink.cc/')) {
                                            // 如果是完整URL
                                            shortUrl = urlValue;
                                        } else if (!urlValue.startsWith('http') && urlValue.length > 0) {
                                            // 如果是短slug，拼接成完整URL
                                            shortUrl = 'https://easylink.cc/' + urlValue;
                                        }
                                        console.log('从 url 字段找到短链接:', shortUrl);
                                    }

                                    // 2. 检查其他可能的短链接字段
                                    if (!shortUrl) {
                                        const shortLinkFields = ['shortUrl', 'short_url', 'link', 'slug', 'shortLink'];
                                        for (const field of shortLinkFields) {
                                            if (data[field]) {
                                                const val = data[field];
                                                if (val.includes('easylink.cc/')) {
                                                    shortUrl = val;
                                                } else if (!val.startsWith('http') && val.length > 0) {
                                                    shortUrl = 'https://easylink.cc/' + val;
                                                }
                                                if (shortUrl) {
                                                    console.log('从字段 ' + field + ' 找到短链接:', shortUrl);
                                                    break;
                                                }
                                            }
                                        }
                                    }

                                    // 3. 如果都没有，使用原始直链
                                    if (!shortUrl) {
                                        shortUrl = fileUrl;
                                    }

                                    console.log('最终使用的URL:', shortUrl);
                                    resolve(shortUrl);
                                } catch (e) {
                                    console.error('解析响应失败:', e);
                                    resolve(fileUrl);
                                }
                            } else {
                                reject(new Error('注册失败: ' + response.status));
                            }
                        },
                        onerror: () => {
                            reject(new Error('注册请求失败'));
                        }
                    });
                });
            }

            // 根据文件扩展名获取MIME类型
            function getMimeType(filename) {
                const ext = filename.split('.').pop().toLowerCase();
                const mimeTypes = {
                    'jpg': 'image/jpeg',
                    'jpeg': 'image/jpeg',
                    'png': 'image/png',
                    'gif': 'image/gif',
                    'webp': 'image/webp',
                    'bmp': 'image/bmp',
                    'svg': 'image/svg+xml',
                    'ico': 'image/x-icon',
                    'mp4': 'video/mp4',
                    'mkv': 'video/x-matroska',
                    'mov': 'video/quicktime',
                    'avi': 'video/x-msvideo',
                    'flv': 'video/x-flv',
                    'webm': 'video/webm',
                    'mp3': 'audio/mpeg',
                    'wav': 'audio/wav',
                    'ogg': 'audio/ogg',
                    'pdf': 'application/pdf',
                    'zip': 'application/zip',
                    'rar': 'application/x-rar-compressed',
                    '7z': 'application/x-7z-compressed',
                    'doc': 'application/msword',
                    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'xls': 'application/vnd.ms-excel',
                    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'ppt': 'application/vnd.ms-powerpoint',
                    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'txt': 'text/plain',
                    'html': 'text/html',
                    'css': 'text/css',
                    'js': 'application/javascript',
                    'json': 'application/json',
                    'xml': 'application/xml'
                };
                return mimeTypes[ext] || 'application/octet-stream';
            }

            // 获取认证token（优先从GM storage读取，否则从localStorage读取）
            function getAuthToken() {
                // 先尝试从GM storage获取（跨页面可用）
                const savedToken = GM_getValue('easylink_token', null);
                if (savedToken) {
                    console.log('从GM storage获取token');
                    return savedToken;
                }

                // 再尝试从localStorage获取（同域名可用）
                const keys = ['token', 'accessToken', 'access_token', 'authToken', 'auth_token', 'jwt'];
                for (const key of keys) {
                    const token = localStorage.getItem(key);
                    if (token) {
                        console.log('从localStorage获取token:', key);
                        return token;
                    }
                }

                // 尝试从localStorage的其他key中查找
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    const value = localStorage.getItem(key);
                    if (value && value.startsWith('eyJ')) {  // JWT token通常以eyJ开头
                        console.log('从localStorage找到JWT token:', key);
                        return value;
                    }
                }

                return null;
            }

            // 保存token到GM storage
            function saveAuthToken() {
                const token = getAuthToken();  // 先尝试从localStorage获取
                if (token) {
                    GM_setValue('easylink_token', token);
                    notify('✅ 登录信息已保存！', 'success');
                    setStatus('✅ 登录信息已保存到GM storage\n可以使用此脚本在任意页面登录上传', 'ok');
                } else {
                    notify('❌ 未找到登录信息，请确保在easylink.cc页面上已登录', 'error');
                }
            }

            // 清除保存的token
            function clearAuthToken() {
                GM_setValue('easylink_token', null);
                notify('✅ 登录信息已清除', 'info');
            }

            // 获取文件列表
            function getFileList() {
                return new Promise((resolve, reject) => {
                    const token = getAuthToken();
                    if (!token) {
                        reject(new Error('未找到认证token，请确保已登录easylink.cc'));
                        return;
                    }

                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: 'https://service.easylink.cc/easyfiles/@me?page=1&limit=50',
                        headers: {
                            'Accept': 'application/json',
                            'Authorization': 'Bearer ' + token,
                            'Origin': 'https://easylink.cc',
                            'Referer': 'https://easylink.cc/'
                        },
                        onload: (response) => {
                            console.log('文件列表响应状态:', response.status);
                            console.log('文件列表响应:', response.responseText);

                            if (response.status === 200) {
                                try {
                                    const data = JSON.parse(response.responseText);
                                    if (Array.isArray(data)) {
                                        resolve(data);
                                    } else if (data.files || data.data || data.items || data.easyfiles || data.rows) {
                                        resolve(data.files || data.data || data.items || data.easyfiles || data.rows);
                                    } else {
                                        resolve([data]);
                                    }
                                } catch (e) {
                                    reject(e);
                                }
                            } else {
                                reject(new Error('获取文件列表失败: ' + response.status + ' - ' + response.responseText));
                            }
                        },
                        onerror: () => {
                            reject(new Error('获取文件列表请求失败'));
                        }
                    });
                });
            }

            // 清除图片
            clearImgBtn.onclick = () => {
                imgEl.value = '';
                imgPreview.src = '';
                imgPreview.classList.remove('show');
                imgPreview.classList.add('hide');
                currentImgData = '';
                currentImgType = '';
                currentImgName = '';
                GM_setValue(S.img, '');
                GM_setValue(S.imgType, '');
                GM_setValue(S.imgName, '');
                notify('图片已清除', 'info');
            };

            // 生成标题和简介按钮
            genTitleDescBtn.onclick = async () => {
                const description = genDescEl.value.trim();
                if (!description) {
                    notify('请输入视频描述', 'warn');
                    genDescEl.focus();
                    return;
                }

                try {
                    // 构建完善的提示词，包含标题、简介和图片生成指令
                    const ratioDescription = currentRatio === '3:2' ? '3:2（横封面图片）' : '7:10（竖封面图片）';
                    const prompt = `请帮我完成以下内容创作：

【主题描述】
${description}

【任务1：生成标题】
请生成一个吸引人的标题，要求：
- 紧扣主题，突出核心亮点
- 简洁有力，富有吸引力
- 字数控制在10-20字之间

【任务2：生成简介】
请生成一段简介，要求：
- 至少50字，内容紧扣主题
- 语言流畅，引人入胜
- 突出视频的看点和价值

【任务3：生成AI绘图指令】
请生成一个详细的AI绘图指令，要求：
- 图片比例：${ratioDescription}
- 风格：写实风格，不要出现人脸
- 包含标题文字，文字不要出现乱码错字，清晰准确
- 标题文字使用艺术字体，不要用基础字体
- 图片所有图案元素需要与标题主体有强相关性

请按照以下格式返回：
---标题---
[你的标题]
---简介---
[你的简介]
---绘图指令---
[你的绘图指令]`;

                    // 复制到剪贴板
                    GM_setClipboard(prompt);

                    const statusTitleEl = $('el-status-title');
                    statusTitleEl.className = 'el-status show ok';
                    statusTitleEl.innerHTML = `<span>✅ 内容已复制到剪贴板！</span><code>请打开AI聊天工具粘贴生成内容\n\n${prompt}</code>`;
                    notify('✅ 内容已复制，去问AI吧！', 'success');

                } catch (err) {
                    const statusTitleEl = $('el-status-title');
                    statusTitleEl.className = 'el-status show err';
                    statusTitleEl.innerHTML = '<span>❌ 复制失败</span>';
                    notify('❌ 复制失败: ' + err.message, 'error');
                }
            };

            // 格式整理功能（整合format-text.user.js）
            const formatInputEl = $('el-format-input');
            const formatResultEl = $('el-format-result');
            const formatPasteBtn = $('el-format-paste-btn');
            const formatBtn = $('el-format-btn');
            const formatCopyBtn = $('el-format-copy-btn');
            const statusFormatEl = $('el-status-format');

            function showFormatStatus(message, type) {
                statusFormatEl.className = 'el-status show ' + type;
                statusFormatEl.innerHTML = '<span>' + message + '</span>';
            }

            function hideFormatStatus() {
                statusFormatEl.className = 'el-status';
                statusFormatEl.innerHTML = '';
            }

            formatInputEl.addEventListener('input', hideFormatStatus);

            formatPasteBtn.onclick = async () => {
                hideFormatStatus();
                try {
                    const text = await navigator.clipboard.readText();
                    formatInputEl.value = text;
                } catch (err) {
                    formatInputEl.focus();
                    document.execCommand('paste');
                }
            };

            formatBtn.onclick = () => {
                const input = formatInputEl.value.trim();
                if (!input) {
                    showFormatStatus('请输入需要格式化的文本', 'err');
                    return;
                }

                const { result, missingFields } = formatTextSingle(input);
                formatResultEl.textContent = result;
                formatResultEl.style.color = '#000';

                if (missingFields.length > 0) {
                    showFormatStatus('缺少要素：' + missingFields.join('、'), 'err');
                } else {
                    showFormatStatus('格式化完成，6要素齐全', 'ok');
                }
            };

            formatCopyBtn.onclick = () => {
                const result = formatResultEl.textContent;
                if (!result) {
                    showFormatStatus('请先格式化文本', 'err');
                    return;
                }

                GM_setClipboard(result);
                const originalText = formatCopyBtn.textContent;
                formatCopyBtn.textContent = '✅ 已复制';
                setTimeout(() => {
                    formatCopyBtn.textContent = originalText;
                }, 2000);
                showFormatStatus('已复制到剪贴板', 'ok');
                notify('✅ 已复制', 'success');
            };

            function formatTextSingle(text) {
                let result = '';
                const foundFields = [];
                let originLink = '';
                let fileName1 = '';
                let cloudLink1 = '';
                let fileName2 = '';
                let cloudLink2 = '';
                let intro = '';

                if (text.includes('\t')) {
                    const cells = text.split('\t');
                    if (cells.length >= 6) {
                        cloudLink1 = cells[0].trim().replace(/`/g, '');
                        const baseFileName = cells[1].trim();
                        intro = cells[2].trim();
                        originLink = cells[3].trim().replace(/`/g, '');
                        cloudLink2 = cells[5].trim().replace(/`/g, '');

                        const cleanBaseName = baseFileName.replace(/\.(mp4|png|jpg|jpeg)$/i, '');

                        fileName1 = cleanBaseName + '.png';
                        fileName2 = cleanBaseName + '.mp4';
                    }
                } else {
                    const originLinkMatch = text.match(/(原链接|参考链接)\s*[：:]\s*`?([^\s`]+)`?/);
                    if (originLinkMatch) {
                        originLink = originLinkMatch[2];
                    }

                    const fileMatches = text.match(/文件名\s*[：:]\s*([^\n]+)/g) || [];
                    const cloudLinkMatches = text.match(/云链接\s*[：:]\s*`?([^\s`]+)`?/g) || [];

                    if (fileMatches.length > 0) {
                        const fileNameMatch = fileMatches[0].match(/文件名\s*[：:]\s*(.+)/);
                        fileName1 = fileNameMatch ? fileNameMatch[1].trim() : '';
                    }
                    if (fileMatches.length > 1) {
                        const fileNameMatch = fileMatches[1].match(/文件名\s*[：:]\s*(.+)/);
                        fileName2 = fileNameMatch ? fileNameMatch[1].trim() : '';
                    }

                    if (cloudLinkMatches.length > 0) {
                        cloudLink1 = cloudLinkMatches[0].match(/云链接\s*[：:]\s*`?([^\s`]+)`?/)[1];
                    }
                    if (cloudLinkMatches.length > 1) {
                        cloudLink2 = cloudLinkMatches[1].match(/云链接\s*[：:]\s*`?([^\s`]+)`?/)[1];
                    }

                    const introMatch = text.match(/简介\s*[：:]([\s\S]*)/);
                    if (introMatch && introMatch[1].trim()) {
                        intro = introMatch[1].trim().replace(/\s+/g, ' ').trim();
                    }
                }

                if (originLink) {
                    result += '原链接：' + originLink + '\n\n';
                    foundFields.push('原链接');
                }

                if (fileName1) {
                    result += '文件名：' + fileName1 + '\n';
                    foundFields.push('文件名1');
                }
                if (cloudLink1) {
                    result += '云链接：' + cloudLink1 + '\n';
                    foundFields.push('云链接1');
                }

                if (fileName2) {
                    result += '\n文件名：' + fileName2 + '\n';
                    foundFields.push('文件名2');
                }
                if (cloudLink2) {
                    result += '云链接：' + cloudLink2 + '\n';
                    foundFields.push('云链接2');
                }

                if (intro) {
                    result += '\n简介：' + intro;
                    foundFields.push('简介');
                }

                const requiredFields = ['原链接', '文件名1', '云链接1', '文件名2', '云链接2', '简介'];
                const missingFields = requiredFields.filter(f => !foundFields.includes(f));

                return { result: result.trim(), missingFields };
            }

            // 图片裁剪功能（整合image-ratio-checker.user.js）
            let ircCurrentImageSrc = '';
            let ircCurrentImageInfo = null;

            function ircBlobUrlToBase64(blobUrl) {
                return new Promise((resolve, reject) => {
                    fetch(blobUrl)
                        .then(r => r.blob())
                        .then(blob => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        })
                        .catch(reject);
                });
            }

            function ircSimplifyRatio(width, height) {
                if (width === 0 || height === 0) return '0:0';
                const isLandscape = width >= height;
                if (isLandscape) {
                    const fixedWidth = 3000;
                    const calculatedHeight = (height * fixedWidth / width).toFixed(2);
                    return `${fixedWidth}:${calculatedHeight}`;
                } else {
                    const fixedWidth = 700;
                    const calculatedHeight = (height * fixedWidth / width).toFixed(2);
                    return `${fixedWidth}:${calculatedHeight}`;
                }
            }

            async function ircGetImageInfo(src) {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        const width = img.width;
                        const height = img.height;
                        const ratio = ircSimplifyRatio(width, height);
                        const isLandscape = width > height;
                        const actualRatio = (height / width).toFixed(2);
                        const requiredRatioValue = isLandscape ? (2/3).toFixed(2) : (10/7).toFixed(2);
                        const requiredRatioText = isLandscape ? '3:2' : '7:10';
                        const ratioOk = actualRatio === requiredRatioValue;
                        resolve({ width, height, ratio, isLandscape, ratioOk, requiredRatioText, img });
                    };
                    img.onerror = () => {
                        resolve({ width: 0, height: 0, ratio: '未知', isLandscape: true, ratioOk: false, requiredRatioText: '', img: null });
                    };
                    img.src = src;
                });
            }

            const ircUrlEl = $('irc-url');
            const ircTitleEl = $('irc-title');
            const ircPreviewEl = $('irc-preview');
            const ircInfoEl = $('irc-info');
            const ircSizeEl = $('irc-size');
            const ircRatioEl = $('irc-ratio');
            const ircCheckEl = $('irc-check');
            const ircTypeEl = $('irc-type');
            const ircStatusEl = $('irc-status');
            const ircEditSection = $('irc-edit-section');
            const ircCropContainer = $('irc-crop-container');
            const ircCropCanvas = $('irc-crop-canvas');
            const ircCropGuide = $('irc-crop-guide');
            const ircCheckUrlBtn = $('irc-check-url');
            const ircGrabBlobBtn = $('irc-grab-blob');
            const ircCropBtn = $('irc-crop-btn');
            const ircSaveBtn = $('irc-save-btn');
            const ircRatioBtns = document.querySelectorAll('.irc-ratio-btn');

            let ircSelectedRatio = '3:2';
            let ircCanvasImg = null;
            let ircImgOffset = { x: 0, y: 0 };
            let ircImgScale = 1;
            let ircGuideRect = { x: 0, y: 0, width: 0, height: 0 };
            let ircContainerWidth = 0, ircContainerHeight = 0;
            let ircIsDragging = false;
            let ircIsMovingGuide = false;
            let ircIsResizing = false;

            const ircHandleNW = $('irc-crop-handle-nw');
            const ircHandleNE = $('irc-crop-handle-ne');
            const ircHandleSW = $('irc-crop-handle-sw');
            const ircHandleSE = $('irc-crop-handle-se');

            function ircSetStatus(msg, type) {
                ircStatusEl.className = 'el-status show ' + type;
                ircStatusEl.innerHTML = '<span>' + msg + '</span>';
            }

            function ircHideStatus() {
                ircStatusEl.className = 'el-status';
                ircStatusEl.innerHTML = '';
            }

            function ircShowImageInfo(info) {
                ircSizeEl.textContent = `${info.width} × ${info.height} px`;
                ircRatioEl.textContent = info.ratio;
                if (info.ratioOk) {
                    ircCheckEl.textContent = `符合${info.requiredRatioText}`;
                    ircCheckEl.style.color = '#22c55e';
                } else {
                    ircCheckEl.textContent = `需${info.requiredRatioText}`;
                    ircCheckEl.style.color = '#ef4444';
                }
                ircTypeEl.textContent = info.isLandscape ? '横图' : '竖图';
                ircTypeEl.style.color = info.isLandscape ? '#3b82f6' : '#f59e0b';
                ircInfoEl.classList.add('show');
            }

            function ircInitCropMode(img) {
                ircCanvasImg = img;
                ircEditSection.style.display = 'block';
                ircCropContainer.classList.add('show');

                ircContainerWidth = ircCropContainer.clientWidth;
                ircContainerHeight = ircCropContainer.clientHeight;

                const scale = Math.min(ircContainerWidth / img.width, ircContainerHeight / img.height, 1);
                ircImgScale = Math.max(scale, 0.1);
                ircImgOffset.x = (ircContainerWidth - img.width * ircImgScale) / 2;
                ircImgOffset.y = (ircContainerHeight - img.height * ircImgScale) / 2;

                ircCropCanvas.width = img.width;
                ircCropCanvas.height = img.height;
                ircCropCanvas.style.width = img.width + 'px';
                ircCropCanvas.style.height = img.height + 'px';
                ircUpdateCanvasDisplay();

                const ctx = ircCropCanvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                ircUpdateCropGuide();
            }

            function ircUpdateCanvasDisplay() {
                ircCropCanvas.style.left = ircImgOffset.x + 'px';
                ircCropCanvas.style.top = ircImgOffset.y + 'px';
                ircCropCanvas.style.transform = `scale(${ircImgScale})`;
            }

            function ircUpdateCropGuide() {
                const [w, h] = ircSelectedRatio.split(':').map(Number);
                const targetRatio = w / h;
                let guideWidth, guideHeight;
                const containerRatio = ircContainerWidth / ircContainerHeight;

                if (containerRatio > targetRatio) {
                    guideHeight = ircContainerHeight * 0.8;
                    guideWidth = guideHeight * targetRatio;
                } else {
                    guideWidth = ircContainerWidth * 0.8;
                    guideHeight = guideWidth / targetRatio;
                }

                ircGuideRect.x = (ircContainerWidth - guideWidth) / 2;
                ircGuideRect.y = (ircContainerHeight - guideHeight) / 2;
                ircGuideRect.width = guideWidth;
                ircGuideRect.height = guideHeight;

                ircUpdateGuideDisplay();
                ircUpdateHandles();
            }

            function ircUpdateGuideDisplay() {
                ircCropGuide.style.left = ircGuideRect.x + 'px';
                ircCropGuide.style.top = ircGuideRect.y + 'px';
                ircCropGuide.style.width = ircGuideRect.width + 'px';
                ircCropGuide.style.height = ircGuideRect.height + 'px';
            }

            function ircUpdateHandles() {
                const hs = 14;
                const ho = hs / 2;
                ircHandleNW.style.left = (ircGuideRect.x - ho) + 'px';
                ircHandleNW.style.top = (ircGuideRect.y - ho) + 'px';
                ircHandleNE.style.left = (ircGuideRect.x + ircGuideRect.width - ho) + 'px';
                ircHandleNE.style.top = (ircGuideRect.y - ho) + 'px';
                ircHandleSW.style.left = (ircGuideRect.x - ho) + 'px';
                ircHandleSW.style.top = (ircGuideRect.y + ircGuideRect.height - ho) + 'px';
                ircHandleSE.style.left = (ircGuideRect.x + ircGuideRect.width - ho) + 'px';
                ircHandleSE.style.top = (ircGuideRect.y + ircGuideRect.height - ho) + 'px';
            }

            function ircCropImage() {
                if (!ircCanvasImg) return;
                const [w, h] = ircSelectedRatio.split(':').map(Number);
                const targetWidth = w === 3 ? 3000 : 700;
                const targetHeight = w === 3 ? 2000 : 1000;

                const cropX = (ircGuideRect.x - ircImgOffset.x) / ircImgScale;
                const cropY = (ircGuideRect.y - ircImgOffset.y) / ircImgScale;
                const cropWidth = ircGuideRect.width / ircImgScale;
                const cropHeight = ircGuideRect.height / ircImgScale;

                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(ircCanvasImg, cropX, cropY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);

                const croppedDataUrl = canvas.toDataURL('image/png');
                ircPreviewEl.src = croppedDataUrl;
                ircCurrentImageSrc = croppedDataUrl;

                const croppedInfo = {
                    width: canvas.width, height: canvas.height,
                    ratio: ircSimplifyRatio(canvas.width, canvas.height),
                    isLandscape: w === 3, ratioOk: true, requiredRatioText: ircSelectedRatio
                };
                ircShowImageInfo(croppedInfo);
                notify('✅ 图片已裁剪为 ' + ircSelectedRatio + ' 比例', 'success');
            }

            let ircDragStartX = 0, ircDragStartY = 0;
            let ircGuideStartX = 0, ircGuideStartY = 0;
            let ircResizeStart = { x: 0, y: 0, rect: null };

            function ircOnCanvasMouseDown(e) {
                if (ircIsResizing || ircIsMovingGuide) return;
                ircIsDragging = true;
                ircDragStartX = e.clientX - ircImgOffset.x;
                ircDragStartY = e.clientY - ircImgOffset.y;
                ircCropCanvas.classList.add('grabbing');
                e.preventDefault();
            }

            function ircOnGuideMouseDown(e) {
                if (ircIsDragging || ircIsResizing) return;
                ircIsMovingGuide = true;
                ircGuideStartX = e.clientX - ircGuideRect.x;
                ircGuideStartY = e.clientY - ircGuideRect.y;
                e.stopPropagation();
                e.preventDefault();
            }

            function ircOnMouseMove(e) {
                if (ircIsDragging) {
                    let newX = e.clientX - ircDragStartX;
                    let newY = e.clientY - ircDragStartY;
                    const displayW = ircCanvasImg.width * ircImgScale;
                    const displayH = ircCanvasImg.height * ircImgScale;

                    if (displayW <= ircContainerWidth) {
                        newX = (ircContainerWidth - displayW) / 2;
                    } else {
                        newX = Math.max(ircContainerWidth - displayW, Math.min(0, newX));
                    }
                    if (displayH <= ircContainerHeight) {
                        newY = (ircContainerHeight - displayH) / 2;
                    } else {
                        newY = Math.max(ircContainerHeight - displayH, Math.min(0, newY));
                    }

                    ircImgOffset.x = newX;
                    ircImgOffset.y = newY;
                    ircUpdateCanvasDisplay();
                } else if (ircIsMovingGuide) {
                    let newX = e.clientX - ircGuideStartX;
                    let newY = e.clientY - ircGuideStartY;
                    newX = Math.max(0, Math.min(ircContainerWidth - ircGuideRect.width, newX));
                    newY = Math.max(0, Math.min(ircContainerHeight - ircGuideRect.height, newY));
                    ircGuideRect.x = newX;
                    ircGuideRect.y = newY;
                    ircUpdateGuideDisplay();
                    ircUpdateHandles();
                } else if (ircIsResizing) {
                    ircResizeGuide(e.clientX, e.clientY);
                }
            }

            function ircOnMouseUp() {
                ircIsDragging = false;
                ircIsMovingGuide = false;
                ircIsResizing = false;
                ircCropCanvas.classList.remove('grabbing');
            }

            function ircOnResizeStart(handle) {
                return function(e) {
                    ircIsResizing = true;
                    ircResizeStart = { x: e.clientX, y: e.clientY, rect: { ...ircGuideRect }, handle: handle };
                    e.stopPropagation();
                    e.preventDefault();
                };
            }

            function ircResizeGuide(clientX, clientY) {
                const [w, h] = ircSelectedRatio.split(':').map(Number);
                const targetRatio = w / h;
                const rect = ircResizeStart.rect;
                const dx = clientX - ircResizeStart.x;
                const dy = clientY - ircResizeStart.y;
                const handle = ircResizeStart.handle;
                const minSize = Math.min(80, ircContainerWidth * 0.2);
                const newRect = { ...rect };

                if (handle === 'se') {
                    newRect.width = Math.max(minSize, Math.min(rect.width + dx, ircContainerWidth - rect.x));
                    newRect.height = newRect.width / targetRatio;
                    newRect.height = Math.max(minSize, Math.min(newRect.height + dy, ircContainerHeight - rect.y));
                    newRect.width = newRect.height * targetRatio;
                } else if (handle === 'ne') {
                    newRect.width = Math.max(minSize, Math.min(rect.width + dx, ircContainerWidth - rect.x));
                    newRect.height = newRect.width / targetRatio;
                    const maxDy = rect.y;
                    const actualDy = Math.max(-(rect.height - minSize / targetRatio), Math.min(dy, maxDy));
                    newRect.y -= actualDy;
                    newRect.height += actualDy;
                    newRect.height = newRect.width / targetRatio;
                } else if (handle === 'sw') {
                    newRect.height = Math.max(minSize, Math.min(rect.height + dy, ircContainerHeight - rect.y));
                    newRect.width = newRect.height * targetRatio;
                    const maxDx = rect.x;
                    const actualDx = Math.max(-(rect.width - minSize * targetRatio), Math.min(dx, maxDx));
                    newRect.x -= actualDx;
                    newRect.width += actualDx;
                    newRect.width = newRect.height * targetRatio;
                } else if (handle === 'nw') {
                    const maxDx = rect.x;
                    const actualDx = Math.max(-(rect.width - minSize * targetRatio), Math.min(dx, maxDx));
                    newRect.x -= actualDx;
                    newRect.width += actualDx;
                    const maxDy = rect.y;
                    const actualDy = Math.max(-(rect.height - minSize / targetRatio), Math.min(dy, maxDy));
                    newRect.y -= actualDy;
                    newRect.height += actualDy;
                    newRect.height = newRect.width / targetRatio;
                }

                if (newRect.x < 0) newRect.x = 0;
                if (newRect.y < 0) newRect.y = 0;
                if (newRect.x + newRect.width > ircContainerWidth) {
                    newRect.width = ircContainerWidth - newRect.x;
                }
                if (newRect.y + newRect.height > ircContainerHeight) {
                    newRect.height = ircContainerHeight - newRect.y;
                }
                newRect.height = newRect.width / targetRatio;
                ircGuideRect = newRect;
                ircUpdateGuideDisplay();
                ircUpdateHandles();
            }

            ircCropCanvas.addEventListener('mousedown', ircOnCanvasMouseDown);
            ircCropGuide.addEventListener('mousedown', ircOnGuideMouseDown);
            document.addEventListener('mousemove', ircOnMouseMove);
            document.addEventListener('mouseup', ircOnMouseUp);
            document.addEventListener('mouseleave', ircOnMouseUp);

            ircHandleNW.addEventListener('mousedown', ircOnResizeStart('nw'));
            ircHandleNE.addEventListener('mousedown', ircOnResizeStart('ne'));
            ircHandleSW.addEventListener('mousedown', ircOnResizeStart('sw'));
            ircHandleSE.addEventListener('mousedown', ircOnResizeStart('se'));

            function ircSaveImage() {
                if (!ircCurrentImageSrc) {
                    notify('请先加载图片', 'warn');
                    return;
                }
                let filename = ircTitleEl.value.trim() || 'image';
                filename = filename.replace(/[\\/:*?"<>|]/g, '_');
                filename += '.png';

                const link = document.createElement('a');
                link.href = ircCurrentImageSrc;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                notify('✅ 图片已保存为: ' + filename, 'success');
            }

            ircUrlEl.addEventListener('input', ircHideStatus);

            // 粘贴本地图片功能（在输入框中粘贴）
            ircUrlEl.addEventListener('paste', async (e) => {
                const items = e.clipboardData?.items;
                if (!items) return;

                for (const item of items) {
                    if (item.type.startsWith('image/')) {
                        e.preventDefault();
                        const file = item.getAsFile();
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = async (event) => {
                                const base64Data = event.target?.result;
                                if (base64Data) {
                                    ircCurrentImageSrc = base64Data;
                                    ircPreviewEl.src = base64Data;
                                    ircPreviewEl.classList.add('show');

                                    const info = await ircGetImageInfo(base64Data);
                                    if (info.width === 0) {
                                        notify('❌ 无法加载图片', 'error');
                                        return;
                                    }

                                    ircCurrentImageInfo = info;
                                    ircShowImageInfo(info);
                                    ircInitCropMode(info.img);
                                    ircSetStatus('✅ 粘贴成功', 'ok');
                                    notify('✅ 已加载本地图片', 'success');
                                }
                            };
                            reader.readAsDataURL(file);
                        }
                        break;
                    }
                }
            });

            ircRatioBtns.forEach(btn => {
                btn.onclick = () => {
                    ircRatioBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    ircSelectedRatio = btn.dataset.ratio;
                    if (ircCanvasImg) {
                        ircUpdateCropGuide();
                    }
                };
            });

            ircCheckUrlBtn.onclick = async () => {
                const url = ircUrlEl.value.trim();
                if (!url) {
                    notify('请输入图片链接', 'warn');
                    ircUrlEl.focus();
                    return;
                }
                if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('blob:')) {
                    notify('请输入有效的图片链接', 'error');
                    return;
                }

                ircCheckUrlBtn.textContent = '⏳ 解析中...';
                ircCheckUrlBtn.disabled = true;

                try {
                    let imgSrc = url;
                    if (url.startsWith('blob:')) {
                        imgSrc = await ircBlobUrlToBase64(url);
                    }

                    ircCurrentImageSrc = imgSrc;
                    ircPreviewEl.src = imgSrc;
                    ircPreviewEl.classList.add('show');

                    const info = await ircGetImageInfo(imgSrc);
                    if (info.width === 0) {
                        throw new Error('无法加载图片');
                    }

                    ircCurrentImageInfo = info;
                    ircShowImageInfo(info);
                    ircInitCropMode(info.img);
                    ircSetStatus('✅ 解析成功', 'ok');
                    notify('✅ 已获取图片比例信息', 'success');

                } catch (err) {
                    ircSetStatus('❌ ' + err.message, 'err');
                    notify('❌ ' + err.message, 'error');
                    ircPreviewEl.classList.remove('show');
                    ircInfoEl.classList.remove('show');
                    ircEditSection.style.display = 'none';
                    ircCropContainer.classList.remove('show');
                } finally {
                    ircCheckUrlBtn.textContent = '🔗 解析链接';
                    ircCheckUrlBtn.disabled = false;
                }
            };

            ircGrabBlobBtn.onclick = async () => {
                ircGrabBlobBtn.textContent = '⏳ 抓取中...';
                ircGrabBlobBtn.disabled = true;

                try {
                    const imgs = Array.from(document.querySelectorAll('img'));
                    if (imgs.length === 0) {
                        throw new Error('页面上没有图片');
                    }

                    const blobImgs = imgs.filter(img => img.src && img.src.startsWith('blob:'));
                    if (blobImgs.length === 0) {
                        throw new Error('页面上没有blob图片');
                    }

                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    const viewportCenterX = viewportWidth / 2;
                    const viewportCenterY = viewportHeight / 2;

                    let bestImg = null;
                    let bestScore = -1;

                    blobImgs.forEach(img => {
                        const rect = img.getBoundingClientRect();
                        const isVisible =
                            img.offsetParent !== null &&
                            rect.width > 10 &&
                            rect.height > 10 &&
                            rect.right > 0 &&
                            rect.left < viewportWidth &&
                            rect.bottom > 0 &&
                            rect.top < viewportHeight;

                        if (!isVisible) return;

                        let score = 0;
                        const area = rect.width * rect.height;
                        score += Math.sqrt(area) * 2;

                        const imgCenterX = rect.left + rect.width / 2;
                        const imgCenterY = rect.top + rect.height / 2;
                        const distanceToCenter = Math.sqrt(
                            Math.pow(imgCenterX - viewportCenterX, 2) +
                            Math.pow(imgCenterY - viewportCenterY, 2)
                        );
                        const maxDistance = Math.sqrt(
                            Math.pow(viewportWidth / 2, 2) +
                            Math.pow(viewportHeight / 2, 2)
                        );
                        score += (1 - distanceToCenter / maxDistance) * 100;

                        if (score > bestScore) {
                            bestScore = score;
                            bestImg = img;
                        }
                    });

                    if (!bestImg) {
                        throw new Error('未找到可见的blob图片');
                    }

                    const base64 = await ircBlobUrlToBase64(bestImg.src);
                    ircCurrentImageSrc = base64;
                    ircPreviewEl.src = base64;
                    ircPreviewEl.classList.add('show');

                    const width = bestImg.naturalWidth || bestImg.width || bestImg.offsetWidth || 0;
                    const height = bestImg.naturalHeight || bestImg.height || bestImg.offsetHeight || 0;
                    const ratio = ircSimplifyRatio(width, height);
                    const isLandscape = width > height;
                    const actualRatio = (height / width).toFixed(2);
                    const requiredRatioValue = isLandscape ? (2/3).toFixed(2) : (10/7).toFixed(2);
                    const requiredRatioText = isLandscape ? '3:2' : '7:10';
                    const ratioOk = actualRatio === requiredRatioValue;

                    const info = { width, height, ratio, isLandscape, ratioOk, requiredRatioText };
                    ircCurrentImageInfo = info;
                    ircShowImageInfo(info);

                    const tempImg = new Image();
                    tempImg.onload = () => {
                        ircInitCropMode(tempImg);
                    };
                    tempImg.src = base64;

                    ircSetStatus('✅ 抓取成功', 'ok');
                    notify('✅ blob图片已抓取', 'success');

                } catch (err) {
                    ircSetStatus('❌ ' + err.message, 'err');
                    notify('❌ ' + err.message, 'error');
                    ircPreviewEl.classList.remove('show');
                    ircInfoEl.classList.remove('show');
                    ircEditSection.style.display = 'none';
                    ircCropContainer.classList.remove('show');
                } finally {
                    ircGrabBlobBtn.textContent = '📷 抓取blob图片';
                    ircGrabBlobBtn.disabled = false;
                }
            };

            ircCropBtn.onclick = ircCropImage;
            ircSaveBtn.onclick = ircSaveImage;

            // 获取图片的最佳URL（优先获取高清版本）
            function getBestImageUrl(img) {
                // 1. 检查srcset，获取最大分辨率的图片
                if (img.srcset) {
                    const sources = img.srcset.split(',').map(s => {
                        const parts = s.trim().split(/\s+/);
                        const url = parts[0];
                        const size = parts[1] ? parseInt(parts[1]) : 0;
                        return { url, size };
                    });
                    if (sources.length > 0) {
                        sources.sort((a, b) => b.size - a.size);
                        return sources[0].url;
                    }
                }

                // 2. 检查常见的data属性
                const dataAttributes = ['data-src', 'data-original', 'data-lazy', 'data-large', 'data-big', 'data-hd'];
                for (const attr of dataAttributes) {
                    const val = img.getAttribute(attr);
                    if (val && val.startsWith('http')) {
                        return val;
                    }
                }

                // 3. 检查父元素是否是a标签且href指向图片
                const parent = img.parentElement;
                if (parent && parent.tagName === 'A') {
                    const href = parent.getAttribute('href');
                    if (href && /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(href)) {
                        return href;
                    }
                }

                // 4. 使用原始src
                return img.src;
            }

            // 将图片转换为base64
            function imageToBase64(img) {
                return new Promise((resolve, reject) => {
                    const bestUrl = getBestImageUrl(img);

                    // 如果找到更好的URL，尝试加载它
                    if (bestUrl && bestUrl !== img.src) {
                        const tempImg = new Image();
                        tempImg.crossOrigin = 'anonymous';
                        tempImg.onload = () => {
                            try {
                                const canvas = document.createElement('canvas');
                                canvas.width = tempImg.naturalWidth || tempImg.width;
                                canvas.height = tempImg.naturalHeight || tempImg.height;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(tempImg, 0, 0);
                                resolve(canvas.toDataURL('image/png'));
                            } catch (err) {
                                // 如果高清图加载失败，回退到原图
                                drawImageToCanvas(img, resolve, reject);
                            }
                        };
                        tempImg.onerror = () => {
                            // 高清图加载失败，回退到原图
                            drawImageToCanvas(img, resolve, reject);
                        };
                        tempImg.src = bestUrl;
                    } else {
                        // 直接使用原图
                        drawImageToCanvas(img, resolve, reject);
                    }
                });
            }

            // 将图片绘制到canvas并转换为base64
            function drawImageToCanvas(img, resolve, reject) {
                try {
                    // 如果是blob URL，先尝试通过fetch获取
                    if (img.src && img.src.startsWith('blob:')) {
                        blobUrlToBase64(img.src).then(resolve).catch(() => {
                            // 如果fetch失败，尝试canvas绘制
                            tryCanvasDraw(img, resolve, reject);
                        });
                    } else {
                        tryCanvasDraw(img, resolve, reject);
                    }
                } catch (err) {
                    reject(err);
                }
            }

            // 尝试用canvas绘制图片
            function tryCanvasDraw(img, resolve, reject) {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.offsetWidth || img.width;
                    canvas.height = img.naturalHeight || img.offsetHeight || img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch (err) {
                    // 如果canvas绘制也失败，尝试通过fetch获取
                    if (img.src) {
                        blobUrlToBase64(img.src).then(resolve).catch(reject);
                    } else {
                        reject(err);
                    }
                }
            }

            // 抓取当前图片按钮
            const grabLargestBtn = document.getElementById('el-grab-largest');
            grabLargestBtn.onclick = async () => {
                try {
                    grabLargestBtn.textContent = '⏳ 抓取中...';
                    grabLargestBtn.disabled = true;

                    // 获取视口信息
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    const viewportCenterX = viewportWidth / 2;
                    const viewportCenterY = viewportHeight / 2;

                    // 查找页面上所有图片
                    const imgs = Array.from(document.querySelectorAll('img'));
                    if (imgs.length === 0) {
                        notify('页面上没有图片', 'warn');
                        return;
                    }

                    // 评估每张图片，找到最可能是用户正在看的
                    let bestImg = null;
                    let bestScore = -1;

                    imgs.forEach(img => {
                        // 检查图片是否可见
                        const rect = img.getBoundingClientRect();
                        const isVisible =
                            img.offsetParent !== null &&
                            rect.width > 10 &&
                            rect.height > 10 &&
                            rect.right > 0 &&
                            rect.left < viewportWidth &&
                            rect.bottom > 0 &&
                            rect.top < viewportHeight;

                        if (!isVisible) return;

                        // 计算分数
                        let score = 0;

                        // 1. 图片尺寸越大分越高
                        const area = rect.width * rect.height;
                        score += Math.sqrt(area) * 2;

                        // 2. 图片越接近视口中心分越高
                        const imgCenterX = rect.left + rect.width / 2;
                        const imgCenterY = rect.top + rect.height / 2;
                        const distanceToCenter = Math.sqrt(
                            Math.pow(imgCenterX - viewportCenterX, 2) +
                            Math.pow(imgCenterY - viewportCenterY, 2)
                        );
                        const maxDistance = Math.sqrt(
                            Math.pow(viewportWidth / 2, 2) +
                            Math.pow(viewportHeight / 2, 2)
                        );
                        score += (1 - distanceToCenter / maxDistance) * 100;

                        // 3. 图片在视口中占比越大分越高
                        const visibleRatio = Math.min(1, (rect.width * rect.height) / (viewportWidth * viewportHeight) * 10);
                        score += visibleRatio * 50;

                        // 4. 优先考虑naturalWidth/naturalHeight较大的图片（真实分辨率）
                        const naturalArea = (img.naturalWidth || 100) * (img.naturalHeight || 100);
                        score += Math.log(naturalArea) * 5;

                        if (score > bestScore) {
                            bestScore = score;
                            bestImg = img;
                        }
                    });

                    if (!bestImg) {
                        notify('未找到可见图片', 'warn');
                        return;
                    }

                    const base64 = await imageToBase64(bestImg);
                    const imgName = 'captured_img_' + Date.now() + '.png';

                    // 获取图片真实尺寸
                    const width = bestImg.naturalWidth || bestImg.width || bestImg.offsetWidth || 0;
                    const height = bestImg.naturalHeight || bestImg.height || bestImg.offsetHeight || 0;

                    // 计算比例
                    const ratio = simplifyRatio(width, height);
                    const isLandscape = width > height;
                    // 使用高度/宽度的比值来校验，精确到0.01
                    const actualRatio = (height / width).toFixed(2);
                    const requiredRatioValue = isLandscape ? (2/3).toFixed(2) : (10/7).toFixed(2);
                    const requiredRatioText = isLandscape ? '3:2' : '7:10';
                    const ratioOk = actualRatio === requiredRatioValue;
                    const checkText = ratioOk ? '比例正确' : `需${requiredRatioText}`;
                    const checkColor = ratioOk ? '#22c55e' : '#ef4444';

                    // 记录状态（不自动下载）
                    currentImgData = base64;
                    currentImgType = 'base64';
                    currentImgName = imgName;
                    imgPreview.src = base64;
                    imgPreview.classList.remove('hide');
                    imgPreview.classList.add('show');
                    imgEl.value = '[已抓取图片]';
                    GM_setValue(S.img, '[抓取]');
                    GM_setValue(S.imgType, 'base64');
                    GM_setValue(S.imgName, imgName);

                    // 显示尺寸信息
                    document.getElementById('el-img-info').classList.remove('hide');
                    document.getElementById('el-img-info').classList.add('show');
                    document.getElementById('el-img-size').textContent = `尺寸: ${width} × ${height}px`;
                    document.getElementById('el-img-ratio').textContent = `比例: ${ratio}`;
                    document.getElementById('el-img-check').textContent = `校验: ${checkText}`;
                    document.getElementById('el-img-check').style.color = checkColor;

                    notify('✅ 图片已抓取，将在复制命令时下载', 'success');
                } catch (err) {
                    notify('❌ ' + err, 'error');
                } finally {
                    grabLargestBtn.textContent = '📷 抓取当前图片';
                    grabLargestBtn.disabled = false;
                }
            };

            function setStatus(msg, type, code = '', progress = null) {
                statusEl.className = 'el-status show ' + type;
                let html = `<span>${msg}</span>`;
                if (progress !== null) {
                    html += `<div class="el-progress-bar"><div class="el-progress-fill" style="width: ${progress}%"></div></div>`;
                }
                if (code) {
                    html += `<code>${code}</code>`;
                }
                statusEl.innerHTML = html;
            }

            async function getVideoInfo() {
                const title = titleEl.value.trim();
                const url = urlEl.value.trim();
                const originalUrl = originalUrlEl.value.trim();
                const desc = descEl.value.trim();

                if (!title) { notify('请输入标题', 'error'); titleEl.focus(); return null; }

                const hasImg = !!currentImgData;
                if (!url && !hasImg) {
                    notify('请输入视频链接或添加图片', 'error');
                    urlEl.focus();
                    return null;
                }

                GM_setValue(S.title, title);
                GM_setValue(S.url, url);
                GM_setValue(S.originalUrl, originalUrl);
                GM_setValue(S.desc, desc);

                const safeName = title.replace(/[\\/:*?"<>|]/g, '_');
                const basePath = '';

                let videoUrl = null;
                if (url) {
                    setStatus('⏳ 正在获取视频地址...', 'loading');
                    curlBtn.disabled = true;

                    try {
                        const code = url.replace(/^https?:\/\/easylink\.cc\//, '').replace(/\/.*$/, '');
                        videoUrl = await fetchVideoUrl(code);
                    } catch (err) {
                        setStatus('❌ ' + err, 'err');
                        curlBtn.disabled = false;
                        notify(String(err), 'error');
                        return null;
                    }
                }

                curlBtn.disabled = false;
                return { videoUrl, safeName, basePath, title, hasImg };
            }

            // 生成命令
            function generateCommands(info) {
                const { videoUrl, safeName, basePath, hasImg } = info;

                let cmds = '';

                if (videoUrl) {
                    cmds += `# 下载视频（以标题命名）
curl.exe -L -o "${basePath}${safeName}.mp4" "${videoUrl}"`;
                }

                if (hasImg && currentImgType === 'url') {
                    if (cmds) cmds += '\n\n';
                    cmds += `# 下载图片（以标题命名）
curl.exe -L -o "${basePath}${safeName}.png" "${currentImgData}"`;
                } else if (hasImg && currentImgType === 'base64') {
                    if (cmds) cmds += '\n\n';
                    cmds += `# 图片已抓取，将在执行命令时下载
curl.exe -L -o "${basePath}${safeName}.png" "${currentImgData}"`;
                }

                return cmds;
            }

            // 复制简介文本
            copyTextBtn.onclick = () => {
                const originalUrl = originalUrlEl.value.trim();
                const desc = descEl.value.trim();

                GM_setValue(S.originalUrl, originalUrl);
                GM_setValue(S.desc, desc);

                let text = `原链接：${originalUrl}`;

                // 显示所有上传的文件信息
                if (uploadedFilesInfo && uploadedFilesInfo.length > 0) {
                    uploadedFilesInfo.forEach((fileInfo, index) => {
                        text += `\n\n文件名：${fileInfo.name}\n云链接：${fileInfo.url}`;
                    });
                }

                text += `\n\n简介：${desc}`;

                GM_setClipboard(text);
                setStatus('✅ 简介文本已复制', 'ok', text);
                notify('简介文本已复制', 'success');
            };

            // 直接下载
            curlBtn.onclick = async () => {
                const title = titleEl.value.trim();
                const url = urlEl.value.trim();

                if (!title) {
                    notify('请输入标题', 'error');
                    titleEl.focus();
                    return;
                }

                const hasImg = !!currentImgData;
                if (!url && !hasImg) {
                    notify('请输入视频链接或添加图片', 'error');
                    urlEl.focus();
                    return;
                }

                const safeName = title.replace(/[\\/:*?"<>|]/g, '_');

                curlBtn.disabled = true;
                curlBtn.textContent = '⏳ 下载中...';

                // 并行处理视频和图片下载
                const promises = [];

                // 获取视频下载URL
                if (url) {
                    promises.push(
                        fetchVideoUrlSafe(url)
                            .then(videoUrl => {
                                return downloadFile(videoUrl, `${safeName}.mp4`)
                                    .then(() => notify('✅ 视频下载开始: ' + safeName + '.mp4', 'success'))
                                    .catch(err => notify('❌ 视频下载失败: ' + err.message, 'error'));
                            })
                            .catch(err => {
                                notify('❌ 获取视频地址失败: ' + err.message, 'error');
                            })
                    );
                }

                // 下载图片
                if (hasImg) {
                    promises.push(
                        downloadFile(currentImgData, `${safeName}.png`)
                            .then(() => notify('✅ 图片下载开始: ' + safeName + '.png', 'success'))
                            .catch(err => notify('❌ 图片下载失败: ' + err.message, 'error'))
                    );
                }

                // 等待所有下载完成
                Promise.all(promises).finally(() => {
                    curlBtn.disabled = false;
                    curlBtn.textContent = '⬇️ 直接下载';
                });
            };

            // 安全的视频URL获取（带超时和重试）
            async function fetchVideoUrlSafe(url) {
                const code = url.replace(/^https?:\/\/easylink\.cc\//, '').replace(/\/.*$/, '');
                return fetchVideoUrl(code);
            }

            // 通用下载函数
            async function downloadFile(url, filename) {
                return new Promise((resolve, reject) => {
                    // 如果是 base64 格式，直接创建下载链接
                    if (url.startsWith('data:') || url.startsWith('blob:')) {
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        resolve();
                        return;
                    }

                    // 否则使用 GM_xmlhttpRequest 下载（支持跨域）
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        responseType: 'blob',
                        onload: (response) => {
                            if (response.status === 200) {
                                const blob = response.response;
                                const blobUrl = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = blobUrl;
                                link.download = filename;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                URL.revokeObjectURL(blobUrl);
                                resolve();
                            } else {
                                reject(new Error('HTTP status ' + response.status));
                            }
                        },
                        onerror: () => reject(new Error('网络错误'))
                    });
                });
            }

        }

        function init() {
            createPanel();
            GM_registerMenuCommand('📥 打开面板', () => {
                const p = document.getElementById('el-panel');
                if (p) p.style.display = 'block';
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    })();
