# Telegram Reddit Bot

A powerful Telegram bot that integrates with Reddit, featuring AI chat capabilities, voice/text conversion, and translation services.

## Features

- Reddit posting and commenting
- AI Chat (DeepSeek and Mistral)
- Voice-to-text conversion
- Text-to-speech conversion
- Text translation
- Subreddit rules reading
- Trending posts viewing
- Multi-language support

## Setup

1. Create a virtual environment:
```bash
python -m venv .venv
```

2. Activate the virtual environment:
- Windows:
```bash
.venv\Scripts\activate
```
- Linux/Mac:
```bash
source .venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file with your API keys:
```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
REDDIT_USERNAME=your_reddit_username
REDDIT_PASSWORD=your_reddit_password
DEEPSEEK_API_KEY=your_deepseek_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
```

5. Run the bot:
```bash
python newestoizotest.py
```

## Available Commands

- `/start` - Initialize bot
- `/commands` - Show all features
- `/post [subreddit] [title] [content]` - Post to Reddit
- `/auto_comment [subreddit]` - Auto-comment system
- `/voice` - Voice-to-text (Google)
- `/text_to_voice [lang] [text]` - Generate speech
- `/deepseek [query]` - DeepSeek AI chat
- `/chat [query]` - Mistral AI chat
- `/translate [src] [dest] [text]` - Translate text
- `/languages` - Show language codes
- `/install_language` - Install language package
- `/rules [subreddit]` - Get subreddit rules
- `/trending [subreddit] [limit]` - Get trending posts

## Rate Limits

- Reddit posts: 5 per hour
- Auto-comments: 10 per hour
- Voice-to-text: 20 per hour

## Error Handling

The bot includes comprehensive error handling for:
- API failures
- Network issues
- Invalid inputs
- Rate limiting
- Subreddit access

## Contributing

Feel free to submit issues and enhancement requests! 