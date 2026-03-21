(function () {
    const logger = new Logger('QY玩法')
    addCommand("setfly", {
        onCommand: function (sender, args) {
            // 检查执行者是否为玩家
            if (!(sender instanceof org.bukkit.entity.Player)) {
                sender.sendMessage("§c该指令只能由玩家执行！");
                return true;
            }

            const player = sender;
            const canFly = player.getAllowFlight();

            // 切换飞行状态
            player.setAllowFlight(!canFly);
            player.setFlying(!canFly); // 立即进入飞行状态（如果允许飞行）

            player.sendMessage('§a[QY 玩法] §3飞行模式已' + (!canFly ? "§2开启" : "§c关闭"));
            return true;
        },

        onTabComplete: function (sender, args) {
            // 无参数补全，返回空列表
            return toJavaList([]);
        }
    });

    logger.info("setFly指令已启用");
})();