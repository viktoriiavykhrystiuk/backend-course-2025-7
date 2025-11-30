#!/usr/bin/env node

// app.js — головний файл програми для ЛР6 (інвентаризація)

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Command } = require('commander');
const express = require('express');
const multer = require('multer');
const swaggerUi = require('swagger-ui-express');

// -----------------------------
// 1. Парсинг аргументів командного рядка
// -----------------------------
const program = new Command();

// Не чіпаємо стандартний -h для help, тому використовуємо короткі -H, -p, -c
program
  .requiredOption('-H, --host <host>', 'server host (required)')
  .requiredOption('-p, --port <port>', 'server port (required)', (v) => parseInt(v, 10))
  .requiredOption('-c, --cache <dir>', 'cache directory (required)');

program.parse(process.argv);

const options = program.opts();
const HOST = options.host;
const PORT = options.port;
const CACHE_DIR = path.resolve(options.cache);
const INVENTORY_FILE = path.join(CACHE_DIR, 'inventory.json');
const PHOTOS_DIR = path.join(CACHE_DIR, 'photos');

// -----------------------------
// 2. Дані в памʼяті + 
// -----------------------------
/**
 * Структура елемента інвентаря:
 * {
 *    id: number,
 *    inventory_name: string,
 *    description: string,
 *    photoFilename: string | null
 * }
 */
let inventory = [];

// Створюємо кеш-директорію та папку для фото
async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(PHOTOS_DIR, { recursive: true });
}

// Завантажуємо список інвентаря з файлу (якщо він є)
async function loadInventory() {
  try {
    const data = await fs.readFile(INVENTORY_FILE, 'utf8');
    inventory = JSON.parse(data);
  } catch (err) {
    // Якщо файлу немає — починаємо з порожнього масиву
    if (err.code === 'ENOENT') {
      inventory = [];
      await saveInventory();
    } else {
      console.error('Помилка читання inventory.json:', err);
    }
  }
}

// Зберігаємо список інвентаря у файл
async function saveInventory() {
  await fs.writeFile(INVENTORY_FILE, JSON.stringify(inventory, null, 2), 'utf8');
}

// Генерація нового ID (просто max + 1)
function generateId() {
  if (inventory.length === 0) return 1;
  return Math.max(...inventory.map((item) => Number(item.id))) + 1;
}

// Знайти елемент за ID
function findItemById(id) {
  return inventory.find((item) => Number(item.id) === Number(id));
}

// Побудувати URL до фото
function buildPhotoUrl(id) {
  return `/inventory/${id}/photo`;
}

// -----------------------------
// 3. Налаштування Express
// -----------------------------
const app = express();

// Парсинг JSON та x-www-form-urlencoded (для /search)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статичні файли (щоб можна було віддавати RegisterForm.html, SearchForm.html)
app.use(express.static(__dirname));

// -----------------------------
// 4. Налаштування Multer для multipart/form-data (завантаження фото)
// -----------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PHOTOS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `photo_${unique}${ext}`);
  },
});

const upload = multer({ storage });

// -----------------------------
// 5. Swagger документація (/docs)
// -----------------------------
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Inventory Service API',
    version: '1.0.0',
    description: 'Простий сервіс інвентаризації для лабораторної роботи №6',
  },
  servers: [
    {
      url: `http://${HOST}:${PORT}`,
    },
  ],
  paths: {
    '/register': {
      post: {
        summary: 'Реєстрація нового пристрою',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  inventory_name: { type: 'string' },
                  description: { type: 'string' },
                  photo: { type: 'string', format: 'binary' },
                },
                required: ['inventory_name'],
              },
            },
          },
        },
        responses: {
          201: { description: 'Пристрій створено' },
          400: { description: 'Некоректні дані' },
        },
      },
    },
    '/inventory': {
      get: {
        summary: 'Отримати список всіх інвентаризованих речей',
        responses: {
          200: { description: 'Список інвентаря у вигляді JSON' },
        },
      },
    },
    '/inventory/{id}': {
      get: {
        summary: 'Отримати інформацію про конкретну річ',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'Обʼєкт інвентаря' },
          404: { description: 'Річ не знайдена' },
        },
      },
      put: {
        summary: 'Оновити імʼя або опис речі',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  inventory_name: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Оновлені дані речі' },
          404: { description: 'Річ не знайдена' },
        },
      },
      delete: {
        summary: 'Видалити річ',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'Річ видалено' },
          404: { description: 'Річ не знайдена' },
        },
      },
    },
    '/inventory/{id}/photo': {
      get: {
        summary: 'Отримати фото речі',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          200: { description: 'JPEG-зображення' },
          404: { description: 'Фото не знайдено' },
        },
      },
      put: {
        summary: 'Оновити фото речі',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  photo: { type: 'string', format: 'binary' },
                },
                required: ['photo'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Фото оновлено' },
          404: { description: 'Річ не знайдена' },
        },
      },
    },
    '/search': {
      post: {
        summary: 'Пошук речі за ID (x-www-form-urlencoded)',
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  has_photo: { type: 'string' },
                },
                required: ['id'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Знайдена річ' },
          404: { description: 'Не знайдено' },
        },
      },
    },
  },
};

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// -----------------------------
// 6. Маршрути + обробка Method Not Allowed (405)
// -----------------------------
//
// Для кожного "відомого" шляху спочатку робимо app.all()
// і перевіряємо метод, щоб повертати 405, якщо метод не дозволений.
//

// /register — дозволений тільки POST
app.all('/register', (req, res, next) => {
  const allowed = ['POST'];
  if (!allowed.includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  next();
});

// /inventory — дозволений тільки GET
app.all('/inventory', (req, res, next) => {
  const allowed = ['GET'];
  if (!allowed.includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  next();
});

// /inventory/:id — дозволені GET, PUT, DELETE
app.all('/inventory/:id', (req, res, next) => {
  const allowed = ['GET', 'PUT', 'DELETE'];
  if (!allowed.includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  next();
});

// /inventory/:id/photo — дозволені GET, PUT
app.all('/inventory/:id/photo', (req, res, next) => {
  const allowed = ['GET', 'PUT'];
  if (!allowed.includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  next();
});

// /SearchForm.html — дозволений тільки GET
app.all('/SearchForm.html', (req, res, next) => {
  const allowed = ['GET'];
  if (!allowed.includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  next();
});

// /RegisterForm.html — дозволений тільки GET
app.all('/RegisterForm.html', (req, res, next) => {
  const allowed = ['GET'];
  if (!allowed.includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  next();
});

// /search — дозволений тільки POST
app.all('/search', (req, res, next) => {
  const allowed = ['POST'];
  if (!allowed.includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  next();
});

// ---------- POST /register ----------
// Реєстрація нового пристрою (multipart/form-data)
app.post('/register', upload.single('photo'), async (req, res) => {
  try {
    const { inventory_name, description } = req.body;

    if (!inventory_name || inventory_name.trim() === '') {
      // Якщо імʼя не задано — 400 Bad Request
      return res.status(400).json({ error: 'inventory_name is required' });
    }

    const id = generateId();
    const item = {
      id,
      inventory_name: inventory_name.trim(),
      description: (description || '').trim(),
      photoFilename: req.file ? path.basename(req.file.filename) : null,
    };

    inventory.push(item);
    await saveInventory();

    return res.status(201).json({
      id: item.id,
      inventory_name: item.inventory_name,
      description: item.description,
      photoUrl: item.photoFilename ? buildPhotoUrl(item.id) : null,
    });
  } catch (err) {
    console.error('Помилка в /register:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------- GET /inventory ----------
// Список усіх інвентаризованих речей
app.get('/inventory', (req, res) => {
  const result = inventory.map((item) => ({
    id: item.id,
    inventory_name: item.inventory_name,
    description: item.description,
    photoUrl: item.photoFilename ? buildPhotoUrl(item.id) : null,
  }));
  res.status(200).json(result);
});

// ---------- GET /inventory/:id ----------
// Інформація про конкретну річ
app.get('/inventory/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const item = findItemById(id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  return res.status(200).json({
    id: item.id,
    inventory_name: item.inventory_name,
    description: item.description,
    photoUrl: item.photoFilename ? buildPhotoUrl(item.id) : null,
  });
});

// ---------- PUT /inventory/:id ----------
// Оновлення імені/опису
app.put('/inventory/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const item = findItemById(id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const { inventory_name, description } = req.body;
  if (inventory_name !== undefined) {
    item.inventory_name = String(inventory_name).trim();
  }
  if (description !== undefined) {
    item.description = String(description).trim();
  }

  await saveInventory();

  return res.status(200).json({
    id: item.id,
    inventory_name: item.inventory_name,
    description: item.description,
    photoUrl: item.photoFilename ? buildPhotoUrl(item.id) : null,
  });
});

// ---------- GET /inventory/:id/photo ----------
// Отримати фото конкретної речі
app.get('/inventory/:id/photo', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const item = findItemById(id);
  if (!item || !item.photoFilename) {
    return res.status(404).json({ error: 'Photo not found' });
  }

  const filePath = path.join(PHOTOS_DIR, item.photoFilename);

  try {
    const data = await fs.readFile(filePath);
    // За вимогами — image/jpeg
    res.setHeader('Content-Type', 'image/jpeg');
    return res.status(200).send(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Photo not found' });
    }
    console.error('Помилка читання фото:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------- PUT /inventory/:id/photo ----------
// Оновити фото конкретної речі
app.put('/inventory/:id/photo', upload.single('photo'), async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const item = findItemById(id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'photo file is required' });
  }

  // Можна було б видалити старий файл, але це не обовʼязково за методичкою
  item.photoFilename = path.basename(req.file.filename);
  await saveInventory();

  return res.status(200).json({
    id: item.id,
    inventory_name: item.inventory_name,
    description: item.description,
    photoUrl: item.photoFilename ? buildPhotoUrl(item.id) : null,
  });
});

// ---------- DELETE /inventory/:id ----------
// Видалити річ
app.delete('/inventory/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const index = inventory.findIndex((item) => Number(item.id) === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const [removed] = inventory.splice(index, 1);
  await saveInventory();

  // Опційно можна видалити фото з диску
  if (removed.photoFilename) {
    const photoPath = path.join(PHOTOS_DIR, removed.photoFilename);
    try {
      await fs.unlink(photoPath);
    } catch (err) {
      // Ігноруємо, якщо файлу вже немає
    }
  }

  return res.status(200).json({ message: 'Item deleted' });
});

// ---------- GET /RegisterForm.html ----------
// Веб-форма для реєстрації (фактично просто віддаємо HTML файл)
app.get('/RegisterForm.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'RegisterForm.html'));
});

// ---------- GET /SearchForm.html ----------
// Веб-форма для пошуку
app.get('/SearchForm.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'SearchForm.html'));
});

// ---------- POST /search ----------
// Пошук пристрою за ID (x-www-form-urlencoded)
// Поля: id, has_photo (checkbox)
app.post('/search', async (req, res) => {
  const id = Number(req.body.id);
  const hasPhotoFlag = req.body.has_photo; // буде 'on' якщо checkbox увімкнений

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const item = findItemById(id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  // Якщо прапорець виставлено — додаємо до опису посилання на фото
  if (hasPhotoFlag && item.photoFilename) {
    const linkText = ` [Photo: ${buildPhotoUrl(item.id)}]`;
    if (!item.description.includes(linkText)) {
      item.description = (item.description || '') + linkText;
      await saveInventory();
    }
  }

  return res.status(200).json({
    id: item.id,
    inventory_name: item.inventory_name,
    description: item.description,
    photoUrl: item.photoFilename ? buildPhotoUrl(item.id) : null,
  });
});

// ---------- 404 для інших маршрутів ----------
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// -----------------------------
// 7. Ініціалізація та запуск HTTP-сервера
// -----------------------------
async function start() {
  try {
    await ensureCacheDir();
    await loadInventory();

    const server = http.createServer(app);
    server.listen(PORT, HOST, () => {
      console.log(`Inventory service is running at http://${HOST}:${PORT}`);
      console.log(`Cache directory: ${CACHE_DIR}`);
      console.log('Swagger docs: /docs');
    });
  } catch (err) {
    console.error('Помилка під час старту сервера:', err);
    process.exit(1);
  }
}

start();
