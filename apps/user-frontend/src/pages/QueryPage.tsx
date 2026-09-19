import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  Form,
  Input,
  Skeleton,
  Timeline,
  Upload,
  type UploadFile,
} from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  ATTACHMENT_KIND_RULES,
  EVENT_LABELS,
  type LookupResultDTO,
  type TicketEventType,
} from '@sr/shared';
import { GlassCard, GradeBadge, StatusTag, revealGrade, revealNode } from '@sr/ui';
import { lookupTicket } from '../api/public';
import { provideSupplement, submitAppeal } from '../api/ticket';
import { ApiClientError } from '../api/client';

const ACCEPT = [
  ...ATTACHMENT_KIND_RULES.image,
  ...ATTACHMENT_KIND_RULES.video,
].join(',');

const EVENT_COLORS: Record<TicketEventType, string> = {
  submitted: '#6f6a5f',
  claimed: '#72dbeb',
  assigned: '#72dbeb',
  released: '#b6b0a3',
  supplement_requested: '#f0965f',
  supplement_provided: '#e8c477',
  receipt_submitted: '#b7a3ff',
  receipt_rejected: '#e88b8b',
  review_confirmed: '#a48fff',
  published: '#7ad3a0',
  receipt_revised: '#e8c477',
  ticket_updated: '#b6b0a3',
  unpublished: '#f0965f',
};

interface LookupFormValues {
  circle_name: string;
  query_code: string;
}

/** 进度查询页：圈名 + 查询码，展示状态、回执与全量事件时间线 */
export function QueryPage() {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<LookupFormValues>();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResultDTO | null>(null);
  const [identity, setIdentity] = useState<LookupFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suppFiles, setSuppFiles] = useState<UploadFile[]>([]);
  const [suppNote, setSuppNote] = useState('');
  const [submittingSupp, setSubmittingSupp] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealReason, setAppealReason] = useState('');
  const [appealContact, setAppealContact] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [appealDone, setAppealDone] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!result || !resultRef.current) return;
    revealNode(resultRef.current);
    revealGrade(resultRef.current.querySelectorAll('.sr-grade'), 0.35);
  }, [result]);

  const doLookup = async (values: LookupFormValues) => {
    setLoading(true);
    setError(null);
    try {
      const data = await lookupTicket({
        circle_name: values.circle_name.trim(),
        query_code: values.query_code.trim(),
      });
      setResult(data);
      setAppealOpen(false);
      setAppealDone(false);
      setAppealReason('');
      setAppealContact('');
    } catch (err) {
      setResult(null);
      setError((err as ApiClientError).message);
    } finally {
      setLoading(false);
    }
  };

  const onLookup = async (values: LookupFormValues) => {
    setIdentity(values);
    await doLookup(values);
  };

  const onSupplement = async () => {
    if (!identity || !result) return;
    const files = suppFiles
      .map((f) => f.originFileObj)
      .filter((f): f is NonNullable<UploadFile['originFileObj']> => f != null);
    if (files.length === 0) {
      message.warning('请至少上传一个补充材料文件');
      return;
    }
    setSubmittingSupp(true);
    try {
      await provideSupplement(
        result.ticket.id,
        { ...identity, note: suppNote.trim() || undefined },
        files,
      );
      message.success('补充材料已提交，工单回到审核中');
      setSuppFiles([]);
      setSuppNote('');
      await doLookup(identity);
    } catch (err) {
      message.error((err as ApiClientError).message);
    } finally {
      setSubmittingSupp(false);
    }
  };

  const onAppeal = async () => {
    if (!identity || !result) return;
    if (appealReason.trim().length < 5) {
      message.warning('请填写至少 5 个字的申诉理由');
      return;
    }
    setSubmittingAppeal(true);
    try {
      await submitAppeal(result.ticket.id, {
        circle_name: identity.circle_name.trim(),
        query_code: identity.query_code.trim(),
        reason: appealReason.trim(),
        contact: appealContact.trim() || undefined,
      });
      message.success('申诉已提交，审核总管/副总管会尽快处理');
      setAppealDone(true);
    } catch (err) {
      message.error((err as ApiClientError).message);
    } finally {
      setSubmittingAppeal(false);
    }
  };

  const { ticket, receipt } = result ?? {};
  const events = result?.events ?? [];
  const showReceipt = receipt !== null && receipt !== undefined && !receipt.is_draft;

  return (
    <div className="page-hero">
      <div className="page-hero__eyebrow">Progress</div>
      <h1 className="page-hero__title">进度查询</h1>
      <p className="page-hero__desc">
        输入提交工单时的圈名与查询码，查看办理进度、审核回执；如被退回补充材料，可在此直接上传。
      </p>

      <GlassCard tone="strong" className="form-card" style={{ marginBottom: 22 }}>
        <Form<LookupFormValues> form={form} layout="vertical" onFinish={onLookup}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              columnGap: 22,
              alignItems: 'end',
            }}
          >
            <Form.Item
              name="circle_name"
              label="圈名"
              rules={[{ required: true, message: '请填写圈名' }]}
            >
              <Input placeholder="提交工单时填写的圈名" maxLength={24} />
            </Form.Item>
            <Form.Item
              name="query_code"
              label="查询码"
              rules={[
                { required: true, message: '请填写查询码' },
                {
                  pattern: /^[A-Z2-9]{8}$/,
                  message: '查询码为 8 位大写字母或数字（不含 0/1）',
                },
              ]}
              normalize={(v: string) => (v ?? '').toUpperCase().replace(/\s/g, '')}
            >
              <Input placeholder="如 6425C6N7" maxLength={8} />
            </Form.Item>
            <Form.Item style={{ paddingBottom: 2 }}>
              <Button type="primary" htmlType="submit" loading={loading} size="large">
                查询
              </Button>
            </Form.Item>
          </div>
        </Form>
      </GlassCard>

      {error && !loading && (
        <Alert type="warning" showIcon message={error} style={{ marginBottom: 22 }} />
      )}

      {loading && (
        <GlassCard className="form-card">
          <Skeleton active paragraph={{ rows: 8 }} />
        </GlassCard>
      )}

      {!loading && !result && !error && (
        <GlassCard className="form-card">
          <div className="pub-empty">输入圈名与查询码后，此处将展示工单进度</div>
        </GlassCard>
      )}

      {!loading && result && ticket && (
        <div ref={resultRef}>
          <GlassCard tone="strong" className="form-card">
            <div className="lookup-head">
              <span className="lookup-head__name">{ticket.circle_name}</span>
              <StatusTag status={ticket.status} />
              <div className="lookup-head__meta">
                工单 {ticket.id} · {ticket.department_name} · {ticket.mode_name}
                （{ticket.mode_group}） · 提交于 {dayjs(ticket.created_at).format('YYYY-MM-DD HH:mm')}
              </div>
            </div>

            {ticket.status === 'supplementing' && (
              <div
                className="receipt-panel"
                style={{ borderColor: 'rgba(240, 150, 95, 0.35)', marginTop: 22 }}
              >
                <div className="receipt-panel__title" style={{ color: '#f0965f' }}>
                  工单已被退回，需要补充材料
                </div>
                <p style={{ color: 'var(--sr-text-mid)', fontSize: 13.5, lineHeight: 1.9 }}>
                  退回原因:{ticket.supplement_reason || '审核员未填写原因，可联系反馈渠道确认'}
                </p>
                <div style={{ marginTop: 16 }}>
                  <Upload.Dragger
                    multiple
                    maxCount={6}
                    accept={ACCEPT}
                    fileList={suppFiles}
                    beforeUpload={() => false}
                    onChange={({ fileList: fl }) => setSuppFiles(fl)}
                  >
                    <p className="ant-upload-drag-icon">
                      <InboxOutlined />
                    </p>
                    <p className="ant-upload-text">上传补充材料</p>
                    <p className="ant-upload-hint">补齐退回原因中要求的证据后提交，工单将回到审核中</p>
                  </Upload.Dragger>
                </div>
                <Input.TextArea
                  style={{ marginTop: 12 }}
                  rows={2}
                  maxLength={200}
                  showCount
                  value={suppNote}
                  onChange={(e) => setSuppNote(e.target.value)}
                  placeholder="给审核员的说明（可选）"
                />
                <Button
                  type="primary"
                  style={{ marginTop: 14 }}
                  loading={submittingSupp}
                  onClick={onSupplement}
                >
                  提交补充材料
                </Button>
              </div>
            )}

            {showReceipt && (
              <div className="receipt-panel">
                <div className="receipt-panel__title">审核回执</div>
                <div className="receipt-panel__grades">
                  <GradeBadge grade={receipt?.pe_grade ?? null} prefix="PE" />
                  <GradeBadge grade={receipt?.pc_grade ?? null} prefix="PC" />
                  {receipt?.pass !== null && receipt?.pass !== undefined && (
                    <span
                      className={`receipt-panel__verdict ${
                        receipt.pass ? 'receipt-panel__verdict--pass' : 'receipt-panel__verdict--fail'
                      }`}
                    >
                      {receipt.pass ? '审核通过' : '未通过'}
                    </span>
                  )}
                </div>
                {receipt?.comment && (
                  <p className="receipt-panel__comment">评语:{receipt.comment}</p>
                )}
                {receipt?.target_department && (
                  <p className="receipt-panel__comment">
                    推荐部门:{receipt.target_department}
                  </p>
                )}
                {receipt?.auditor_name && (
                  <div className="receipt-panel__auditor">
                    审核员 {receipt.auditor_name}
                    {receipt.submitted_at
                      ? ` · ${dayjs(receipt.submitted_at).format('YYYY-MM-DD HH:mm')}`
                      : ''}
                  </div>
                )}
              </div>
            )}

            {(ticket.status === 'resulted' || ticket.status === 'published') && (
              <div className="receipt-panel" style={{ marginTop: 22 }}>
                <div className="receipt-panel__title">对结果有异议？</div>
                {appealDone ? (
                  <p style={{ color: 'var(--sr-text-mid)', fontSize: 13.5, lineHeight: 1.9, margin: 0 }}>
                    申诉已提交，审核总管 / 副总管会尽快处理；处理期间无需重复提交，请留意本页的时间线或反馈渠道通知。
                  </p>
                ) : appealOpen ? (
                  <>
                    <Input.TextArea
                      style={{ marginTop: 4 }}
                      rows={4}
                      maxLength={500}
                      showCount
                      value={appealReason}
                      onChange={(e) => setAppealReason(e.target.value)}
                      placeholder="请说明申诉理由（至少 5 个字，例如：成绩判定有误、证据未被判读完整等）"
                    />
                    <Input
                      style={{ marginTop: 10 }}
                      maxLength={64}
                      value={appealContact}
                      onChange={(e) => setAppealContact(e.target.value)}
                      placeholder="备用联系方式（QQ / 微信，可选）"
                    />
                    <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                      <Button type="primary" loading={submittingAppeal} onClick={() => void onAppeal()}>
                        提交申诉
                      </Button>
                      <Button onClick={() => setAppealOpen(false)}>取消</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ color: 'var(--sr-text-mid)', fontSize: 13.5, lineHeight: 1.9 }}>
                      申诉将由审核总管 / 副总管复核处理，结果记录在工单时间线中，可随时追溯。
                    </p>
                    <Button onClick={() => setAppealOpen(true)}>提交申诉</Button>
                  </>
                )}
              </div>
            )}

            <div className="receipt-panel">
              <div className="receipt-panel__title">办理轨迹</div>
              <Timeline
                items={events.map((ev) => ({
                  color: EVENT_COLORS[ev.type],
                  children: (
                    <div style={{ paddingBottom: 6 }}>
                      <div style={{ fontSize: 13.5, color: 'var(--sr-text-hi)' }}>
                        {EVENT_LABELS[ev.type]}
                        {ev.actor_name ? (
                          <span style={{ color: 'var(--sr-text-low)', fontSize: 12 }}>
                            {' '}· {ev.actor_name}
                          </span>
                        ) : null}
                      </div>
                      {ev.detail && (
                        <div style={{ fontSize: 12.5, color: 'var(--sr-text-mid)', marginTop: 3, lineHeight: 1.7 }}>
                          {ev.detail}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 11.5,
                          color: 'var(--sr-text-low)',
                          marginTop: 3,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {dayjs(ev.created_at).format('YYYY-MM-DD HH:mm')}
                      </div>
                    </div>
                  ),
                }))}
              />
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
