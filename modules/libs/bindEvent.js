const bindEvent = (() => {
    const callbacks = {
        unload: [],
    };
    function handleBindEvent(eventName, callback) {
        switch (eventName) {
            case 'unload':
                callbacks.unload.push(callback);
                break;
            default:
                throw new Error('Unknown event')
        }
    }
    task.bindToUnload(() => {
        for (let i = 0; i < callbacks.unload.length; i++) {
            callbacks.unload[i]();
        }
    });
    return handleBindEvent;
})();