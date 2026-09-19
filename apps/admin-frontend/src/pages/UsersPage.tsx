import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Form, Input, Modal, Popconfirm, Select, Switch, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { ROLE_LABELS, type StaffRole, type StaffUserDTO } from '@sr/shared';
import { createUser, fetchUsers, resetPassword, updateUser } from '../api/admin';
import { ApiClientError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface CreateUserValues {
  username: string;
  name: string;
  role: StaffRole;
  password: string;
  qq?: string;
  skills?: string;
}

interface EditUserValues {
  name: string;
  role: StaffRole;
  qq?: string;
  skills?: string;
  active: boolean;
}

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as StaffRole[]).map((r) => ({
  value: r,
  label: ROLE_LABELS[r],
}));

export function UsersPage() {
  const { message } = App.useApp();
  const { user: me } = useAuth();

  const [users, setUsers] = useState<StaffUserDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm<CreateUserValues>();
  const [createSaving, setCreateSaving] = useState(false);

  const [editing, setEditing] = useState<StaffUserDTO | null>(null);
  const [editForm] = Form.useForm<EditUserValues>();
  const [editSaving, setEditSaving] = useState(false);

  const [pwdTarget, setPwdTarget] = useState<StaffUserDTO | null>(null);
  const [pwdForm] = Form.useForm<{ password: string }>();
  const [pwdSaving, setPwdSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await fetchUsers());
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveCreate = async () => {
    const values = await createForm.validateFields();
    setCreateSaving(true);
    try {
      await createUser(values);
      message.success(`账号 ${values.username} 已创建`);
      setCreating(false);
      void load();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.details) {
          createForm.setFields(
            Object.entries(err.details).map(([name, errors]) => ({ name, errors })) as never,
          );
        } else {
          message.error(err.message);
        }
      }
    } finally {
      setCreateSaving(false);
    }
  };

  const openEdit = (target: StaffUserDTO) => {
    setEditing(target);
    editForm.setFieldsValue({
      name: target.name,
      role: target.role,
      qq: target.qq || undefined,
      skills: target.skills || undefined,
      active: target.status === 'active',
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const values = await editForm.validateFields();
    setEditSaving(true);
    try {
      await updateUser(editing.id, {
        name: values.name,
        role: values.role,
        qq: values.qq ?? '',
        skills: values.skills ?? '',
        status: values.active ? 'active' : 'disabled',
      });
      message.success('账号已更新');
      setEditing(null);
      void load();
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const savePassword = async () => {
    if (!pwdTarget) return;
    const values = await pwdForm.validateFields();
    setPwdSaving(true);
    try {
      await resetPassword(pwdTarget.id, values.password);
      message.success(`已重置 ${pwdTarget.name} 的密码`);
      setPwdTarget(null);
      pwdForm.resetFields();
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setPwdSaving(false);
    }
  };

  const columns: ColumnsType<StaffUserDTO> = useMemo(
    () => [
      { title: '用户名', dataIndex: 'username', width: 130 },
      {
        title: '姓名',
        dataIndex: 'name',
        width: 120,
        render: (name: string, row) => (
          <span>
            {name}
            {me?.id === row.id && <Tag style={{ marginLeft: 8 }}>当前账号</Tag>}
          </span>
        ),
      },
      {
        title: '角色',
        dataIndex: 'role',
        width: 120,
        render: (r: StaffRole) => <span className={`admin-role admin-role--${r}`}>{ROLE_LABELS[r]}</span>,
      },
      {
        title: 'QQ',
        dataIndex: 'qq',
        width: 130,
        render: (qq: string) =>
          qq ? <a href={`https://wpa.qq.com/msgrd?v=3&uin=${qq}&site=qq&menu=yes`}>{qq}</a> : '—',
      },
      {
        title: '特长',
        dataIndex: 'skills',
        render: (skills: string) =>
          skills ? (
            <span className="user-skills">
              {skills
                .split(/[/,，、]/)
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => (
                  <Tag key={s} className="user-skill__tag">
                    {s}
                  </Tag>
                ))}
            </span>
          ) : (
            '—'
          ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 90,
        render: (s: StaffUserDTO['status']) =>
          s === 'active' ? <Tag color="success">在职</Tag> : <Tag color="default">停用</Tag>,
      },
      {
        title: '创建时间',
        dataIndex: 'created_at',
        width: 150,
        render: (t: string) => <span className="pool-time">{dayjs(t).format('YYYY-MM-DD')}</span>,
      },
      {
        title: '操作',
        key: 'actions',
        width: 210,
        render: (_, row) => (
          <div className="pool-actions">
            <Button size="small" onClick={() => openEdit(row)}>
              编辑
            </Button>
            <Button size="small" onClick={() => setPwdTarget(row)}>
              重置密码
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me?.id],
  );

  return (
    <div className="users-page">
      <div className="page-hero page-hero--row">
        <div>
          <h1 className="page-hero__title">人员管理</h1>
          <p className="page-hero__desc">
            审核员名单由总管 / 副总管维护；停用账号立即失去登录与接单能力。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          新建账号
        </Button>
      </div>

      <div className="sr-glass pool-table">
        <Table<StaffUserDTO> rowKey="id" columns={columns} dataSource={users} loading={loading} pagination={false} />
      </div>

      <Modal
        title="新建账号"
        open={creating}
        confirmLoading={createSaving}
        okText="创建"
        cancelText="取消"
        onOk={() => void saveCreate()}
        onCancel={() => setCreating(false)}
        destroyOnHidden
      >
        <Form<CreateUserValues> form={createForm} layout="vertical" preserve={false}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              {
                pattern: /^[a-z0-9_-]{3,24}$/,
                message: '3-24 位小写字母、数字、下划线或连字符',
              },
            ]}
          >
            <Input placeholder="如 xingchen" autoComplete="off" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请填写姓名' }]}>
            <Input maxLength={24} placeholder="展示名称" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={ROLE_OPTIONS} placeholder="选择角色" />
          </Form.Item>
          <Form.Item
            name="qq"
            label="QQ"
            rules={[{ pattern: /^\d{5,12}$/, message: 'QQ 号为 5-12 位数字' }]}
          >
            <Input maxLength={12} placeholder="选填，用于联系" />
          </Form.Item>
          <Form.Item name="skills" label="特长" extra="用 / 或逗号分隔，如：PCEC / JAVA低版本">
            <Input maxLength={60} placeholder="选填，指派工单时参考" />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[
              { required: true, message: '请输入初始密码' },
              { min: 8, max: 64, message: '密码为 8-64 位' },
            ]}
          >
            <Input.Password placeholder="至少 8 位" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editing ? `编辑账号 · ${editing.username}` : '编辑账号'}
        open={!!editing}
        confirmLoading={editSaving}
        okText="保存"
        cancelText="取消"
        onOk={() => void saveEdit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form<EditUserValues> form={editForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请填写姓名' }]}>
            <Input maxLength={24} />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="qq"
            label="QQ"
            rules={[{ pattern: /^\d{5,12}$/, message: 'QQ 号为 5-12 位数字' }]}
          >
            <Input maxLength={12} placeholder="选填" />
          </Form.Item>
          <Form.Item name="skills" label="特长" extra="用 / 或逗号分隔">
            <Input maxLength={60} placeholder="选填" />
          </Form.Item>
          <Form.Item name="active" label="在职" valuePropName="checked">
            <Switch checkedChildren="在职" unCheckedChildren="停用" />
          </Form.Item>
          {editing?.id === me?.id && (
            <p className="rules-form__hint">不能停用自己的账号。</p>
          )}
        </Form>
      </Modal>

      <Modal
        title={pwdTarget ? `重置密码 · ${pwdTarget.name}` : '重置密码'}
        open={!!pwdTarget}
        confirmLoading={pwdSaving}
        okText="重置"
        cancelText="取消"
        onOk={() => void savePassword()}
        onCancel={() => setPwdTarget(null)}
        destroyOnHidden
      >
        <Form form={pwdForm} layout="vertical" preserve={false}>
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, max: 64, message: '密码为 8-64 位' },
            ]}
          >
            <Input.Password placeholder="至少 8 位" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
