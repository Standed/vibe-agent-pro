"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        send: function (channel, data) { return electron_1.ipcRenderer.send(channel, data); },
        on: function (channel, func) {
            var subscription = function (_event) {
                var args = [];
                for (var _i = 1; _i < arguments.length; _i++) {
                    args[_i - 1] = arguments[_i];
                }
                return func.apply(void 0, args);
            };
            electron_1.ipcRenderer.on(channel, subscription);
            return function () { return electron_1.ipcRenderer.removeListener(channel, subscription); };
        },
        once: function (channel, func) { return electron_1.ipcRenderer.once(channel, func); },
    },
});
