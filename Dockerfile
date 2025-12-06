FROM node:20-alpine

# Робоча директорія всередині контейнера
WORKDIR /app

# Копіюємо package.json і package-lock.json
COPY package*.json ./

# Встановлюємо залежності
RUN npm install

# Копіюємо весь проєкт у контейнер
COPY . .

# Створюємо папку для кешу (всередині контейнера)
RUN mkdir -p /app/cache/photos

# EXPOSE — порт у контейнері
EXPOSE 3000

# Команда запуску (ВАЖЛИВО: з усіма параметрами!)
CMD ["node", "app.js", "--host", "0.0.0.0", "--port", "3000", "--cache", "./cache"]




