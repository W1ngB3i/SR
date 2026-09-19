import { theme } from 'antd';

/** AntD 暗色主题对齐深空玻璃 tokens（与申请人端一致） */
export const antdTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#72dbeb',
    colorInfo: '#72dbeb',
    colorLink: '#72dbeb',
    colorBgBase: '#070b16',
    colorBgContainer: 'rgba(255, 255, 255, 0.04)',
    colorBgElevated: '#0e1526',
    colorBorder: 'rgba(163, 190, 255, 0.14)',
    colorBorderSecondary: 'rgba(163, 190, 255, 0.09)',
    colorText: '#e9eef7',
    colorTextSecondary: '#adb9cf',
    colorTextTertiary: '#6d7890',
    borderRadius: 10,
    fontFamily:
      "'PingFang SC', 'HarmonyOS Sans SC', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, -apple-system, sans-serif",
  },
  components: {
    Form: {
      labelColor: '#adb9cf',
    },
    Modal: {
      contentBg: 'rgba(14, 21, 38, 0.92)',
    },
  },
} as const;
