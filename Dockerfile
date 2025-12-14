FROM node:20-alpine

# Робоча директорія
WORKDIR /app

# Копіюємо package.json та package-lock.json
COPY package*.json ./

# Встановлюємо всі залежності (включно з nodemon)
RUN npm install

# Копіюємо весь проєкт
COPY . .

# Створюємо папки кешу
RUN mkdir -p /app/cache/photos

# Відкриваємо порти
EXPOSE 3000
EXPOSE 9229

# ❗ Запуск БЕЗ 0.0.0.0 — так, як очікує твій код
CMD ["node", "app.js", "--host", "127.0.0.1", "--port", "3000", "--cache", "./cache"]
