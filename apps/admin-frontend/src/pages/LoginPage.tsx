import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Form, Input, App } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { ApiClientError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { homePathFor } from '../roles';

interface LoginForm {
  username: string;
  password: string;
}

export function LoginPage() {
  const { login } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    try {
      const user = await login(values.username, values.password);
      message.success(`欢迎回来，${user.name}`);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : homePathFor(user.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        message.error(err.message);
      } else {
        message.error('登录失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card sr-glass sr-glass--strong">
        <div className="login-card__brand">
          <span className="login-card__mark">SR</span>
          <div>
            <h1 className="login-card__title">审核工作台</h1>
            <p className="login-card__desc">SR 公会审核工单系统 · 内部人员入口</p>
          </div>
        </div>

        <Form<LoginForm> layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="如 xingchen" autoComplete="username" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入密码"
              autoComplete="current-password"
              size="large"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            登 录
          </Button>
        </Form>

        <p className="login-card__foot">
          面向审核员 / 副总管 / 总管 / 系统管理员，账号由总管或系统管理员统一发放
        </p>
      </div>
    </div>
  );
}
