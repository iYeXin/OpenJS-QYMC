module.exports = {
    defaultModuleDir: 'modules',
    intry: 'src/main.js',
    output: 'dist/main.js',
    upload: {
        // The following options provide automatic uploads and log pulls for Minecraft servers deployed based on the MCSManager panel.
        enable: false,
        autoPullLogs: true,
        server: {
            url: '', // 面板地址
            apiKey: '', // 面板用户API KEY
            daemonId: '', // 节点ID
            instanceId: '', // 实例ID
        },
        targetFile: '/plugins/OpenJS/scripts/main.js'
    }
}