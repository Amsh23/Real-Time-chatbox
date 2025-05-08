"""MongoDB monitoring script."""
import os
import asyncio
import logging
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MongoMonitor:
    def __init__(self):
        self.uri = os.getenv("MONGODB_URI")
        self.db_name = os.getenv("MONGODB_DB_NAME", "telegram_bot")
        self.client = None
        self.db = None

    async def connect(self):
        """Establish MongoDB connection."""
        try:
            self.client = AsyncIOMotorClient(self.uri)
            self.db = self.client[self.db_name]
            await self.client.admin.command('ping')
            logger.info("✅ Connected to MongoDB")
        except Exception as e:
            logger.error(f"❌ Connection failed: {str(e)}")
            raise

    async def check_connection_status(self):
        """Check MongoDB connection status."""
        try:
            await self.client.admin.command('ping')
            return True
        except Exception:
            return False

    async def get_database_stats(self):
        """Get database statistics."""
        try:
            stats = await self.db.command("dbStats")
            return {
                "collections": stats["collections"],
                "objects": stats["objects"],
                "avg_obj_size": stats["avgObjSize"],
                "storage_size": stats["storageSize"],
                "indexes": stats["indexes"],
                "index_size": stats["indexSize"]
            }
        except Exception as e:
            logger.error(f"❌ Failed to get database stats: {str(e)}")
            return None

    async def check_collection_performance(self, collection_name):
        """Check collection performance metrics."""
        try:
            pipeline = [
                {"$collStats": {"latencyStats": {"histograms": True}}}
            ]
            async for stats in self.db[collection_name].aggregate(pipeline):
                return stats
        except Exception as e:
            logger.error(f"❌ Failed to get collection stats: {str(e)}")
            return None

    async def monitor_rate_limits(self):
        """Monitor rate limit usage."""
        try:
            now = datetime.utcnow()
            hour_ago = now - timedelta(hours=1)
            
            pipeline = [
                {"$match": {"reset_time": {"$gte": hour_ago}}},
                {"$group": {
                    "_id": "$command_type",
                    "total_requests": {"$sum": "$count"},
                    "unique_users": {"$addToSet": "$user_id"}
                }}
            ]
            
            results = await self.db.rate_limits.aggregate(pipeline).to_list(None)
            return {
                stat["_id"]: {
                    "requests": stat["total_requests"],
                    "users": len(stat["unique_users"])
                } for stat in results
            }
        except Exception as e:
            logger.error(f"❌ Failed to get rate limit stats: {str(e)}")
            return None

    async def check_error_rates(self):
        """Monitor error rates."""
        try:
            now = datetime.utcnow()
            hour_ago = now - timedelta(hours=1)
            
            pipeline = [
                {"$match": {"timestamp": {"$gte": hour_ago}}},
                {"$group": {
                    "_id": "$error_type",
                    "count": {"$sum": 1}
                }}
            ]
            
            results = await self.db.errors.aggregate(pipeline).to_list(None)
            return {stat["_id"]: stat["count"] for stat in results}
        except Exception as e:
            logger.error(f"❌ Failed to get error stats: {str(e)}")
            return None

    async def monitor_slow_operations(self):
        """Monitor slow database operations."""
        try:
            # Get current operations
            ops = await self.client.admin.command({
                "currentOp": True,
                "active": True,
                "milliseconds": 100  # Operations taking more than 100ms
            })
            
            return [
                {
                    "opid": op.get("opid"),
                    "type": op.get("type"),
                    "duration_ms": op.get("ms"),
                    "ns": op.get("ns")
                }
                for op in ops.get("inprog", [])
            ]
        except Exception as e:
            logger.error(f"❌ Failed to monitor operations: {str(e)}")
            return None

async def main():
    """Main monitoring loop."""
    monitor = MongoMonitor()
    await monitor.connect()
    
    while True:
        try:
            # Check connection
            is_connected = await monitor.check_connection_status()
            logger.info(f"Connection status: {'✅' if is_connected else '❌'}")
            
            # Get database stats
            if stats := await monitor.get_database_stats():
                logger.info("Database Stats:")
                for key, value in stats.items():
                    logger.info(f"{key}: {value}")
            
            # Check rate limits
            if limits := await monitor.monitor_rate_limits():
                logger.info("\nRate Limit Usage:")
                for cmd, stats in limits.items():
                    logger.info(f"{cmd}: {stats['requests']} requests from {stats['users']} users")
            
            # Check error rates
            if errors := await monitor.check_error_rates():
                logger.info("\nError Rates:")
                for error_type, count in errors.items():
                    logger.info(f"{error_type}: {count} occurrences")
            
            # Check slow operations
            if slow_ops := await monitor.monitor_slow_operations():
                logger.info("\nSlow Operations:")
                for op in slow_ops:
                    logger.info(f"Operation {op['opid']}: {op['type']} ({op['duration_ms']}ms)")
            
            # Monitor collection performance
            collections = ["messages", "users", "rate_limits", "errors"]
            for collection in collections:
                if perf := await monitor.check_collection_performance(collection):
                    logger.info(f"\n{collection} Performance:")
                    logger.info(perf)
            
        except Exception as e:
            logger.error(f"Monitoring error: {str(e)}")
        
        await asyncio.sleep(300)  # Monitor every 5 minutes

if __name__ == "__main__":
    asyncio.run(main())