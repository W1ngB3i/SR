import { useCallback, useEffect, useState } from 'react';
import { App, Button, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { KeyOutlined } from '@ant-design/icons';
import type { ContactKeyDTO } from '@sr/shared';
import { fetchMyContactKeys, generateContactKey } from '../api/staff';
import { ApiClientError } from '../api/client';

const fmtTime = (v: string | null) => (v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : '—');

export function ContactKeysPage() {
  const { message, modal } = App.useApp();
  const [keys, setKeys] = useState<ContactKeyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      setKeys(await fetchMyContactKeys());
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const key = await generateContactKey();
      modal.success({
        title: '接洽码已生成',
        content: (
          <div className="contact-key-modal">
            <p className="contact-key-modal__hint">
              请通过 QQ 面对面将该接洽码交给被审核的人，由对方填入申请表「接洽码」栏。每个接洽码只能使用一次
            </p>
            <div className="contact-key-modal__code">{key.code}</div>
          </div>
        ),
        okText: '我已交付',
      });
      await load();
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const columns: ColumnsType<ContactKeyDTO> = [
    {
      title: '接洽码',
      dataIndex: 'code',
      width: 160,
      render: (code: string) => (
        <Typography.Text code copyable={{ tooltips: ['复制', '已复制'] }} className="contact-key-code">
          {code}
        </Typography.Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: ContactKeyDTO['status']) =>
        status === 'unused' ? <Tag color="processing">未使用</Tag> : <Tag>已使用</Tag>,
    },
    { title: '生成时间', dataIndex: 'created_at', width: 190, render: fmtTime },
    { title: '使用时间', dataIndex: 'used_at', width: 190, render: fmtTime },
  ];

  return (
    <div className="contact-keys-page">
      <div className="page-hero">
        <h1 className="page-hero__title">接洽码</h1>
        <p className="page-hero__desc">
          生成一次性接洽码后，通过 QQ 面对面交付被审核的人；对方将其填入申请表「接洽码」栏即可提交工单
        </p>
      </div>

      <section className="sr-glass detail-card">
        <div className="contact-keys-toolbar">
          <Button type="primary" icon={<KeyOutlined />} loading={generating} onClick={() => void handleGenerate()}>
            生成接洽码
          </Button>
          <span className="contact-keys-toolbar__hint">每个接洽码仅可使用一次，使用后自动作废</span>
        </div>

        <Table<ContactKeyDTO>
          rowKey="id"
          columns={columns}
          dataSource={keys}
          loading={loading}
          pagination={false}
          locale={{ emptyText: '还没有生成过接洽码' }}
        />
      </section>
    </div>
  );
}
