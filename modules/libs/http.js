// http

const http = (function () {
    // 导入 Java 类
    const URL = java.net.URL;
    const HttpURLConnection = java.net.HttpURLConnection;
    const BufferedReader = java.io.BufferedReader;
    const InputStreamReader = java.io.InputStreamReader;
    const OutputStreamWriter = java.io.OutputStreamWriter;
    const StringBuilder = java.lang.StringBuilder;
    const Base64 = java.util.Base64;            // 新增，用于 Base64 编码

    // 服务器相关类（JDK 内置 com.sun.net.httpserver）
    const HttpServer = com.sun.net.httpserver.HttpServer;
    const HttpHandler = com.sun.net.httpserver.HttpHandler;
    const HttpExchange = com.sun.net.httpserver.HttpExchange;
    const InetSocketAddress = java.net.InetSocketAddress;
    const StandardCharsets = java.nio.charset.StandardCharsets;

    // ==================== 内部工具 ====================
    /**
     * 将 Java Map<String, List<String>> 转换为 JS 对象（每个键对应逗号拼接的字符串）
     */
    function toJsMap(javaMap) {
        const obj = {};
        if (!javaMap) return obj;
        const iter = javaMap.entrySet().iterator();
        while (iter.hasNext()) {
            const entry = iter.next();
            const key = entry.getKey();
            if (key !== null) {
                const values = entry.getValue(); // Java List
                const valuesArray = [];
                const valueIter = values.iterator();
                while (valueIter.hasNext()) {
                    valuesArray.push(valueIter.next());
                }
                obj[key] = valuesArray.join(', ');
            }
        }
        return obj;
    }

    // ==================== HTTP 客户端（Promise 风格）====================
    /**
     * 底层请求函数，返回 Promise
     * @param {string} method - GET/POST/PUT/DELETE 等
     * @param {string} url - 完整 URL
     * @param {object} options - 可选 { headers, data, timeout }
     * @returns {Promise<object>} 包含 { statusCode, headers, body }
     */
    function _request(method, url, options) {
        return new Promise((resolve, reject) => {
            options = options || {};

            // 使用 task.spawn 在独立线程中执行阻塞网络操作
            task.spawn(function () {
                let connection = null;
                try {
                    const javaUrl = new URL(url);
                    connection = javaUrl.openConnection();
                    connection.setRequestMethod(method);
                    connection.setConnectTimeout(options.timeout || 10000);
                    connection.setReadTimeout(options.timeout || 10000);

                    // 设置请求头
                    if (options.headers) {
                        Object.keys(options.headers).forEach(key => {
                            connection.setRequestProperty(key, options.headers[key]);
                        });
                    }

                    // 处理请求体 (POST/PUT/PATCH)
                    if (options.data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                        connection.setDoOutput(true);
                        // 自动处理 JSON（若 data 是对象且未指定 Content-Type）
                        if (typeof options.data === 'object' && !(options.data instanceof String)) {
                            options.data = JSON.stringify(options.data);
                            if (!options.headers || !options.headers['Content-Type']) {
                                connection.setRequestProperty('Content-Type', 'application/json; charset=UTF-8');
                            }
                        }
                        const output = connection.getOutputStream();
                        const writer = new OutputStreamWriter(output, StandardCharsets.UTF_8);
                        writer.write(options.data);
                        writer.flush();
                        writer.close();
                    }

                    // 获取响应码
                    const responseCode = connection.getResponseCode();

                    // 读取响应流
                    const inputStream = responseCode >= 400 ? connection.getErrorStream() : connection.getInputStream();
                    let reader = null;
                    let body = '';
                    if (inputStream) {
                        reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8));
                        const responseBuilder = new StringBuilder();
                        let line;
                        while ((line = reader.readLine()) !== null) {
                            responseBuilder.append(line).append('\n');
                        }
                        reader.close();
                        body = responseBuilder.toString().trim();
                    }

                    // 获取响应头
                    const headerFields = connection.getHeaderFields();
                    const headers = {};
                    const iter = headerFields.entrySet().iterator();
                    while (iter.hasNext()) {
                        const entry = iter.next();
                        const key = entry.getKey();
                        if (key !== null) {
                            const values = entry.getValue(); // Java List
                            const valuesArray = [];
                            const valueIter = values.iterator();
                            while (valueIter.hasNext()) {
                                valuesArray.push(valueIter.next());
                            }
                            headers[key] = valuesArray.join(', ');
                        }
                    }

                    const response = {
                        statusCode: responseCode,
                        headers: headers,
                        body: body
                    };

                    resolve(response);

                } catch (e) {
                    reject(e);
                } finally {
                    if (connection) connection.disconnect();
                }
            });
        });
    }

    // ==================== 对外暴露的 fetch 方法 ====================
    const http = {};

    /**
     * 兼容 fetch 风格的 HTTP 请求方法
     * @param {string} url - 请求地址
     * @param {object} options - 可选配置，包含 method, headers, body, timeout 等
     * @returns {Promise<object>} 类似 Response 的对象，包含 status, ok, headers, text(), json(), base64()
     */
    http.fetch = function (url, options = {}) {
        const method = options.method || 'GET';
        const reqOptions = {
            headers: options.headers,
            timeout: options.timeout,
            data: options.body
        };
        return _request(method, url, reqOptions).then(function (rawResp) {
            // 创建类似 Response 的对象
            const response = {
                status: rawResp.statusCode,
                statusText: '',                 // 暂不提供状态文本
                ok: rawResp.statusCode >= 200 && rawResp.statusCode < 300,
                headers: rawResp.headers,
                // 提供 headers.get 方法
                getHeader: function (name) {
                    return this.headers[name] || null;
                },
                _body: rawResp.body,
                _bodyUsed: false,

                // text 方法
                text: function () {
                    if (this._bodyUsed) {
                        return Promise.reject(new Error('Body already used'));
                    }
                    this._bodyUsed = true;
                    return Promise.resolve(this._body);
                },

                // json 方法
                json: function () {
                    if (this._bodyUsed) {
                        return Promise.reject(new Error('Body already used'));
                    }
                    this._bodyUsed = true;
                    try {
                        return Promise.resolve(JSON.parse(this._body));
                    } catch (e) {
                        return Promise.reject(e);
                    }
                },

                // base64 方法（新增）
                base64: function () {
                    if (this._bodyUsed) {
                        return Promise.reject(new Error('Body already used'));
                    }
                    this._bodyUsed = true;
                    // 将响应体字符串转为 UTF-8 字节，然后 Base64 编码
                    const bytes = new java.lang.String(this._body).getBytes(StandardCharsets.UTF_8);
                    const base64Encoded = Base64.getEncoder().encodeToString(bytes);
                    return Promise.resolve(base64Encoded);
                }
            };
            return response;
        });
    };

    // ==================== HTTP 服务器（保持不变）====================
    /**
     * 创建一个 HTTP 服务器
     * @param {number} port - 监听端口
     * @param {function} requestHandler - (req, res) => {} 每次请求调用
     * @returns {object} server 对象，包含 close() 方法
     */
    http.createServer = function (port, requestHandler) {
        const address = new InetSocketAddress(port);
        const server = HttpServer.create(address, 0);

        server.createContext('/', new HttpHandler({
            handle: function (exchange) {
                // 封装 req
                const req = {
                    method: exchange.getRequestMethod(),
                    url: exchange.getRequestURI().toString(),
                    headers: toJsMap(exchange.getRequestHeaders()),
                    body: null
                };

                // 读取请求体
                const reqBodyStream = exchange.getRequestBody();
                if (reqBodyStream.available() > 0) {
                    const reader = new BufferedReader(new InputStreamReader(reqBodyStream, StandardCharsets.UTF_8));
                    const sb = new StringBuilder();
                    let line;
                    while ((line = reader.readLine()) !== null) {
                        sb.append(line).append('\n');
                    }
                    reader.close();
                    req.body = sb.toString().trim();
                }

                // 封装 res
                const res = {
                    _exchange: exchange,
                    _headersSent: false,
                    statusCode: 200,
                    headers: {},
                    writeHead: function (statusCode, headers) {
                        this.statusCode = statusCode;
                        if (!this.headers) this.headers = {};
                        if (headers) {
                            for (var key in headers) {
                                if (headers.hasOwnProperty(key)) {
                                    this.headers[key] = headers[key];
                                }
                            }
                        }
                        return this;
                    },
                    end: function (data) {
                        if (this._headersSent) return;
                        this._headersSent = true;

                        if (!this.headers) this.headers = {};

                        const responseHeaders = exchange.getResponseHeaders();
                        for (var key in this.headers) {
                            if (this.headers.hasOwnProperty(key)) {
                                responseHeaders.set(key, this.headers[key]);
                            }
                        }

                        if (responseHeaders) {
                            if (!responseHeaders.get('Content-Type')) {
                                responseHeaders.set('Content-Type', 'text/plain; charset=utf-8');
                            }
                        } else {
                            log.warn('responseHeaders is null, cannot set Content-Type');
                        }

                        const dataBytes = data ? new java.lang.String(data).getBytes(StandardCharsets.UTF_8) : null;
                        const contentLength = dataBytes ? dataBytes.length : 0;
                        exchange.sendResponseHeaders(this.statusCode, contentLength);

                        if (dataBytes) {
                            const os = exchange.getResponseBody();
                            os.write(dataBytes);
                            os.flush();
                            os.close();
                        } else {
                            exchange.getResponseBody().close();
                        }
                    }
                };

                try {
                    requestHandler(req, res);
                } catch (e) {
                    log.error('HTTP 服务器处理请求时出错: ' + e);
                    if (!res._headersSent) {
                        res.writeHead(500);
                        res.end('Internal Server Error');
                    }
                } finally {
                    if (!res._headersSent) {
                        res.writeHead(500);
                        res.end('No response');
                    }
                }
            }
        }));

        server.setExecutor(null);
        server.start();
        log.info('HTTP 服务器已启动，监听端口 ' + port);

        // 注册脚本卸载回调，自动关闭服务器
        bindEvent('unload', function () {
            try {
                server.stop(0);
                log.info('HTTP 服务器已自动关闭（脚本卸载）');
            } catch (e) {
                // 忽略关闭时的异常
            }
        });

        const serverHandle = {
            close: function (callback) {
                task.spawn(function () {
                    server.stop(0);
                    log.info('HTTP 服务器已关闭');
                    if (callback) task.main(callback);
                });
            }
        };
        return serverHandle;
    };

    return http;
})();

const fetch = http.fetch;