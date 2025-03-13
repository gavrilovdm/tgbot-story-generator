const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const input = require('input');
const fs = require('fs');
const path = require('path');

// Директория для хранения истории
const HISTORY_DIR = path.join(__dirname, '../../history');
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

// Файл для хранения сессии
const SESSION_FILE = path.join(HISTORY_DIR, 'session.data');

// Настройки Telegram API
const apiId = process.env.TELEGRAM_API_ID;
const apiHash = process.env.TELEGRAM_API_HASH;

// Переменная для хранения клиента
let client = null;

// Функция для инициализации клиента
async function initClient() {
  try {
    console.log('Инициализация Telegram клиента...');
    
    // Проверяем наличие файла сессии
    let stringSession = new StringSession('');
    if (fs.existsSync(SESSION_FILE)) {
      // Если файл существует, загружаем сессию из него
      const sessionData = fs.readFileSync(SESSION_FILE, 'utf8');
      stringSession = new StringSession(sessionData);
      console.log('Загружена существующая сессия.');
    } else {
      console.log('Файл сессии не найден, будет создана новая сессия.');
    }
    
    // Создаем клиент Telegram
    client = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
      connectionRetries: 5,
    });
    
    // Запускаем клиент
    await client.start({
      phoneNumber: async () => await input.text('Введите номер телефона: '),
      password: async () => await input.text('Введите пароль: '),
      phoneCode: async () => await input.text('Введите код из SMS: '),
      onError: (err) => console.error('Ошибка при авторизации:', err),
    });
    
    console.log('Клиент Telegram успешно запущен.');
    
    // Сохраняем сессию
    const sessionString = client.session.save();
    fs.writeFileSync(SESSION_FILE, sessionString);
    console.log('Сессия сохранена в файл.');
    
    return client;
  } catch (error) {
    console.error('Ошибка при инициализации Telegram клиента:', error);
    return null;
  }
}

// Функция для получения истории сообщений
async function getChatHistory(chatId, limit = 100) {
  try {
    // Проверяем, инициализирован ли клиент
    if (!client) {
      client = await initClient();
      if (!client) {
        throw new Error('Не удалось инициализировать Telegram клиент');
      }
    }
    
    console.log(`Получение истории сообщений для чата ${chatId}...`);
    
    // Получаем объект диалога
    const entity = await client.getEntity(chatId);
    
    // Получаем историю сообщений
    const messages = await client.getMessages(entity, {
      limit: limit,
    });
    
    console.log(`Получено ${messages.length} сообщений из истории чата.`);
    
    return messages;
  } catch (error) {
    console.error('Ошибка при получении истории сообщений:', error);
    return [];
  }
}

// Экспортируем функции
module.exports = {
  initClient,
  getChatHistory
}; 