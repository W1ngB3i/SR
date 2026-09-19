import { z } from 'zod';
import { GRADES } from './enums.js';

export const gradeSchema = z.enum(GRADES);
export const deviceModuleSchema = z.enum(['PE', 'PC', 'BOTH']);
export const staffRoleSchema = z.enum(['reviewer', 'deputy', 'chief', 'admin']);
export const ticketStatusSchema = z.enum([
  'pending_claim',
  'reviewing',
  'supplementing',
  'resulted',
  'published',
]);

/** 提交工单（multipart 字段解析后的对象） */
export const submitTicketSchema = z.object({
  circle_name: z
    .string()
    .trim()
    .min(1, '请填写圈名')
    .max(24, '圈名不超过 24 个字符'),
  intention: z.string().trim().min(1, '请选择审核意向').max(40),
  department_id: z.string().min(1, '请选择审核部门'),
  mode_id: z.string().min(1, '请选择审核模式'),
  module: deviceModuleSchema,
  self_proof: z.boolean(),
  contact: z
    .string()
    .trim()
    .min(4, '请填写有效的联系方式')
    .max(64, '联系方式不超过 64 个字符'),
});
export type SubmitTicketInput = z.infer<typeof submitTicketSchema>;

/** 查询码：8 位无歧义大写字母数字 */
export const queryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z2-9]{8}$/, '查询码为 8 位大写字母或数字');

export const lookupSchema = z.object({
  circle_name: z.string().trim().min(1, '请填写圈名').max(24),
  query_code: queryCodeSchema,
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名').max(32),
  password: z.string().min(1, '请输入密码').max(64),
});

/** 回执草稿 / 提交（字段级完整性由服务端按工单模块校验） */
export const receiptSchema = z.object({
  pe_grade: gradeSchema.nullish(),
  pc_grade: gradeSchema.nullish(),
  pass: z.boolean().nullish(),
  target_department: z.string().trim().max(60).default(''),
  comment: z.string().trim().max(500).default(''),
  submit: z.boolean().default(false),
});
export type ReceiptInput = z.infer<typeof receiptSchema>;

export const supplementRequestSchema = z.object({
  reason: z.string().trim().min(1, '请填写退回原因').max(300, '退回原因不超过 300 字'),
});

export const supplementSchema = z.object({
  circle_name: z.string().trim().min(1).max(24),
  query_code: queryCodeSchema,
  note: z.string().trim().max(200).optional().default(''),
});

export const reviewSchema = z.object({
  action: z.enum(['confirm', 'reject']),
  note: z.string().trim().max(300).optional().default(''),
});

export const assignSchema = z.object({
  assignee_id: z.string().min(1, '请选择审核员'),
});

export const releaseSchema = z.object({
  reason: z.string().trim().max(200).optional().default(''),
});

export const departmentSchema = z.object({
  name: z.string().trim().min(1, '请填写部门名称').max(50),
  tier: z.string().trim().max(30).default(''),
  contact: z.string().trim().max(60).default(''),
  description: z.string().trim().max(200).default(''),
  sort: z.number().int().min(0).max(999).default(0),
  enabled: z.boolean().default(true),
});

export const modeSchema = z.object({
  department_id: z.string().min(1),
  group_name: z.string().trim().max(40).default(''),
  name: z.string().trim().min(1, '请填写模式名称').max(50),
  min_requirement: z.string().trim().max(100).default(''),
  sort: z.number().int().min(0).max(999).default(0),
});

export const announcementSchema = z.object({
  title: z.string().trim().min(1, '请填写标题').max(80),
  content: z.string().trim().min(1, '请填写内容').max(2000),
  pinned: z.boolean().default(false),
  expires_at: z.string().datetime().nullish(),
});

export const userCreateSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{3,24}$/, '用户名为 3-24 位小写字母、数字、下划线或连字符'),
  name: z.string().trim().min(1, '请填写姓名').max(24),
  role: staffRoleSchema,
  password: z.string().min(8, '密码至少 8 位').max(64),
  qq: z.string().trim().regex(/^\d{5,12}$/, 'QQ 号为 5-12 位数字').max(12).optional().or(z.literal('')),
  skills: z.string().trim().max(60, '特长不超过 60 个字符').optional().or(z.literal('')),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(24).optional(),
  role: staffRoleSchema.optional(),
  qq: z.string().trim().regex(/^\d{5,12}$/, 'QQ 号为 5-12 位数字').max(12).optional(),
  skills: z.string().trim().max(60, '特长不超过 60 个字符').optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

export const passwordResetSchema = z.object({
  password: z.string().min(8, '密码至少 8 位').max(64),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(10),
});

/** zod 校验失败 → 业务错误 details 映射 */
export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
