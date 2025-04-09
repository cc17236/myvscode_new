/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import os from 'os';

// 定义类型
type PlatformType = NodeJS.Platform;
type ArchitectureType = 'x64' | 'ia32' | 'arm64' | string;
type SystemInfoType = 'win64' | 'win32' | 'linuxArm64' | 'linuxX86' | 'other';

type DateParam = Date | string | number;
type FormatKeys = 'y' | 'm' | 'd' | 'h' | 'i' | 's' | 'a';

export function parseTime(time?: DateParam, cFormat?: string): string {
  if (!time){
		return '';
	}

  const format = cFormat || '{y}-{m}-{d} {h}:{i}:{s}';
  let date: Date;

  if (time instanceof Date) {
    date = time;
  } else {
    let timestamp: number;

    if (typeof time === 'string') {
      if (/^\d+$/.test(time)) {
        timestamp = parseInt(time, 10);
      } else {
        // 处理 Safari 兼容性问题
        timestamp = Date.parse(time.replace(/-/g, '/'));
      }
    } else if (typeof time === 'number') {
      timestamp = time.toString().length === 10 ? time * 1000 : time;
    } else {
      return '';
    }

    date = new Date(timestamp);

    // 处理无效日期
    if (isNaN(date.getTime())){
			return '';
		}
  }

  const formatObj: Record<FormatKeys, number> = {
    y: date.getFullYear(),
    m: date.getMonth() + 1,
    d: date.getDate(),
    h: date.getHours(),
    i: date.getMinutes(),
    s: date.getSeconds(),
    a: date.getDay() // 周日返回 0
  };

  const timeStr = format.replace(/{([ymdhisa])+}/g, (result: string, key: string) => {
    const formatKey = key as FormatKeys;
    const value = formatObj[formatKey];

    if (formatKey === 'a') {
      return ['日', '一', '二', '三', '四', '五', '六'][value];
    }

    return value.toString().padStart(2, '0');
  });

  return timeStr;
}

export const getOSUpdateType = (): SystemInfoType => {
  // 使用 NodeJS 原生类型定义
  const platform: PlatformType = os.platform();
  const arch: ArchitectureType = os.arch();

  console.log(`操作系统: ${platform}`);
  console.log(`系统架构: ${arch}`);

  let systemInfo: SystemInfoType = 'other';

  if (platform === 'win32') {
    systemInfo = arch === 'x64' ? 'win64' : 'win32';
  } else if (platform === 'linux') {
    systemInfo = arch === 'arm64' ? 'linuxArm64' : 'linuxX86';
  }

  return systemInfo;
};

export const cookiesToHeaderString = (
  cookies: Record<string, string>
): string => {
  return Object.entries(cookies)
    .map(([key, value]) =>
      `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join('; ');
};

export const safeStringify = (obj: unknown): string => {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
};
