import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, RobotOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  ROBOT_MESSAGE_DIRECTION_LABELS,
  ROBOT_MESSAGE_KIND_LABELS,
  ROBOT_ROLE_LABELS,
  type ContactKeyDTO,
  type DepartmentDTO,
  type RobotIdentityDTO,
  type RobotMessageDTO,
  type RobotMessageKind,
  type RobotRole,
  type RobotStatusDTO,
} from '@sr/shared';
import { fetchDepartmentOptions } from '../api/admin';
import {
  createRobotIdentity,
  deleteRobotIdentity,
  fetchAllContactKeys,
  fetchRobotIdentities,
  fetchRobotMessages,
  fetchRobotStatus,
  resendRobotMessage,
  updateRobotIdentity,
} from '../api/robot';
import { ApiClientError } from '../api/client';

const fmtTime = (v: string | null) =>
  v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '—';

const shortId = (v: string) => (v.length > 16 ? `${v.slice(0, 10)}…${v.slice(-4)}` : v || '—');

const ROLE_OPTIONS = (Object.keys(ROBOT_ROLE_LABELS) as RobotRole[]).map((r) => ({
  value: r,
  label: ROBOT_ROLE_LABELS[r],
}));

const KIND_OPTIONS = (Object.keys(ROBOT_MESSAGE_KIND_LABELS) as RobotMessageKind[]).map((k) => ({
  value: k,
  label: ROBOT_MESSAGE_KIND_LABELS[k],
}));

interface IdentityFormValues {
  openid: string;
  qq_number: string;
  role: RobotRole;
  dept_id?: string | null;
  guild_id?: string;
}

/** 机器人管理：身份绑定 / 接洽码绑定状态 / 消息日志 */
export function RobotPage() {
  const { message } = App.useApp();

  const [status, setStatus] = useState<RobotStatusDTO | null>(null);
  const [departments, setDepartments] = useState<DepartmentDTO[]>([]);

  // —— 身份绑定 ——
  const [identities, setIdentities] = useState<RobotIdentityDTO[]>([]);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityKeyword, setIdentityKeyword] = useState('');
  const [identityRole, setIdentityRole] = useState<RobotRole | undefined>();
  const [identityDept, setIdentityDept] = useState<string | undefined>();
  const [identityPage, setIdentityPage] = useState(1);
  const [identityTotal, setIdentityTotal] = useState(0);

  const [editing, setEditing] = useState<RobotIdentityDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [identityForm] = Form.useForm<IdentityFormValues>();
  const [identitySaving, setIdentitySaving] = useState(false);

  // —— 接洽码 ——
  const [keys, setKeys] = useState<ContactKeyDTO[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keysBound, setKeysBound] = useState<'all' | 'bound' | 'unbound'>('all');
  const [keysPage, setKeysPage] = useState(1);
  const [keysTotal, setKeysTotal] = useState(0);

  // —— 消息日志 ——
  const [messages, setMessages] = useState<RobotMessageDTO[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [msgStatus, setMsgStatus] = useState<string | undefined>();
  const [msgKind, setMsgKind] = useState<string | undefined>();
  const [msgPage, setMsgPage] = useState(1);
  const [msgTotal, setMsgTotal] = useState(0);
  const [resending, setResending] = useState<string | null>(null);

  const deptOptions = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await fetchRobotStatus());
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    }
  }, [message]);

  const loadIdentities = useCallback(async () => {
    setIdentityLoading(true);
    try {
      const data = await fetchRobotIdentities({
        keyword: identityKeyword || undefined,
        role: identityRole,
        dept_id: identityDept,
        page: identityPage,
        page_size: 20,
      });
      setIdentities(data.items);
      setIdentityTotal(data.total);
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setIdentityLoading(false);
    }
  }, [identityKeyword, identityRole, identityDept, identityPage, message]);

  const loadKeys = useCallback(async () => {
    setKeysLoading(true);
    try {
      const data = await fetchAllContactKeys({
        bound: keysBound === 'all' ? undefined : keysBound,
        page: keysPage,
        page_size: 20,
      });
      setKeys(data.items);
      setKeysTotal(data.total);
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setKeysLoading(false);
    }
  }, [keysBound, keysPage, message]);

  const loadMessages = useCallback(async () => {
    setMessagesLoading(true);
    try {
      const data = await fetchRobotMessages({
        status: msgStatus,
        kind: msgKind,
        page: msgPage,
        page_size: 20,
      });
      setMessages(data.items);
      setMsgTotal(data.total);
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setMessagesLoading(false);
    }
  }, [msgStatus, msgKind, msgPage, message]);

  useEffect(() => {
    void loadStatus();
    fetchDepartmentOptions()
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, [loadStatus]);

  useEffect(() => {
    void loadIdentities();
  }, [loadIdentities]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const openCreate = () => {
    setCreating(true);
    identityForm.resetFields();
  };

  const openEdit = (row: RobotIdentityDTO) => {
    setEditing(row);
    identityForm.setFieldsValue({
      openid: row.openid,
      qq_number: row.qq_number,
      role: row.role,
      dept_id: row.dept_id ?? undefined,
      guild_id: row.guild_id || undefined,
    });
  };

  const closeIdentityModal = () => {
    setCreating(false);
    setEditing(null);
  };

  const saveIdentity = async () => {
    const values = await identityForm.validateFields();
    setIdentitySaving(true);
    try {
      if (editing) {
        await updateRobotIdentity(editing.openid, {
          qq_number: values.qq_number,
          role: values.role,
          dept_id: values.dept_id ?? null,
          guild_id: values.guild_id ?? '',
        });
        message.success('绑定已更新');
      } else {
        await createRobotIdentity({
          openid: values.openid,
          qq_number: values.qq_number ?? '',
          role: values.role,
          dept_id: values.dept_id ?? null,
          guild_id: values.guild_id ?? '',
        });
        message.success('绑定已新增');
      }
      closeIdentityModal();
      void loadIdentities();
      void loadStatus();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.details) {
          identityForm.setFields(
            Object.entries(err.details).map(([name, errors]) => ({ name, errors })) as never,
          );
        } else {
          message.error(err.message);
        }
      }
    } finally {
      setIdentitySaving(false);
    }
  };

  const removeIdentity = async (row: RobotIdentityDTO) => {
    try {
      await deleteRobotIdentity(row.openid);
      message.success('绑定已删除');
      void loadIdentities();
      void loadStatus();
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    }
  };

  const handleResend = async (row: RobotMessageDTO) => {
    setResending(row.id);
    try {
      const next = await resendRobotMessage(row.id);
      if (next.status === 'sent') message.success('已重新发送');
      else message.warning(`仍发送失败：${next.error || '未知原因'}`);
      void loadMessages();
      void loadStatus();
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setResending(null);
    }
  };

  const identityColumns: ColumnsType<RobotIdentityDTO> = [
    {
      title: 'QQ 号',
      dataIndex: 'qq_number',
      width: 120,
      render: (qq: string) =>
        qq ? (
          <a href={`https://wpa.qq.com/msgrd?v=3&uin=${qq}&site=qq&menu=yes`}>{qq}</a>
        ) : (
          <Typography.Text type="secondary">未登记</Typography.Text>
        ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 110,
      render: (r: RobotRole) => <Tag color="gold">{ROBOT_ROLE_LABELS[r]}</Tag>,
    },
    {
      title: '部门',
      dataIndex: 'dept_name',
      width: 140,
      render: (name: string | null) => name ?? '—',
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 90,
      render: (s: RobotIdentityDTO['source']) =>
        s === 'bot' ? <Tag color="processing">机器人</Tag> : <Tag>后台录入</Tag>,
    },
    {
      title: '认证 ID',
      dataIndex: 'user_id',
      width: 150,
      render: (userId: string | null) =>
        userId ? (
          <Typography.Text code copyable={{ tooltips: ['复制', '已复制'] }}>
            {userId}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary">玩家</Typography.Text>
        ),
    },
    {
      title: 'openid',
      dataIndex: 'openid',
      width: 170,
      render: (openid: string) => (
        <Typography.Text title={openid} copyable={{ text: openid, tooltips: ['复制', '已复制'] }}>
          {shortId(openid)}
        </Typography.Text>
      ),
    },
    {
      title: '绑定时间',
      dataIndex: 'created_at',
      width: 170,
      render: (t: string) => <span className="pool-time">{fmtTime(t)}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_, row) => (
        <div className="pool-actions">
          <Button size="small" onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除该绑定？"
            description="删除后该 QQ 将不再收到工单通知。"
            okText="删除"
            cancelText="取消"
            onConfirm={() => void removeIdentity(row)}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  const keyColumns: ColumnsType<ContactKeyDTO> = [
    {
      title: '接洽码',
      dataIndex: 'code',
      width: 140,
      render: (code: string) => (
        <Typography.Text code copyable={{ tooltips: ['复制', '已复制'] }} className="contact-key-code">
          {code}
        </Typography.Text>
      ),
    },
    {
      title: '签发人',
      dataIndex: 'created_by_name',
      width: 140,
      render: (name: string) => name || '—',
    },
    {
      title: 'QQ 绑定',
      dataIndex: 'bind_openid',
      width: 130,
      render: (openid: string | null) =>
        openid ? (
          <Typography.Text title={openid} type="success">
            已绑定
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary">未绑定</Typography.Text>
        ),
    },
    {
      title: '使用状态',
      dataIndex: 'status',
      width: 100,
      render: (s: ContactKeyDTO['status']) =>
        s === 'unused' ? <Tag color="processing">未使用</Tag> : <Tag>已使用</Tag>,
    },
    {
      title: '生成时间',
      dataIndex: 'created_at',
      width: 170,
      render: (t: string) => <span className="pool-time">{fmtTime(t)}</span>,
    },
    {
      title: '使用时间',
      dataIndex: 'used_at',
      width: 170,
      render: (t: string | null) => <span className="pool-time">{fmtTime(t)}</span>,
    },
  ];

  const messageColumns: ColumnsType<RobotMessageDTO> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 170,
      render: (t: string) => <span className="pool-time">{fmtTime(t)}</span>,
    },
    {
      title: '方向',
      dataIndex: 'direction',
      width: 80,
      render: (d: RobotMessageDTO['direction']) =>
        d === 'in' ? <Tag>收到</Tag> : <Tag color="gold">发出</Tag>,
    },
    {
      title: '类型',
      dataIndex: 'kind',
      width: 130,
      render: (k: RobotMessageKind) => ROBOT_MESSAGE_KIND_LABELS[k],
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: RobotMessageDTO['status']) => {
        if (s === 'sent') return <Tag color="success">已发送</Tag>;
        if (s === 'received') return <Tag color="processing">已接收</Tag>;
        if (s === 'skipped') return <Tag>未发送</Tag>;
        return <Tag color="error">失败</Tag>;
      },
    },
    {
      title: '对象 openid',
      dataIndex: 'openid',
      width: 150,
      render: (openid: string) => (openid ? shortId(openid) : '—'),
    },
    {
      title: '内容',
      dataIndex: 'content',
      render: (content: string, row) => (
        <span className="robot-msg__content">
          {content}
          {row.error && (
            <span className={row.status === 'failed' ? 'robot-msg__error' : 'robot-msg__note'}>
              {row.error}
            </span>
          )}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, row) =>
        row.direction === 'out' && row.status === 'failed' ? (
          <Button
            size="small"
            loading={resending === row.id}
            onClick={() => void handleResend(row)}
          >
            重发
          </Button>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="robot-page">
      <div className="page-hero">
        <h1 className="page-hero__title">机器人管理</h1>
        <p className="page-hero__desc">
          QQ 机器人只做触发与通知：玩家在群里 @机器人 领取接洽码，审核员发送后台认证 ID 完成绑定，
          表单填写与审核操作仍在网站端完成。
        </p>
      </div>

      <section className="sr-glass detail-card">
        <h2 className="detail-card__title">接入状态</h2>
        {status && !status.configured && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="机器人凭据未配置"
            description="当前不会真正投递消息，仅记录消息日志。请在服务端 .env 配置 QQ_BOT_APPID / QQ_BOT_SECRET / QQ_BOT_TOKEN 后重启服务。"
          />
        )}
        <Descriptions column={4} size="small" className="detail-info">
          <Descriptions.Item label="凭据">
            {status?.configured ? <Tag color="success">已接通</Tag> : <Tag color="error">未配置</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="环境">
            {status?.sandbox ? <Tag>沙箱</Tag> : <Tag color="gold">正式</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="AppID">{status?.appid || '—'}</Descriptions.Item>
          <Descriptions.Item label="接洽码签发人">{status?.issuer_name ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="已绑定身份">{status?.identity_count ?? 0}</Descriptions.Item>
          <Descriptions.Item label="已绑定接洽码">{status?.bound_key_count ?? 0}</Descriptions.Item>
          <Descriptions.Item label="失败消息">
            {status?.failed_message_count ? (
              <Typography.Text type="danger">{status.failed_message_count}</Typography.Text>
            ) : (
              0
            )}
          </Descriptions.Item>
        </Descriptions>
      </section>

      <Tabs
        className="pool-tabs"
        items={[
          {
            key: 'identities',
            label: '身份绑定',
            children: (
              <section className="sr-glass detail-card">
                <div className="pool-filter">
                  <Input.Search
                    allowClear
                    className="pool-filter__keyword"
                    placeholder="按 QQ 号或 openid 搜索"
                    onSearch={(v) => {
                      setIdentityPage(1);
                      setIdentityKeyword(v.trim());
                    }}
                  />
                  <Select
                    allowClear
                    className="pool-filter__select"
                    placeholder="角色"
                    options={ROLE_OPTIONS}
                    value={identityRole}
                    onChange={(v) => {
                      setIdentityPage(1);
                      setIdentityRole(v);
                    }}
                  />
                  <Select
                    allowClear
                    className="pool-filter__select"
                    placeholder="部门"
                    options={deptOptions}
                    value={identityDept}
                    onChange={(v) => {
                      setIdentityPage(1);
                      setIdentityDept(v);
                    }}
                  />
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    手工新增绑定
                  </Button>
                </div>
                <Table<RobotIdentityDTO>
                  rowKey="openid"
                  columns={identityColumns}
                  dataSource={identities}
                  loading={identityLoading}
                  scroll={{ x: 1200 }}
                  pagination={{
                    current: identityPage,
                    pageSize: 20,
                    total: identityTotal,
                    showSizeChanger: false,
                    onChange: setIdentityPage,
                  }}
                  locale={{ emptyText: '还没有审核员完成绑定，可让审核员在群里发送后台认证 ID' }}
                />
              </section>
            ),
          },
          {
            key: 'keys',
            label: '接洽码',
            children: (
              <section className="sr-glass detail-card">
                <div className="contact-keys-toolbar">
                  <Select
                    className="pool-filter__select"
                    value={keysBound}
                    onChange={(v) => {
                      setKeysPage(1);
                      setKeysBound(v);
                    }}
                    options={[
                      { value: 'all', label: '全部接洽码' },
                      { value: 'bound', label: '已绑定 QQ' },
                      { value: 'unbound', label: '未绑定 QQ（后台手工签发）' },
                    ]}
                  />
                  <span className="contact-keys-toolbar__hint">
                    仅「已绑定 QQ」的接洽码能收到审核结果推送。
                  </span>
                </div>
                <Table<ContactKeyDTO>
                  rowKey="id"
                  columns={keyColumns}
                  dataSource={keys}
                  loading={keysLoading}
                  pagination={{
                    current: keysPage,
                    pageSize: 20,
                    total: keysTotal,
                    showSizeChanger: false,
                    onChange: setKeysPage,
                  }}
                  locale={{ emptyText: '暂无接洽码记录' }}
                />
              </section>
            ),
          },
          {
            key: 'messages',
            label: '消息日志',
            children: (
              <section className="sr-glass detail-card">
                <div className="pool-filter">
                  <Select
                    allowClear
                    className="pool-filter__select"
                    placeholder="状态"
                    value={msgStatus}
                    onChange={(v) => {
                      setMsgPage(1);
                      setMsgStatus(v);
                    }}
                    options={[
                      { value: 'received', label: '已接收' },
                      { value: 'sent', label: '已发送' },
                      { value: 'failed', label: '失败' },
                      { value: 'skipped', label: '未发送' },
                    ]}
                  />
                  <Select
                    allowClear
                    className="pool-filter__select"
                    placeholder="类型"
                    value={msgKind}
                    onChange={(v) => {
                      setMsgPage(1);
                      setMsgKind(v);
                    }}
                    options={KIND_OPTIONS}
                  />
                  <Button icon={<RobotOutlined />} onClick={() => void loadMessages()}>
                    刷新
                  </Button>
                </div>
                <Table<RobotMessageDTO>
                  rowKey="id"
                  columns={messageColumns}
                  dataSource={messages}
                  loading={messagesLoading}
                  scroll={{ x: 1100 }}
                  pagination={{
                    current: msgPage,
                    pageSize: 20,
                    total: msgTotal,
                    showSizeChanger: false,
                    onChange: setMsgPage,
                  }}
                  locale={{ emptyText: '暂无消息记录' }}
                />
              </section>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑身份绑定' : '手工新增身份绑定'}
        open={creating || !!editing}
        confirmLoading={identitySaving}
        okText="保存"
        cancelText="取消"
        onOk={() => void saveIdentity()}
        onCancel={closeIdentityModal}
        destroyOnHidden
      >
        <Form<IdentityFormValues> form={identityForm} layout="vertical" preserve={false}>
          <Form.Item
            name="openid"
            label="QQ openid"
            extra="群内 @机器人 收到的 openid；@ 人必须用 openid，不能用 QQ 号"
            rules={[
              { required: true, message: '请填写 openid' },
              { min: 8, max: 128, message: 'openid 为 8-128 个字符' },
            ]}
          >
            <Input placeholder="如 8F3A9C2E5B..." disabled={!!editing} />
          </Form.Item>
          <Form.Item
            name="qq_number"
            label="QQ 号"
            extra="仅用于展示与人工核对"
            rules={[{ pattern: /^\d{5,12}$/, message: 'QQ 号为 5-12 位数字' }]}
          >
            <Input maxLength={12} placeholder="选填" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              options={ROLE_OPTIONS}
              onChange={(v: RobotRole) => {
                if (v === 'applicant') identityForm.setFieldValue('dept_id', undefined);
              }}
            />
          </Form.Item>
          <Form.Item
            name="dept_id"
            label="所属部门"
            extra="审核员按部门接收新工单 @通知；申请人无需选择"
          >
            <Select allowClear options={deptOptions} placeholder="选择部门" />
          </Form.Item>
          <Form.Item name="guild_id" label="群 openid" extra="群聊场景下用于在该群 @人；私聊可留空">
            <Input maxLength={64} placeholder="选填" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}