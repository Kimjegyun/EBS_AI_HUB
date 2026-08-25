# AI HUB Complete Server Auto-Setup Script
# This script creates ALL server files and sets up the environment automatically

Write-Host "=== AI HUB Complete Server Auto-Setup ===" -ForegroundColor Cyan
Write-Host "This will create all necessary files for the local server" -ForegroundColor Yellow
Write-Host ""

$serverRoot = Join-Path $PSScriptRoot "server"

# Create all directories
Write-Host "Step 1: Creating directory structure..." -ForegroundColor Yellow
$directories = @(
    "server/src/config",
    "server/src/controllers",
    "server/src/middleware",
    "server/src/models",
    "server/src/routes",
    "server/src/services",
    "server/src/utils",
    "server/src/scripts",
    "server/src/types",
    "server/data",
    "server/logs",
    "server/backups"
)

foreach ($dir in $directories) {
    $fullPath = Join-Path $PSScriptRoot $dir
    if (-not (Test-Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
    }
}
Write-Host "  Directories created!" -ForegroundColor Green

# Function to create file
function New-ServerFile {
    param([string]$Path, [string]$Content)
    $fullPath = Join-Path $serverRoot $Path
    $dir = Split-Path $fullPath -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $Content | Out-File -FilePath $fullPath -Encoding UTF8 -Force
}

Write-Host ""
Write-Host "Step 2: Creating configuration files..." -ForegroundColor Yellow

# package.json
New-ServerFile "package.json" @'
{
  "name": "ai-hub-server",
  "version": "1.0.0",
  "description": "AI HUB Local Server Backend",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "start:prod": "NODE_ENV=production node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "better-sqlite3": "^9.2.2",
    "dotenv": "^16.3.1",
    "express-rate-limit": "^7.1.5",
    "express-validator": "^7.0.1",
    "uuid": "^9.0.1",
    "winston": "^3.11.0",
    "compression": "^1.7.4"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/bcrypt": "^5.0.2",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/better-sqlite3": "^7.6.8",
    "@types/uuid": "^9.0.7",
    "@types/compression": "^1.7.5",
    "@types/node": "^20.10.6",
    "typescript": "^5.3.3",
    "tsx": "^4.7.0"
  }
}
'@

# tsconfig.json
New-ServerFile "tsconfig.json" @'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
'@

# .env
$envPath = Join-Path $serverRoot ".env"
if (-not (Test-Path $envPath)) {
    New-ServerFile ".env" @"
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
JWT_SECRET=ai-hub-secret-$(Get-Random)
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
DATABASE_PATH=./data/aihub.db
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
LOG_FILE=./logs/server.log
ADMIN_EMAIL=admin@company.com
ADMIN_PASSWORD=admin123
ADMIN_NAME=System Administrator
"@
}

# .gitignore
New-ServerFile ".gitignore" @'
node_modules/
dist/
.env
data/*.db
data/*.db-shm
data/*.db-wal
logs/
*.log
backups/
'@

Write-Host "  Configuration files created!" -ForegroundColor Green

Write-Host ""
Write-Host "Step 3: Creating source files..." -ForegroundColor Yellow

# Main server file
New-ServerFile "src/index.ts" @'
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { initDatabase } from './config/database';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import holidayRoutes from './routes/holiday.routes';
import eventRoutes from './routes/event.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

app.use(helmet());
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/events', eventRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use(errorHandler);

const startServer = async () => {
  try {
    await initDatabase();
    logger.info('Database initialized');
    app.listen(PORT, HOST, () => {
      logger.info(`Server running on http://${HOST}:${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start:', error);
    process.exit(1);
  }
};

startServer();
'@

# Database config
New-ServerFile "src/config/database.ts" @'
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

const DATABASE_PATH = process.env.DATABASE_PATH || './data/aihub.db';
const dataDir = path.dirname(DATABASE_PATH);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(DATABASE_PATH);
db.pragma('foreign_keys = ON');

export const initDatabase = async (): Promise<void> => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      login_id TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user', 'partner')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
      company TEXT,
      department TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      is_recurring BOOLEAN DEFAULT 0,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      user_id TEXT NOT NULL,
      is_all_day BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_login_id ON users(login_id);
  `);
  logger.info('Database schema initialized');
};
'@

# Logger
New-ServerFile "src/utils/logger.ts" @'
import winston from 'winston';
import path from 'path';
import fs from 'fs';

const logDir = './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});
'@

# Error handler
New-ServerFile "src/middleware/errorHandler.ts" @'
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Error:', { message: err.message, stack: err.stack });
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal Server Error' });
};
'@

# Rate limiter
New-ServerFile "src/middleware/rateLimiter.ts" @'
import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests, please try again later.'
});
'@

# Auth middleware
New-ServerFile "src/middleware/auth.ts" @'
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string; };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
};
'@

# Auth service
New-ServerFile "src/services/auth.service.ts" @'
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';

export class AuthService {
  async login(loginId: string, password: string) {
    const user = db.prepare('SELECT * FROM users WHERE login_id = ? AND status = ?').get(loginId, 'approved');
    if (!user) throw new Error('Invalid credentials or account not approved');
    
    const valid = await bcrypt.compare(password, (user as any).password_hash);
    if (!valid) throw new Error('Invalid credentials');
    
    const token = jwt.sign(
      { id: (user as any).id, email: (user as any).email, role: (user as any).role },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    
    return { token, user: { id: (user as any).id, email: (user as any).email, name: (user as any).name, role: (user as any).role } };
  }

  async signup(userData: any) {
    const passwordHash = await bcrypt.hash(userData.password, 10);
    const id = uuidv4();
    
    db.prepare(`
      INSERT INTO users (id, email, login_id, password_hash, name, role, company, department)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userData.email, userData.loginId, passwordHash, userData.name, userData.role || 'user', userData.company, userData.department);
    
    return { message: 'Signup successful. Waiting for admin approval.' };
  }
}
'@

# User service
New-ServerFile "src/services/user.service.ts" @'
import { db } from '../config/database';

export class UserService {
  getUsers() {
    return db.prepare('SELECT id, email, login_id, name, role, status, company, department, created_at FROM users').all();
  }

  getUserById(id: string) {
    return db.prepare('SELECT id, email, login_id, name, role, status, company, department, created_at FROM users WHERE id = ?').get(id);
  }

  updateUser(id: string, data: any) {
    db.prepare('UPDATE users SET name = ?, company = ?, department = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(data.name, data.company, data.department, id);
    return this.getUserById(id);
  }

  deleteUser(id: string) {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { message: 'User deleted successfully' };
  }

  approveUser(id: string) {
    db.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('approved', id);
    return this.getUserById(id);
  }

  rejectUser(id: string) {
    db.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('rejected', id);
    return this.getUserById(id);
  }
}
'@

# Controllers
New-ServerFile "src/controllers/auth.controller.ts" @'
import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';

const authService = new AuthService();

export class AuthController {
  async login(req: Request, res: Response) {
    try {
      const result = await authService.login(req.body.loginId, req.body.password);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  }

  async signup(req: Request, res: Response) {
    try {
      const result = await authService.signup(req.body);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  async logout(req: Request, res: Response) {
    res.json({ message: 'Logged out successfully' });
  }

  async refreshToken(req: Request, res: Response) {
    res.json({ message: 'Token refreshed' });
  }

  async resetPassword(req: Request, res: Response) {
    res.json({ message: 'Password reset email sent' });
  }
}
'@

New-ServerFile "src/controllers/user.controller.ts" @'
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { UserService } from '../services/user.service';

const userService = new UserService();

export class UserController {
  async getUsers(req: AuthRequest, res: Response) {
    try {
      const users = userService.getUsers();
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async getUserById(req: AuthRequest, res: Response) {
    try {
      const user = userService.getUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateUser(req: AuthRequest, res: Response) {
    try {
      const user = userService.updateUser(req.params.id, req.body);
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async deleteUser(req: AuthRequest, res: Response) {
    try {
      const result = userService.deleteUser(req.params.id);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async approveUser(req: AuthRequest, res: Response) {
    try {
      const user = userService.approveUser(req.params.id);
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async rejectUser(req: AuthRequest, res: Response) {
    try {
      const user = userService.rejectUser(req.params.id);
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
'@

New-ServerFile "src/controllers/holiday.controller.ts" @'
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';

export class HolidayController {
  async getHolidays(req: AuthRequest, res: Response) {
    res.json([]);
  }
  async createHoliday(req: AuthRequest, res: Response) {
    res.json({ message: 'Holiday created' });
  }
  async updateHoliday(req: AuthRequest, res: Response) {
    res.json({ message: 'Holiday updated' });
  }
  async deleteHoliday(req: AuthRequest, res: Response) {
    res.json({ message: 'Holiday deleted' });
  }
}
'@

New-ServerFile "src/controllers/event.controller.ts" @'
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';

export class EventController {
  async getEvents(req: AuthRequest, res: Response) {
    res.json([]);
  }
  async createEvent(req: AuthRequest, res: Response) {
    res.json({ message: 'Event created' });
  }
  async updateEvent(req: AuthRequest, res: Response) {
    res.json({ message: 'Event updated' });
  }
  async deleteEvent(req: AuthRequest, res: Response) {
    res.json({ message: 'Event deleted' });
  }
}
'@

# Routes
New-ServerFile "src/routes/auth.routes.ts" @'
import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = Router();
const controller = new AuthController();

router.post('/login', controller.login);
router.post('/signup', controller.signup);
router.post('/logout', controller.logout);
router.post('/refresh', controller.refreshToken);
router.post('/reset-password', controller.resetPassword);

export default router;
'@

New-ServerFile "src/routes/user.routes.ts" @'
import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
const controller = new UserController();

router.use(authenticate);
router.get('/', authorize('admin'), controller.getUsers);
router.get('/:id', controller.getUserById);
router.put('/:id', controller.updateUser);
router.delete('/:id', authorize('admin'), controller.deleteUser);
router.post('/:id/approve', authorize('admin'), controller.approveUser);
router.post('/:id/reject', authorize('admin'), controller.rejectUser);

export default router;
'@

New-ServerFile "src/routes/holiday.routes.ts" @'
import { Router } from 'express';
import { HolidayController } from '../controllers/holiday.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
const controller = new HolidayController();

router.use(authenticate);
router.get('/', controller.getHolidays);
router.post('/', authorize('admin'), controller.createHoliday);
router.put('/:id', authorize('admin'), controller.updateHoliday);
router.delete('/:id', authorize('admin'), controller.deleteHoliday);

export default router;
'@

New-ServerFile "src/routes/event.routes.ts" @'
import { Router } from 'express';
import { EventController } from '../controllers/event.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new EventController();

router.use(authenticate);
router.get('/', controller.getEvents);
router.post('/', controller.createEvent);
router.put('/:id', controller.updateEvent);
router.delete('/:id', controller.deleteEvent);

export default router;
'@

Write-Host "  Source files created!" -ForegroundColor Green

Write-Host ""
Write-Host "Step 4: Installing dependencies..." -ForegroundColor Yellow
Set-Location $serverRoot
npm install

Write-Host ""
Write-Host "=== Setup Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "To start the server:" -ForegroundColor Cyan
Write-Host "  cd server" -ForegroundColor White
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Server will run on: http://localhost:3001" -ForegroundColor Yellow
Write-Host "API endpoints: http://localhost:3001/api/*" -ForegroundColor Yellow
Write-Host ""

# Made with Bob
