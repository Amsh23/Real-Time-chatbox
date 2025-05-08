"""Script to migrate data from SQLite to MongoDB."""
import os
import sqlite3
import asyncio
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

async def migrate_data():
    """Migrate data from SQLite to MongoDB."""
    # MongoDB connection
    mongo_uri = os.getenv("MONGODB_URI")
    if not mongo_uri:
        raise ValueError("MongoDB URI not found in environment variables")
    
    client = MongoClient(mongo_uri)
    db = client[os.getenv("MONGODB_DB_NAME", "telegram_bot")]
    
    # SQLite connection
    sqlite_conn = sqlite3.connect("database.db")
    cursor = sqlite_conn.cursor()
    
    try:
        # Get all messages from SQLite
        cursor.execute("SELECT * FROM messages")
        messages = cursor.fetchall()
        
        # Prepare data for MongoDB
        mongo_messages = []
        for msg in messages:
            mongo_messages.append({
                "user_id": msg[1],  # Assuming user_id is second column
                "message": msg[2],  # Assuming message is third column
                "timestamp": datetime.fromtimestamp(msg[3]),  # Assuming timestamp is fourth column
                "message_type": "text"  # Default type for existing messages
            })
        
        if mongo_messages:
            # Insert into MongoDB
            result = db.messages.insert_many(mongo_messages)
            print(f"✅ Migrated {len(result.inserted_ids)} messages")
        
        # Create indexes after migration
        db.messages.create_index([("user_id", 1), ("timestamp", -1)])
        db.messages.create_index([("message_type", 1)])
        print("✅ Created indexes")
        
    except Exception as e:
        print(f"❌ Migration error: {str(e)}")
        raise
    finally:
        cursor.close()
        sqlite_conn.close()
        client.close()

if __name__ == "__main__":
    asyncio.run(migrate_data())