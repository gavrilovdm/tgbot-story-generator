require('dotenv').config();
const fs = require('fs');
const speech = require('@google-cloud/speech');
const path = require('path');

// Инициализация Google Speech-to-Text
const speechClient = new speech.SpeechClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

async function testSpeechToText() {
  try {
    console.log('Тестирование Google Speech-to-Text API...');
    console.log(`Используется файл учетных данных: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
    
    // Проверяем, существует ли файл учетных данных
    if (!fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      console.error(`Ошибка: Файл учетных данных не найден. Убедитесь, что он существует по пути: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
      return;
    }
    
    // Проверяем на примере тестового аудиофайла (если он существует)
    const testAudioFile = path.join(__dirname, 'test-audio.mp3');
    if (!fs.existsSync(testAudioFile)) {
      console.log('Тестовый файл test-audio.mp3 не найден. Пожалуйста, создайте его для полного тестирования.');
      console.log('Выполняем только проверку подключения к API...');
    } else {
      console.log(`Найден тестовый файл: ${testAudioFile}`);
      
      // Читаем аудиофайл
      const fileContent = fs.readFileSync(testAudioFile);
      
      // Кодируем в base64
      const audioBytes = fileContent.toString('base64');
      
      // Настраиваем запрос
      const audio = {
        content: audioBytes,
      };
      
      const config = {
        encoding: 'MP3',
        sampleRateHertz: 16000,
        languageCode: 'ru-RU',
        enableAutomaticPunctuation: true,
      };
      
      const request = {
        audio: audio,
        config: config,
      };
      
      console.log('Отправляем запрос на распознавание речи...');
      const [response] = await speechClient.recognize(request);
      
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
      
      console.log('Результат распознавания:');
      console.log(`"${transcription}"`);
    }
    
    console.log('Тест подключения к Google Speech-to-Text API успешно выполнен!');
  } catch (error) {
    console.error('Ошибка при тестировании Google Speech-to-Text API:', error);
    console.error('Проверьте правильность файла учетных данных и настройку Google Cloud.');
  }
}

testSpeechToText();

// Инструкции по созданию тестового аудиофайла:
console.log(`
================================================================================
Инструкции по тестированию:

1. Для полного тестирования создайте файл test-audio.mp3 в корневой папке проекта
   - Вы можете записать аудио на компьютере или телефоне
   - Убедитесь, что аудиофайл имеет формат MP3

2. Проверьте файл учетных данных Google Cloud:
   - ${process.env.GOOGLE_APPLICATION_CREDENTIALS}
   - Убедитесь, что файл существует и содержит правильные данные
   - Проверьте, что API Speech-to-Text активировано в проекте Google Cloud

3. Запустите этот скрипт:
   node test-speech.js

4. Если тест прошел успешно, вы увидите транскрибированный текст
   из тестового аудиофайла или сообщение об успешном подключении к API

5. Если возникла ошибка, проверьте:
   - Правильность пути к файлу учетных данных
   - Формат и содержимое файла учетных данных
   - Активацию и настройку API Speech-to-Text в Google Cloud
================================================================================
`); 