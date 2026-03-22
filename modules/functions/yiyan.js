(() => {
    const logger = new Logger('QY一言');
    const Bukkit = org.bukkit.Bukkit;
    const interval = 5 * 60; // 5分钟
    setInterval(sendHitokoto, interval * 1000);
    sendHitokoto(); // 初次调用
    logger.info('一言加载成功')
    function sendHitokoto() {
        task.main(() => {
            if (Bukkit.getOnlinePlayers().length === 0) return;
            fetch('https://v1.hitokoto.cn/')
                .then(res => res.json())
                .then(data => {
                    const message = data.hitokoto;
                    logger.info(message)
                    task.main(() => {
                        const players = Bukkit.getOnlinePlayers();
                        for (let player of players) {
                            player.sendMessage('§a[QY 一言] §3' + message);
                        }
                    })
                })
                .catch(err => logger.error(err.message));
        });
    }
})();