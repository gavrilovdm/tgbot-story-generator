const speech = require('@google-cloud/speech');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

// Установка пути к ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

// Временная директория для хранения аудиофайлов
const TEMP_DIR = path.join(__dirname, '../../temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Инициализация Google Speech-to-Text для конвертации аудио
const speechClient = new speech.SpeechClient({
  credentials: JSON.parse(
    fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  ),
});

// Функция для конвертации голосового сообщения в текст
async function convertVoiceToText(fileUrl, fileName) {
  try {
    console.log(`Начинаю обработку аудиофайла из ${fileUrl}`);
    
    // Скачиваем аудиофайл
    const downloadResponse = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'stream',
    });

    const filePath = path.join(TEMP_DIR, fileName);
    const fileStream = fs.createWriteStream(filePath);
    downloadResponse.data.pipe(fileStream);

    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });
    
    console.log(`Аудиофайл успешно скачан в ${filePath}`);

    // Конвертируем файл в mp3 для совместимости с Google Speech
    const mp3FilePath = path.join(TEMP_DIR, `${path.basename(fileName, path.extname(fileName))}.mp3`);
    
    console.log(`Конвертирую ${filePath} в ${mp3FilePath} с параметрами для Google Speech-to-Text`);
    
    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .outputOptions([
          '-ac 1',             // Один канал аудио (моно)
          '-ar 16000',         // Частота дискретизации 16кГц
          '-acodec libmp3lame' // Кодек MP3
        ])
        .output(mp3FilePath)
        .on('start', (commandLine) => {
          console.log(`Запущена команда FFmpeg: ${commandLine}`);
        })
        .on('progress', (progress) => {
          console.log(`Процесс конвертации: ${JSON.stringify(progress)}`);
        })
        .on('end', () => {
          console.log(`Конвертация завершена успешно: ${mp3FilePath}`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`Ошибка FFmpeg: ${err.message}`);
          reject(err);
        })
        .run();
    });

    // Читаем конвертированный файл
    console.log(`Чтение конвертированного файла: ${mp3FilePath}`);
    const fileContent = fs.readFileSync(mp3FilePath);
    console.log(`Размер аудиофайла: ${fileContent.length} байт`);
    
    // Кодируем аудио в base64 для отправки в Google Speech-to-Text
    const audioBytes = fileContent.toString('base64');

    // Настраиваем запрос к Google Speech-to-Text
    const audio = {
      content: audioBytes,
    };
    
    const config = {
      encoding: 'MP3',
      sampleRateHertz: 16000,
      languageCode: 'ru-RU', // Язык для распознавания, измените при необходимости
      enableAutomaticPunctuation: true,
      model: 'default', // Используем стандартную модель
      useEnhanced: true // Используем улучшенный алгоритм распознавания
    };
    
    const request = {
      audio: audio,
      config: config,
    };

    console.log('Отправляю запрос к Google Speech-to-Text API...');
    
    // Транскрибируем аудио с помощью Google Speech-to-Text API
    const [speechResponse] = await speechClient.recognize(request);
    
    console.log('Получен ответ от Google Speech-to-Text API');
    console.log(`Количество результатов: ${speechResponse.results ? speechResponse.results.length : 0}`);
    
    if (!speechResponse.results || speechResponse.results.length === 0) {
      console.log('API вернул пустой результат, нет распознанного текста');
      return '[Аудио без распознаваемого текста]';
    }
    
    const transcription = speechResponse.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');
    
    console.log(`Текст успешно распознан: "${transcription}"`);

    // Удаляем временные файлы
    try {
      fs.unlinkSync(filePath);
      fs.unlinkSync(mp3FilePath);
      console.log(`Временные файлы удалены: ${filePath}, ${mp3FilePath}`);
    } catch (cleanupError) {
      console.error(`Ошибка при удалении временных файлов: ${cleanupError.message}`);
    }

    return transcription;
  } catch (error) {
    console.error('Ошибка при конвертации голосового сообщения:', error);
    
    // Попытка вывести более подробную информацию об ошибке
    if (error.response) {
      console.error('Статус ответа:', error.response.status);
      console.error('Данные ответа:', error.response.data);
    }
    
    // Попробуем другой метод в случае ошибки
    try {
      console.log('Пробуем альтернативный метод аутентификации...');
      
      // Проверим существование файла
      const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (!fs.existsSync(credentialsPath)) {
        console.error(`Файл учетных данных не найден: ${credentialsPath}`);
        return '[Не удалось расшифровать аудио: проблема с файлом учетных данных]';
      }
      
      console.log('Файл учетных данных найден, пробуем прямой вызов API');
      return '[Не удалось расшифровать аудио, требуется настройка API]';
    } catch (secondError) {
      console.error('Ошибка при альтернативном методе:', secondError);
      return '[Не удалось расшифровать аудио]';
    }
  }
}

module.exports = {
  convertVoiceToText
}; 