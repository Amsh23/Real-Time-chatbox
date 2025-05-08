"""MongoDB database integration for Telegram bot."""
import os
import logging
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import IndexModel, ASCENDING, DESCENDING
from pymongo.errors import ConnectionFailure, OperationFailure
import backoff

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MongoDB:
    def __init__(self):
        self.client = None
        self.db = None
        self.connected = False
        
    @backoff.on_exception(
        backoff.expo,
        (ConnectionFailure, OperationFailure),
        max_tries=5
    )
    async def connect(self) -> None:
        """Establish connection to MongoDB with retry mechanism."""
        try:
            # Get MongoDB configuration from environment
            uri = os.getenv("MONGODB_URI")
            db_name = os.getenv("MONGODB_DB_NAME", "telegram_bot")
            min_pool_size = int(os.getenv("MONGODB_MIN_POOL_SIZE", 5))
            max_pool_size = int(os.getenv("MONGODB_MAX_POOL_SIZE", 50))
            max_idle_time_ms = int(os.getenv("MONGODB_MAX_IDLE_TIME_MS", 60000))

            if not uri:
                raise ValueError("MongoDB URI not found in environment variables")

            # Initialize client with connection pooling
            self.client = AsyncIOMotorClient(
                uri,
                minPoolSize=min_pool_size,
                maxPoolSize=max_pool_size,
                maxIdleTimeMS=max_idle_time_ms
            )
            
            # Get database instance
            self.db = self.client[db_name]
            
            # Test connection
            await self.client.admin.command('ping')
            self.connected = True
            
            # Create indexes
            await self._create_indexes()
            
            logger.info("Successfully connected to MongoDB")
            
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {str(e)}")
            self.connected = False
            raise

    async def _create_indexes(self) -> None:
        """Create indexes for collections."""
        try:
            # Messages collection indexes
            message_indexes = [
                IndexModel([("user_id", ASCENDING), ("timestamp", DESCENDING)]),
                IndexModel([("message_type", ASCENDING)]),
                IndexModel([("timestamp", DESCENDING)])
            ]
            await self.db.messages.create_indexes(message_indexes)

            # Users collection indexes
            user_indexes = [
                IndexModel([("user_id", ASCENDING)], unique=True),
                IndexModel([("last_active", DESCENDING)])
            ]
            await self.db.users.create_indexes(user_indexes)

            # Rate limits collection indexes
            rate_limit_indexes = [
                IndexModel([
                    ("user_id", ASCENDING),
                    ("command_type", ASCENDING)
                ], unique=True),
                IndexModel([("reset_time", DESCENDING)])
            ]
            await self.db.rate_limits.create_indexes(rate_limit_indexes)

            # Errors collection indexes
            error_indexes = [
                IndexModel([("timestamp", DESCENDING)]),
                IndexModel([("error_type", ASCENDING)])
            ]
            await self.db.errors.create_indexes(error_indexes)

            logger.info("Successfully created database indexes")
            
        except Exception as e:
            logger.error(f"Failed to create indexes: {str(e)}")
            raise

    async def save_message(self, user_id: int, message: str, message_type: str) -> None:
        """Save message to database with validation."""
        if not self.connected:
            raise ConnectionError("Not connected to MongoDB")

        try:
            await self.db.messages.insert_one({
                "user_id": user_id,
                "message": message,
                "message_type": message_type,
                "timestamp": datetime.utcnow()
            })
        except Exception as e:
            logger.error(f"Failed to save message: {str(e)}")
            raise

    async def update_user_activity(self, user_id: int, username: str) -> None:
        """Update user's activity status."""
        if not self.connected:
            raise ConnectionError("Not connected to MongoDB")

        try:
            now = datetime.utcnow()
            await self.db.users.update_one(
                {"user_id": user_id},
                {
                    "$set": {
                        "username": username,
                        "last_active": now
                    },
                    "$setOnInsert": {
                        "first_seen": now
                    }
                },
                upsert=True
            )
        except Exception as e:
            logger.error(f"Failed to update user activity: {str(e)}")
            raise

    async def check_rate_limit(self, user_id: int, command_type: str, limit: int, window: int) -> bool:
        """Check if user has exceeded rate limit for command."""
        if not self.connected:
            raise ConnectionError("Not connected to MongoDB")

        try:
            now = datetime.utcnow()
            result = await self.db.rate_limits.find_one_and_update(
                {
                    "user_id": user_id,
                    "command_type": command_type
                },
                {
                    "$set": {
                        "reset_time": now
                    },
                    "$inc": {
                        "count": 1
                    }
                },
                upsert=True,
                return_document=True
            )
            
            return result["count"] <= limit
            
        except Exception as e:
            logger.error(f"Failed to check rate limit: {str(e)}")
            raise

    async def log_error(self, error_type: str, message: str, stack_trace: str) -> None:
        """Log error details to database."""
        if not self.connected:
            raise ConnectionError("Not connected to MongoDB")

        try:
            await self.db.errors.insert_one({
                "error_type": error_type,
                "message": message,
                "stack_trace": stack_trace,
                "timestamp": datetime.utcnow()
            })
        except Exception as e:
            logger.error(f"Failed to log error: {str(e)}")
            raise

    async def get_user_stats(self, user_id: int) -> Dict[str, Any]:
        """Get user statistics."""
        if not self.connected:
            raise ConnectionError("Not connected to MongoDB")

        try:
            pipeline = [
                {"$match": {"user_id": user_id}},
                {"$group": {
                    "_id": "$message_type",
                    "count": {"$sum": 1}
                }}
            ]
            stats = await self.db.messages.aggregate(pipeline).to_list(None)
            return {stat["_id"]: stat["count"] for stat in stats}
        except Exception as e:
            logger.error(f"Failed to get user stats: {str(e)}")
            raise

    async def cleanup_old_data(self, days: int) -> None:
        """Clean up old data for maintenance."""
        if not self.connected:
            raise ConnectionError("Not connected to MongoDB")

        try:
            cutoff = datetime.utcnow() - timedelta(days=days)
            await self.db.messages.delete_many({"timestamp": {"$lt": cutoff}})
            await self.db.errors.delete_many({"timestamp": {"$lt": cutoff}})
            logger.info(f"Cleaned up data older than {days} days")
        except Exception as e:
            logger.error(f"Failed to cleanup old data: {str(e)}")
            raise

    async def close(self) -> None:
        """Close database connection."""
        if self.client:
            self.client.close()
            self.connected = False
            logger.info("Closed MongoDB connection")

# Create singleton instance
db = MongoDB()