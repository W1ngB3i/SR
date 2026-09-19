import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  type FormInstance,
  Form,
  Input,
  Radio,
  Select,
  Skeleton,
  Upload,
  type UploadFile,
} from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  ATTACHMENT_KIND_RULES,
  BizCode,
  DEVICE_NOTES,
  MODULE_LABELS,
  type DepartmentDTO,
  type ModeDTO,
  type RulesBundleDTO,
  type SubmitResultDTO,
  type SubmitTicketInput,
} from '@sr/shared';
import { GlassCard, revealNode, staggerReveal } from '@sr/ui';
import { fetchRules } from '../api/public';
import { submitTicket } from '../api/ticket';
import { ApiClientError } from '../api/client';

const MAX_FILES = 6;
const ACCEPT = [
  ...ATTACHMENT_KIND_RULES.image,
  ...ATTACHMENT_KIND_RULES.video,
].join(',');

/** 提交申请页：部门 → 模式级联联动 + 设备模块 + 证据上传 */
export function SubmitPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<SubmitTicketInput>();
  const [bundle, setBundle] = useState<RulesBundleDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResultDTO | null>(null);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetchRules()
      .then((data) => {
        if (alive) setBundle(data);
      })
      .catch((err: ApiClientError) => {
        if (alive) setLoadError(err.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (result && successRef.current) {
      revealNode(successRef.current.querySelector('.submit-success__title'));
      staggerReveal(successRef.current.querySelectorAll('.query-code__char'), {
        each: 0.06,
        duration: 0.55,
        y: 16,
        delay: 0.18,
      });
      revealNode(successRef.current.querySelector('.submit-success__actions'), {
        delay: 0.55,
      });
    }
  }, [result]);

  const departmentId = Form.useWatch('department_id', form);
  const selectedDept = useMemo<DepartmentDTO | undefined>(
    () => bundle?.departments.find((d) => d.id === departmentId),
    [bundle, departmentId],
  );

  /** 模式选项：按 group_name 分组 */
  const modeOptions = useMemo(() => {
    if (!selectedDept) return [];
    const groups = new Map<string, ModeDTO[]>();
    for (const mode of selectedDept.modes) {
      const key = mode.group_name || '常规';
      const list = groups.get(key);
      if (list) list.push(mode);
      else groups.set(key, [mode]);
    }
    return [...groups.entries()].map(([group, modes]) => ({
      label: group,
      options: modes.map((m) => ({
        value: m.id,
        label: m.min_requirement ? `${m.name}（${m.min_requirement}）` : m.name,
      })),
    }));
  }, [selectedDept]);

  if (loadError) {
    return (
      <div className="page-hero">
        <h1 className="page-hero__title">提交审核申请</h1>
        <Alert type="error" showIcon message="规则加载失败" description={loadError} />
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="page-hero">
        <h1 className="page-hero__title">提交审核申请</h1>
        <GlassCard className="form-card">
          <Skeleton active paragraph={{ rows: 10 }} />
        </GlassCard>
      </div>
    );
  }

  const onFinish = async (values: SubmitTicketInput) => {
    const files = fileList
      .map((f) => f.originFileObj)
      .filter((f): f is NonNullable<UploadFile['originFileObj']> => f != null);
    setSubmitting(true);
    try {
      const data = await submitTicket(values, files);
      setResult(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const e = err as ApiClientError;
      if (e.code === BizCode.FieldRequired && e.details) {
        const loose = form as unknown as FormInstance<Record<string, unknown>>;
        loose.setFields(
          Object.entries(e.details).map(([name, errors]) => ({
            name: name.split('.'),
            errors,
          })),
        );
      } else if (e.code === BizCode.CooldownActive) {
        message.warning(e.message);
      } else {
        message.error(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    const dept = bundle.departments.find((d) => d.id === form.getFieldValue('department_id'));
    return (
      <div className="page-hero">
        <div className="submit-success" ref={successRef}>
          <div className="submit-success__eyebrow">Submitted</div>
          <h2 className="submit-success__title">工单已提交，等待审核员接单</h2>
          <div className="submit-success__meta">
            圈名 <em>{form.getFieldValue('circle_name')}</em>
            {dept ? (
              <>
                {' '}· {dept.name} · {form.getFieldValue('module') === 'BOTH' ? '双端' : form.getFieldValue('module')}
              </>
            ) : null}
          </div>
          <div className="query-code">
            {result.query_code.split('').map((ch, i) => (
              <span key={i} className="query-code__char">
                {ch}
              </span>
            ))}
          </div>
          <div className="submit-success__ticket">工单编号 {result.ticket_id}</div>
          <Alert
            style={{ maxWidth: 460, margin: '26px auto 0', textAlign: 'left' }}
            type="warning"
            showIcon
            message="请务必记录查询码"
            description="查询码仅此一次展示，凭「圈名 + 查询码」可在进度查询页随时查看办理进度与补充材料。"
          />
          <div className="submit-success__actions">
            <Button type="primary" size="large" onClick={() => navigate('/query')}>
              去查询进度
            </Button>
            <Button
              size="large"
              onClick={() => {
                form.resetFields();
                setFileList([]);
                setResult(null);
              }}
            >
              再提交一单
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-hero">
      <div className="page-hero__eyebrow">Submit</div>
      <h1 className="page-hero__title">提交审核申请</h1>
      <p className="page-hero__desc">
        填写圈名与审核意向，选择目标部门与审核模式并上传证据材料。提交后系统生成唯一查询码，凭「圈名 + 查询码」随时查询进度。
      </p>

      <GlassCard tone="strong" className="form-card">
        <Form<SubmitTicketInput>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={onFinish}
        >
          <div className="form-card__section-title">基本信息</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              columnGap: 22,
            }}
          >
            <Form.Item
              name="circle_name"
              label="圈名"
              rules={[
                { required: true, message: '请填写圈名' },
                { max: 24, message: '圈名不超过 24 个字符' },
              ]}
            >
              <Input placeholder="游戏内使用的圈名" maxLength={24} showCount />
            </Form.Item>

            <Form.Item
              name="intention"
              label="审核意向"
              rules={[{ required: true, message: '请选择审核意向' }]}
            >
              <Select
                placeholder="选择本次审核面向的 SR 群组"
                options={bundle.intentions.map((i) => ({ value: i, label: i }))}
              />
            </Form.Item>
          </div>

          <Form.Item
            name="contact"
            label="联系方式（QQ / 微信）"
            rules={[
              { required: true, message: '请填写联系方式' },
              { min: 4, message: '请填写有效的联系方式' },
              { max: 64, message: '联系方式不超过 64 个字符' },
            ]}
          >
            <Input placeholder="用于审核员与你沟通补充材料" maxLength={64} />
          </Form.Item>

          <div className="form-card__section-title">审核目标</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              columnGap: 22,
            }}
          >
            <Form.Item
              name="department_id"
              label="审核部门"
              rules={[{ required: true, message: '请选择审核部门' }]}
            >
              <Select
                placeholder="选择审核部门"
                options={bundle.departments.map((d) => ({
                  value: d.id,
                  label: d.tier ? `${d.name}（难度 ${d.tier}）` : d.name,
                }))}
                onChange={() => form.setFieldValue('mode_id', undefined)}
              />
            </Form.Item>

            <Form.Item
              name="mode_id"
              label="审核模式"
              rules={[{ required: true, message: '请选择审核模式' }]}
            >
              <Select
                placeholder={selectedDept ? '选择该部门的审核模式' : '请先选择审核部门'}
                disabled={!selectedDept}
                options={modeOptions}
              />
            </Form.Item>
          </div>

          <Form.Item
            name="module"
            label="设备模块"
            rules={[{ required: true, message: '请选择设备模块' }]}
            extra={
              <ul className="hint-lines">
                {DEVICE_NOTES.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            }
          >
            <Radio.Group
              options={Object.entries(MODULE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              optionType="button"
              buttonStyle="solid"
            />
          </Form.Item>

          <Form.Item
            name="self_proof"
            label="自证材料（是否为本人操作）"
            rules={[{ required: true, message: '请选择是否自证' }]}
          >
            <Radio.Group
              options={[
                { value: true, label: '自证（视频含手部/设备入镜）' },
                { value: false, label: '非自证（常规录像）' },
              ]}
            />
          </Form.Item>

          <div className="form-card__section-title">证据材料</div>
          <Form.Item
            label={`上传视频 / 截图证据（最多 ${MAX_FILES} 个）`}
            extra="支持 png / jpg / webp / gif / mp4 / mov / webm / mkv；单文件不超过 200MB。"
          >
            <Upload.Dragger
              multiple
              maxCount={MAX_FILES}
              accept={ACCEPT}
              fileList={fileList}
              beforeUpload={() => false}
              onChange={({ fileList: fl }) => setFileList(fl)}
              onRemove={(file) => {
                setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
              }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
              <p className="ant-upload-hint">证据需完整覆盖申报模块的操作过程</p>
            </Upload.Dragger>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button type="primary" size="large" htmlType="submit" loading={submitting}>
              提交工单
            </Button>
          </Form.Item>
        </Form>
      </GlassCard>
    </div>
  );
}
