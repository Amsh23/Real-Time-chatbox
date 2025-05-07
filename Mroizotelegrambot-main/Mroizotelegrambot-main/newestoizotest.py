# ✅ This is a unified single-file implementation that integrates all capabilities.
# It extends your base code with added support for saving message history (SQLite)
# and language listing using `googletrans`, all in one file.
"""
Telegram Bot with Reddit Integration, AI Chat, Voice/Text Conversion, and Translation.
Features:
- Reddit posting and commenting
- AI Chat (DeepSeek and Mistral)
- Voice-to-text conversion (Google and OpenRouter)
- Text-to-speech conversion
- Text translation
- Multi-language support
"""

import os
import sys

import asyncio
import logging
import praw
import aiohttp
import nest_asyncio
import schedule
import sqlite3
from dotenv import load_dotenv
from gtts import gTTS
from io import BytesIO
from telegram import Update, BotCommand
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
import speech_recognition as sr
from googletrans import Translator, LANGUAGES
import time
from functools import wraps
from datetime import datetime, timedelta

try:
    import argostranslate.package
    import argostranslate.translate
except ImportError:
    logging.warning("Argostranslate not installed. Translation features will be limited.")

from telegram.error import NetworkError, TimedOut, RetryAfter
import socket
import backoff

# ---- Setup ----
nest_asyncio.apply()
logging.basicConfig(level=logging.INFO)
load_dotenv()

# ---- Environment Variables ----
ENV_VARS = {
    "TOKEN": os.getenv("TELEGRAM_BOT_TOKEN"),
    "REDDIT_CLIENT_ID": os.getenv("REDDIT_CLIENT_ID"),
    "REDDIT_CLIENT_SECRET": os.getenv("REDDIT_CLIENT_SECRET"),
    "REDDIT_USERNAME": os.getenv("REDDIT_USERNAME"),
    "REDDIT_PASSWORD": os.getenv("REDDIT_PASSWORD"),
    "DEEPSEEK_API_KEY": os.getenv("DEEPSEEK_API_KEY"),
    "OPENROUTER_API_KEY": os.getenv("OPENROUTER_API_KEY")
}

for var, val in ENV_VARS.items():
    if not val:
        raise ValueError(f"Missing environment variable: {var}")

# ---- Reddit Client ----
reddit = praw.Reddit(
    client_id=ENV_VARS["REDDIT_CLIENT_ID"],
    client_secret=ENV_VARS["REDDIT_CLIENT_SECRET"],
    username=ENV_VARS["REDDIT_USERNAME"],
    password=ENV_VARS["REDDIT_PASSWORD"],
    user_agent="telegram_reddit_bot"
)

# ---- SQLite Database ----
def init_db():
    conn = sqlite3.connect("bot.db")
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS messages (user_id INTEGER, message TEXT)""")
    conn.commit()
    conn.close()

def save_message(user_id, message):
    conn = sqlite3.connect("bot.db")
    c = conn.cursor()
    c.execute("INSERT INTO messages VALUES (?, ?)", (user_id, message))
    conn.commit()
    conn.close()

COMMENT_INTERVAL = 1200  # 20 minutes

# Rate limiting
RATE_LIMIT = {
    "reddit_post": {"count": 0, "last_reset": time.time(), "limit": 5, "window": 3600},  # 5 posts per hour
    "auto_comment": {"count": 0, "last_reset": time.time(), "limit": 10, "window": 3600},  # 10 comments per hour
    "voice_to_text": {"count": 0, "last_reset": time.time(), "limit": 20, "window": 3600},  # 20 conversions per hour
    "auto_post": {"count": 0, "last_reset": time.time(), "limit": 3, "window": 3600},  # 3 auto-posts per hour
}

def rate_limit(limit_type):
    def decorator(func):
        @wraps(func)
        async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args, **kwargs):
            current_time = time.time()
            limit_info = RATE_LIMIT[limit_type]
            
            # Reset counter if window has passed
            if current_time - limit_info["last_reset"] > limit_info["window"]:
                limit_info["count"] = 0
                limit_info["last_reset"] = current_time
            
            # Check if limit exceeded
            if limit_info["count"] >= limit_info["limit"]:
                remaining = int(limit_info["window"] - (current_time - limit_info["last_reset"]))
                await update.message.reply_text(
                    f"⚠️ Rate limit exceeded. Please wait {remaining} seconds before trying again."
                )
                return
            
            limit_info["count"] += 1
            return await func(update, context, *args, **kwargs)
        return wrapper
    return decorator

async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle errors gracefully"""
    error = context.error
    logging.error(f"Error occurred: {error}")
    
    error_message = "❌ An error occurred. Please try again later."
    if isinstance(error, praw.exceptions.RedditAPIException):
        error_message = f"❌ Reddit API Error: {error.message}"
    elif isinstance(error, aiohttp.ClientError):
        error_message = "❌ Network error. Please check your connection."
    
    if update and update.effective_message:
        await update.effective_message.reply_text(error_message)

# ---- Command Definitions ----
COMMANDS = [
    BotCommand("start", "Initialize bot"),
    BotCommand("commands", "Show all features"),
    BotCommand("post", "Reddit post"),
    BotCommand("auto_comment", "Auto-comment system"),
    BotCommand("voice", "Voice-to-text (Google)"),
    BotCommand("text_to_voice", "Generate speech"),
    BotCommand("deepseek", "DeepSeek AI chat"),
    BotCommand("chat", "Mistral AI chat"),
    BotCommand("translate", "Translate text"),
    BotCommand("languages", "Language codes"),
    BotCommand("install_language", "Install language package"),
    BotCommand("rules", "Get subreddit rules"),
    BotCommand("trending", "Get trending posts"),
    BotCommand("auto_post", "Auto-post based on trends")
]

# ---- Command Functions ----
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("🤖 Welcome! Use /commands for features")

async def command_panel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    descs = [f"/{cmd.command} - {cmd.description}" for cmd in COMMANDS]
    await update.message.reply_text("\n".join(descs))

@rate_limit("reddit_post")
async def reddit_post_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 3:
        await update.message.reply_text("❌ Format: /post subreddit title content")
        return
    sub, title, content = context.args[0], context.args[1], " ".join(context.args[2:])
    try:
        subreddit = reddit.subreddit(sub)
        # Check if subreddit exists
        if not subreddit.id:
            await update.message.reply_text(f"❌ Subreddit r/{sub} does not exist")
            return
        # Check if user can post
        if not subreddit.user_is_subscriber:
            await update.message.reply_text(f"❌ You need to subscribe to r/{sub} to post")
            return
        reddit.subreddit(sub).submit(title, selftext=content)
        await update.message.reply_text(f"✅ Posted to r/{sub}")
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {str(e)}")

async def generate_comment(title, content):
    headers = {
        "Authorization": f"Bearer {ENV_VARS['OPENROUTER_API_KEY']}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "mistralai/mistral-7b-instruct",
        "messages": [
            {"role": "system", "content": "Generate relevant Reddit comment"},
            {"role": "user", "content": f"Post: {title}\n{content}"}
        ]
    }
    async with aiohttp.ClientSession() as session:
        async with session.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload) as res:
            data = await res.json()
            return data['choices'][0]['message']['content']

@rate_limit("auto_comment")
async def start_auto_comment(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("❌ Format: /auto_comment subreddit")
        return
    sub = context.args[0]
    try:
        subreddit = reddit.subreddit(sub)
        if not subreddit.id:
            await update.message.reply_text(f"❌ Subreddit r/{sub} does not exist")
            return
        if not subreddit.user_is_subscriber:
            await update.message.reply_text(f"❌ You need to subscribe to r/{sub} to comment")
            return
        async def task():
            while True:
                try:
                    post = next(reddit.subreddit(sub).new(limit=1))
                    comment = await generate_comment(post.title, post.selftext)
                    if comment:
                        post.reply(comment)
                        logging.info(f"💬 Commented on {post.id}")
                except StopIteration:
                    logging.info(f"No new posts in r/{sub}")
                except Exception as e:
                    logging.error(f"Auto-comment error: {str(e)}")
                await asyncio.sleep(COMMENT_INTERVAL)
        asyncio.create_task(task())
        await update.message.reply_text(f"🔄 Auto-commenting on r/{sub}")
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {str(e)}")

async def deepseek_query(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("❌ Format: /deepseek question")
        return
    headers = {"Authorization": f"Bearer {ENV_VARS['DEEPSEEK_API_KEY']}"}
    payload = {"question": " ".join(context.args)}
    async with aiohttp.ClientSession() as session:
        async with session.post("https://api.deepseek.com/v1/ask", headers=headers, json=payload) as res:
            data = await res.json()
            await update.message.reply_text(data.get("answer", "⚠️ No response"))

async def mistral_chat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("❌ Format: /chat question")
        return
    headers = {
        "Authorization": f"Bearer {ENV_VARS['OPENROUTER_API_KEY']}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "mistralai/mistral-7b-instruct",
        "messages": [
            {"role": "user", "content": " ".join(context.args)}
        ]
    }
    async with aiohttp.ClientSession() as session:
        async with session.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload) as res:
            data = await res.json()
            await update.message.reply_text(data['choices'][0]['message']['content'])

@rate_limit("voice_to_text")
async def google_voice_to_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message.voice:
        await update.message.reply_text("❌ Send a voice message")
        return
    try:
        file = await update.message.voice.get_file()
        buffer = BytesIO()
        await file.download_to_memory(out=buffer)
        buffer.seek(0)
        recognizer = sr.Recognizer()
        with sr.AudioFile(buffer) as source:
            audio = recognizer.record(source)
            text = recognizer.recognize_google(audio)
            await update.message.reply_text(f"🔊 Transcription: {text}")
    except sr.UnknownValueError:
        await update.message.reply_text("❌ Could not understand audio")
    except sr.RequestError as e:
        await update.message.reply_text(f"❌ Google Speech API error: {str(e)}")
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {str(e)}")

async def text_to_speech(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 2:
        await update.message.reply_text("❌ Format: /text_to_voice lang text")
        return
    lang, text = context.args[0], " ".join(context.args[1:])
    tts = gTTS(text, lang=lang)
    buffer = BytesIO()
    tts.write_to_fp(buffer)
    buffer.seek(0)
    await update.message.reply_voice(voice=buffer)

async def install_language(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 3:
        await update.message.reply_text("❌ Format: /translate src dest text")
        return
    src, dest = context.args[0], context.args[1]
    text = " ".join(context.args[2:])
    try:
        argostranslate.package.update_package_index()
        packages = argostranslate.package.get_available_packages()
        for pkg in packages:
            if pkg.from_code == src and pkg.to_code == dest:
                path = pkg.download()
                argostranslate.package.install_from_path(path)
                break
        installed = argostranslate.translate.get_installed_languages()
        from_lang = next((l for l in installed if l.code == src), None)
        to_lang = next((l for l in installed if l.code == dest), None)
        if from_lang and to_lang:
            translation = from_lang.get_translation(to_lang)
            translated = translation.translate(text)
            await update.message.reply_text(f"🌍 {translated}")
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {str(e)}")

async def show_languages(update: Update, context: ContextTypes.DEFAULT_TYPE):
    langs = [f"{code} - {name}" for code, name in LANGUAGES.items()]
    await update.message.reply_text("\n".join(langs))

async def get_subreddit_rules(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Get rules for a specific subreddit"""
    if not context.args:
        await update.message.reply_text("❌ Format: /rules subreddit")
        return
    
    subreddit_name = context.args[0]
    try:
        subreddit = reddit.subreddit(subreddit_name)
        rules = subreddit.rules
        
        if not rules:
            await update.message.reply_text(f"ℹ️ No rules found for r/{subreddit_name}")
            return
            
        rules_text = f"📜 Rules for r/{subreddit_name}:\n\n"
        for rule in rules:
            rules_text += f"• {rule.short_name}\n"
            if rule.description:
                rules_text += f"  {rule.description}\n\n"
        
        # Split message if too long
        if len(rules_text) > 4000:
            chunks = [rules_text[i:i+4000] for i in range(0, len(rules_text), 4000)]
            for chunk in chunks:
                await update.message.reply_text(chunk)
        else:
            await update.message.reply_text(rules_text)
            
    except Exception as e:
        await update.message.reply_text(f"❌ Error getting rules: {str(e)}")

async def get_trending_posts(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Get trending posts from a subreddit"""
    if not context.args:
        await update.message.reply_text("❌ Format: /trending subreddit [limit]")
        return
    
    subreddit_name = context.args[0]
    limit = 5  # Default limit
    if len(context.args) > 1:
        try:
            limit = int(context.args[1])
        except ValueError:
            await update.message.reply_text("❌ Limit must be a number")
            return
    
    try:
        subreddit = reddit.subreddit(subreddit_name)
        trending = subreddit.hot(limit=limit)
        
        response = f"🔥 Trending in r/{subreddit_name}:\n\n"
        for post in trending:
            response += f"📌 {post.title}\n"
            response += f"👥 Score: {post.score} | 💬 Comments: {post.num_comments}\n"
            response += f"🔗 https://reddit.com{post.permalink}\n\n"
        
        # Split message if too long
        if len(response) > 4000:
            chunks = [response[i:i+4000] for i in range(0, len(response), 4000)]
            for chunk in chunks:
                await update.message.reply_text(chunk)
        else:
            await update.message.reply_text(response)
            
    except Exception as e:
        await update.message.reply_text(f"❌ Error getting trending posts: {str(e)}")

async def analyze_rules_and_generate_content(subreddit_name: str, trending_post_data: dict) -> tuple[str, str]:
    """Analyze subreddit rules and generate compliant content based on trending posts"""
    try:
        subreddit = reddit.subreddit(subreddit_name)
        rules = subreddit.rules
        
        # Format rules for AI
        rules_text = "Subreddit rules:\n"
        for rule in rules:
            rules_text += f"- {rule.short_name}: {rule.description}\n"
        
        # Prepare trending post data for AI
        trend_text = f"Trending post info:\nTitle: {trending_post_data['title']}\nScore: {trending_post_data['score']}\nTopics: {trending_post_data['topics']}\n"
        
        # Ask AI to generate compliant content
        headers = {
            "Authorization": f"Bearer {ENV_VARS['OPENROUTER_API_KEY']}",
            "Content-Type": "application/json"
        }
        
        prompt = f"""Given these subreddit rules and trending post data, generate a new Reddit post that:
        1. Follows all subreddit rules strictly
        2. Is inspired by but not copying the trending content
        3. Is original and engaging
        
        {rules_text}
        
        {trend_text}
        
        Generate a title and content that would be appropriate and successful in this subreddit.
        Format: TITLE: <title>
        CONTENT: <content>"""
        
        payload = {
            "model": "mistralai/mistral-7b-instruct",
            "messages": [
                {"role": "system", "content": "You are a Reddit content creator who understands subreddit rules and creates engaging, compliant content."},
                {"role": "user", "content": prompt}
            ]
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload) as res:
                data = await res.json()
                response = data['choices'][0]['message']['content']
                
                # Parse AI response
                title_start = response.find("TITLE: ") + 7
                content_start = response.find("CONTENT: ") + 9
                title = response[title_start:response.find("\n", title_start)].strip()
                content = response[content_start:].strip()
                
                return title, content
                
    except Exception as e:
        logging.error(f"Error in content generation: {str(e)}")
        raise

@rate_limit("auto_post")
async def start_auto_posting(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Start auto-posting based on trending posts"""
    if not context.args or len(context.args) < 2:
        await update.message.reply_text("❌ Format: /auto_post subreddit interval_minutes")
        return
    
    subreddit_name = context.args[0]
    try:
        interval_minutes = int(context.args[1])
        if interval_minutes < 30:  # Minimum 30 minutes between posts
            await update.message.reply_text("⚠️ Minimum interval is 30 minutes")
            return
    except ValueError:
        await update.message.reply_text("❌ Interval must be a number in minutes")
        return
        
    try:
        subreddit = reddit.subreddit(subreddit_name)
        # Verify subreddit exists and we can post
        if not subreddit.id:
            await update.message.reply_text(f"❌ Subreddit r/{subreddit_name} does not exist")
            return
        if not subreddit.user_is_subscriber:
            await update.message.reply_text(f"❌ Need to subscribe to r/{subreddit_name} first")
            return
            
        async def posting_task():
            while True:
                try:
                    # Get trending posts
                    trending_posts = list(subreddit.hot(limit=5))
                    if not trending_posts:
                        logging.info(f"No trending posts found in r/{subreddit_name}")
                        continue
                        
                    # Analyze top trending post
                    top_post = trending_posts[0]
                    trend_data = {
                        "title": top_post.title,
                        "score": top_post.score,
                        "topics": [p.title for p in trending_posts[1:3]]  # Get topics from other top posts
                    }
                    
                    # Generate compliant content
                    title, content = await analyze_rules_and_generate_content(subreddit_name, trend_data)
                    
                    # Post content
                    submission = subreddit.submit(title, selftext=content)
                    logging.info(f"✅ Posted to r/{subreddit_name}: {submission.id}")
                    
                except Exception as e:
                    logging.error(f"Auto-posting error: {str(e)}")
                    
                await asyncio.sleep(interval_minutes * 60)
                
        # Start the posting task
        asyncio.create_task(posting_task())
        await update.message.reply_text(
            f"🔄 Auto-posting started in r/{subreddit_name}\n"
            f"📊 Interval: {interval_minutes} minutes\n"
            "ℹ️ Bot will analyze rules and trends before each post"
        )
        
    except Exception as e:
        await update.message.reply_text(f"❌ Error starting auto-posting: {str(e)}")

MAX_RETRIES = 3
INITIAL_RETRY_DELAY = 1
MAX_RETRY_DELAY = 30

def network_retry_handler(details):
    """Log retry attempts"""
    logging.warning(f"Network error, retry attempt {details['tries']}")

@backoff.on_exception(
    backoff.expo,
    (NetworkError, TimedOut, socket.error, aiohttp.ClientError),
    max_tries=MAX_RETRIES,
    max_time=60,
    on_backoff=network_retry_handler
)
async def retry_api_call(func, *args, **kwargs):
    """Wrapper for API calls that implements retry logic"""
    try:
        return await func(*args, **kwargs)
    except RetryAfter as e:
        await asyncio.sleep(e.retry_after)
        return await func(*args, **kwargs)

# ---- Main ----
async def main():
    try:
        init_db()
        application = Application.builder().token(ENV_VARS["TOKEN"]).build()
        
        # Set up command handlers with retry wrapper
        try:
            await retry_api_call(application.bot.set_my_commands, COMMANDS)
        except Exception as e:
            logging.error(f"Failed to set commands: {e}")
            # Continue even if setting commands fails
        
        # Add handlers
        for handler in [
            CommandHandler("start", start),
            CommandHandler("commands", command_panel),
            CommandHandler("post", reddit_post_command),
            CommandHandler("auto_comment", start_auto_comment),
            CommandHandler("deepseek", deepseek_query),
            CommandHandler("chat", mistral_chat),
            CommandHandler("voice", google_voice_to_text),
            CommandHandler("text_to_voice", text_to_speech),
            CommandHandler("translate", install_language),
            CommandHandler("install_language", install_language),
            CommandHandler("languages", show_languages),
            CommandHandler("rules", get_subreddit_rules),
            CommandHandler("trending", get_trending_posts),
            CommandHandler("auto_post", start_auto_posting)
        ]:
            application.add_handler(handler)
        
        # Add error handler
        application.add_error_handler(error_handler)
        
        logging.info("🤖 Bot is running")
        
        # Run the bot with retry logic
        while True:
            try:
                await application.run_polling(
                    drop_pending_updates=True,
                    connect_timeout=30,
                    read_timeout=30,
                    write_timeout=30
                )
                break  # Exit loop if polling succeeds
            except (NetworkError, socket.error, aiohttp.ClientError) as e:
                logging.error(f"Network error: {e}")
                await asyncio.sleep(INITIAL_RETRY_DELAY)
            except Exception as e:
                logging.error(f"Critical error: {e}")
                raise
                
    except Exception as e:
        logging.critical(f"Fatal error: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(main())