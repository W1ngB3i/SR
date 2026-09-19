import { Router } from 'express';
import { SignJWT } from 'jose';
import { loginSchema } from '@sr/shared';
import { JWT_SECRET } from '../env.js';
import { sendOk } from '../middleware/errorHandler.js';
import { verifyLogin } from '../services/user.js';

const secretKey = new TextEncoder().encode(JWT_SECRET);

export const authRouter = Router();

/** 登录：签发 12 小时有效的 JWT */
authRouter.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = verifyLogin(input.username, input.password);
    const token = await new SignJWT({ name: user.name, role: user.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(secretKey);
    sendOk(res, { token, user });
  } catch (err) {
    next(err);
  }
});
