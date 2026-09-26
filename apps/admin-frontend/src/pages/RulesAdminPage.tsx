import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Switch, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { DepartmentDTO, ModeDTO } from '@sr/shared';
import {
  createDepartment,
  createMode,
  deleteDepartment,
  deleteMode,
  fetchDepartments,
  updateDepartment,
  updateMode,
} from '../api/admin';
import { ApiClientError } from '../api/client';

interface DeptFormValues {
  name: string;
  tier: string;
  contact: string;
  description: string;
  sort: number;
  enabled: boolean;
}

interface ModeFormValues {
  group_name: string;
  name: string;
  min_requirement: string;
  sort: number;
}

export function RulesAdminPage() {
  const { message } = App.useApp();

  const [departments, setDepartments] = useState<DepartmentDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const [deptEditing, setDeptEditing] = useState<DepartmentDTO | 'new' | null>(null);
  const [deptForm] = Form.useForm<DeptFormValues>();
  const [deptSaving, setDeptSaving] = useState(false);

  const [modeEditing, setModeEditing] = useState<{ dept: DepartmentDTO; mode: ModeDTO | 'new' } | null>(null);
  const [modeForm] = Form.useForm<ModeFormValues>();
  const [modeSaving, setModeSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDepartments(await fetchDepartments());
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---- 部门 CRUD ----

  const openDept = (target: DepartmentDTO | 'new') => {
    setDeptEditing(target);
    if (target === 'new') {
      deptForm.resetFields();
    } else {
      deptForm.setFieldsValue({
        name: target.name,
        tier: target.tier,
        contact: target.contact,
        description: target.description,
        sort: target.sort,
        enabled: target.enabled,
      });
    }
  };

  const saveDept = async () => {
    const values = await deptForm.validateFields();
    setDeptSaving(true);
    try {
      if (deptEditing === 'new') {
        await createDepartment(values);
        message.success('部门已创建');
      } else if (deptEditing) {
        await updateDepartment(deptEditing.id, values);
        message.success('部门已更新');
      }
      setDeptEditing(null);
      void load();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.details) {
          deptForm.setFields(
            Object.entries(err.details).map(([name, errors]) => ({ name, errors })) as never,
          );
        } else {
          message.error(err.message);
        }
      }
    } finally {
      setDeptSaving(false);
    }
  };

  const removeDept = async (dept: DepartmentDTO) => {
    try {
      await deleteDepartment(dept.id);
      message.success('部门已删除');
      void load();
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    }
  };

  // ---- 模式 CRUD ----

  const openMode = (dept: DepartmentDTO, mode: ModeDTO | 'new') => {
    setModeEditing({ dept, mode });
    if (mode === 'new') {
      modeForm.resetFields();
    } else {
      modeForm.setFieldsValue({
        group_name: mode.group_name,
        name: mode.name,
        min_requirement: mode.min_requirement,
        sort: mode.sort,
      });
    }
  };

  const saveMode = async () => {
    if (!modeEditing) return;
    const values = await modeForm.validateFields();
    setModeSaving(true);
    try {
      if (modeEditing.mode === 'new') {
        await createMode({ ...values, department_id: modeEditing.dept.id });
        message.success('模式已创建');
      } else {
        await updateMode(modeEditing.mode.id, values);
        message.success('模式已更新');
      }
      setModeEditing(null);
      void load();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.details) {
          modeForm.setFields(
            Object.entries(err.details).map(([name, errors]) => ({ name, errors })) as never,
          );
        } else {
          message.error(err.message);
        }
      }
    } finally {
      setModeSaving(false);
    }
  };

  const removeMode = async (mode: ModeDTO) => {
    try {
      await deleteMode(mode.id);
      message.success('模式已删除');
      void load();
    } catch (err) {
      if (err instanceof ApiClientError) message.error(err.message);
    }
  };

  const deptColumns: ColumnsType<DepartmentDTO> = useMemo(
    () => [
      {
        title: '部门',
        dataIndex: 'name',
        render: (name: string, row) => (
          <div className="rules-dept__name">
            <span>{name}</span>
            {row.tier && <Tag className="rules-dept__tier">{row.tier}</Tag>}
            {!row.enabled && <Tag color="default">已停用</Tag>}
          </div>
        ),
      },
      { title: '联系方式', dataIndex: 'contact', width: 160, render: (v: string) => v || '—' },
      { title: '模式数', key: 'modes', width: 90, render: (_, row) => row.modes.length },
      { title: '排序', dataIndex: 'sort', width: 70 },
      {
        title: '操作',
        key: 'actions',
        width: 260,
        render: (_, row) => (
          <div className="pool-actions">
            <Button size="small" type="primary" ghost onClick={() => openMode(row, 'new')}>
              加模式
            </Button>
            <Button size="small" onClick={() => openDept(row)}>
              编辑
            </Button>
            <Popconfirm
              title="删除部门"
              description="仅能删除无模式且无工单关联的部门"
              okText="删除"
              okButtonProps={{ danger: true }}
              onConfirm={() => void removeDept(row)}
            >
              <Button size="small" danger>
                删除
              </Button>
            </Popconfirm>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** 模式表格列：闭包捕获所属部门，供「编辑」回填 */
  const modeColumnsFor = (dept: DepartmentDTO): ColumnsType<ModeDTO> => [
    {
      title: '分组 / 模式',
      key: 'mode',
      render: (_, m) => (
        <div className="rules-dept__mode">
          <span className="rules-mode__group">{m.group_name || '未分组'}</span>
          <span className="rules-mode__name">{m.name}</span>
        </div>
      ),
    },
    {
      title: '最低要求',
      dataIndex: 'min_requirement',
      render: (v: string) => v || '—',
    },
    { title: '排序', dataIndex: 'sort', width: 70 },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, m) => (
        <div className="pool-actions">
          <Button size="small" onClick={() => openMode(dept, m)}>
            编辑
          </Button>
          <Popconfirm
            title="删除模式"
            description="仅能删除无工单关联的模式"
            okText="删除"
            okButtonProps={{ danger: true }}
            onConfirm={() => void removeMode(m)}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div className="rules-page">
      <div className="page-hero page-hero--row">
        <div>
          <h1 className="page-hero__title">规则配置中心</h1>
          <p className="page-hero__desc">部门与审核模式是申请表单和公示的口径来源，修改即时生效</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openDept('new')}>
          新建部门
        </Button>
      </div>

      <div className="sr-glass pool-table">
        <Table<DepartmentDTO>
          rowKey="id"
          columns={deptColumns}
          dataSource={departments}
          loading={loading}
          pagination={false}
          expandable={{
            expandedRowRender: (dept) => (
              <Table<ModeDTO>
                rowKey="id"
                columns={modeColumnsFor(dept)}
                dataSource={dept.modes}
                pagination={false}
                size="small"
                className="rules-modes-table"
              />
            ),
          }}
          locale={{ emptyText: '暂无部门' }}
        />
      </div>

      <Modal
        title={deptEditing === 'new' ? '新建部门' : '编辑部门'}
        open={!!deptEditing}
        confirmLoading={deptSaving}
        okText="保存"
        cancelText="取消"
        onOk={() => void saveDept()}
        onCancel={() => setDeptEditing(null)}
        destroyOnHidden
      >
        <Form<DeptFormValues> form={deptForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="部门名称" rules={[{ required: true, message: '请填写部门名称' }]}>
            <Input maxLength={50} placeholder="如：作战部" />
          </Form.Item>
          <Form.Item name="tier" label="梯队 / 级别">
            <Input maxLength={30} placeholder="如：一线作战部门" />
          </Form.Item>
          <Form.Item name="contact" label="联系渠道">
            <Input maxLength={60} placeholder="QQ 群 / 负责人，选填" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} maxLength={200} placeholder="面向申请人展示的部门说明" />
          </Form.Item>
          <div className="rules-form__row">
            <Form.Item name="sort" label="排序" initialValue={0} rules={[{ required: true }]}>
              <InputNumber min={0} max={999} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="enabled" label="启用" initialValue={true} valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        title={
          modeEditing
            ? modeEditing.mode === 'new'
              ? `新增模式 · ${modeEditing.dept.name}`
              : `编辑模式 · ${modeEditing.dept.name}`
            : '模式'
        }
        open={!!modeEditing}
        confirmLoading={modeSaving}
        okText="保存"
        cancelText="取消"
        onOk={() => void saveMode()}
        onCancel={() => setModeEditing(null)}
        destroyOnHidden
      >
        <Form<ModeFormValues> form={modeForm} layout="vertical" preserve={false}>
          <Form.Item name="group_name" label="模式分组">
            <Input maxLength={40} placeholder="如：竞技场模式 / 战场模式" />
          </Form.Item>
          <Form.Item name="name" label="模式名称" rules={[{ required: true, message: '请填写模式名称' }]}>
            <Input maxLength={50} placeholder="如：小组赛" />
          </Form.Item>
          <Form.Item name="min_requirement" label="最低要求">
            <Input maxLength={100} placeholder="如：S 评级以上" />
          </Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0} rules={[{ required: true }]}>
            <InputNumber min={0} max={999} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
