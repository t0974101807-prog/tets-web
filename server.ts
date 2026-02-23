import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
console.log('Upload directory:', uploadDir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configure Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Ensure uploads directory exists
  if (!fs.existsSync(uploadDir)) {
    console.log('Creating uploads directory at:', uploadDir);
    fs.mkdirSync(uploadDir, { recursive: true });
  } else {
    console.log('Uploads directory exists at:', uploadDir);
  }

  // Serve uploaded files - PLACE THIS BEFORE VITE MIDDLEWARE
  app.use('/uploads', express.static(uploadDir));

  // File Upload API - PLACE THIS BEFORE BODY PARSERS
  app.post('/api/upload', (req, res) => {
    console.log('Received upload request');
    upload.single('image')(req, res, (err) => {
      if (err) {
        console.error('Upload error:', err);
        return res.status(500).json({ success: false, message: err.message });
      }
      
      if (!req.file) {
        console.error('No file in request');
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      console.log('File uploaded:', req.file.filename);
      const imageUrl = `/uploads/${req.file.filename}`;
      res.json({ success: true, imageUrl });
    });
  });

  // List uploaded files (for debugging)
  app.get('/api/uploads', (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Unable to scan directory' });
      }
      res.json({ success: true, files });
    });
  });

  // Middleware to parse JSON bodies (after upload route to avoid conflicts)
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Database setup
  const db = new Database('database.db');
  
  // Create Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      name TEXT,
      role TEXT DEFAULT 'editor'
    )
  `);

  // Migration: Add role column if it doesn't exist
  try {
    const tableInfo = db.prepare('PRAGMA table_info(users)').all() as any[];
    const hasRole = tableInfo.some(col => col.name === 'role');
    if (!hasRole) {
      db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'editor'");
      console.log('Added role column to users table');
    }
  } catch (error) {
    console.error('Error checking/adding role column:', error);
  }

  // Create Services Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      icon TEXT,
      file_url TEXT
    )
  `);

  // Migration: Add file_url column to services table if it doesn't exist
  try {
    const tableInfo = db.prepare('PRAGMA table_info(services)').all() as any[];
    const hasFileUrl = tableInfo.some(col => col.name === 'file_url');
    if (!hasFileUrl) {
      db.exec("ALTER TABLE services ADD COLUMN file_url TEXT");
      console.log('Added file_url column to services table');
    }
  } catch (error) {
    console.error('Error checking/adding file_url column to services table:', error);
  }

  // Create Team Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS team (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      title TEXT,
      image TEXT,
      icon TEXT
    )
  `);

  // Migration: Add icon column to team table if it doesn't exist
  try {
    const tableInfo = db.prepare('PRAGMA table_info(team)').all() as any[];
    const hasIcon = tableInfo.some(col => col.name === 'icon');
    if (!hasIcon) {
      db.exec("ALTER TABLE team ADD COLUMN icon TEXT");
      console.log('Added icon column to team table');
    }
  } catch (error) {
    console.error('Error checking/adding icon column to team table:', error);
  }

  // Seed user if not exists
  const checkUser = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  if (!checkUser) {
    const insertUser = db.prepare('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)');
    insertUser.run('admin', '123456', 'Administrator', 'admin');
    console.log('Seeded admin user');
  } else {
    // Ensure admin has admin role
    db.prepare("UPDATE users SET role = 'admin' WHERE username = 'admin'").run();
  }

  // Seed Services if empty
  const checkServices = db.prepare('SELECT count(*) as count FROM services').get() as { count: number };
  if (checkServices.count === 0) {
    const insertService = db.prepare('INSERT INTO services (title, description, icon) VALUES (?, ?, ?)');
    const initialServices = [
      { icon: 'Leaf', title: 'Môi trường & Năng lượng', description: 'Tư vấn tuân thủ quy định môi trường, đánh giá tác động và phát triển dự án năng lượng tái tạo.' },
      { icon: 'Globe', title: 'Du lịch & Khách sạn', description: 'Hỗ trợ pháp lý toàn diện cho các dự án nghỉ dưỡng, khách sạn và kinh doanh lữ hành quốc tế.' },
      { icon: 'Building2', title: 'Bất động sản & Xây dựng', description: 'Tư vấn pháp lý dự án, giao dịch mua bán, sáp nhập và giải quyết tranh chấp xây dựng.' },
      { icon: 'Briefcase', title: 'Tư vấn Doanh nghiệp', description: 'Thành lập, tái cấu trúc, M&A và quản trị nội bộ doanh nghiệp theo chuẩn mực quốc tế.' },
      { icon: 'Gavel', title: 'Tranh tụng & Giải quyết', description: 'Đại diện tham gia tố tụng tại Tòa án và Trọng tài thương mại với chiến lược hiệu quả.' },
      { icon: 'Scale', title: 'Sở hữu trí tuệ', description: 'Đăng ký bảo hộ, li-xăng và xử lý vi phạm quyền sở hữu trí tuệ cho thương hiệu.' },
    ];
    initialServices.forEach(s => insertService.run(s.title, s.description, s.icon));
    console.log('Seeded services');
  }

  // Seed Team if empty
  const checkTeam = db.prepare('SELECT count(*) as count FROM team').get() as { count: number };
  if (checkTeam.count === 0) {
    const insertTeam = db.prepare('INSERT INTO team (name, title, image) VALUES (?, ?, ?)');
    const initialTeam = [
      { name: 'LS. Lê Văn Tài', title: 'Giám đốc điều hành', image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=1974&auto=format&fit=crop' },
      { name: 'Mrs. Phạm Thị Mỹ Linh', title: 'Trưởng ban Quan hệ khách hàng', image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1976&auto=format&fit=crop' },
      { name: 'LS. Lê Văn C', title: 'Luật sư cao cấp', image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?q=80&w=1974&auto=format&fit=crop' },
    ];
    initialTeam.forEach(t => insertTeam.run(t.name, t.title, t.image));
    console.log('Seeded team');
  }

  // API Routes
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password) as any;
    
    if (user) {
      res.json({ success: true, user: { id: user.id, name: user.name, username: user.username, role: user.role } });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  });

  // User Management APIs
  app.get('/api/users', (req, res) => {
    const users = db.prepare('SELECT id, username, name, role FROM users').all();
    res.json(users);
  });

  app.post('/api/users', (req, res) => {
    const { username, password, name, role } = req.body;
    try {
      const result = db.prepare('INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)').run(username, password, name, role || 'editor');
      res.json({ id: result.lastInsertRowid, username, name, role: role || 'editor' });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(400).json({ success: false, message: 'Username already exists' });
      } else {
        res.status(500).json({ success: false, message: 'Failed to create user' });
      }
    }
  });

  app.put('/api/users/:id', (req, res) => {
    const { username, password, name, role } = req.body;
    const { id } = req.params;
    
    try {
      if (password) {
        db.prepare('UPDATE users SET username = ?, password = ?, name = ?, role = ? WHERE id = ?').run(username, password, name, role, id);
      } else {
        db.prepare('UPDATE users SET username = ?, name = ?, role = ? WHERE id = ?').run(username, name, role, id);
      }
      res.json({ success: true });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(400).json({ success: false, message: 'Username already exists' });
      } else {
        res.status(500).json({ success: false, message: 'Failed to update user' });
      }
    }
  });

  app.delete('/api/users/:id', (req, res) => {
    const { id } = req.params;
    // Prevent deleting the main admin user (id 1 or username 'admin') if needed, but for now just allow deletion except self (handled in frontend maybe)
    // Actually, let's prevent deleting the last admin user or specifically 'admin' user.
    // For simplicity, let's just delete.
    try {
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to delete user' });
    }
  });

  // Services APIs
  app.get('/api/services', (req, res) => {
    const services = db.prepare('SELECT * FROM services').all();
    res.json(services);
  });

  app.post('/api/services', (req, res) => {
    const { title, description, icon, file_url } = req.body;
    const result = db.prepare('INSERT INTO services (title, description, icon, file_url) VALUES (?, ?, ?, ?)').run(title, description, icon, file_url);
    res.json({ id: result.lastInsertRowid, title, description, icon, file_url });
  });

  app.put('/api/services/:id', (req, res) => {
    const { title, description, icon, file_url } = req.body;
    const { id } = req.params;
    db.prepare('UPDATE services SET title = ?, description = ?, icon = ?, file_url = ? WHERE id = ?').run(title, description, icon, file_url, id);
    res.json({ success: true });
  });

  app.delete('/api/services/:id', (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM services WHERE id = ?').run(id);
    res.json({ success: true });
  });

  // Team APIs
  app.get('/api/team', (req, res) => {
    const team = db.prepare('SELECT * FROM team').all();
    res.json(team);
  });

  app.post('/api/team', (req, res) => {
    const { name, title, image, icon } = req.body;
    const result = db.prepare('INSERT INTO team (name, title, image, icon) VALUES (?, ?, ?, ?)').run(name, title, image, icon);
    res.json({ id: result.lastInsertRowid, name, title, image, icon });
  });

  app.put('/api/team/:id', (req, res) => {
    const { name, title, image, icon } = req.body;
    const { id } = req.params;
    db.prepare('UPDATE team SET name = ?, title = ?, image = ?, icon = ? WHERE id = ?').run(name, title, image, icon, id);
    res.json({ success: true });
  });

  app.delete('/api/team/:id', (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM team WHERE id = ?').run(id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, 'dist')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
