const { expect } = require('chai');
const { MessageCache, OfflineMessageQueue } = require('../../handlers/socket/messageHandlers');

describe('Message Cache', () => {
    let cache;

    beforeEach(() => {
        cache = new MessageCache(3); // Small size for testing
    });

    it('should store and retrieve messages', () => {
        const message = {
            id: '1',
            text: 'test',
            timestamp: new Date()
        };
        cache.set('group1', message);
        expect(cache.get('group1', '1')).to.deep.equal(message);
    });

    it('should handle LRU eviction', () => {
        const messages = [
            { id: '1', timestamp: new Date() },
            { id: '2', timestamp: new Date() },
            { id: '3', timestamp: new Date() },
            { id: '4', timestamp: new Date() }
        ];

        messages.forEach(msg => cache.set('group1', msg));
        expect(cache.get('group1', '1')).to.be.null;
        expect(cache.get('group1', '4')).to.deep.equal(messages[3]);
    });

    it('should batch update messages', () => {
        const messages = [
            { id: '1', timestamp: new Date() },
            { id: '2', timestamp: new Date() }
        ];
        cache.set('group1', messages);
        expect(cache.getGroupMessages('group1')).to.have.lengthOf(2);
    });

    it('should invalidate cache entries', () => {
        const message = {
            id: '1',
            text: 'test',
            timestamp: new Date()
        };
        cache.set('group1', message);
        cache.invalidate('group1', '1');
        expect(cache.get('group1', '1')).to.be.null;
    });
});

describe('Offline Message Queue', () => {
    let queue;

    beforeEach(() => {
        queue = new OfflineMessageQueue();
    });

    it('should queue messages', () => {
        const message = {
            id: '1',
            text: 'test',
            timestamp: new Date()
        };
        queue.addMessage('group1', message);
        expect(queue.queues.get('group1')).to.have.lengthOf(1);
    });

    it('should process queued messages', async () => {
        const message = {
            id: '1',
            text: 'test',
            timestamp: new Date()
        };
        queue.addMessage('group1', message);
        const processed = await queue.processQueue('group1');
        expect(processed).to.have.lengthOf(1);
        expect(queue.queues.get('group1')).to.have.lengthOf(0);
    });

    it('should handle failed messages', async () => {
        const message = {
            id: '1',
            text: 'test',
            timestamp: new Date(),
            shouldFail: true // This will cause the message to fail processing
        };
        queue.addMessage('group1', message);
        const processed = await queue.processQueue('group1');
        expect(processed).to.have.lengthOf(0);
        expect(queue.queues.get('group1')).to.have.lengthOf(1);
    });

    it('should expire old failed messages', async () => {
        const oldMessage = {
            id: '1',
            text: 'test',
            timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours old
        };
        queue.addMessage('group1', oldMessage);
        const processed = await queue.processQueue('group1');
        expect(queue.queues.get('group1')).to.have.lengthOf(0);
    });
});
