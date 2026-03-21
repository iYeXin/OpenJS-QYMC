(() => {
    const logger = new Logger('QY一言');
    function hitokoto() {
        fetch('https://v1.hitokoto.cn/')
            .then(res => res.json())
            .then(data => logger.info(data.hitokoto))
            .catch(err => logger.error(err.message));
    }
    const id = setInterval(hitokoto, 10 * 1000);
    hitokoto();
    setTimeout(() => {
        clearInterval(id);
    }, 30 * 1000);
})();