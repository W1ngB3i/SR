import { theme } from 'antd';

/** AntD 暗色主题对齐黑金玻璃 tokens */
export const antdTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#e0b866',
    colorInfo: '#e0b866',
    colorLink: '#e0b866',
    colorBgBase: '#0a0a09',
    colorBgContainer: 'rgba(255, 255, 255, 0.04)',
    colorBgElevated: '#141311',
    colorBorder: 'rgba(255, 255, 255, 0.11)',
    colorBorderSecondary: 'rgba(255, 255, 255, 0.07)',
    colorText: '#f4f1e8',
    colorTextSecondary: '#b6b0a3',
    colorTextTertiary: '#6f6a5f',
    borderRadius: 10,
    fontFamily:
      "'PingFang SC', 'HarmonyOS Sans SC', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, -apple-system, sans-serif",
  },
  components: {
    Form: {
      labelColor: '#b6b0a3',
    },
    Modal: {
      contentBg: 'rgba(20, 19, 17, 0.92)',
    },
  },
} as const;
