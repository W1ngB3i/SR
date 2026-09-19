import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  App,
  Button,
  Descriptions,
  Form,
  Image,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Tag,
  Timeline,
  type FormInstance,
} from 'antd';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  FileOutlined,
  StarFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  EVENT_LABELS,
  GRADES,
  GRADE_LABELS,
  MODULE_LABELS,
  STATUS_LABELS,
  type DepartmentDTO,
  type Grade,
  type TicketDetailDTO,
} from '@sr/shared';
import { GradeBadge, StatusTag } from '@sr/ui';
import {
  ApiClientError,
} from '../api/client';
import { fetchDepartments } from '../api/admin';
import {
  deleteTicket,
  fetchTicketDetail,
  publishTicket,
  requestSupplement,
  reviewTicket,
  saveReceipt,
  unpublishTicket,
  updateTicketInfo,
} from '../api/staff';
import { useAuth } from '../auth/AuthContext';
import { canManage } from '../roles';

interface ReceiptFormValues {
  pe_grade?: Grade;
  pc_grade?: Grade;
  pass?: boolean;
  target_department: string;
  comment: string;
}

interface InfoFormValues {
  circle_name: string;
  contact: string;
  department_id: string;
  mode_id: string;
  module: 'PE' | 'PC' | 'BOTH';
  self_proof: boolean;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function TicketDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<TicketDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoSaving, setInfoSaving] = useState(false);
  const [departments, setDepartments] = useState<DepartmentDTO[]>([]);
  const [form] = Form.useForm<ReceiptFormValues>();
  const [infoForm] = Form.useForm<InfoFormValues>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await fetchTicketDetail(id));
    } catch (err) {
      if (err instanceof ApiClientError) {
        message.error(err.message);
        navigate('/pool', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  }, [id, message, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 回执表单回填（进入页面 / 保存后刷新时） */
  useEffect(() => {
    if (!detail?.receipt) {
      form.resetFields();
      return;
    }
    const r = detail.receipt;
    form.setFieldsValue({
      pe_grade: r.pe_grade ?? undefined,
      pc_grade: r.pc_grade ?? undefined,
      pass: r.pass ?? undefined,
      target_department: r.target_department ?? '',
      comment: r.comment ?? '',
    });
  }, [detail?.receipt, form]);

  const isManager = canManage(user?.role);
  const isAssignee = !!user && detail?.assignee_id === user.id;

  /** 回执可编辑：本人负责（审核中 / 复核退回重填）；总管/副总管全权——任意工单、含已公示修订 */
  const ownEditable =
    !!detail && isAssignee && (detail.status === 'reviewing' || detail.status === 'resulted');
  const managerEditable =
    !!detail &&
    isManager &&
    (detail.status === 'reviewing' || detail.status === 'resulted' || detail.status === 'published');
  const receiptEditable = ownEditable || managerEditable;
  /** 已公示工单：总管/副总管直接修订公示结果（仅提交，不走草稿） */
  const publishedRevision = managerEditable && detail?.status === 'published';
  /** 等待申请人补充材料时锁定表单 */
  const receiptLocked = !!detail && detail.status === 'supplementing' && isAssignee && !managerEditable;
  /** 复核面板：总管 + 回执已提交 + 已出结果 */
  const reviewable =
    !!detail &&
    isManager &&
    detail.status === 'resulted' &&
    !!detail.receipt &&
    !detail.receipt.is_draft;

  const needPe = detail ? detail.module === 'PE' || detail.module === 'BOTH' : false;
  const needPc = detail ? detail.module === 'PC' || detail.module === 'BOTH' : false;

  const gradeOptions = useMemo(
    () => GRADES.map((g) => ({ value: g, label: GRADE_LABELS[g] })),
    [],
  );

  const applyFieldErrors = (err: unknown) => {
    if (err instanceof ApiClientError && err.details) {
      const fields = Object.entries(err.details).map(([name, errors]) => ({
        name,
        errors,
      }));
      form.setFields(fields as never);
      return true;
    }
    return false;
  };

  const handleSaveReceipt = async (submit: boolean) => {
    if (!detail) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      const next = await saveReceipt(detail.id, {
        pe_grade: values.pe_grade ?? null,
        pc_grade: values.pc_grade ?? null,
        pass: values.pass ?? null,
        target_department: values.target_department?.trim() ?? '',
        comment: values.comment?.trim() ?? '',
        submit,
      });
      setDetail(next);
      message.success(submit ? '回执已提交，等待总管复核' : '草稿已保存');
    } catch (err) {
      if (!applyFieldErrors(err) && err instanceof ApiClientError) {
        message.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSupplementRequest = () => {
    if (!detail) return;
    let reason = '';
    modal.confirm({
      title: `退回补充材料：${detail.circle_name}`,
      content: (
        <div style={{ marginTop: 12 }}>
          <p style={{ color: '#6d7890', marginBottom: 8, fontSize: 13 }}>
            工单将回到申请人侧，由其在「进度查询」页上传补充材料。
          </p>
          <Input.TextArea
            rows={3}
            maxLength={300}
            placeholder="请说明需要补充的证据或材料（必填）"
            onChange={(e) => {
              reason = e.target.value;
            }}
          />
        </div>
      ),
      okText: '确认退回',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        if (!reason.trim()) {
          message.warning('请填写退回原因');
          throw new Error('reason required');
        }
        try {
          await requestSupplement(detail.id, reason.trim());
          message.success('已退回申请人补充');
          void load();
        } catch (err) {
          if (err instanceof ApiClientError) message.error(err.message);
          throw err;
        }
      },
    });
  };

  const handleReview = (action: 'confirm' | 'reject') => {
    if (!detail) return;
    const run = async (note: string) => {
      try {
        await reviewTicket(detail.id, action, note);
        message.success(action === 'confirm' ? '复核通过，结果已公示' : '已退回重填');
        void load();
      } catch (err) {
        if (err instanceof ApiClientError) message.error(err.message);
        void load();
      }
    };
    if (action === 'confirm') {
      modal.confirm({
        title: '复核通过并公示',
        content: (
          <p style={{ marginTop: 12, color: '#6d7890', fontSize: 13 }}>
            通过后回执内容将脱敏进入「结果公示」页，向全公会公开。
          </p>
        ),
        okText: '确认公示',
        onOk: () => run(''),
      });
    } else {
      let note = '';
      modal.confirm({
        title: '退回重填',
        content: (
          <div style={{ marginTop: 12 }}>
            <p style={{ color: '#6d7890', marginBottom: 8, fontSize: 13 }}>
              退回后回执转为草稿，由负责审核员修改后重新提交。
            </p>
            <Input.TextArea
              rows={3}
              maxLength={300}
              placeholder="退回说明（可选）"
              onChange={(e) => {
                note = e.target.value;
              }}
            />
          </div>
        ),
        okText: '确认退回',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => run(note.trim()),
      });
    }
  };

  const handlePublish = async () => {
    if (!detail) return;
    try {
      await publishTicket(detail.id);
      message.success('结果已公示');
      void load();
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    }
  };

  // ---------------------------------------------------------------------------
  // 总管/副总管全权操作：修订工单信息 / 撤销公示 / 删除工单
  // ---------------------------------------------------------------------------

  const openInfoModal = async () => {
    if (!detail) return;
    setInfoOpen(true);
    if (departments.length === 0) {
      try {
        setDepartments(await fetchDepartments());
      } catch (err) {
        if (err instanceof ApiClientError) message.error(err.message);
      }
    }
    infoForm.setFieldsValue({
    circle_name: detail.circle_name,
    contact: detail.contact,
    department_id: detail.department_id,
    mode_id: detail.mode_id,
    module: detail.module,
    self_proof: detail.self_proof,
  });
  };

  const submitInfo = async () => {
    if (!detail) return;
    const values = await infoForm.validateFields();
    setInfoSaving(true);
    try {
      const next = await updateTicketInfo(detail.id, values);
      setDetail(next);
      setInfoOpen(false);
      message.success('工单信息已修订');
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
      throw err;
    } finally {
      setInfoSaving(false);
    }
  };

  const handleUnpublish = async () => {
    if (!detail) return;
    try {
      await unpublishTicket(detail.id);
      message.success('已撤销公示，工单回到「已出结果」');
      void load();
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    try {
      await deleteTicket(detail.id);
      message.success('工单已删除');
      navigate('/pool', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    }
  };

  if (loading && !detail) {
    return <div className="detail-loading sr-glass">正在加载工单…</div>;
  }
  if (!detail) return null;

  const r = detail.receipt;
  const images = detail.attachments.filter((a) => a.kind === 'image');
  const videos = detail.attachments.filter((a) => a.kind === 'video');
  const others = detail.attachments.filter((a) => a.kind === 'other');

  return (
    <div className="detail-page">
      <div className="detail-head">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回
        </Button>
        <div className="detail-head__main">
          <h1 className="detail-head__title">
            {detail.is_priority && <StarFilled className="detail-head__star" />}
            {detail.circle_name}
          </h1>
          <div className="detail-head__meta">
            <StatusTag status={detail.status} />
            <span className="detail-head__meta-item">
              {detail.department_name} · {detail.mode_group ? `${detail.mode_group} / ` : ''}
              {detail.mode_name}
            </span>
            <span className="detail-head__meta-item">{MODULE_LABELS[detail.module]}</span>
            <span className="detail-head__meta-item">
              负责人：{detail.assignee_name ?? '未接单'}
            </span>
            <span className="detail-head__meta-item">
              提交于 {dayjs(detail.created_at).format('YYYY-MM-DD HH:mm')}
            </span>
          </div>
        </div>
        {(isAssignee || isManager) && detail.status === 'reviewing' && (
          <Button danger onClick={handleSupplementRequest}>
            退回补充
          </Button>
        )}
        {isManager && (
          <Space wrap>
            <Button icon={<EditOutlined />} onClick={() => void openInfoModal()}>
              编辑信息
            </Button>
            {detail.status === 'published' && (
              <Popconfirm
                title="撤销公示"
                description="工单将回到「已出结果」，可修订回执后重新公示。"
                okText="确认撤销"
                cancelText="取消"
                onConfirm={() => void handleUnpublish()}
              >
                <Button>撤销公示</Button>
              </Popconfirm>
            )}
            <Popconfirm
              title="删除工单"
              description="将级联删除回执、时间线与证据文件，不可恢复！"
              okText="确认删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => void handleDelete()}
            >
              <Button danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        )}
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          {/* 证据材料 */}
          <section className="sr-glass detail-card">
            <h2 className="detail-card__title">证据材料</h2>
            {detail.attachments.length === 0 && (
              <p className="detail-empty">暂无证据材料</p>
            )}
            {images.length > 0 && (
              <Image.PreviewGroup>
                <div className="detail-evidence">
                  {images.map((a) => (
                    <div key={a.id} className="detail-evidence__item">
                      <div className="detail-evidence__wrap">
                        <Image
                          src={a.url}
                          alt={a.filename}
                          loading="lazy"
                          className="detail-evidence__img"
                          height={150}
                        />
                      </div>
                      <p className="detail-evidence__name">{a.filename}</p>
                    </div>
                  ))}
                </div>
              </Image.PreviewGroup>
            )}
            {videos.length > 0 && (
              <div className="detail-evidence">
                {videos.map((a) => (
                  <div key={a.id} className="detail-evidence__item detail-evidence__item--video">
                    <video src={a.url} controls preload="metadata" className="detail-evidence__video" />
                    <p className="detail-evidence__name">{a.filename}</p>
                  </div>
                ))}
              </div>
            )}
            {others.length > 0 && (
              <div className="detail-files">
                {others.map((a) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="detail-files__link">
                    <FileOutlined /> {a.filename}（{formatSize(a.size)}）
                  </a>
                ))}
              </div>
            )}
          </section>

          {/* 审核回执 / 复核面板 */}
          <section className="sr-glass detail-card">
            <div className="detail-card__head">
              <h2 className="detail-card__title">审核回执</h2>
              {r && (
                <Tag className={`detail-draft ${r.is_draft ? 'is-draft' : 'is-submitted'}`}>
                  {r.is_draft ? '草稿' : '已提交'}
                </Tag>
              )}
            </div>

            {(receiptEditable || receiptLocked) && (
              <Form<ReceiptFormValues>
                form={form}
                layout="vertical"
                disabled={receiptLocked || saving}
                className="detail-receipt"
              >
                {receiptLocked && (
                  <p className="detail-lock">等待申请人补充材料，回执暂不可编辑。</p>
                )}
                <div className="detail-receipt__grades">
                  {needPe && (
                    <Form.Item name="pe_grade" label="PE 端成绩" rules={[{ required: false }]}>
                      <Select options={gradeOptions} placeholder="选择 PE 成绩" allowClear />
                    </Form.Item>
                  )}
                  {needPc && (
                    <Form.Item name="pc_grade" label="PC 端成绩" rules={[{ required: false }]}>
                      <Select options={gradeOptions} placeholder="选择 PC 成绩" allowClear />
                    </Form.Item>
                  )}
                </div>
                <Form.Item name="pass" label="审核评价">
                  <Radio.Group>
                    <Radio value={true}>通过</Radio>
                    <Radio value={false}>不通过</Radio>
                  </Radio.Group>
                </Form.Item>
                <Form.Item
                  noStyle
                  shouldUpdate={(prev, cur) => prev.pass !== cur.pass}
                >
                  {({ getFieldValue }) =>
                    getFieldValue('pass') === true ? (
                      <Form.Item
                        name="target_department"
                        label="可进入部门"
                        extra="评价为「通过」时必填，将展示在结果公示中"
                      >
                        <Input maxLength={60} placeholder="如：作战部 / 直属总部" />
                      </Form.Item>
                    ) : null
                  }
                </Form.Item>
                <Form.Item name="comment" label="审核意见">
                  <Input.TextArea rows={4} maxLength={500} placeholder="面向总管复核与结果公示的意见（可选）" />
                </Form.Item>
                <div className="detail-receipt__actions">
                  {publishedRevision ? (
                    <Button type="primary" loading={saving} onClick={() => void handleSaveReceipt(true)}>
                      保存修订
                    </Button>
                  ) : (
                    <>
                      <Button onClick={() => void handleSaveReceipt(false)} loading={saving}>
                        保存草稿
                      </Button>
                      <Button
                        type="primary"
                        loading={saving}
                        onClick={() => void handleSaveReceipt(true)}
                      >
                        提交回执
                      </Button>
                    </>
                  )}
                </div>
                <p className="detail-receipt__hint">
                  {publishedRevision
                    ? '该工单已公示：保存修订后公示结果即时更新，并记录修订时间线。'
                    : !isAssignee && isManager
                      ? '总管/副总管全权模式：可直接代为填写或修订任意工单的回执。'
                      : '提交后工单进入「已出结果」，由总管复核；复核退回后可在此重填再提交。'}
                </p>
              </Form>
            )}

            {reviewable && r && (
              <div className="detail-review">
                <Descriptions
                  column={1}
                  size="small"
                  className="detail-review__desc"
                  items={[
                    ...(needPe && r.pe_grade
                      ? [{ key: 'pe', label: 'PE 成绩', children: <GradeBadge grade={r.pe_grade} size="sm" /> }]
                      : []),
                    ...(needPc && r.pc_grade
                      ? [{ key: 'pc', label: 'PC 成绩', children: <GradeBadge grade={r.pc_grade} size="sm" /> }]
                      : []),
                    { key: 'pass', label: '审核评价', children: r.pass ? '通过' : '不通过' },
                    ...(r.pass && r.target_department
                      ? [{ key: 'dept', label: '可进入部门', children: r.target_department }]
                      : []),
                    { key: 'auditor', label: '审核员', children: r.auditor_name ?? '—' },
                    ...(r.comment ? [{ key: 'comment', label: '审核意见', children: r.comment }] : []),
                  ]}
                />
                <div className="detail-review__actions">
                  <Button type="primary" onClick={() => handleReview('confirm')}>
                    复核通过并公示
                  </Button>
                  <Button danger onClick={() => handleReview('reject')}>
                    退回重填
                  </Button>
                  <Button onClick={() => void handlePublish()}>直接公示</Button>
                </div>
                <p className="detail-review__hint">
                  「复核通过并公示」与「直接公示」等效：结果将脱敏进入公示页。
                </p>
              </div>
            )}

            {!receiptEditable && !receiptLocked && !reviewable && (
              <div className="detail-review__readonly">
                {r ? (
                  <Descriptions
                    column={1}
                    size="small"
                    items={[
                      ...(needPe && r.pe_grade
                        ? [{ key: 'pe', label: 'PE 成绩', children: <GradeBadge grade={r.pe_grade} size="sm" /> }]
                        : []),
                      ...(needPc && r.pc_grade
                        ? [{ key: 'pc', label: 'PC 成绩', children: <GradeBadge grade={r.pc_grade} size="sm" /> }]
                        : []),
                      { key: 'pass', label: '审核评价', children: r.pass === null ? '未填写' : r.pass ? '通过' : '不通过' },
                      ...(r.target_department ? [{ key: 'dept', label: '可进入部门', children: r.target_department }] : []),
                      { key: 'auditor', label: '审核员', children: r.auditor_name ?? '—' },
                      ...(r.comment ? [{ key: 'comment', label: '审核意见', children: r.comment }] : []),
                    ]}
                  />
                ) : (
                  <p className="detail-empty">
                    {detail.status === 'pending_claim'
                      ? '接单或指派后，由负责审核员填写回执。'
                      : '回执尚未填写。'}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        {/* 侧栏：工单信息 + 时间线 */}
        <div className="detail-side">
          <section className="sr-glass detail-card">
            <h2 className="detail-card__title">工单信息</h2>
            <Descriptions
              column={1}
              size="small"
              className="detail-info"
              items={[
                { key: 'module', label: '模块', children: MODULE_LABELS[detail.module] },
                { key: 'contact', label: '接洽码', children: detail.contact },
                {
                  key: 'self',
                  label: '自带证明',
                  children: detail.self_proof ? '有' : '无',
                },
                { key: 'status', label: '当前状态', children: STATUS_LABELS[detail.status] },
                ...(detail.supplement_reason
                  ? [
                      {
                        key: 'supplement',
                        label: '补充原因',
                        children: detail.supplement_reason,
                      },
                    ]
                  : []),
                ...(detail.claimed_at
                  ? [
                      {
                        key: 'claimed',
                        label: '接单时间',
                        children: dayjs(detail.claimed_at).format('MM-DD HH:mm'),
                      },
                    ]
                  : []),
                ...(detail.resulted_at
                  ? [
                      {
                        key: 'resulted',
                        label: '出结果',
                        children: dayjs(detail.resulted_at).format('MM-DD HH:mm'),
                      },
                    ]
                  : []),
                ...(detail.published_at
                  ? [
                      {
                        key: 'published',
                        label: '公示时间',
                        children: dayjs(detail.published_at).format('MM-DD HH:mm'),
                      },
                    ]
                  : []),
              ]}
            />
          </section>

          <section className="sr-glass detail-card">
            <h2 className="detail-card__title">流转时间线</h2>
            <Timeline
              className="detail-timeline"
              items={detail.events.map((e) => ({
                children: (
                  <div className="detail-timeline__item" data-type={e.type}>
                    <span className="detail-timeline__label">{EVENT_LABELS[e.type]}</span>
                    <span className="detail-timeline__meta">
                      {e.actor_name} · {dayjs(e.created_at).format('MM-DD HH:mm')}
                    </span>
                    {e.detail && <p className="detail-timeline__detail">{e.detail}</p>}
                  </div>
                ),
              }))}
            />
          </section>
        </div>
      </div>

      <Modal
        title="修订工单信息"
        open={infoOpen}
        onCancel={() => setInfoOpen(false)}
        onOk={() => void submitInfo()}
        okText="保存修订"
        cancelText="取消"
        confirmLoading={infoSaving}
        destroyOnHidden
      >
        <Form<InfoFormValues> form={infoForm} layout="vertical" style={{ marginTop: 12 }}>
          <InfoModalFields
            infoForm={infoForm}
            departments={departments}
            currentDept={detail.department_id}
          />
        </Form>
      </Modal>
    </div>
  );
}

/** 信息修订表单字段：部门切换时联动过滤模式选项 */
function InfoModalFields({
  infoForm,
  departments,
  currentDept,
}: {
  infoForm: FormInstance<InfoFormValues>;
  departments: DepartmentDTO[];
  currentDept: string;
}) {
  const deptId = Form.useWatch('department_id', infoForm) ?? currentDept;
  const modes = departments.find((d) => d.id === deptId)?.modes ?? [];
  return (
    <>
      <Form.Item
        name="circle_name"
        label="圈名"
        rules={[{ required: true, message: '请填写圈名' }]}
      >
        <Input maxLength={24} />
      </Form.Item>
      <Form.Item
        name="contact"
        label="接洽码"
        rules={[{ required: true, message: '请填写接洽码' }]}
      >
        <Input maxLength={6} style={{ textTransform: 'uppercase' }} />
      </Form.Item>
      <Form.Item name="department_id" label="所属部门" rules={[{ required: true }]}>
        <Select
          options={departments.map((d) => ({ value: d.id, label: d.name }))}
          placeholder="选择部门"
          showSearch
          optionFilterProp="label"
        />
      </Form.Item>
      <Form.Item name="mode_id" label="审核模式" rules={[{ required: true }]}>
        <Select
          options={modes.map((m) => ({
            value: m.id,
            label: m.group_name ? `${m.group_name} / ${m.name}` : m.name,
          }))}
          placeholder="选择模式"
          showSearch
          optionFilterProp="label"
        />
      </Form.Item>
      <Form.Item name="module" label="设备模块" rules={[{ required: true }]}>
        <Select
          options={Object.entries(MODULE_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </Form.Item>
      <Form.Item name="self_proof" label="自带证明">
        <Radio.Group>
          <Radio value={true}>有</Radio>
          <Radio value={false}>无</Radio>
        </Radio.Group>
      </Form.Item>
    </>
  );
}
