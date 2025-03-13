const fs = require('fs');
const path = require('path');

// Директория для хранения данных сообщений
const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Файл для хранения сообщений
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// Хранилище сообщений для каждого чата
let chatMessages = {}; // { chatId: [message1, message2, ...] }

// Загрузка сообщений из файла при запуске
function loadMessages() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
      chatMessages = JSON.parse(data);
      console.log(`Загружено ${Object.keys(chatMessages).length} чатов из файла`);

      // Очищаем старые сообщения во всех чатах после загрузки
      Object.keys(chatMessages).forEach(chatId => {
        const oldLength = chatMessages[chatId].length;
        cleanOldMessages(chatId);
        console.log(`Чат ${chatId}: удалено ${oldLength - chatMessages[chatId].length} устаревших сообщений`);
      });
    } else {
      console.log('Файл с сообщениями не найден, используем пустое хранилище');
    }
  } catch (error) {
    console.error('Ошибка при загрузке сообщений из файла:', error);
    chatMessages = {};
  }
}

// Сохранение сообщений в файл
function saveMessages() {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(chatMessages, null, 2));
    console.log(`Сохранено ${Object.keys(chatMessages).length} чатов в файл`);
  } catch (error) {
    console.error('Ошибка при сохранении сообщений в файл:', error);
  }
}

// Функция для очистки старых сообщений (старше 12 часов)
function cleanOldMessages(chatId) {
  if (!chatMessages[chatId]) return;

  const twelvehHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
  chatMessages[chatId] = chatMessages[chatId].filter(msg => msg.timestamp >= twelvehHoursAgo);
}

// Периодическое сохранение сообщений (каждые 5 минут)
const SAVE_INTERVAL = 5 * 60 * 1000; // 5 минут
let saveInterval;

// Запуск периодического сохранения
function startSavingMessages() {
  saveInterval = setInterval(() => {
    console.log('Выполняю периодическое сохранение сообщений...');
    saveMessages();
  }, SAVE_INTERVAL);
}

// Остановка периодического сохранения
function stopSavingMessages() {
  if (saveInterval) {
    clearInterval(saveInterval);
  }
}

// Добавление сообщения в хранилище
function addMessage(chatId, message) {
  if (!chatMessages[chatId]) {
    chatMessages[chatId] = [];
  }
  chatMessages[chatId].push({ ...message, timestamp: Date.now(), processed: false });
}

// Получение сообщений для чата
function getMessages(chatId) {
  return chatMessages[chatId] || [];
}

// Отметить сообщения как обработанные
function markMessagesAsProcessed(chatId, messageIndexes) {
  if (!chatMessages[chatId]) {
    return;
  }

  // Если indexes не предоставлены, помечаем все сообщения
  if (!messageIndexes) {
    chatMessages[chatId].forEach(msg => {
      msg.processed = true;
    });
    console.log(`Помечены все ${chatMessages[chatId].length} сообщений в чате ${chatId} как обработанные`);
  } else {
    let count = 0;
    // Помечаем только указанные сообщения
    messageIndexes.forEach(index => {
      if (index >= 0 && index < chatMessages[chatId].length) {
        chatMessages[chatId][index].processed = true;
        count++;
      }
    });
    console.log(`Помечены ${count} сообщений в чате ${chatId} как обработанные`);
  }
}

module.exports = {
  loadMessages,
  saveMessages,
  cleanOldMessages,
  startSavingMessages,
  stopSavingMessages,
  addMessage,
  getMessages,
  markMessagesAsProcessed,
  chatMessages
}; 