const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');

// 加载配置文件
const requireFromCwd = createRequire(__filename);
let config;
try {
    const rawConfig = requireFromCwd('./ojbuild.config.js');
    config = rawConfig.default || rawConfig;
} catch (err) {
    console.error('❌ 无法加载 ojbuild.config.js：', err.message);
    process.exit(1);
}

const {
    defaultModuleDir = 'modules',
    intry: entryFile,
    output: outputFile,
    upload: uploadConfig
} = config;

if (!entryFile || !outputFile) {
    console.error('❌ 配置文件缺少 intry 或 output 字段');
    process.exit(1);
}

/**
 * 获取模块文件的绝对路径
 */
function getModulePath(moduleName) {
    return path.resolve(defaultModuleDir, `${moduleName}.js`);
}

/**
 * 读取模块文件的原始内容
 */
function readModuleRaw(moduleName) {
    const filePath = getModulePath(moduleName);
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        console.error(`❌ 读取模块失败: ${filePath}\n`, err.message);
        process.exit(1);
    }
}

/**
 * 递归展开内容中的所有 include/includeAll 指令
 */
function expandContent(content, currentFilePath, processedStack = []) {
    const lines = content.split(/\r?\n/);
    const resultLines = [];

    const includeRegex = /^\s*"include\s+([^"]+)"\s*;?\s*$/;
    const includeAllRegex = /^\s*"includeAll\s+([^"]+)"\s*;?\s*$/;

    for (let line of lines) {
        let match;

        if ((match = line.match(includeAllRegex))) {
            const moduleName = match[1].trim();
            const modulePath = getModulePath(moduleName);

            if (processedStack.includes(modulePath)) {
                console.error(`❌ 检测到循环依赖: ${modulePath}`);
                console.error(`   调用栈: ${[...processedStack, modulePath].join(' -> ')}`);
                process.exit(1);
            }

            const rawContent = readModuleRaw(moduleName);
            const expanded = expandContent(rawContent, modulePath, [...processedStack, currentFilePath]);
            resultLines.push(expanded);
        } else if ((match = line.match(includeRegex))) {
            const moduleName = match[1].trim();
            const rawContent = readModuleRaw(moduleName);
            resultLines.push(rawContent);
        } else {
            resultLines.push(line);
        }
    }

    return resultLines.join('\n');
}

// ==================== 上传与日志拉取相关 ====================

/**
 * 通用 HTTP 请求（使用 fetch，支持 http/https）
 * @param {string} method HTTP 方法
 * @param {string} baseUrl 基础 URL（不含查询参数）
 * @param {object} options 可选配置
 * @param {object} options.query 查询参数对象
 * @param {object} options.headers 自定义请求头
 * @param {any} options.body 请求体（FormData、字符串等）
 */
async function doRequest(method, baseUrl, options = {}) {
    const { headers = {}, body, query = {} } = options;
    // 构建 URL，添加查询参数
    const urlObj = new URL(baseUrl);
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
            urlObj.searchParams.append(key, String(value));
        }
    }
    const url = urlObj.toString();

    // 默认头部
    const defaultHeaders = {
        'X-Requested-With': 'XMLHttpRequest',
    };
    // 如果不是 FormData，则设置 Content-Type
    if (!(body instanceof FormData)) {
        defaultHeaders['Content-Type'] = 'application/json; charset=utf-8';
    }

    const mergedHeaders = { ...defaultHeaders, ...headers };

    const fetchOptions = {
        method,
        headers: mergedHeaders,
        body
    };

    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return await response.json();
    } else {
        const text = await response.text();
        try {
            const json = JSON.parse(text);
            return json;
        } catch { }
        return text;
    }
}

/**
 * 获取上传凭证
 */
async function getUploadConfig(server, targetFile) {
    const uploadDir = path.posix.dirname(targetFile);
    const baseUrl = `${server.url}/api/files/upload`;
    const query = {
        upload_dir: uploadDir,
        daemonId: server.daemonId,
        uuid: server.instanceId,
        apikey: server.apiKey,
    };
    const result = await doRequest('POST', baseUrl, { query });
    if (result.status !== 200) {
        throw new Error(`获取上传凭证失败: ${result.status}`);
    }
    return result.data; // { password, addr }
}

/**
 * 上传文件到守护进程
 * @param {string} baseUrl 上传基础 URL（例如 http://mc.ye.yeside.top:24444）
 * @param {string} password 上传密码
 * @param {string} filePath 本地文件路径
 */
async function uploadFileToDaemon(baseUrl, password, filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), filename);

    const url = `${baseUrl}/upload/${password}`;
    const response = await fetch(url, {
        method: 'POST',
        body: formData
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`上传文件失败 (${response.status}): ${text}`);
    }
    return text; // 通常是 "OK"
}

/**
 * 拉取原始日志
 */
async function fetchRawLogs(server, size = 4096) {
    const baseUrl = `${server.url}/api/protected_instance/outputlog`;
    const query = {
        uuid: server.instanceId,
        daemonId: server.daemonId,
        size: size.toString(),
        apikey: server.apiKey,
    };
    const result = await doRequest('GET', baseUrl, { query });
    if (result.status !== 200) {
        throw new Error(`获取日志失败: ${result.status}`);
    }
    return result.data; // 原始字符串
}

/**
 * 从日志行中提取时间（hh:mm:ss）并转换为秒数
 */
function extractTimeSec(line) {
    const first15 = line.substring(0, 15);
    const match = first15.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return null;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    return hours * 3600 + minutes * 60 + seconds;
}

/**
 * 计算行的哈希（用于去重）
 * 使用当前行及其前三行的组合
 */
function computeLineHash(lines, index) {
    const start = Math.max(0, index - 3);
    const slice = lines.slice(start, index + 1);
    const combined = slice.join('\n');
    return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * 启动日志拉取循环
 * @param {number} uploadStartTime 上传开始时的 Unix 时间戳（秒）
 * @param {object} serverConfig 服务器配置
 */
async function startLogPulling(uploadStartTime, serverConfig) {
    const startTimeSec = (uploadStartTime - 5) % 86400 + 8 * 60 * 60; // 起始时间（秒）
    let lastProcessedTime = startTimeSec;     // 已处理过的最大时间（秒）
    let processedHashes = new Set();           // 已输出行的哈希集合
    let isFetching = false;                    // 防止重叠请求

    console.log(`\n开始拉取日志（起始时间: ${new Date(uploadStartTime * 1000).toLocaleTimeString()}）`);

    // 拉取并处理一次
    async function pullOnce() {
        if (isFetching) return;
        isFetching = true;
        try {
            // 拉取所有日志（不设 size 限制，或者设大一点）
            const logs = await fetchRawLogs(serverConfig, 4 * 1024); // 4 KB
            const lines = logs.split(/\r?\n/);
            const newOutputLines = [];

            // 逐行处理
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const timeSec = extractTimeSec(line);
                if (timeSec === null) continue; // 无时间戳的行忽略

                // 时间过滤：只处理 >= lastProcessedTime 的行（起始条件）
                if (timeSec < lastProcessedTime) continue;

                // 去重：计算哈希并检查
                const hash = computeLineHash(lines, i);
                if (processedHashes.has(hash)) continue;

                // 新行：输出并记录
                processedHashes.add(hash);
                newOutputLines.push(line);
                // 更新最后处理时间（取最大值）
                if (timeSec > lastProcessedTime) lastProcessedTime = timeSec;
            }

            // 输出新行
            if (newOutputLines.length > 0) {
                console.log(`\n新日志 (${newOutputLines.length} 行):`);
                for (const line of newOutputLines) {
                    // 美观输出：用青色显示时间戳部分，其余原样
                    const formatted = line.replace(/^(\[\d{2}:\d{2}:\d{2}\])/, '\x1b[36m$1\x1b[0m');
                    console.log(formatted);
                }
            }
        } catch (err) {
            console.error(`\n⚠️ 拉取日志出错: ${err.message}`);
        } finally {
            isFetching = false;
        }
    }

    // 立即执行一次
    setTimeout(async () => {
        await pullOnce();
    }, 1000)

    // 定时循环
    const interval = setInterval(async () => {
        await pullOnce();
    }, 3000);

    // 优雅退出
    process.on('SIGINT', () => {
        clearInterval(interval);
        console.log('\n🚪 已停止日志拉取');
        process.exit(0);
    });
}

// ==================== 主流程 ====================
(async () => {
    // 1. 构建
    try {
        const entryPath = path.resolve(entryFile);
        const entryContent = fs.readFileSync(entryPath, 'utf8');
        const finalContent = expandContent(entryContent, entryPath);

        const outputDir = path.dirname(outputFile);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.writeFileSync(outputFile, finalContent, 'utf8');
        console.log(`✅ 构建成功！输出文件：${outputFile}`);
    } catch (err) {
        console.error('❌ 构建失败：', err.message);
        process.exit(1);
    }

    // 2. 处理上传（如果启用）
    if (uploadConfig && uploadConfig.enable) {
        const { server, targetFile } = uploadConfig;
        if (!server || !targetFile) {
            console.warn('⚠️ 上传配置不完整，跳过上传');
            process.exit(0);
        }

        console.log(`\n📤 准备上传文件到 ${server.url}`);
        const uploadStartTime = Math.floor(Date.now() / 1000); // 记录开始时间（秒）

        try {
            // 获取上传凭证
            const { password, addr } = await getUploadConfig(server, targetFile);
            console.log(`   获取凭证成功，原始上传主机地址: ${addr}`);

            // 解析返回的 addr，提取端口
            let port = '80';
            if (addr.includes(':')) {
                const parts = addr.split(':');
                port = parts[1];
            }

            // 从配置的 server.url 中提取域名
            const serverUrlObj = new URL(server.url);
            const serverHostname = serverUrlObj.hostname;

            // 构造可访问的上传基础 URL
            const uploadBaseUrl = `http://${serverHostname}:${port}`;
            console.log(`   自动填充公网地址: ${uploadBaseUrl}`);

            // 上传文件
            const result = await uploadFileToDaemon(uploadBaseUrl, password, outputFile);
            console.log(`   ✅ 上传成功: ${result}`);

            // 如果启用自动拉取日志
            if (uploadConfig.autoPullLogs) {
                await startLogPulling(uploadStartTime, server);
            } else {
                console.log('ℹ️ 自动拉取日志未启用');
            }
        } catch (err) {
            console.error(`❌ 上传失败: ${err.message}`);
            process.exit(1);
        }
    } else {
        console.log('ℹ️ 未启用文件上传');
    }
})();