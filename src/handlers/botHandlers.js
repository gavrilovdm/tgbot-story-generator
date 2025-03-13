const { message } = require('telegraf/filters');
const path = require('path');
const { convertVoiceToText } = require('../services/speechToText');
const { generateStory } = require('../services/storyGenerator');
const { addMessage, getMessages, markMessagesAsProcessed } = require('../services/messageStorage');
const telegramClient = require('../services/telegramClient');

// Вспомогательные функции для обработки сообщений
function getMessageSender(msg) {
  // Функция для получения полного имени пользователя
  function getFullName(user) {
    if (!user) return 'Неизвестный пользователь';

    let name = user.first_name || '';
    if (user.last_name) name += ' ' + user.last_name;
    return name || user.username || 'Неизвестный пользователь';
  }

  // Проверяем, переслано ли сообщение
  if (msg.forward_from) {
    // Сообщение переслано от пользователя
    return {
      username: getFullName(msg.forward_from), // Используем имя оригинального отправителя
      forwardedBy: getFullName(msg.from),
      isForwarded: true
    };
  } else if (msg.forward_from_chat) {
    // Сообщение переслано из канала/группы
    return {
      username: msg.forward_from_chat.title || msg.forward_from_chat.username || 'Неизвестный канал',
      forwardedBy: getFullName(msg.from),
      isForwarded: true
    };
  } else {
    // Обычное сообщение
    return {
      username: getFullName(msg.from),
      isForwarded: false
    };
  }
}

// Обработчик команды /wtf - генерация рассказа о последних сообщениях в чате
async function handleWtfCommand(ctx) {
  try {
    const chatId = ctx.chat.id.toString();
    console.log(`Получена команда wtf в чате ${chatId}`);

    // Отправляем "печатает" статус
    await ctx.telegram.sendChatAction(chatId, 'typing');

    // Проверяем, есть ли сохраненные сообщения для этого чата
    const messages = getMessages(chatId);

    // Выводим информацию о сохраненных сообщениях в лог
    console.log(`Найдено ${messages.length} сохраненных сообщений для чата ${chatId}`);

    // Если сообщений недостаточно, пробуем получить историю через telegram API
    if (messages.length < 10) {
      console.log(`Недостаточно сообщений (${messages.length}), получаем историю через Telegram API`);

      // Используем функцию получения истории сообщений
      try {
        await getChatHistory(ctx, chatId);
      } catch (historyError) {
        console.error('Ошибка при получении истории чата:', historyError);
        await ctx.reply('Недостаточно сообщений в истории для генерации рассказа. Пожалуйста, подождите, пока в чате накопится больше сообщений.');
        return;
      }
    }

    // Получаем обновленный список сообщений после загрузки истории
    const updatedMessages = getMessages(chatId);
    console.log(`После загрузки истории: ${updatedMessages.length} сообщений`);

    // Подсчитываем количество необработанных сообщений
    const unprocessedCount = updatedMessages.filter(msg => !msg.processed).length;
    console.log(`Количество непрочитанных сообщений: ${unprocessedCount}`);

    // Если нет новых сообщений, информируем пользователя
    if (unprocessedCount === 0) {
      await ctx.reply('Нет новых сообщений со времени последнего запроса. Пожалуйста, дождитесь новых сообщений в чате.');
      return;
    }

    // Если сообщений все еще недостаточно
    if (updatedMessages.length < 5) {
      console.log(`Все еще недостаточно сообщений (${updatedMessages.length})`);
      await ctx.reply('Недостаточно сообщений в истории для генерации рассказа. Пожалуйста, подождите, пока в чате накопится больше сообщений.');
      return;
    }

    // Проверяем структуру сообщений
    console.log('Проверка структуры сообщений перед генерацией рассказа...');
    let hasInvalidMessages = false;
    for (let i = 0; i < updatedMessages.length; i++) {
      const msg = updatedMessages[i];
      if (!msg.message && !msg.text) {
        console.warn(`Предупреждение: сообщение ${i} не содержит ни message, ни text`);
        console.warn('Содержимое сообщения:', JSON.stringify(msg, null, 2));
        hasInvalidMessages = true;
      }
    }

    if (hasInvalidMessages) {
      console.log('Обнаружены сообщения с неправильной структурой, исправляем...');
      // Исправляем структуру сообщений, добавляя заглушки для отсутствующих полей
      for (let i = 0; i < updatedMessages.length; i++) {
        const msg = updatedMessages[i];
        if (!msg.message && !msg.text) {
          msg.message = '[Содержимое недоступно]';
        }
      }
    }

    // Отправляем еще один "печатает" статус, так как генерация может занять время
    await ctx.telegram.sendChatAction(chatId, 'typing');

    // Генерируем рассказ
    console.log('Генерируем рассказ на основе сообщений...');
    let story;
    try {
      story = await generateStory(updatedMessages);
    } catch (genError) {
      console.error('Критическая ошибка при генерации рассказа:', genError);
      await ctx.reply('Произошла непредвиденная ошибка при генерации рассказа. Пожалуйста, сообщите об этом администратору бота.');
      return;
    }

    // Отправляем сгенерированный рассказ
    if (!story || typeof story !== 'string' || story.trim() === '') {
      console.error('Ошибка: сгенерированный рассказ пуст или имеет неправильный формат');
      await ctx.reply('К сожалению, не удалось сгенерировать рассказ. Попробуйте позже.');
      return;
    }

    await ctx.reply(story);
    console.log('Рассказ успешно отправлен в чат');

    // Сохраняем обработанные сообщения
    await markMessagesAsProcessed(chatId);
    console.log('Все сообщения в чате помечены как обработанные');

  } catch (error) {
    console.error('Ошибка при обработке команды wtf:', error);
    try {
      await ctx.reply('Произошла ошибка при генерации рассказа. Пожалуйста, попробуйте позже.');
    } catch (replyError) {
      console.error('Не удалось отправить сообщение об ошибке в чат:', replyError);
    }
  }
}

// Обработчик обычных сообщений - сохранение текстовых сообщений и обработка голосовых
async function handleMessage(ctx) {
  try {
    const msg = ctx.message;
    const chatId = ctx.chat.id.toString();

    // Получаем информацию об отправителе
    const senderInfo = getMessageSender(msg);

    // Если это голосовое сообщение
    if (msg.voice) {
      console.log(`Получено голосовое сообщение в чате ${chatId} от ${senderInfo.username}`);

      // Отправляем статус, что бот занят обработкой
      await ctx.telegram.sendChatAction(chatId, 'typing');

      // Получаем ссылку на файл голосового сообщения
      const fileId = msg.voice.file_id;
      const fileUrl = await ctx.telegram.getFileLink(fileId);

      console.log(`Получена ссылка на голосовой файл: ${fileUrl}`);

      // Создаем имя файла для сохранения
      const fileName = `voice_${Date.now()}${path.extname(fileUrl.toString())}`;

      // Конвертируем голосовое сообщение в текст
      console.log(`Начинаем конвертацию голосового сообщения в текст...`);
      const transcription = await convertVoiceToText(fileUrl.toString(), fileName);

      console.log(`Результат конвертации: "${transcription}"`);

      // Сохраняем транскрипцию в историю сообщений
      addMessage(chatId, {
        ...senderInfo,
        message: transcription,
        text: transcription, // Дублируем текст в оба поля для надежности
        timestamp: Date.now(),
        messageType: 'audio'
      });

    } else if (msg.text) {
      // Это текстовое сообщение, сохраняем его в историю
      console.log(`Получено текстовое сообщение в чате ${chatId} от ${senderInfo.username}: "${msg.text.substring(0, 50)}${msg.text.length > 50 ? '...' : ''}"`);

      // Отладочная информация для пересланных сообщений
      if (senderInfo.isForwarded) {
        console.log(`Сообщение переслано от ${senderInfo.forwardedBy}, оригинальный отправитель: ${senderInfo.username}`);
      }

      addMessage(chatId, {
        ...senderInfo,
        message: msg.text,
        text: msg.text, // Дублируем текст в оба поля для надежности
        timestamp: Date.now()
      });
    } else {
      // Другие типы сообщений (фото, видео и т.д.)
      console.log(`Получено сообщение другого типа в чате ${chatId} от ${senderInfo.username}`);

      // Пытаемся извлечь подпись к медиа, если есть
      const mediaCaption = msg.caption || '[Медиа-контент]';

      addMessage(chatId, {
        ...senderInfo,
        message: mediaCaption,
        text: mediaCaption, // Дублируем текст в оба поля для надежности
        timestamp: Date.now(),
        messageType: msg.photo ? 'photo' : msg.video ? 'video' : 'other'
      });
    }
  } catch (error) {
    console.error('Ошибка при обработке сообщения:', error);
  }
}

// Функция для получения истории чата через telegram API
async function getChatHistory(ctx, chatId) {
  try {
    console.log(`Запрашиваем историю чата ${chatId} через Telegram API...`);

    // Получаем сообщения из истории чата через Telegram client API
    const historyMessages = await telegramClient.getChatHistory(chatId);

    if (historyMessages.length === 0) {
      console.log('История чата пуста или не удалось получить доступ');
      return;
    }

    console.log(`Получено ${historyMessages.length} сообщений из истории чата ${chatId}`);

    // Массив для хранения обработанных сообщений
    const processedMessages = [];

    // Обрабатываем полученные сообщения
    await processMessagesFromHistory(ctx, historyMessages, processedMessages);

    console.log(`Обработано ${processedMessages.length} сообщений из истории`);

    // Добавляем обработанные сообщения в хранилище
    processedMessages.forEach(msg => {
      addMessage(chatId, msg);
    });

    console.log('История чата успешно загружена и сохранена');
  } catch (error) {
    console.error('Ошибка при получении истории чата:', error);
    throw error;
  }
}

// Функция для обработки сообщений из истории
async function processMessagesFromHistory(ctx, messages, processedMessages) {
  for (const msg of messages) {
    // Пропускаем сообщения от ботов и системные сообщения
    if (msg.fromId && msg.fromId.className === 'PeerUser' && msg.message) {
      try {
        // Получаем информацию о пользователе
        const sender = await msg.getSender();
        const username = sender.firstName + (sender.lastName ? ' ' + sender.lastName : '');

        // Базовая информация о сообщении
        const baseMessage = {
          username: username,
          isForwarded: false,
          timestamp: msg.date * 1000, // Переводим UNIX-время в миллисекунды
          processed: false // Инициализируем флаг processed как false для новых сообщений
        };

        // Проверяем, является ли сообщение пересланным
        if (msg.fwdFrom) {
          baseMessage.isForwarded = true;

          // Сохраняем текущее имя пользователя как пересылающего
          baseMessage.forwardedBy = username;

          // Пытаемся получить информацию об оригинальном отправителе
          if (msg.fwdFrom.fromId) {
            try {
              const originalSender = await msg.fwdFrom.fromId.getEntity();
              // Обновляем имя пользователя на оригинального отправителя
              baseMessage.username = originalSender.firstName + (originalSender.lastName ? ' ' + originalSender.lastName : '');
            } catch (e) {
              baseMessage.username = 'Неизвестный пользователь';
            }
          } else if (msg.fwdFrom.fromName) {
            // Обновляем имя пользователя на оригинального отправителя
            baseMessage.username = msg.fwdFrom.fromName;
          } else {
            baseMessage.username = 'Неизвестный источник';
          }
        }

        // Обрабатываем аудиосообщения
        if (msg.media && msg.media.className === 'MessageMediaDocument' &&
          msg.media.document.mimeType && msg.media.document.mimeType.startsWith('audio/')) {
          // Это аудиосообщение, но мы не можем обработать его напрямую из истории
          // Просто добавляем заглушку
          processedMessages.push({
            ...baseMessage,
            message: '[Аудиосообщение из истории]',
            text: '[Аудиосообщение из истории]', // Добавляем дублирование в text
            messageType: 'audio'
          });
        } else if (msg.message) {
          // Это текстовое сообщение
          processedMessages.push({
            ...baseMessage,
            message: msg.message,
            text: msg.message // Добавляем дублирование в text
          });
        } else {
          // Другие типы сообщений (фото, видео и т.д.)
          const mediaCaption = msg.caption || '[Медиа-контент]';
          processedMessages.push({
            ...baseMessage,
            message: mediaCaption,
            text: mediaCaption, // Добавляем дублирование в text
            messageType: msg.photo ? 'photo' : msg.video ? 'video' : 'other'
          });
        }
      } catch (msgError) {
        console.error('Ошибка при обработке сообщения из истории:', msgError);
        // Добавим информацию о сообщении, которое вызвало ошибку
        try {
          console.error('Проблемное сообщение:', JSON.stringify({
            id: msg.id,
            fromId: msg.fromId,
            hasMessage: !!msg.message,
            hasMedia: !!msg.media
          }, null, 2));
        } catch (debugError) {
          console.error('Не удалось вывести дополнительную информацию о сообщении');
        }
      }
    }
  }
}

module.exports = {
  handleWtfCommand,
  handleMessage,
  getChatHistory
}; 