# ЕНТ / ҰБТ Тренажёр

Веб-приложение для подготовки к ЕНТ. Статический сайт — работает на GitHub Pages без сервера.

## Структура проекта

```
ent-test/
├── index.html              ← точка входа
├── css/
│   └── style.css           ← стили (тёмная + светлая тема)
├── js/
│   ├── i18n.js             ← переводы RU / KZ
│   └── app.js              ← основная логика
├── data/
│   ├── index.json          ← реестр предметов и вариантов
│   ├── ru/                 ← варианты на русском
│   │   └── informatika/
│   │       └── variant-1.json
│   └── kz/                 ← варианты на казахском
│       └── informatika/
│           └── variant-1.json
└── README.md
```

## Как добавить новый вариант

### 1. Положите JSON-файл в нужную папку

Например, новый вариант по информатике на русском:
```
data/ru/informatika/variant-2.json
```

### 2. Обновите `data/index.json`

Добавьте имя файла (без .json) в массив `variants`:

```json
{
  "ru": {
    "Информатика": {
      "folder": "informatika",
      "variants": ["variant-1", "variant-2"]
    }
  }
}
```

### 3. Как добавить новый предмет

Создайте папку и обновите index.json:

```
data/ru/biologiya/variant-1.json
data/kz/biologiya/variant-1.json
```

```json
{
  "ru": {
    "Информатика": { "folder": "informatika", "variants": ["variant-1"] },
    "Биология": { "folder": "biologiya", "variants": ["variant-1"] }
  },
  "kz": {
    "Информатика": { "folder": "informatika", "variants": ["variant-1"] },
    "Биология": { "folder": "biologiya", "variants": ["variant-1"] }
  }
}
```

## Формат JSON-вопроса

Все типы заданий используют одну и ту же структуру. Неиспользуемые поля = `null`.

```json
{
  "id": "inf-5001",
  "subject": "Информатика",
  "lang": "ru",
  "type": "single | context | matching | multiple",
  "difficulty": "A | B | C",
  "context": "Текст контекста (для context) или null",
  "extra_content": null,
  "question": "Текст задания",
  "left_column": null,
  "right_column": null,
  "options": ["A", "B", "C", "D"],
  "correct": 0,
  "explanation": "Пояснение",
  "source": "Источник",
  "topic": "Тема",
  "author": "NotebookLM Expert"
}
```

### Поле `extra_content`

Для вопросов с кодом, таблицей или изображением:

**Код:**
```json
"extra_content": {
  "type": "code",
  "language": "python",
  "content": "a = 5\nb = 3\nprint(a + b)"
}
```

**Таблица (markdown):**
```json
"extra_content": {
  "type": "table",
  "content": "| Столбец 1 | Столбец 2 |\n|---|---|\n| A | B |"
}
```

**Изображение:**
```json
"extra_content": {
  "type": "image",
  "content": "images/diagram1.png"
}
```

## Деплой на GitHub Pages

1. Создайте репозиторий на GitHub
2. Загрузите все файлы проекта
3. Settings → Pages → Source: `main` branch, folder: `/ (root)`
4. Сайт будет доступен по адресу: `https://username.github.io/repo-name/`

## Оценивание

| Вопросы | Тип | Макс. балл | Логика |
|---------|-----|-----------|--------|
| 1–25 | single | 1 | Правильно = 1, иначе 0 |
| 26–30 | context | 1 | Правильно = 1, иначе 0 |
| 31–35 | matching | 2 | По 1 баллу за каждую верную пару |
| 36–40 | multiple | 2 | 2 − кол-во ошибок (мин. 0) |