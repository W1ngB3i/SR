/** REST API 路径常量，前后端共同引用；不兼容变更时升 v2 */
export const API_PREFIX = '/api/v1';

export const API = {
  auth: {
    login: `${API_PREFIX}/auth/login`,
  },
  tickets: {
    submit: `${API_PREFIX}/tickets`,
    list: `${API_PREFIX}/tickets`,
    detail: (id: string) => `${API_PREFIX}/tickets/${id}`,
    assignables: `${API_PREFIX}/tickets/assignables`,
    claim: (id: string) => `${API_PREFIX}/tickets/${id}/claim`,
    assign: (id: string) => `${API_PREFIX}/tickets/${id}/assign`,
    release: (id: string) => `${API_PREFIX}/tickets/${id}/release`,
    pin: (id: string) => `${API_PREFIX}/tickets/${id}/pin`,
    supplementRequest: (id: string) => `${API_PREFIX}/tickets/${id}/supplement-request`,
    supplement: (id: string) => `${API_PREFIX}/tickets/${id}/supplement`,
    receipt: (id: string) => `${API_PREFIX}/tickets/${id}/receipt`,
    review: (id: string) => `${API_PREFIX}/tickets/${id}/review`,
    publish: (id: string) => `${API_PREFIX}/tickets/${id}/publish`,
    attachmentUrl: (id: string) => `${API_PREFIX}/attachments/${id}`,
  },
  publicApi: {
    lookup: `${API_PREFIX}/public/tickets/lookup`,
    published: `${API_PREFIX}/public/published`,
    rules: `${API_PREFIX}/public/rules`,
    announcements: `${API_PREFIX}/public/announcements`,
  },
  admin: {
    departments: `${API_PREFIX}/admin/departments`,
    department: (id: string) => `${API_PREFIX}/admin/departments/${id}`,
    modes: `${API_PREFIX}/admin/modes`,
    mode: (id: string) => `${API_PREFIX}/admin/modes/${id}`,
    config: `${API_PREFIX}/admin/config`,
    configKey: (key: string) => `${API_PREFIX}/admin/config/${key}`,
    auditLogs: `${API_PREFIX}/admin/audit-logs`,
    users: `${API_PREFIX}/admin/users`,
    user: (id: string) => `${API_PREFIX}/admin/users/${id}`,
    resetPassword: (id: string) => `${API_PREFIX}/admin/users/${id}/reset-password`,
    announcements: `${API_PREFIX}/admin/announcements`,
    announcement: (id: string) => `${API_PREFIX}/admin/announcements/${id}`,
    stats: `${API_PREFIX}/admin/stats`,
  },
  files: {
    stream: (attachmentId: string) => `${API_PREFIX}/files/${attachmentId}`,
  },
} as const;
