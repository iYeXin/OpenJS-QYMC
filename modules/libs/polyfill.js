// polyfill

// polyfill for Array.prototype.includes (ES7)
if (!Array.prototype.includes) {
    Array.prototype.includes = function (searchElement, fromIndex) {
        if (this == null) {
            throw new TypeError('"this" is null or not defined');
        }
        var o = Object(this);
        var len = o.length >>> 0;
        if (len === 0) {
            return false;
        }
        var n = fromIndex | 0;
        var k = Math.max(n >= 0 ? n : len + n, 0);
        while (k < len) {
            if (o[k] === searchElement) {
                return true;
            }
            k++;
        }
        return false;
    };
}

// polyfill for setTimeout, clearTimeout, setInterval, clearInterval

const _timeout = (function () {
    const timers = {};
    function _setTimeout(callback, delay) {
        const args = Array.prototype.slice.call(arguments, 2);
        const taskId = task.delay(delay / 1000, function () {
            // 捕获回调异常，避免影响其他定时器（可选，保持与原行为接近）
            try {
                callback.apply(null, args);
                delete timers[taskId];
            } catch (error) {
                log.error("Error in setTimeout callback: " + error);
            }
        });
        timers[taskId] = 1;
        return taskId;
    }
    function _clearTimeout(taskId) {
        try {
            task.cancel(taskId);
            delete timers[taskId];
        } catch (error) {
            log.error("Error clearing timeout: " + error);
        }
    }
    bindEvent('unload', () => {
        const keys = Object.keys(timers);
        for (let i = 0; i < keys.length; i++) {
            task.cancel(keys[i]);
        }
    });
    return {
        setTimeout: _setTimeout,
        clearTimeout: _clearTimeout
    };
})();

const setTimeout = _timeout.setTimeout;
const clearTimeout = _timeout.clearTimeout;

const _interval = (function () {
    const intervals = {};
    let counter = 0;
    const setInterval = function (callback, delay) {
        const args = Array.prototype.slice.call(arguments, 2);
        const id = ++counter;
        // 定义递归调度函数，避免在回调中清除后仍创建新定时器
        const schedule = () => {
            intervals[id] = setTimeout(function () {
                if (intervals[id]) {
                    try {
                        callback.apply(null, args);
                    } catch (error) {
                        log.error("Error in setInterval callback: " + error);
                    }
                    // 回调执行后再次检查，若未被清除则继续调度
                    if (intervals[id]) {
                        schedule();
                    }
                }
            }, delay);
        };
        schedule();
        return id;
    };
    const clearInterval = function (id) {
        clearTimeout(intervals[id]);
        delete intervals[id];
    };
    return {
        setInterval: setInterval,
        clearInterval: clearInterval
    };
})();

const setInterval = _interval.setInterval;
const clearInterval = _interval.clearInterval;

// polyfill for Promise
const Promise = (function () {
    // 状态常量
    const PENDING = 'pending';
    const FULFILLED = 'fulfilled';
    const REJECTED = 'rejected';

    // 核心的 resolvePromise 过程（遵循 Promise/A+ 规范）
    function resolvePromise(promise, x, resolve, reject) {
        // 调试日志：函数入口
        // log.info("resolvePromise called - promise: " + promise + ", x type: " + (x === null ? 'null' : typeof x) + ", resolve is function: " + (typeof resolve === 'function') + ", reject is function: " + (typeof reject === 'function'));

        if (promise === x) {
            // log.info("Chaining cycle detected for promise, rejecting with TypeError");
            reject(new TypeError('Chaining cycle detected for promise'));
            return;
        }

        if (x instanceof Promise) {
            // log.info("x is a Promise instance, state: " + x.state);
            // 如果 x 是 Promise 实例，则根据它的状态处理
            if (x.state === PENDING) {
                x.then(function (y) {
                    resolvePromise(promise, y, resolve, reject);
                }, reject);
            } else {
                x.then(resolve, reject);
            }
            return;
        }

        if (x !== null && (typeof x === 'object' || typeof x === 'function')) {
            // log.info("x is an object or function, attempting to extract then property");
            let then;
            try {
                then = x.then;
                // log.info("then property extracted: " + (typeof then === 'function' ? 'function' : typeof then));
            } catch (e) {
                // log.info("Error accessing then property: " + e);
                reject(e);
                return;
            }

            if (typeof then === 'function') {
                // log.info("then is a function, calling then with x as this");
                let called = false;
                try {
                    then.call(
                        x,
                        function (y) {
                            if (called) return;
                            called = true;
                            // log.info("then onFulfilled called with y: " + (typeof y === 'object' ? JSON.stringify(y) : String(y)));
                            resolvePromise(promise, y, resolve, reject);
                        },
                        function (r) {
                            if (called) return;
                            called = true;
                            // log.info("then onRejected called with r: " + (typeof r === 'object' ? JSON.stringify(r) : String(r)));
                            reject(r);
                        }
                    );
                } catch (e) {
                    // log.info("Error calling then: " + e);
                    if (!called) {
                        reject(e);
                    }
                }
                return;
            }
        }

        // 普通值直接 resolve
        // log.info("x is a primitive value, resolving with: " + (typeof x === 'object' ? JSON.stringify(x) : String(x)));
        resolve(x);
    }

    // Promise 构造函数
    function Promise(executor) {
        const self = this;
        self.state = PENDING;
        self.value = undefined;
        self.callbacks = [];

        // 内部 resolve 函数（处理值可能是 thenable 的情况）
        function resolve(value) {
            if (self.state !== PENDING) return;

            // 最终的 fulfilled 处理
            function settleResolve(val) {
                if (self.state !== PENDING) return;
                self.state = FULFILLED;
                self.value = val;
                // 使用 task.spawn 异步执行所有已注册的 onFulfilled 回调
                task.spawn(function () {
                    self.callbacks.forEach(function (cb) {
                        cb.onFulfilled(val);
                    });
                });
            }

            // 最终的 rejected 处理
            function settleReject(reason) {
                if (self.state !== PENDING) return;
                self.state = REJECTED;
                self.value = reason;
                task.spawn(function () {
                    self.callbacks.forEach(function (cb) {
                        cb.onRejected(reason);
                    });
                });
            }

            try {
                // 调用 resolvePromise 处理 value（可能是 thenable 或 Promise）
                resolvePromise(self, value, settleResolve, settleReject);
            } catch (e) {
                settleReject(e);
            }
        }

        // 内部 reject 函数
        function reject(reason) {
            if (self.state !== PENDING) return;
            self.state = REJECTED;
            self.value = reason;
            task.spawn(function () {
                self.callbacks.forEach(function (cb) {
                    cb.onRejected(reason);
                });
            });
        }

        try {
            executor(resolve, reject);
        } catch (e) {
            reject(e);
        }
    }

    // then 方法
    Promise.prototype.then = function (onFulfilled, onRejected) {

        const self = this;

        // 参数默认值（值穿透）
        onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : function (v) { return v; };
        onRejected = typeof onRejected === 'function' ? onRejected : function (r) { throw r; };

        const newPromise = new Promise(function (resolve, reject) {
            if (self.state === FULFILLED) {
                task.spawn(function () {
                    try {
                        const x = onFulfilled(self.value);
                        resolvePromise(newPromise, x, resolve, reject);
                    } catch (e) {
                        reject(e);
                    }
                });
            } else if (self.state === REJECTED) {
                task.spawn(function () {
                    try {
                        const x = onRejected(self.value);
                        resolvePromise(newPromise, x, resolve, reject);
                    } catch (e) {
                        reject(e);
                    }
                });
            } else {
                // pending 状态，将回调暂存
                self.callbacks.push({
                    onFulfilled: function (value) {
                        try {
                            const x = onFulfilled(value);
                            resolvePromise(newPromise, x, resolve, reject);
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onRejected: function (reason) {
                        try {
                            const x = onRejected(reason);
                            resolvePromise(newPromise, x, resolve, reject);
                        } catch (e) {
                            reject(e);
                        }
                    }
                });
            }
        });

        return newPromise;
    };

    // catch 方法
    Promise.prototype.catch = function (onRejected) {
        return this.then(null, onRejected);
    };

    // finally 方法 (ES2018)
    Promise.prototype.finally = function (onFinally) {
        return this.then(
            function (value) {
                return Promise.resolve(onFinally()).then(function () { return value; });
            },
            function (reason) {
                return Promise.resolve(onFinally()).then(function () { throw reason; });
            }
        );
    };

    // 静态方法 resolve
    Promise.resolve = function (value) {
        if (value instanceof Promise) return value;
        return new Promise(function (resolve) {
            resolve(value);
        });
    };

    // 静态方法 reject
    Promise.reject = function (reason) {
        return new Promise(function (resolve, reject) {
            reject(reason);
        });
    };

    // 静态方法 all
    Promise.all = function (promises) {
        return new Promise(function (resolve, reject) {
            if (!Array.isArray(promises)) {
                return reject(new TypeError('promises must be an array'));
            }
            const results = new Array(promises.length);
            let remaining = promises.length;
            if (remaining === 0) {
                resolve(results);
                return;
            }
            function resolveOne(index, value) {
                Promise.resolve(value).then(function (v) {
                    results[index] = v;
                    remaining--;
                    if (remaining === 0) resolve(results);
                }, reject);
            }
            for (let i = 0; i < promises.length; i++) {
                resolveOne(i, promises[i]);
            }
        });
    };

    // 静态方法 race
    Promise.race = function (promises) {
        return new Promise(function (resolve, reject) {
            if (!Array.isArray(promises)) {
                return reject(new TypeError('promises must be an array'));
            }
            for (let i = 0; i < promises.length; i++) {
                Promise.resolve(promises[i]).then(resolve, reject);
            }
        });
    };

    // 静态方法 allSettled (ES2020)
    Promise.allSettled = function (promises) {
        return new Promise(function (resolve, reject) {
            if (!Array.isArray(promises)) {
                return reject(new TypeError('promises must be an array'));
            }
            const results = new Array(promises.length);
            let remaining = promises.length;
            if (remaining === 0) {
                resolve(results);
                return;
            }
            function resolveOne(index, promise) {
                Promise.resolve(promise).then(
                    function (value) {
                        results[index] = { status: 'fulfilled', value: value };
                        remaining--;
                        if (remaining === 0) resolve(results);
                    },
                    function (reason) {
                        results[index] = { status: 'rejected', reason: reason };
                        remaining--;
                        if (remaining === 0) resolve(results);
                    }
                );
            }
            for (let i = 0; i < promises.length; i++) {
                resolveOne(i, promises[i]);
            }
        });
    };

    return Promise;
})();