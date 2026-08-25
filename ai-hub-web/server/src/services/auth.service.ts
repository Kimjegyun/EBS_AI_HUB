import bcrypt from 'bcrypt'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { run, get } from '../config/database'

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim()
  if (!secret || secret === 'default-secret') {
    throw new Error('JWT_SECRET is not configured')
  }
  return secret
}

export class AuthService {
  async login(loginId: string, password: string) {
    const user = await get('SELECT * FROM users WHERE login_id = ? AND status = ?', [loginId, 'approved'])
    if (!user) throw new Error('Invalid credentials or account not approved')

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) throw new Error('Invalid credentials')

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      getJwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' } as SignOptions,
    )

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    }
  }

  async signup(userData: { email: string; loginId: string; password: string; name: string; company?: string; department?: string }) {
    if (!userData.password || userData.password.length < 8) {
      throw new Error('Password must be at least 8 characters')
    }
    if (!userData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
      throw new Error('Invalid email format')
    }
    const passwordHash = await bcrypt.hash(userData.password, 12)
    const id = uuidv4()

    await run(
      `INSERT INTO users (id, email, login_id, password_hash, name, role, company, department)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userData.email, userData.loginId, passwordHash, userData.name, 'user', userData.company, userData.department],
    )

    return { message: 'Signup successful. Waiting for admin approval.' }
  }
}
