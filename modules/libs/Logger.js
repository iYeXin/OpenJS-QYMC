// 日志构造函数
function Logger(prefix) {
    // 存储前缀
    this.prefix = prefix;
    // 获取 Java Logger 实例，名称即为前缀
    this.javaLogger = java.util.logging.Logger.getLogger(prefix);
}

// 原型方法定义
Logger.prototype = {
    constructor: Logger,

    // 普通信息
    info: function (msg) {
        this.javaLogger.info(msg);
    },

    // 警告
    warn: function (msg) {
        this.javaLogger.warning(msg);
    },
    warning: function (msg) {
        this.javaLogger.warning(msg);
    },

    // 错误
    error: function (msg) {
        this.javaLogger.severe(msg);
    },
    severe: function (msg) {
        this.javaLogger.severe(msg);
    },

    // 调试 (FINE)
    debug: function (msg) {
        this.javaLogger.fine(msg);
    },
    fine: function (msg) {
        this.javaLogger.fine(msg);
    },

    // 更详细调试
    finer: function (msg) {
        this.javaLogger.finer(msg);
    },

    // 最详细调试
    finest: function (msg) {
        this.javaLogger.finest(msg);
    },

    // 获取当前前缀
    getPrefix: function () {
        return this.prefix;
    },

    // 动态修改前缀（谨慎使用，会更改 Java Logger 名称）
    setPrefix: function (newPrefix) {
        this.prefix = newPrefix;
        // 重新获取 Logger（原来的 Logger 仍存在，但新日志将使用新名称）
        this.javaLogger = java.util.logging.Logger.getLogger(newPrefix);
    }
};
