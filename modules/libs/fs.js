// file system

const fs = (function () {
    // 导入 Java 类
    const Paths = java.nio.file.Paths;
    const Files = java.nio.file.Files;
    const StandardCharsets = java.nio.charset.StandardCharsets;
    const File = java.io.File;
    const ArrayList = java.util.ArrayList;
    const StandardOpenOption = java.nio.file.StandardOpenOption;
    const LinkOption = java.nio.file.LinkOption;

    // 辅助函数：将 Java 迭代器或集合转换为 JS 数组
    function toJsArray(iterable) {
        const arr = [];
        const iterator = iterable.iterator();
        while (iterator.hasNext()) {
            arr.push(iterator.next());
        }
        return arr;
    }

    // 辅助函数：处理路径参数
    function getPath(path) {
        if (typeof path !== 'string') throw new Error('Path must be a string');
        return Paths.get(path);
    }

    // 辅助函数：处理编码参数，默认 UTF-8
    function getCharset(encoding) {
        if (!encoding || encoding.toLowerCase() === 'utf8' || encoding.toLowerCase() === 'utf-8') {
            return StandardCharsets.UTF_8;
        }
        // 可以扩展支持其他编码，但这里只实现 UTF-8
        return StandardCharsets.UTF_8;
    }

    // 辅助函数：读取所有字节并转为字符串
    function readAllBytes(path) {
        return Files.readAllBytes(path);
    }

    // 辅助函数：写入字节（修正：不使用扩展运算符，改用 Java 数组）
    function writeBytes(path, bytes, options) {
        const optsList = [];
        if (options && options.flag === 'a') {
            optsList.push(StandardOpenOption.APPEND);
            optsList.push(StandardOpenOption.CREATE);
        } else {
            optsList.push(StandardOpenOption.WRITE);
            optsList.push(StandardOpenOption.CREATE);
            optsList.push(StandardOpenOption.TRUNCATE_EXISTING);
        }

        // 将 JS 数组转换为 Java 数组
        const optsArray = Java.to(optsList, StandardOpenOption);
        for (let i = 0; i < optsList.length; i++) {
            optsArray[i] = optsList[i];
        }

        Files.write(path, bytes, optsArray);
    }

    // ==================== 同步方法 ====================
    const sync = {
        /**
         * 同步读取文件
         * @param {string} path 文件路径
         * @param {string|object} options 可以是编码字符串或 { encoding: string }
         * @returns {string} 文件内容
         */
        readFileSync: function (path, options) {
            const p = getPath(path);
            let encoding = 'utf8';
            if (options) {
                if (typeof options === 'string') encoding = options;
                else if (options.encoding) encoding = options.encoding;
            }
            const charset = getCharset(encoding);
            try {
                const bytes = readAllBytes(p);
                return new java.lang.String(bytes, charset);
            } catch (e) {
                throw new Error('Failed to read file: ' + e.message);
            }
        },

        /**
         * 同步写入文件
         * @param {string} path 文件路径
         * @param {string|byte[]} data 要写入的数据
         * @param {string|object} options 编码或选项
         */
        writeFileSync: function (path, data, options) {
            const p = getPath(path);
            // 解析选项
            let encoding = 'utf8';
            let flag = 'w';
            if (options) {
                if (typeof options === 'string') {
                    encoding = options;
                } else {
                    if (options.encoding) encoding = options.encoding;
                    if (options.flag) flag = options.flag;
                }
            }
            const charset = getCharset(encoding);
            // 将 data 转换为字节数组
            let bytes;
            if (typeof data === 'string' || data instanceof java.lang.String) {
                bytes = new java.lang.String(data).getBytes(charset);
            } else if (data instanceof java.lang.Object && data.getClass().isArray() && data.getClass().getComponentType() === java.lang.Byte.TYPE) {
                bytes = data; // 已经是 Java byte[]
            } else {
                throw new Error('Data must be a string or byte array');
            }
            try {
                writeBytes(p, bytes, { flag: flag });
            } catch (e) {
                throw new Error('Failed to write file: ' + e.message);
            }
        },

        /**
         * 同步追加文件
         */
        appendFileSync: function (path, data, options) {
            if (!options) options = {};
            if (typeof options === 'string') options = { encoding: options };
            options.flag = 'a';
            this.writeFileSync(path, data, options);
        },

        /**
         * 检查文件是否存在
         */
        existsSync: function (path) {
            const p = getPath(path);
            return Files.exists(p, LinkOption.NOFOLLOW_LINKS);
        },

        /**
         * 创建目录（包括父目录）
         */
        mkdirSync: function (path, options) {
            const p = getPath(path);
            try {
                if (options && options.recursive) {
                    Files.createDirectories(p);
                } else {
                    Files.createDirectory(p);
                }
            } catch (e) {
                throw new Error('Failed to create directory: ' + e.message);
            }
        },

        /**
         * 获取文件状态
         * @returns {object} 包含 size, isFile, isDirectory, mtime 等
         */
        statSync: function (path) {
            const p = getPath(path);
            try {
                const attrs = Files.readAttributes(p, java.nio.file.attribute.BasicFileAttributes.class);
                return {
                    size: attrs.size(),
                    isFile: attrs.isRegularFile(),
                    isDirectory: attrs.isDirectory(),
                    isSymbolicLink: attrs.isSymbolicLink(),
                    mtime: attrs.lastModifiedTime().toMillis(),
                    atime: attrs.lastAccessTime().toMillis(),
                    ctime: attrs.creationTime().toMillis()
                };
            } catch (e) {
                throw new Error('Failed to stat file: ' + e.message);
            }
        },

        /**
         * 删除文件
         */
        unlinkSync: function (path) {
            const p = getPath(path);
            try {
                Files.delete(p);
            } catch (e) {
                throw new Error('Failed to delete file: ' + e.message);
            }
        },

        /**
         * 读取目录
         * @returns {string[]} 文件名数组
         */
        readdirSync: function (path) {
            const p = getPath(path);
            try {
                const stream = Files.newDirectoryStream(p);
                const list = new ArrayList();
                const iterator = stream.iterator();
                while (iterator.hasNext()) {
                    list.add(iterator.next().getFileName().toString());
                }
                stream.close();
                return toJsArray(list);
            } catch (e) {
                throw new Error('Failed to read directory: ' + e.message);
            }
        }
    };

    // ==================== 异步方法（返回 Promise） ====================
    // 注意：异步操作使用 task.spawn 在后台线程执行，完成后 resolve/reject
    const async = {};

    // 辅助函数：创建异步包装器
    function createAsync(syncFn) {
        return function () {
            // 将 arguments 转换为真正的数组
            var args = [];
            for (var i = 0; i < arguments.length; i++) {
                args.push(arguments[i]);
            }
            return new Promise((resolve, reject) => {
                task.spawn(function () {
                    try {
                        // 使用 apply 调用同步函数，传入 args 数组
                        const result = syncFn.apply(sync, args);
                        resolve(result);
                    } catch (e) {
                        reject(e);
                    }
                });
            });
        };
    }

    // 为每个同步方法创建对应的异步版本
    async.readFile = createAsync(sync.readFileSync);
    async.writeFile = createAsync(sync.writeFileSync);
    async.appendFile = createAsync(sync.appendFileSync);
    async.exists = createAsync(sync.existsSync);
    async.mkdir = createAsync(sync.mkdirSync);
    async.stat = createAsync(sync.statSync);
    async.unlink = createAsync(sync.unlinkSync);
    async.readdir = createAsync(sync.readdirSync);

    // 返回同时包含同步和异步方法的对象
    return {
        // 同步
        readFileSync: sync.readFileSync,
        writeFileSync: sync.writeFileSync,
        appendFileSync: sync.appendFileSync,
        existsSync: sync.existsSync,
        mkdirSync: sync.mkdirSync,
        statSync: sync.statSync,
        unlinkSync: sync.unlinkSync,
        readdirSync: sync.readdirSync,

        // 异步（Promise）
        readFile: async.readFile,
        writeFile: async.writeFile,
        appendFile: async.appendFile,
        exists: async.exists,
        mkdir: async.mkdir,
        stat: async.stat,
        unlink: async.unlink,
        readdir: async.readdir
    };
})();
