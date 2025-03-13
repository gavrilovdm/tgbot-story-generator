require('dotenv').config();
const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');
const path = require('path');

// Импортируем модули сервисов
const messageStorage = require('./services/messageStorage');
const telegramClient = require('./services/telegramClient');

// Импортируем обработчики бота
const { handleWtfCommand, handleMessage } = require('./handlers/botHandlers');

// Инициализация бота
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Функция инициализации
async function init() {
  try {
    console.log('Запуск бота...');
    
    // Загружаем сохраненные сообщения
    messageStorage.loadMessages();
    
    // Запускаем периодическое сохранение сообщений
    messageStorage.startSavingMessages();
    
    // Обработчик команды /start
    bot.start((ctx) => {
      ctx.reply('Привет! Я бот, который создает рассказы на основе ваших чатов. Добавьте меня в группу и используйте команду /wtf, чтобы получить рассказ о последних сообщениях в чате.');
    });
    
    // Обработчик команды /help
    bot.help((ctx) => {
      ctx.reply(
        'Я бот, который создает забавные рассказы на основе ваших чатов.\n\n' +
        'Как использовать:\n' +
        '1. Добавьте меня в группу\n' +
        '2. Я буду сохранять сообщения за последние 12 часов\n' +
        '3. Используйте команду /wtf или просто напишите "wtf", чтобы получить рассказ\n\n' +
        'Я также могу обрабатывать голосовые сообщения и преобразовывать их в текст для включения в рассказ!'
      );
    });
    
    // Обработчик команды /wtf
    bot.command('wtf', handleWtfCommand);
    
    // Обработчик текста "wtf" (без слеша)
    bot.hears(/^wtf$/i, handleWtfCommand);
    
    // Обработчик всех сообщений
    bot.on(message(), handleMessage);
    
    // Запуск бота
    await bot.launch();
    console.log('Бот успешно запущен!');
    
    // Настраиваем корректное завершение работы
    process.once('SIGINT', () => stopBot('SIGINT'));
    process.once('SIGTERM', () => stopBot('SIGTERM'));
  } catch (error) {
    console.error('Ошибка при инициализации бота:', error);
    process.exit(1);
  }
}

// Функция остановки бота
function stopBot(signal) {
  console.log(`Получен сигнал ${signal}, останавливаю бота...`);
  bot.stop(signal);
  messageStorage.stopSavingMessages();
  messageStorage.saveMessages();
  console.log('Бот остановлен');
  process.exit(0);
}

// Запускаем инициализацию
init().catch(err => {
  console.error('Критическая ошибка при запуске:', err);
  process.exit(1);
}); 