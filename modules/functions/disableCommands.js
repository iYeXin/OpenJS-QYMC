(function () {
    // 监听玩家发送命令和命令方块执行命令，阻止敏感指令（如 op），控制台不受限制

    const logger = new Logger('QY安全')

    // 定义需要阻止的命令列表（小写，不包含斜杠）
    const blockedCommands = [
        'op',
        'deop',
        'stop',
        'restart',
        'reload',
        'plugman',
        'advancement',
        'console'
    ];

    // 辅助函数：从完整命令字符串中提取第一个命令部分（小写，无斜杠）
    function getCommandName(fullCommand) {
        // 移除开头的斜杠（如果有）
        let cmd = fullCommand.startsWith('/') ? fullCommand.substring(1) : fullCommand;
        cmd = cmd.startsWith('minecraft:') ? cmd.substring(10) : cmd; // 移除 minecraft: 前缀
        cmd = cmd.startsWith('bukkit') ? cmd.substring(7) : cmd; // 移除 bukkit: 前缀
        // 按空格分割，取第一个
        return cmd.split(' ')[0].toLowerCase();
    }

    // 辅助函数：判断命令是否被阻止
    function isBlocked(fullCommand) {
        const cmdName = getCommandName(fullCommand);
        return blockedCommands.includes(cmdName);
    }

    // --- 1. 监听玩家命令预处理事件 ---
    registerEvent('org.bukkit.event.player.PlayerCommandPreprocessEvent', function (event) {
        const player = event.getPlayer();
        const message = event.getMessage(); // 包含 '/' 的完整消息
        if (isBlocked(message)) {
            event.setCancelled(true);
            const msg = '§a[QY 安全] §3玩家 ' + player.getName() + ' 尝试执行被阻止的命令: ' + message
            logger.info(msg);
            player.sendMessage(msg);
        }
    });

    // --- 2. 监听服务器命令事件（包含控制台、命令方块、Rcon等）---
    registerEvent('org.bukkit.event.server.ServerCommandEvent', function (event) {
        const sender = event.getSender();
        const command = event.getCommand(); // 不带斜杠的命令字符串
        const message = event.getMessage();

        // 如果发送者是控制台，放行
        if (sender instanceof org.bukkit.command.ConsoleCommandSender) {
            return; // 控制台不受限制
        }

        // 如果发送者是命令方块（包括命令方块矿车）
        const isCommandBlock = sender instanceof org.bukkit.command.BlockCommandSender ||
            sender instanceof org.bukkit.entity.minecart.CommandMinecart;
        if (isCommandBlock && isBlocked('/' + command)) { // 补上斜杠以匹配 isBlocked 的格式
            event.setCancelled(true);
            const msg = '§a[QY 安全] §3命令方块 ' + ' 尝试执行被阻止的命令: ' + message
            logger.info(msg);
        }
    });

    logger.info('安全脚本已加载 - 已阻止命令: ' + blockedCommands.join(', '));
})();