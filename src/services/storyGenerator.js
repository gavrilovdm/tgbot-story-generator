const Anthropic = require('@anthropic-ai/sdk');

// Инициализация Anthropic API для генерации текста
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_KEY,
});

// Функция для генерации рассказа на основе сообщений
async function generateStory(messages) {
  try {
    console.log(`Начинаю генерацию рассказа на основе ${messages.length} сообщений`);

    // Проверка входных данных
    if (!Array.isArray(messages)) {
      console.error('Ошибка: messages не является массивом');
      return "Произошла ошибка при обработке сообщений. Пожалуйста, сообщите администратору.";
    }

    // Фильтруем сообщения, которые еще не были обработаны
    const unprocessedMessages = messages.filter(msg => !msg.processed);
    console.log(`Найдено ${unprocessedMessages.length} необработанных сообщений из ${messages.length} всего`);

    // Если новых сообщений нет, возвращаем сообщение об ошибке
    if (unprocessedMessages.length === 0) {
      return "Не удалось сгенерировать рассказ: нет новых сообщений со времени последнего запроса.";
    }

    // Вывод информации о первых нескольких сообщениях для отладки
    console.log('Примеры сообщений:');
    for (let i = 0; i < Math.min(3, unprocessedMessages.length); i++) {
      const debugMsg = unprocessedMessages[i];
      console.log(`Сообщение ${i}:`,
        'username:', debugMsg.username,
        'message:', debugMsg.message,
        'text:', debugMsg.text,
        'isForwarded:', debugMsg.isForwarded,
        (debugMsg.isForwarded ? 'forwardedBy: ' + debugMsg.forwardedBy : ''),
        'messageType:', debugMsg.messageType
      );
    }

    // Фильтруем сообщения, чтобы исключить команды wtf и их вариации
    const filteredMessages = unprocessedMessages.filter(msg => {
      // Проверяем, есть ли текст сообщения (может быть в поле message или text)
      const messageText = msg.message || msg.text;

      // Если сообщение не содержит текст, просто пропускаем его
      if (!messageText) {
        console.log(`Пропускаю сообщение без текста от ${msg.username || 'неизвестного пользователя'}`);
        return false;
      }

      // Проверяем текст сообщения и исключаем все вариации wtf
      const text = messageText.toLowerCase();

      // Исключаем сообщения, которые могут быть командой wtf
      if (text === 'wtf' ||
        text === '/wtf' ||
        text.startsWith('/wtf@') ||
        text.includes('wtf') && (text.startsWith('@') || text.includes('@wtf'))) {
        console.log(`Исключаю команду wtf из промпта: "${messageText}" от ${msg.username || 'неизвестного пользователя'}`);
        return false;
      }

      return true;
    });

    console.log(`После фильтрации осталось ${filteredMessages.length} сообщений (исключено ${unprocessedMessages.length - filteredMessages.length} сообщений с wtf)`);

    // Если после фильтрации не осталось сообщений, возвращаем сообщение об ошибке
    if (filteredMessages.length === 0) {
      return "Не удалось сгенерировать рассказ: в чате присутствуют только команды wtf, но нет содержательных сообщений для анализа.";
    }

    // Группируем сообщения по пользователям
    const userMessages = {};
    filteredMessages.forEach(msg => {
      const username = msg.username || 'Неизвестный пользователь';
      if (!userMessages[username]) {
        userMessages[username] = [];
      }
      userMessages[username].push(msg.message || msg.text);
    });

    // Формируем список участников дискуссии
    const participants = Object.keys(userMessages);
    console.log(`Участники дискуссии: ${participants.join(', ')}`);

    // Сокращаем количество сообщений, если их слишком много для запроса к API
    let messagesToProcess = filteredMessages;
    if (filteredMessages.length > 50) {
      console.log(`Слишком много сообщений (${filteredMessages.length}), сокращаем до 50`);
      // Берем первые 20 и последние 30 сообщений для сохранения контекста
      messagesToProcess = [
        ...filteredMessages.slice(0, 20),
        ...filteredMessages.slice(filteredMessages.length - 30)
      ];
    }

    // Формируем промпт для Anthropic API
    const messagesText = messagesToProcess.map(msg => {
      const messageText = msg.message || msg.text || '[Нет текста]';
      // Если сообщение было переслано, добавляем информацию об этом
      if (msg.isForwarded) {
        return `${msg.username} (переслано от ${msg.forwardedBy || 'неизвестного отправителя'}): ${messageText}`;
      } else {
        return `${msg.username || 'Неизвестный пользователь'}: ${messageText}`;
      }
    }).join('\n');

    const systemPrompt = "Ты талантливый писатель со знанием встратых мемов и шарящий за суровую жизнь в снг, который умеет создавать рассказы на основе фрагментов обсуждений из чата. Ты пишешь с юмором и глубоким пониманием человеческой психологии. Ты босс этой качалки. Конструктив и вежливость - не про тебя. Ты любишь жестить, язвить и иронировать с матерными NSFW словами. ВАЖНО: НИКОГДА не начинай текст с дисклеймеров, предупреждений о содержании или извинений за ненормативную лексику. Пиши как натуральный рассказчик без морализаторства и предупреждений.";

    const userPrompt = `
    На основе следующих сообщений из чата за последние 12 часов:
    
    ${messagesText}

    ВАЖНО: 
    1. Некоторые сообщения могут быть пересланы от других пользователей. В этом случае приписывай содержание сообщения оригинальному автору, а не тому, кто переслал сообщение.
    2. По желанию, в зависимости от контекста дискуссии, с целью большей иронии и юмора, имена участников можно заменять и коверкать.
    3. НЕ копируй сообщения дословно, а используй их как основу для создания связного рассказа. Выделяй основные темы и направление дискуссии.
    4. Стилизуй текст как короткий увлекательный рассказ от третьего лица о том, что происходило в этом чате.
    5. Старайся отразить отношения и взаимодействия между участниками, их характерные особенности.
    6. По возможности используй игру слов, метафоры и другие литературные приемы для придания тексту яркости.
    7. Не упоминай что это "рассказ на основе сообщений из чата" или подобные фразы.
    8. Текст может быть 300-1500 символов.
    
    Сочини увлекательный рассказ от третьего лица о том, что происходило в этом чате:`;

    console.log(`Отправляю запрос к Anthropic API с текстом длиной ${userPrompt.length} символов`);

    // Добавим отладочную информацию о нескольких обработанных сообщениях
    console.log('Примеры обработанных сообщений для отправки в API:');
    for (let i = 0; i < Math.min(5, messagesToProcess.length); i++) {
      const debugMsg = messagesToProcess[i];
      console.log(`Сообщение ${i}:`,
        'username:', debugMsg.username,
        'message:', debugMsg.message,
        'text:', debugMsg.text,
        'isForwarded:', debugMsg.isForwarded,
        (debugMsg.isForwarded ? 'forwardedBy: ' + debugMsg.forwardedBy : '')
      );
    }

    // Вызов API Anthropic для генерации рассказа
    const completion = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      system: systemPrompt,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    // Получаем сгенерированный текст и возвращаем его
    let generatedText = completion.content[0].text;
    console.log(`Успешно сгенерирован рассказ длиной ${generatedText.length} символов`);

    // Помечаем все обработанные сообщения как processed
    unprocessedMessages.forEach(msg => {
      msg.processed = true;
    });

    console.log(`Помечено ${unprocessedMessages.length} сообщений как обработанные`);

    return generatedText;
  } catch (error) {
    console.error('Ошибка при генерации рассказа:', error);

    // Выводим дополнительную отладочную информацию
    if (error instanceof TypeError && error.message.includes('undefined')) {
      console.error('Ошибка связана с обращением к несуществующему свойству объекта.');
      console.error('Стек вызовов:', error.stack);
    }

    if (error.status === 429) {
      return "Извините, не удалось сгенерировать рассказ из-за превышения лимитов Anthropic API. Пожалуйста, попробуйте позже.";
    }

    if (error.status === 400) {
      return "Не удалось сгенерировать рассказ: слишком большой объем сообщений для обработки. Попробуйте после того, как активность в чате снизится.";
    }

    return "Извините, произошла ошибка при создании рассказа. Пожалуйста, попробуйте позже.";
  }
}

module.exports = {
  generateStory
}; 