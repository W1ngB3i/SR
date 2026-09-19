import { useEffect, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Select, Spin } from 'antd';
import type { SystemConfigDTO } from '@sr/shared';
import {
  fetchSystemConfig,
  putFeedbackContacts,
  putIntentions,
  putReviewerMaxConcurrent,
  putSubmissionCooldown,
  putUploadLimits,
} from '../api/admin';
import { ApiClientError } from '../api/client';

export function ConfigPage() {
  const { message } = App.useApp();

  const [config, setConfig] = useState<SystemConfigDTO | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [intentionsForm] = Form.useForm<{ intentions: string[] }>();
  const [contactsForm] = Form.useForm<{
    chief_name: string;
    chief_qq: string;
    deputy_name: string;
    deputy_qq: string;
  }>();
  const [cooldownForm] = Form.useForm<{ hours: number }>();
  const [concurrentForm] = Form.useForm<{ max: number }>();
  const [limitsForm] = Form.useForm<{
    max_file_mb: number;
    max_files: number;
    image_ext: string[];
    video_ext: string[];
  }>();

  useEffect(() => {
    fetchSystemConfig()
      .then((cfg) => {
        setConfig(cfg);
        intentionsForm.setFieldsValue({ intentions: cfg.intentions });
        contactsForm.setFieldsValue({
          chief_name: cfg.feedback_contacts.chief.name,
          chief_qq: cfg.feedback_contacts.chief.qq,
          deputy_name: cfg.feedback_contacts.deputy.name,
          deputy_qq: cfg.feedback_contacts.deputy.qq,
        });
        cooldownForm.setFieldsValue({ hours: cfg.submission_cooldown_hours });
        concurrentForm.setFieldsValue({ max: cfg.reviewer_max_concurrent });
        limitsForm.setFieldsValue({
          max_file_mb: cfg.upload_limits.max_file_mb,
          max_files: cfg.upload_limits.max_files,
          image_ext: cfg.upload_limits.image_ext,
          video_ext: cfg.upload_limits.video_ext,
        });
      })
      .catch((err) => {
        if (err instanceof ApiClientError) message.error(err.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSave = async (key: string, fn: () => Promise<unknown>, successText: string) => {
    setSavingKey(key);
    try {
      await fn();
      message.success(successText);
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setSavingKey(null);
    }
  };

  if (!config) {
    return (
      <div className="sr-glass detail-loading">
        <Spin />
      </div>
    );
  }

  return (
    <div className="config-page">
      <div className="page-hero">
        <h1 className="page-hero__title">系统配置</h1>
        <p className="page-hero__desc">平台级参数，修改即时生效并记入审计日志。</p>
      </div>

      <section className="sr-glass detail-card config-card">
        <h2 className="detail-card__title">审核意向</h2>
        <p className="config-card__desc">申请人端「审核意向」下拉的可选项，回车确认新增。</p>
        <Form form={intentionsForm} layout="vertical">
          <Form.Item name="intentions" rules={[{ required: true, message: '至少保留一个意向' }]}>
            <Select mode="tags" placeholder="输入后回车添加" open={false} tokenSeparators={['\n', ',']} />
          </Form.Item>
          <Button
            type="primary"
            loading={savingKey === 'intentions'}
            onClick={() =>
              void runSave('intentions', async () => {
                const values = await intentionsForm.validateFields();
                return putIntentions(values.intentions);
              }, '审核意向已更新')
            }
          >
            保存
          </Button>
        </Form>
      </section>

      <section className="sr-glass detail-card config-card">
        <h2 className="detail-card__title">反馈渠道</h2>
        <p className="config-card__desc">展示在申请人端「审核规则」页，供申请人在遇到问题时联系。</p>
        <Form form={contactsForm} layout="vertical">
          <div className="config-contacts">
            <Form.Item
              name="chief_name"
              label="总管姓名"
              rules={[{ required: true, message: '请填写总管姓名' }]}
            >
              <Input maxLength={24} />
            </Form.Item>
            <Form.Item
              name="chief_qq"
              label="总管 QQ"
              rules={[{ required: true, message: '请填写总管 QQ' }]}
            >
              <Input maxLength={16} />
            </Form.Item>
            <Form.Item
              name="deputy_name"
              label="副总管姓名"
              rules={[{ required: true, message: '请填写副总管姓名' }]}
            >
              <Input maxLength={24} />
            </Form.Item>
            <Form.Item
              name="deputy_qq"
              label="副总管 QQ"
              rules={[{ required: true, message: '请填写副总管 QQ' }]}
            >
              <Input maxLength={16} />
            </Form.Item>
          </div>
          <Button
            type="primary"
            loading={savingKey === 'contacts'}
            onClick={() =>
              void runSave('contacts', async () => {
                const v = await contactsForm.validateFields();
                return putFeedbackContacts({
                  chief: { name: v.chief_name, qq: v.chief_qq },
                  deputy: { name: v.deputy_name, qq: v.deputy_qq },
                });
              }, '反馈渠道已更新')
            }
          >
            保存
          </Button>
        </Form>
      </section>

      <div className="config-grid">
        <section className="sr-glass detail-card config-card">
          <h2 className="detail-card__title">提交冷却</h2>
          <p className="config-card__desc">同一申请人两次提交工单的最小间隔（小时）。</p>
          <Form form={cooldownForm} layout="vertical">
            <Form.Item
              name="hours"
              rules={[{ required: true, message: '请填写间隔小时数' }]}
            >
              <InputNumber min={0} max={720} style={{ width: '100%' }} addonAfter="小时" />
            </Form.Item>
            <Button
              type="primary"
              loading={savingKey === 'cooldown'}
              onClick={() =>
                void runSave('cooldown', async () => {
                  const v = await cooldownForm.validateFields();
                  return putSubmissionCooldown(v.hours);
                }, '提交冷却已更新')
              }
            >
              保存
            </Button>
          </Form>
        </section>

        <section className="sr-glass detail-card config-card">
          <h2 className="detail-card__title">审核员并单上限</h2>
          <p className="config-card__desc">单个审核员同时在办（审核中 + 补充中）的工单数上限。</p>
          <Form form={concurrentForm} layout="vertical">
            <Form.Item name="max" rules={[{ required: true, message: '请填写上限' }]}>
              <InputNumber min={1} max={50} style={{ width: '100%' }} addonAfter="条" />
            </Form.Item>
            <Button
              type="primary"
              loading={savingKey === 'concurrent'}
              onClick={() =>
                void runSave('concurrent', async () => {
                  const v = await concurrentForm.validateFields();
                  return putReviewerMaxConcurrent(v.max);
                }, '并单上限已更新')
              }
            >
              保存
            </Button>
          </Form>
        </section>
      </div>

      <section className="sr-glass detail-card config-card">
        <h2 className="detail-card__title">上传限制</h2>
        <p className="config-card__desc">申请人端证据附件的大小、数量与扩展名白名单。</p>
        <Form form={limitsForm} layout="vertical">
          <div className="config-contacts">
            <Form.Item
              name="max_file_mb"
              label="单文件上限（MB）"
              rules={[{ required: true, message: '请填写' }]}
            >
              <InputNumber min={1} max={2048} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="max_files"
              label="文件数上限"
              rules={[{ required: true, message: '请填写' }]}
            >
              <InputNumber min={1} max={20} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item
            name="image_ext"
            label="图片扩展名"
            rules={[{ required: true, message: '请填写图片扩展名' }]}
          >
            <Select mode="tags" placeholder="如 .png" open={false} tokenSeparators={['\n', ',']} />
          </Form.Item>
          <Form.Item
            name="video_ext"
            label="视频扩展名"
            rules={[{ required: true, message: '请填写视频扩展名' }]}
          >
            <Select mode="tags" placeholder="如 .mp4" open={false} tokenSeparators={['\n', ',']} />
          </Form.Item>
          <Button
            type="primary"
            loading={savingKey === 'limits'}
            onClick={() =>
              void runSave('limits', async () => {
                const v = await limitsForm.validateFields();
                return putUploadLimits({
                  max_file_mb: v.max_file_mb,
                  max_files: v.max_files,
                  image_ext: v.image_ext.map((s) => (s.startsWith('.') ? s : `.${s}`)),
                  video_ext: v.video_ext.map((s) => (s.startsWith('.') ? s : `.${s}`)),
                });
              }, '上传限制已更新')
            }
          >
            保存
          </Button>
        </Form>
      </section>
    </div>
  );
}
