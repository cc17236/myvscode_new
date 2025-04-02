/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

  const { contextBridge, ipcRenderer } = require('electron');


  const OSMap = {
    'linux': 'linux',
    'win32': 'windows',
  };

  const getOSType = () => {
    return OSMap[process.platform] || 'other';
  };

  const listeners = new Map();

  contextBridge.exposeInMainWorld(
    'electronAPI',
    {
      openSubAppWindow: (appItem) =>
        ipcRenderer.send('open-new-sub-app-window', appItem),
      sendMessage: (channel, message) => ipcRenderer.send(channel, message),
      invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
      onMessage: (channel, callback) => {
        // 如果已存在监听器，先移除
        if (listeners.has(channel)) {
          const oldListener = listeners.get(channel);
          ipcRenderer.removeListener(channel, oldListener.handler);
        }

        // 创建新的包装处理器
        const wrappedHandler = (event, ...args) => {
          try {
            return callback(event, ...args);
          } catch (error) {
            console.error(`onMessage error for channel "${channel}":`, error);
            console.error(`"${channel}" Args:`, args);
          }
        };

        // 保存监听器信息
        listeners.set(channel, {
          originalCallback: callback,
          handler: wrappedHandler,
        });

        // 添加新监听器
        ipcRenderer.on(channel, wrappedHandler);

        // 返回清理函数
        return () => {
          if (listeners.has(channel)) {
            const listener = listeners.get(channel);
            ipcRenderer.removeListener(channel, listener.handler);
            listeners.delete(channel);
          }
        };
      },
      removeListener: (channel) => {
        if (listeners.has(channel)) {
          const listener = listeners.get(channel);
          ipcRenderer.removeListener(channel, listener.handler);
          listeners.delete(channel);
        }
      },
      getOSType: () => getOSType(),
      once: (channel, callback) => {
        ipcRenderer.once(channel, (event, ...args) => callback(event, ...args));
      },
    }
  );
