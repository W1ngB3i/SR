import { useCallback, useEffect, useState } from 'react';
import { App, Button, DatePicker, Form, Input, Modal, Popconfirm, Switch, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import type { AnnouncementDTO } from '@sr/shared';
import {
  createAnnouncement,
  deleteAnnouncement,
  fetchAllAnnouncements,
  updateAnnouncement,
} from '../api/admin';
import { ApiClientError } from '../api/client';

interface AnnFormValues {
  title: string;
  content: string;
  pinned: boolean;
  expires_at: Dayjs | null;
}

export function AnnouncementsPage() {
  const { message } = App.useApp();

  const [items, setItems] = useState<AnnouncementDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState<AnnouncementDTO | 'new' | null>(null);
  const [form] = Form.useForm<AnnFormValues>();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchAllAnnouncements());
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (target: AnnouncementDTO | 'new') => {
    setEditing(target);
    if (target === 'new') {
      form.resetFields();
    } else {
      form.setFieldsValue({
        title: target.title,
        content: target.content,
        pinned: target.pinned,
        expires_at: target.expires_at ? dayjs(target.expires_at) : null,
      });
    }
  };

  const save = async () => {
    const values = await form.validateFields();
    const payload = {
      title: values.title,
      content: values.content,
      pinned: values.pinned ?? false,
      expires_at: values.expires_at ? values.expires_at.toISOString() : null,
    };
    setSaving(true);
    try {
      if (editing === 'new') {
        await createAnnouncement(payload);
        message.success('公告已发布');
      } else if (editing) {
        await updateAnnouncement(editing.id, payload);
        message.success('公告已更新');
      }
      setEditing(null);
      void load();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.details) {
          form.setFields(
            Object.entries(err.details).map(([name, errors]) => ({ name, errors })) as never,
          );
        } else {
          message.error(err.message);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: AnnouncementDTO) => {
    try {
      await deleteAnnouncement(item.id);
      message.success('公告已删除');
      void load();
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    }
  };

  const columns: ColumnsType<AnnouncementDTO> = [
    {
      title: '标题',
      dataIndex: 'title',
      render: (title: string, row) => (
        <span className="ann-title">
          {row.pinned && <Tag color="gold">置顶</Tag>}
          {title}
        </span>
      ),
    },
    {
      title: '内容摘要',
      dataIndex: 'content',
      ellipsis: true,
      render: (c: string) => <span className="pool-time">{c.slice(0, 60)}</span>,
    },
    {
      title: '过期时间',
      dataIndex: 'expires_at',
      width: 150,
      render: (t: string | null) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '长期'),
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      width: 100,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 150,
      render: (t: string) => <span className="pool-time">{dayjs(t).format('YYYY-MM-DD HH:mm')}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, row) => (
        <div className="pool-actions">
          <Button size="small" onClick={() => open(row)}>
            编辑
          </Button>
          <Popconfirm title="删除公告" okText="删除" okButtonProps={{ danger: true }} onConfirm={() => void remove(row)}>
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="ann-page">
      <div className="page-hero page-hero--row">
        <div>
          <h1 className="page-hero__title">公告管理</h1>
          <p className="page-hero__desc">公告展示在申请人端「结果公示」页顶部；过期后自动隐藏</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')}>
          发布公告
        </Button>
      </div>

      <div className="sr-glass pool-table">
        <Table<AnnouncementDTO> rowKey="id" columns={columns} dataSource={items} loading={loading} pagination={false} />
      </div>

      <Modal
        title={editing === 'new' ? '发布公告' : '编辑公告'}
        open={!!editing}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        onOk={() => void save()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
        width={560}
      >
        <Form<AnnFormValues> form={form} layout="vertical" preserve={false}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请填写标题' }]}>
            <Input maxLength={80} placeholder="不超过 80 字" />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: '请填写内容' }]}>
            <Input.TextArea rows={6} maxLength={2000} placeholder="支持纯文本，2000 字以内" />
          </Form.Item>
          <div className="rules-form__row">
            <Form.Item name="pinned" label="置顶" valuePropName="checked" initialValue={false}>
              <Switch />
            </Form.Item>
            <Form.Item name="expires_at" label="过期时间（可选）">
              <DatePicker showTime style={{ width: '100%' }} placeholder="过期后不再展示" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
